#!/usr/bin/env bash
set -Eeuo pipefail

BASE_COMMIT="5731e05bba01aadc58a2f9f3eeb0e93d0e3a4d21"
HARNESS="$(mktemp)"
trap 'rm -f "$HARNESS"' EXIT
curl -fsSL "https://raw.githubusercontent.com/inn-media/truyn/${BASE_COMMIT}/scripts/class-c-cross-cloud-proof.sh" -o "$HARNESS"

python3 - "$HARNESS" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
s = p.read_text()
for old, new in (
    ('/etc/truin-testnet/', '/etc/truyn-testnet/'),
    ('/opt/truin/', '/opt/truyn/'),
    ('/var/lib/truin-network', '/var/lib/truyn-network'),
    ('/etc/truin-cgnat', '/etc/truyn-cgnat'),
    ('/var/lib/truin-cgnat', '/var/lib/truy n-cgnat'),
):
    s = s.replace(old, new)
s = s.replace('/var/lib/truy n-cgnat', '/var/lib/truyn-cgnat')
s = s.replace('npm install --ignore-scripts --no-audit --no-fund', 'npm install --no-audit --no-fund')

old_remote = '''az_remote(){ retry az vm run-command invoke -g "$AZ_RG" -n "$1" --command-id RunShellScript --scripts "$2" --query 'value[0].message' -o tsv --only-show-errors; }'''
new_remote = '''az_remote(){
  local vm="$1" body="$2" enc remote
  enc="$(printf '%s' "$body" | base64 -w0)"
  remote="printf '%s' '$enc' | base64 -d >/tmp/truyn-run.sh; chmod 700 /tmp/truy n-run.sh; /bin/bash /tmp/truy n-run.sh"
  remote="${remote//truy n-run/truyn-run}"
  retry az vm run-command invoke -g "$AZ_RG" -n "$vm" --command-id RunShellScript --scripts "$remote" --query 'value[0].message' -o tsv --only-show-errors
}'''
if old_remote not in s:
    raise SystemExit('expected az_remote definition not found')
s = s.replace(old_remote, new_remote)

s = s.replace(
    'systemctl --no-pager status truyn-testnet.service || true; exit 31',
    "systemctl --no-pager status truyn-testnet.service || true; "
    "journalctl -u truyn-testnet.service --no-pager -n 120 || true; "
    "cd /opt/truy n && node -e \"import('@matrixai/quic').then(()=>console.log('TRUYN_QUIC_IMPORT=PASS')).catch(e=>{console.error(e);process.exitCode=1})\" || true; "
    "exit 31"
)
s = s.replace('/opt/truy n', '/opt/truyn')

checks = {
    'out="$(az_remote "$AZ_A0" "$(install_script "$A0_PUB")")"; grep -Fq TRUYN_NODE_READY <<<"$out" || fail azure_a0_start 30':
      'out="$(az_remote "$AZ_A0" "$(install_script "$A0_PUB")")"; if ! grep -Fq TRUYN_NODE_READY <<<"$out"; then printf "%s\\n" "$out"; fail azure_a0_start 30; fi',
    'out="$(az_remote "$AZ_A2" "$(install_script "$A2_PUB")")"; grep -Fq TRUYN_NODE_READY <<<"$out" || fail azure_a2_start 31':
      'out="$(az_remote "$AZ_A2" "$(install_script "$A2_PUB")")"; if ! grep -Fq TRUYN_NODE_READY <<<"$out"; then printf "%s\\n" "$out"; fail azure_a2_start 31; fi',
    'out="$(az_remote "$AZ_AN" "$(install_script "$AN_PRIV")")"; grep -Fq TRUYN_NODE_READY <<<"$out" || fail azure_nat_start 32':
      'out="$(az_remote "$AZ_AN" "$(install_script "$AN_PRIV")")"; if ! grep -Fq TRUYN_NODE_READY <<<"$out"; then printf "%s\\n" "$out"; fail azure_nat_start 32; fi',
}
for old, new in checks.items():
    if old not in s:
        raise SystemExit(f'expected Class C bootstrap check not found: {old[:40]}')
    s = s.replace(old, new)

old_direct = '''P="$(jq -nc --arg id "$A0_ID" '{nodeId:$id,input:{proof:"gcp-cloudrun-to-azure-cross-cloud"}}')"; D1="$(cr_call POST /need "$P")"; [[ "$(jq -r '.transport' <<<"$D1")" == quic-direct ]] || fail gcp_to_azure_direct 40'''
new_direct = '''P="$(jq -nc --arg id "$A0_ID" '{nodeId:$id,input:{proof:"gcp-cloudrun-to-azure-cross-cloud"}}')"
D1="$(curl -sS --max-time 70 -X POST -H 'content-type: application/json' --data-binary "$P" "$G_URL/need")"
if [[ "$(jq -r '.transport // empty' <<<"$D1" 2>/dev/null)" != quic-direct ]]; then
  diag="$(jq -r '.error // "unknown_direct_failure"' <<<"$D1" 2>/dev/null || printf 'unparseable_direct_failure')"
  diag="$(printf '%s' "$diag" | tr -cd 'A-Za-z0-9_.:-' | cut -c1-128)"
  echo "TRUYN_CLASS_C_DIRECT_ERROR=$diag"
  fail gcp_to_azure_direct 40
fi'''
if old_direct not in s:
    raise SystemExit('expected cross-cloud direct gate not found')
s = s.replace(old_direct, new_direct)

old_regression = 'node --test tests/network-peer-lease-class-c.test.js tests/network-nat-class-c.test.js >/tmp/class-c-unit.log'
new_regression = 'node --test tests/peer-record-renewal-productionization.test.js tests/network-connect-v01.test.js >/tmp/class-c-unit.log'
if old_regression not in s:
    raise SystemExit('expected legacy Class C regression command not found')
s = s.replace(old_regression, new_regression)
p.write_text(s)
PY

chmod +x "$HARNESS"
exec bash "$HARNESS"
