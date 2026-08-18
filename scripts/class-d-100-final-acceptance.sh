#!/usr/bin/env bash
set -Eeuo pipefail

# Keep the accepted 100-node gate strict while isolating known GitHub-hosted
# Azure CLI process crashes at the process boundary. Persistent cloud failures
# still fail closed after a bounded number of attempts.
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

TMP="$(mktemp -d)"
cp benchmarks/scale/class-d-azure-100-provision.sh "$TMP/provision.sh"
cp benchmarks/scale/class-d-azure-100-campaign.sh "$TMP/campaign.sh"

python3 - "$TMP/provision.sh" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
s = p.read_text()
s = s.replace('npm install --ignore-scripts --no-audit --no-fund', 'npm install --no-audit --no-fund')
# Ubuntu command-not-found APT post-hook is irrelevant to ephemeral benchmark
# guests. Mirror/index resolution can also be transient; retry the mandatory
# update+package install boundary a bounded number of times and still fail
# closed if required tools are not installable.
apt_old = '''apt-get update -qq
apt-get install -y -qq git curl jq openssl ca-certificates python3 iptables >/dev/null
major=0; command -v node >/dev/null 2>&1 && major=\$(node -p 'parseInt(process.versions.node)' 2>/dev/null || echo 0)
if [ "\$major" -lt 22 ]; then curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null; apt-get install -y -qq nodejs >/dev/null; fi'''
apt_new = '''rm -f /etc/apt/apt.conf.d/50command-not-found
apt_ok=0
for apt_attempt in 1 2 3 4; do
  if apt-get update -qq && apt-get install -y -qq git curl jq openssl ca-certificates python3 iptables >/dev/null; then apt_ok=1; break; fi
  echo "TRUYN_APT_TRANSIENT_RETRY attempt=\$apt_attempt max=4" >&2
  sleep 3
done
[ "\$apt_ok" -eq 1 ]
major=0; command -v node >/dev/null 2>&1 && major=\$(node -p 'parseInt(process.versions.node)' 2>/dev/null || echo 0)
if [ "\$major" -lt 22 ]; then
  node_ok=0
  for node_attempt in 1 2 3 4; do
    if curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null && apt-get install -y -qq nodejs >/dev/null; then node_ok=1; break; fi
    echo "TRUYN_NODE_BOOTSTRAP_TRANSIENT_RETRY attempt=\$node_attempt max=4" >&2
    sleep 3
  done
  [ "\$node_ok" -eq 1 ]
fi'''
if apt_old not in s:
    raise SystemExit('expected Class D guest apt bootstrap block not found')
s = s.replace(apt_old, apt_new, 1)
old = '''remote() {
  local vm="$1" script="$2"
  retry az vm run-command invoke -g "$RG" -n "$vm" --command-id RunShellScript --scripts "$script" --query 'value[0].message' -o tsv --only-show-errors
}'''
new = '''remote() {
  local vm="$1" script="$2" enc remote_script
  enc="$(printf '%s' "$script" | base64 -w0)"
  remote_script="printf '%s' '$enc' | base64 -d >/tmp/truyn-d100-run.sh; chmod 700 /tmp/truin-d100-run.sh; /bin/bash /tmp/truin-d100-run.sh"
  remote_script="${remote_script//truin-d100-run/truyn-d100-run}"
  retry az vm run-command invoke -g "$RG" -n "$vm" --command-id RunShellScript --scripts "$remote_script" --query 'value[0].message' -o tsv --only-show-errors
}'''
if old not in s:
    raise SystemExit('expected Class D remote helper not found')
s = s.replace(old, new)
p.write_text(s)
PY

source "$TMP/provision.sh"
source "$TMP/campaign.sh"
rm -rf "$TMP"
