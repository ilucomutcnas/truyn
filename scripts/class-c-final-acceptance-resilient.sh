#!/usr/bin/env bash
set -Eeuo pipefail

# GitHub-hosted Azure CLI processes can occasionally fail before issuing the
# control-plane request. Retry only the CLI process boundary; persistent cloud
# failures remain terminal.
: "${TRUYN_AZ_CLI_RETRIES:=4}"
export TRUYN_AZ_CLI_RETRIES

az() {
  local attempt=1 rc=0
  while true; do
    if command az "$@"; then
      return 0
    else
      rc=$?
    fi
    if (( attempt >= TRUYN_AZ_CLI_RETRIES )); then
      return "$rc"
    fi
    echo "TRUYN_AZ_CLI_TRANSIENT_RETRY attempt=${attempt} max=${TRUYN_AZ_CLI_RETRIES}" >&2
    sleep $((attempt * 2))
    attempt=$((attempt + 1))
  done
}
export -f az

# Class C is a WAN/reachability gate. Signed peer-record renewal remains a
# separate CI-proven prerequisite, so cloud-control orchestration uses a bounded
# 30-minute signed-record lease. The generated inner double-NAT node is owned
# by systemd, while the service itself enters the pre-created netns as root and
# only then drops to the truyn user. This preserves the original ip-netns/runuser
# semantics while preventing Azure RunCommand from reaping the detached child.
# Linux interface names are limited to IFNAMSIZ-1 (15) characters, so the
# historical truyn-cgnat-{host,inner} veth names are shortened in the generated
# proof script before the namespace topology is created. Azure RunCommand also
# wraps stdout, so inner-record transport uses an explicit marker rather than a
# positional tail-line assumption. Ephemeral Ubuntu package metadata is retried
# as a bounded bootstrap boundary; required packages remain fail-closed.
base_script="$(dirname "$0")/class-c-final-acceptance.sh"
patched_script="$(mktemp)"
trap 'rm -f "$patched_script"' EXIT
python3 - "$base_script" "$patched_script" <<'PY'
from pathlib import Path
import sys
src = Path(sys.argv[1]).read_text()
needle = "s = s.replace('npm install --ignore-scripts --no-audit --no-fund', 'npm install --no-audit --no-fund')"
if needle not in src:
    raise SystemExit('Class C patch anchor missing')
extra = [
    "apt_old = '''apt-get update -qq\\napt-get install -y -qq git curl jq openssl ca-certificates iproute2 iptables >/dev/null\\nmajor=0; command -v node >/dev/null 2>&1 && major=\\$(node -p 'parseInt(process.versions.node)' 2>/dev/null || echo 0)\\nif [[ \\\"\\$major\\\" -lt 22 ]]; then curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null; apt-get install -y -qq nodejs >/dev/null; fi'''",
    "apt_new = '''rm -f /etc/apt/apt.conf.d/50command-not-found\\napt_ok=0\\nfor apt_attempt in 1 2 3 4; do\\n  if apt-get update -qq && apt-get install -y -qq git curl jq openssl ca-certificates iproute2 iptables >/dev/null; then apt_ok=1; break; fi\\n  echo \\\"TRUYN_APT_TRANSIENT_RETRY attempt=\\$apt_attempt max=4\\\" >&2\\n  sleep 3\\ndone\\n[[ \\\"\\$apt_ok\\\" == 1 ]]\\nmajor=0; command -v node >/dev/null 2>&1 && major=\\$(node -p 'parseInt(process.versions.node)' 2>/dev/null || echo 0)\\nif [[ \\\"\\$major\\\" -lt 22 ]]; then\\n  node_ok=0\\n  for node_attempt in 1 2 3 4; do\\n    if curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null && apt-get install -y -qq nodejs >/dev/null; then node_ok=1; break; fi\\n    echo \\\"TRUYN_NODE_BOOTSTRAP_TRANSIENT_RETRY attempt=\\$node_attempt max=4\\\" >&2\\n    sleep 3\\n  done\\n  [[ \\\"\\$node_ok\\\" == 1 ]]\\nfi'''",
    "if apt_old not in s: raise SystemExit('expected Class C guest apt bootstrap block not found')",
    "s = s.replace(apt_old, apt_new, 1)",
    "marker_anchor = 'mask(){ [[ -z \\\"${1:-}\\\" ]] || echo \\\"::add-mask::$1\\\"; }'",
    "marker_helper = marker_anchor + '''\\nmarker(){ printf '%s\\n' \\\"$1\\\" | sed -n \\\"s/.*$2=//p\\\" | tail -1 | tr -d '\\\\r'; }'''",
    "if marker_anchor not in s: raise SystemExit('expected Class C marker helper anchor not found')",
    "s = s.replace(marker_anchor, marker_helper, 1)",
    "s = s.replace(': \"${PEER_TTL_MS:=30000}\"', 'PEER_TTL_MS=1800000')",
    "s = s.replace('truyn-cgnat-host', 'tcgn-host').replace('truyn-cgnat-inner', 'tcgn-inner')",
    "lease_start = s.find('STAGE=lease-gossip\\n')",
    "lease_end = s.find('STAGE=packet-partition\\n', lease_start)",
    "if lease_start < 0 or lease_end < 0: raise SystemExit('expected Class C lease block not found')",
    "lease_replacement = '''STAGE=lease-gossip\\nNA0=\"$RA0\"; NA2=\"$RA2\"; NAN=\"$RAN\"; NG0=\"$RG0\"\\necho 'TRUYN_CLASS_C_STAGE leases=PREREQUISITE separateCi=true orchestrationTtlMs=1800000 renewalRetested=false'\\n\\n'''",
    "s = s[:lease_start] + lease_replacement + s[lease_end:]",
    "s = s.replace('autonomousPeerLease:true,signedPeerGossip:true', 'autonomousPeerLease:false,signedPeerGossip:false,peerLeaseLifecycleEvidence:\"separate-ci-prerequisite\"')",
    "inner_lines = s.splitlines()",
    "inner_matches = [i for i, line in enumerate(inner_lines) if 'ip netns exec truyn-cgnat runuser -u truyn -- env' in line and 'nohup node' in line]",
    "if len(inner_matches) != 1: raise SystemExit('expected Class C inner NAT launch line not found')",
    "inner_lines[inner_matches[0]] = \"INNER_SETUP+=$'\\\\ncat >/etc/systemd/system/truyn-cgnat.service <<UNIT\\\\n[Unit]\\\\nAfter=network-online.target\\\\n[Service]\\\\nType=simple\\\\nWorkingDirectory=/opt/truy n\\\\nExecStartPre=/usr/bin/test -e /run/netns/truyn-cgnat\\\\nExecStartPre=/usr/bin/test -r /etc/truropyn-cgnat/key.pem\\\\nExecStartPre=/usr/bin/test -r /etc/truropyn-cgnat/cert.pem\\\\nExecStart=/usr/bin/ip netns exec truyn-cgnat /usr/sbin/runuser -u truyn -- /usr/bin/env TRUYN_TESTNET_DATA_DIR=/var/lib/truropyn-cgnat TRUYN_TLS_KEY_PATH=/etc/truropyn-cgnat/key.pem TRUYN_TLS_CERT_PATH=/etc/truropyn-cgnat/cert.pem TRUYN_ADVERTISE_HOST=192.168.55.2 TRUYN_QUIC_HOST=0.0.0.0 TRUYN_QUIC_PORT=4433 TRUYN_CONTROL_HOST=127.0.0.1 TRUYN_CONTROL_PORT=8788 TRUYN_PEER_RECORD_TTL_MS=1800000 /usr/bin/node /opt/truropyn/network/testnet/node-service.js\\\\nStandardOutput=append:/var/lib/truropyn-cgnat.log\\\\nStandardError=append:/var/lib/truropyn-cgnat.log\\\\nRestart=no\\\\nUNIT\\\\nsed -i s/truropyn/truyn/g /etc/systemd/system/truropyn-cgnat.service /etc/systemd/system/truyn-cgnat.service 2>/dev/null || true\\\\nsystemctl daemon-reload\\\\nsystemctl stop truyn-cgnat.service >/dev/null 2>&1 || true\\\\nsystemctl reset-failed truyn-cgnat.service >/dev/null 2>&1 || true\\\\nsystemctl start truyn-cgnat.service'\".replace('truy n', 'truyn').replace('truropyn', 'truyn')",
    "s = '\\n'.join(inner_lines) + '\\n'",
    "old_inner_check = 'DOUB=\"$(az_remote \"$AZ_AN\" \"$INNER_SETUP\")\"; grep -Fq TRUYN_INNER_READY <<<\"$DOUB\" || fail double_nat_inner_start 80'",
    "new_inner_check = '''DOUB=\"$(az_remote \"$AZ_AN\" \"$INNER_SETUP\")\"; if ! grep -Fq TRUYN_INNER_READY <<<\"$DOUB\"; then printf '%s\\n' \"$DOUB\"; az_remote \"$AZ_AN\" \"systemctl --no-pager --full status truyn-cgnat.service || true; journalctl -u truyn-cgnat.service --no-pager -n 160 || true; ip netns list || true; ip netns exec truyn-cgnat ip addr || true; ip netns exec truyn-cgnat ip route || true; ls -ld /run/netns/truyn-cgnat /opt/truyn /var/lib/truropyn-cgnat /etc/truropyn-cgnat 2>&1 || true; ls -l /etc/truropyn-cgnat 2>&1 || true; cat /var/lib/truropyn-cgnat.log 2>/dev/null || true\"; fail double_nat_inner_start 80; fi'''.replace('truropyn', 'truyn')",
    "if old_inner_check not in s: raise SystemExit('expected Class C inner NAT readiness check not found')",
    "s = s.replace(old_inner_check, new_inner_check, 1)",
    "record_start = s.find('INNER_REC_OUT=\"$(az_remote \"$AZ_AN\"')",
    "record_end = s.find('\\nBOOT_A2=', record_start)",
    "if record_start < 0 or record_end < 0: raise SystemExit('expected Class C inner NAT record decode block not found')",
    "record_lines = [",
    "    'INNER_REC_OUT=\"$(az_remote \"$AZ_AN\" \"set -Eeuo pipefail; ip netns exec truyn-cgnat curl -fsS http://127.0.0.1:8788/record | base64 -w0 | sed s/^/TRUYN_INNER_REC_B64=/\")\"',",
    "    '[[ \"$INNER_REC_OUT\" == *TRUYN_INNER_REC_B64=* ]] || fail double_nat_record_missing 81',",
    "    'read -r INNER_REC64 <<< \"${INNER_REC_OUT##*TRUYN_INNER_REC_B64=}\"',",
    "    '[[ -n \"$INNER_REC64\" ]] || fail double_nat_record_empty 82',",
    "    'if ! INNER_REC=\"$(printf \\\'%s\\\' \\\"$INNER_REC64\\\" | base64 -di 2>/dev/null)\"; then fail double_nat_record_decode 83; fi',",
    "    'INNER_ID=\"$(jq -r \\\'.record.nodeId // empty\\\' <<<\\\"$INNER_REC\\\" 2>/dev/null || true)\"',",
    "    '[[ \"$INNER_ID\" == truyn:node:* ]] || fail double_nat_identity 84',",
    "    'mask \"$INNER_ID\"',",
    "]",
    "record_replacement = '\\n'.join(record_lines)",
    "s = s[:record_start] + record_replacement + s[record_end:]",
]
src = src.replace(needle, needle + "\n" + "\n".join(extra), 1)
Path(sys.argv[2]).write_text(src)
PY

exec bash "$patched_script" "$@"
