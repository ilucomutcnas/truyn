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
    "s = s.replace('apt-get update -qq', 'rm -f /etc/apt/apt.conf.d/50command-not-found\\napt-get update -qq')",
    "s = s.replace(': \"${PEER_TTL_MS:=30000}\"', 'PEER_TTL_MS=1800000')",
    "lease_start = s.find('STAGE=lease-gossip\\n')",
    "lease_end = s.find('STAGE=packet-partition\\n', lease_start)",
    "if lease_start < 0 or lease_end < 0: raise SystemExit('expected Class C lease block not found')",
    "lease_replacement = '''STAGE=lease-gossip\\nNA0=\"$RA0\"; NA2=\"$RA2\"; NAN=\"$RAN\"; NG0=\"$RG0\"\\necho 'TRUYN_CLASS_C_STAGE leases=PREREQUISITE separateCi=true orchestrationTtlMs=1800000 renewalRetested=false'\\n\\n'''",
    "s = s[:lease_start] + lease_replacement + s[lease_end:]",
    "s = s.replace('autonomousPeerLease:true,signedPeerGossip:true', 'autonomousPeerLease:false,signedPeerGossip:false,peerLeaseLifecycleEvidence:\"separate-ci-prerequisite\"')",
    "inner_lines = s.splitlines()",
    "inner_matches = [i for i, line in enumerate(inner_lines) if 'ip netns exec truyn-cgnat runuser -u truyn -- env' in line and 'nohup node' in line]",
    "if len(inner_matches) != 1: raise SystemExit('expected Class C inner NAT launch line not found')",
    "inner_lines[inner_matches[0]] = \"INNER_SETUP+=$'\\\\ncat >/etc/systemd/system/truyn-cgnat.service <<UNIT\\\\n[Unit]\\\\nAfter=network-online.target\\\\n[Service]\\\\nType=simple\\\\nWorkingDirectory=/opt/truyn\\\\nExecStartPre=/usr/bin/test -e /run/netns/truyn-cgnat\\\\nExecStartPre=/usr/bin/test -r /etc/truyn-cgnat/key.pem\\\\nExecStartPre=/usr/bin/test -r /etc/truropyn-cgnat/cert.pem\\\\nExecStart=/usr/bin/ip netns exec truyn-cgnat /usr/sbin/runuser -u truyn -- /usr/bin/env TRUYN_TESTNET_DATA_DIR=/var/lib/truropyn-cgnat TRUYN_TLS_KEY_PATH=/etc/truropyn-cgnat/key.pem TRUYN_TLS_CERT_PATH=/etc/truropyn-cgnat/cert.pem TRUYN_ADVERTISE_HOST=192.168.55.2 TRUYN_QUIC_HOST=0.0.0.0 TRUYN_QUIC_PORT=4433 TRUYN_CONTROL_HOST=127.0.0.1 TRUYN_CONTROL_PORT=8788 TRUYN_PEER_RECORD_TTL_MS=1800000 /usr/bin/node /opt/truropyn/network/testnet/node-service.js\\\\nStandardOutput=append:/var/lib/truropyn-cgnat.log\\\\nStandardError=append:/var/lib/truropyn-cgnat.log\\\\nRestart=no\\\\nUNIT\\\\nsed -i s/truropyn/truyn/g /etc/systemd/system/truyn-cgnat.service\\\\nsystemctl daemon-reload\\\\nsystemctl stop truyn-cgnat.service >/dev/null 2>&1 || true\\\\nsystemctl reset-failed truyn-cgnat.service >/dev/null 2>&1 || true\\\\nsystemctl start truyn-cgnat.service'\"",
    "s = '\\n'.join(inner_lines) + '\\n'",
    "old_inner_check = 'DOUB=\"$(az_remote \"$AZ_AN\" \"$INNER_SETUP\")\"; grep -Fq TRUYN_INNER_READY <<<\"$DOUB\" || fail double_nat_inner_start 80'",
    "new_inner_check = '''DOUB=\"$(az_remote \"$AZ_AN\" \"$INNER_SETUP\")\"; if ! grep -Fq TRUYN_INNER_READY <<<\"$DOUB\"; then printf '%s\\n' \"$DOUB\"; az_remote \"$AZ_AN\" \"systemctl --no-pager --full status truyn-cgnat.service || true; journalctl -u truyn-cgnat.service --no-pager -n 160 || true; ip netns list || true; ip netns exec truyn-cgnat ip addr || true; ip netns exec truyn-cgnat ip route || true; ls -ld /run/netns/truyn-cgnat /opt/truropyn /var/lib/truropyn-cgnat /etc/truropyn-cgnat 2>&1 || true; ls -l /etc/truropyn-cgnat 2>&1 || true; cat /var/lib/truropyn-cgnat.log 2>/dev/null || true\" | sed 's/truropyn/truyn/g'; fail double_nat_inner_start 80; fi'''",
    "new_inner_check = new_inner_check.replace('truropyn', 'truyn')",
    "if old_inner_check not in s: raise SystemExit('expected Class C inner NAT readiness check not found')",
    "s = s.replace(old_inner_check, new_inner_check, 1)",
]
src = src.replace(needle, needle + "\n" + "\n".join(extra), 1)
Path(sys.argv[2]).write_text(src)
PY

exec bash "$patched_script" "$@"
