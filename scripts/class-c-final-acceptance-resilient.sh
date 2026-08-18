#!/usr/bin/env bash
set -Eeuo pipefail

# GitHub-hosted Azure CLI processes can occasionally fail before issuing the
# control-plane request (for example, a Python import/module-lock crash). The
# Class C gate must distinguish that runner/tooling noise from a TRUYN network
# result, while remaining fail-closed on persistent failures.
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

# The historical Class C harness used a 30-second peer lease while orchestrating
# peer-record reads through serial cloud control-plane RunCommand calls. That can
# expire a valid signed record before bootstrap and produce peer_not_discovered
# without testing WAN reachability at all. Peer-record renewal is already a
# separately CI-proven prerequisite; this WAN gate therefore uses a bounded
# 30-minute orchestration lease and records that lifecycle renewal is not
# re-proven by this run.
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
]
src = src.replace(needle, needle + "\n" + "\n".join(extra), 1)
Path(sys.argv[2]).write_text(src)
PY

exec bash "$patched_script" "$@"
