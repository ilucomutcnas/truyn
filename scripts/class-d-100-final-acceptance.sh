#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${TRUYN_CLASS_D100_PREPARE_ONLY:-0}" != 1 ]]; then
  : "${TRUYN_TESTED_COMMIT:?TRUYN_TESTED_COMMIT is required for accepted D-100}"
fi

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

# Normalize the canonical D-100 guest filesystem/service names before any
# cloud execution. These historical typo-paths previously made the first
# RunCommand install fail under set -e before its fallback code was reachable.
s = s.replace('truqyn', 'truyn')
s = s.replace('truinyn', 'truyn')
s = s.replace('truin-d100', 'truyn-d100')

s = s.replace('npm install --ignore-scripts --no-audit --no-fund', 'npm install --no-audit --no-fund')
# Ubuntu command-not-found APT post-hook is irrelevant to ephemeral benchmark
# guests. Mirror/index resolution can also be transient; retry the mandatory
# update+package install boundary a bounded number of times and still fail
# closed if required tools are not installable.
apt_old = r'''apt-get update -qq
apt-get install -y -qq git curl jq openssl ca-certificates python3 iptables >/dev/null
major=0; command -v node >/dev/null 2>&1 && major=\$(node -p 'parseInt(process.versions.node)' 2>/dev/null || echo 0)
if [ "\$major" -lt 22 ]; then curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null; apt-get install -y -qq nodejs >/dev/null; fi'''
apt_new = r'''rm -f /etc/apt/apt.conf.d/50command-not-found
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
old = r'''remote() {
  local vm="$1" script="$2"
  retry az vm run-command invoke -g "$RG" -n "$vm" --command-id RunShellScript --scripts "$script" --query 'value[0].message' -o tsv --only-show-errors
}'''
new = r'''remote() {
  local vm="$1" script="$2" enc remote_script
  enc="$(printf '%s' "$script" | base64 -w0)"
  remote_script="printf '%s' '$enc' | base64 -d >/tmp/truyn-d100-run.sh; chmod 700 /tmp/truyn-d100-run.sh; /bin/bash /tmp/truyn-d100-run.sh"
  retry az vm run-command invoke -g "$RG" -n "$vm" --command-id RunShellScript --scripts "$remote_script" --query 'value[0].message' -o tsv --only-show-errors
}'''
if old not in s:
    raise SystemExit('expected Class D remote helper not found')
s = s.replace(old, new, 1)

# D-100 bootstrap must validate the invariant the protocol actually promises.
# Kademlia k=20 intentionally bounds each routing bucket, so routing.size()
# is not a full-membership list and a >=90 peerCount gate is invalid. Require
# every one of the 25 processes on each host to accept all 100 signed peer
# records; keep the routing table bounded/non-empty; later baseline/healed
# traffic still has to satisfy the unchanged >=99% canonical routing gate.
bootstrap_old = r'''payload=\$(jq -c '{records:.}' /tmp/all-records.json)
t0=\$(date +%s%3N)
for j in \$(seq 0 24); do curl -fsS --max-time 60 -H 'content-type: application/json' --data-binary "\$payload" http://127.0.0.1:\$(( ${CONTROL_BASE} + j ))/bootstrap >/dev/null; done
t1=\$(date +%s%3N)
peers=0
for j in \$(seq 0 24); do p=\$(curl -fsS http://127.0.0.1:\$(( ${CONTROL_BASE} + j ))/status | jq -r '.peerCount'); [ "\$p" -ge 90 ] && peers=\$((peers+1)); done
[ "\$peers" -eq 25 ]
echo RECORDS=100
echo BOOTSTRAP_MS=\$((t1-t0))
echo FULL_PEERS=\$peers'''
bootstrap_new = r'''payload=\$(jq -c '{records:.}' /tmp/all-records.json)
t0=\$(date +%s%3N)
accepted_nodes=0
routing_min=1000000
routing_max=0
for j in \$(seq 0 24); do
  response=\$(curl -fsS --max-time 60 -H 'content-type: application/json' --data-binary "\$payload" http://127.0.0.1:\$(( ${CONTROL_BASE} + j ))/bootstrap)
  accepted=\$(printf '%s' "\$response" | jq '[.results[] | select(.accepted == true)] | length')
  [ "\$accepted" -eq 100 ]
  p=\$(curl -fsS --max-time 10 http://127.0.0.1:\$(( ${CONTROL_BASE} + j ))/status | jq -r '.peerCount')
  [ "\$p" -gt 0 ]
  [ "\$p" -lt "\$routing_min" ] && routing_min=\$p
  [ "\$p" -gt "\$routing_max" ] && routing_max=\$p
  accepted_nodes=\$((accepted_nodes+1))
done
t1=\$(date +%s%3N)
[ "\$accepted_nodes" -eq 25 ]
echo RECORDS=100
echo BOOTSTRAP_MS=\$((t1-t0))
echo BOOTSTRAPPED_NODES=\$accepted_nodes
echo ROUTING_MIN=\$routing_min
echo ROUTING_MAX=\$routing_max'''
if bootstrap_old not in s:
    raise SystemExit('expected invalid Class D full-routing bootstrap gate not found')
s = s.replace(bootstrap_old, bootstrap_new, 1)
s = s.replace('[[ "$(marker "$out" FULL_PEERS)" == 25 ]]', '[[ "$(marker "$out" BOOTSTRAPPED_NODES)" == 25 ]]', 1)
s = s.replace('records=100 fullRoutingNodes=25 bootstrapMs=$(marker "$out" BOOTSTRAP_MS)', 'records=100 bootstrappedNodes=25 routingMin=$(marker "$out" ROUTING_MIN) routingMax=$(marker "$out" ROUTING_MAX) bootstrapMs=$(marker "$out" BOOTSTRAP_MS)', 1)

bad_tokens = ('truqyn', 'truinyn', 'truin-d100', '/tmp/truin-d100-run.sh')
remaining = [token for token in bad_tokens if token in s]
if remaining:
    raise SystemExit('invalid Class D guest path survived preparation: ' + ','.join(remaining))

p.write_text(s)
PY

if [[ "${TRUYN_CLASS_D100_PREPARE_ONLY:-0}" == 1 ]]; then
  bash -n "$TMP/provision.sh"
  bash -n "$TMP/campaign.sh"
  grep -q 'BOOTSTRAPPED_NODES' "$TMP/provision.sh"
  grep -q 'accepted.*-eq 100' "$TMP/provision.sh"
  grep -q '/var/lib/truyn-d100/records.json' "$TMP/provision.sh"
  grep -q 'EnvironmentFile=/etc/truyn-d100/node-%i.env' "$TMP/provision.sh"
  grep -q 'ExecStart=/usr/bin/node /opt/truyn/network/testnet/node-service.js' "$TMP/provision.sh"
  if grep -Eq 'peerCount.*-ge 90|-ge 90.*peerCount|truqyn|truinyn|truin-d100' "$TMP/provision.sh"; then
    echo 'invalid D-100 bootstrap or guest path survived preparation' >&2
    exit 1
  fi
  echo 'TRUYN_CLASS_D100_PREPARED_HARNESS=PASS'
  rm -rf "$TMP"
  exit 0
fi

source "$TMP/provision.sh"
source "$TMP/campaign.sh"
rm -rf "$TMP"
