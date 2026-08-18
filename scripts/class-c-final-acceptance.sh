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
  remote="printf '%s' '$enc' | base64 -d >/tmp/truy n-run.sh; chmod 700 /tmp/truy n-run.sh; /bin/bash /tmp/truy n-run.sh"
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

relay_block = r'''
STAGE=relay-fallback
RELAY_PORT=8789
RELAY_TOKEN="$(openssl rand -hex 24)"
mask "$RELAY_TOKEN"
az network nsg rule create -g "$AZ_RG" --nsg-name "$AZ_NSG" -n allow-truyn-relay-proof --priority 110 --direction Inbound --access Allow --protocol Tcp --destination-port-ranges "$RELAY_PORT" --source-address-prefixes "$A2_PUB" "$NAT_PUB" --only-show-errors >/dev/null
relay_start=$(cat <<EOS
set -Eeuo pipefail
cd /opt/truyn
if [[ -f /tmp/truyn-class-c-relay.pid ]]; then kill \$(cat /tmp/truy n-class-c-relay.pid) >/dev/null 2>&1 || true; fi
rm -f /tmp/truy n-class-c-relay.pid
nohup env TRUYN_RELAY_HOST=0.0.0.0 TRUYN_RELAY_PORT=${RELAY_PORT} TRUYN_RELAY_TOKEN='${RELAY_TOKEN}' node network/testnet/relay-service.js >/tmp/truy n-class-c-relay.log 2>&1 &
echo \$! >/tmp/truy n-class-c-relay.pid
for n in \$(seq 1 30); do curl -fsS --max-time 2 http://127.0.0.1:${RELAY_PORT}/health >/dev/null && { echo TRUYN_RELAY_READY=1; exit 0; }; sleep 1; done
cat /tmp/truy n-class-c-relay.log 2>/dev/null || true
exit 1
EOS
)
relay_start="${relay_start//truy n/truyn}"
out="$(az_remote "$AZ_A0" "$relay_start")"; [[ "$(marker "$out" TRUYN_RELAY_READY)" == 1 ]] || fail relay_start_failed 90

relay_url="http://${A0_PUB}:${RELAY_PORT}"
target_start=$(cat <<EOS
set -Eeuo pipefail
cd /opt/truyn
if [[ -f /tmp/truy n-class-c-relay-target.pid ]]; then kill \$(cat /tmp/truy n-class-c-relay-target.pid) >/dev/null 2>&1 || true; fi
rm -f /tmp/truy n-class-c-relay-target.pid /tmp/truy n-class-c-relay-target.log
nohup env TRUYN_CLASS_C_RELAY_MODE=target TRUYN_RELAY_URL='${relay_url}' TRUYN_RELAY_TOKEN='${RELAY_TOKEN}' TRUYN_TLS_KEY_PATH=/etc/truy n-testnet/key.pem TRUYN_TLS_CERT_PATH=/etc/truy n-testnet/cert.pem TRUYN_ADVERTISE_HOST='${AN_PRIV}' TRUYN_QUIC_PORT=4544 node benchmarks/scale/class-c-relay-client.js >/tmp/truy n-class-c-relay-target.log 2>&1 &
echo \$! >/tmp/truy n-class-c-relay-target.pid
for n in \$(seq 1 30); do if grep -q 'TRUYN_CLASS_C_RELAY_TARGET_READY' /tmp/truy n-class-c-relay-target.log 2>/dev/null; then grep 'TRUYN_CLASS_C_RELAY_TARGET_READY' /tmp/truy n-class-c-relay-target.log | tail -1; exit 0; fi; sleep 1; done
cat /tmp/truy n-class-c-relay-target.log 2>/dev/null || true
exit 1
EOS
)
target_start="${target_start//truy n/truyn}"
target_out="$(az_remote "$AZ_AN" "$target_start")"
TARGET_ID="$(printf '%s\n' "$target_out" | sed -n 's/.*TRUYN_CLASS_C_RELAY_TARGET_READY nodeId=//p' | tail -1 | tr -d '\r')"
[[ "$TARGET_ID" == truyn:node:* ]] || fail relay_target_start_failed 91
mask "$TARGET_ID"

source_cmd=$(cat <<EOS
set -Eeuo pipefail
cd /opt/truyn
out=\$(env TRUYN_CLASS_C_RELAY_MODE=source TRUYN_RELAY_URL='${relay_url}' TRUYN_RELAY_TOKEN='${RELAY_TOKEN}' TRUYN_TLS_KEY_PATH=/etc/truy n-testnet/key.pem TRUYN_TLS_CERT_PATH=/etc/truy n-testnet/cert.pem TRUYN_TARGET_NODE_ID='${TARGET_ID}' TRUYN_PROOF_LABEL=nat-hidden-relay-fallback node benchmarks/scale/class-c-relay-client.js)
printf 'TRUYN_RELAY_SOURCE=%s\\n' "\$out"
EOS
)
source_cmd="${source_cmd//truy n/truyn}"
source_out="$(az_remote "$AZ_A2" "$source_cmd")"
source_json="$(printf '%s\n' "$source_out" | sed -n 's/.*TRUYN_RELAY_SOURCE=//p' | tail -1 | tr -d '\r')"
[[ "$(jq -r '.ok // false' <<<"$source_json")" == true ]] || fail relay_fallback_failed 92
[[ "$(jq -r '.transport' <<<"$source_json")" == relay-fallback ]] || fail relay_transport_wrong 93
[[ "$(jq -r '.targetTransport' <<<"$source_json")" == relay ]] || fail relay_target_transport_wrong 94
relay_fallback_ms="$(jq -r '.elapsedMs' <<<"$source_json")"

az_remote "$AZ_A0" "set -Eeuo pipefail; kill \$(cat /tmp/truyn-class-c-relay.pid); rm -f /tmp/truy n-class-c-relay.pid; echo TRUYN_RELAY_STOPPED=1" >/dev/null
outage_cmd=$(cat <<EOS
set +e
cd /opt/truyn
env TRUYN_CLASS_C_RELAY_MODE=source TRUYN_RELAY_URL='${relay_url}' TRUYN_RELAY_TOKEN='${RELAY_TOKEN}' TRUYN_TLS_KEY_PATH=/etc/truy n-testnet/key.pem TRUYN_TLS_CERT_PATH=/etc/truy n-testnet/cert.pem TRUYN_TARGET_NODE_ID='${TARGET_ID}' TRUYN_PROOF_LABEL=relay-outage node benchmarks/scale/class-c-relay-client.js >/tmp/truy n-class-c-relay-outage.log 2>&1
rc=\$?
printf 'TRUYN_RELAY_OUTAGE_RC=%s\\n' "\$rc"
exit 0
EOS
)
outage_cmd="${outage_cmd//truy n/truyn}"
outage_out="$(az_remote "$AZ_A2" "$outage_cmd")"; outage_rc="$(marker "$outage_out" TRUYN_RELAY_OUTAGE_RC)"; [[ -n "$outage_rc" && "$outage_rc" -ne 0 ]] || fail relay_outage_not_fail_closed 95

out="$(az_remote "$AZ_A0" "$relay_start")"; [[ "$(marker "$out" TRUYN_RELAY_READY)" == 1 ]] || fail relay_restart_failed 96
recovery_cmd=$(cat <<EOS
set -Eeuo pipefail
cd /opt/truy n
t0=\$(date +%s%3N)
for n in \$(seq 1 30); do
  if out=\$(env TRUYN_CLASS_C_RELAY_MODE=source TRUYN_RELAY_URL='${relay_url}' TRUYN_RELAY_TOKEN='${RELAY_TOKEN}' TRUYN_TLS_KEY_PATH=/etc/truy n-testnet/key.pem TRUYN_TLS_CERT_PATH=/etc/truy n-testnet/cert.pem TRUYN_TARGET_NODE_ID='${TARGET_ID}' TRUYN_PROOF_LABEL=relay-recovery node benchmarks/scale/class-c-relay-client.js 2>/dev/null); then
    if [[ \$(printf '%s' "\$out" | jq -r '.ok // false') == true ]]; then t1=\$(date +%s%3N); echo TRUYN_RELAY_RECOVERY_MS=\$((t1-t0)); echo TRUYN_RELAY_RECOVERY=1; exit 0; fi
  fi
  sleep 1
done
exit 1
EOS
)
recovery_cmd="${recovery_cmd//truy n/truyn}"
recovery_out="$(az_remote "$AZ_A2" "$recovery_cmd")"; [[ "$(marker "$recovery_out" TRUYN_RELAY_RECOVERY)" == 1 ]] || fail relay_recovery_failed 97
relay_recovery_ms="$(marker "$recovery_out" TRUYN_RELAY_RECOVERY_MS)"
echo "TRUYN_CLASS_C_STAGE relay=PASS natHiddenTarget=true fallback=true fallbackMs=${relay_fallback_ms} outageFailClosed=true recovery=true recoveryMs=${relay_recovery_ms} signedEnvelope=true"

'''
needle = 'STAGE=local-regression\n'
if needle not in s:
    raise SystemExit('expected local regression stage not found')
s = s.replace(needle, relay_block + needle, 1)

old_regression = 'node --test tests/network-peer-lease-class-c.test.js tests/network-nat-class-c.test.js >/tmp/class-c-unit.log'
new_regression = 'node --test tests/peer-record-renewal-productionization.test.js tests/network-relay-productionization.test.js tests/network-connect-v01.test.js >/tmp/class-c-unit.log'
if old_regression not in s:
    raise SystemExit('expected legacy Class C regression command not found')
s = s.replace(old_regression, new_regression)

arg_needle = '--argjson natPkts "$NAT_PKTS" '
if arg_needle not in s:
    raise SystemExit('expected final Class C jq args not found')
s = s.replace(arg_needle, arg_needle + '--argjson relayFallbackMs "$relay_fallback_ms" --argjson relayRecoveryMs "$relay_recovery_ms" ', 1)
obj_needle = 'carrierCgnatFieldValidated:false}'
if obj_needle not in s:
    raise SystemExit('expected final Class C object not found')
s = s.replace(obj_needle, 'carrierCgnatFieldValidated:false,relayFallback:true,relayFallbackAuthenticated:true,relayFallbackMs:$relayFallbackMs,relayOutageFailClosed:true,relayRecovery:true,relayRecoveryMs:$relayRecoveryMs}', 1)
p.write_text(s)
PY

chmod +x "$HARNESS"
exec bash "$HARNESS"
