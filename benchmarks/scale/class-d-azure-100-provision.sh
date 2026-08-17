#!/usr/bin/env bash
set -Eeuo pipefail

: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"

LOCATION="${TRUYN_CLASS_D_LOCATION:-eastus2}"
VM_SIZE="${TRUYN_CLASS_D_VM_SIZE:-Standard_D2as_v5}"
RG="${TRUYN_AZURE_RESOURCE_GROUP:-truyn}"
PREFIX="truyn-d100-${GITHUB_RUN_ID}"
VNET="${PREFIX}-vnet"
SUBNET="${PREFIX}-subnet"
NSG="${PREFIX}-nsg"
NODES_PER_HOST=25
HOST_COUNT=4
QUIC_BASE=4400
CONTROL_BASE=8700
SEED=20260818
EVIDENCE="${GITHUB_WORKSPACE:-$PWD}/class-d-100-evidence.json"
START_MS=$(date +%s%3N)
CLEANUP_CONFIRMED=false
GATE_OK=false
STAGE=init

VMS=(); NICS=(); PIPS=(); DISKS=(); PRIV=()
for i in $(seq 0 $((HOST_COUNT-1))); do
  VMS+=("${PREFIX}-h${i}")
  NICS+=("${PREFIX}-h${i}-nic")
  PIPS+=("${PREFIX}-h${i}-pip")
  DISKS+=("${PREFIX}-h${i}-os")
done

retry() {
  local n=0
  until "$@"; do
    n=$((n+1)); [[ $n -lt 4 ]] || return 1
    sleep $((n*2))
  done
}

remote() {
  local vm="$1" script="$2"
  retry az vm run-command invoke -g "$RG" -n "$vm" --command-id RunShellScript --scripts "$script" --query 'value[0].message' -o tsv --only-show-errors
}

marker() {
  local text="$1" key="$2"
  printf '%s\n' "$text" | sed -n "s/.*${key}=//p" | tail -1 | tr -d '\r'
}

cleanup() {
  set +e
  STAGE=cleanup
  for vm in "${VMS[@]}"; do az vm delete -g "$RG" -n "$vm" --yes --force-deletion --only-show-errors >/dev/null 2>&1 || true; done
  for nic in "${NICS[@]}"; do az network nic delete -g "$RG" -n "$nic" --only-show-errors >/dev/null 2>&1 || true; done
  for pip in "${PIPS[@]}"; do az network public-ip delete -g "$RG" -n "$pip" --only-show-errors >/dev/null 2>&1 || true; done
  for disk in "${DISKS[@]}"; do az disk delete -g "$RG" -n "$disk" --yes --only-show-errors >/dev/null 2>&1 || true; done
  az network vnet delete -g "$RG" -n "$VNET" --only-show-errors >/dev/null 2>&1 || true
  az network nsg delete -g "$RG" -n "$NSG" --only-show-errors >/dev/null 2>&1 || true
  left=$(az resource list -g "$RG" --query "[?starts_with(name, '${PREFIX}')].name" -o tsv --only-show-errors 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$left" == 0 ]]; then CLEANUP_CONFIRMED=true; fi
  if [[ -f "$EVIDENCE" ]]; then tmp="${EVIDENCE}.tmp"; jq --argjson confirmed "$CLEANUP_CONFIRMED" --argjson remaining "$left" ".cleanup.confirmed=\$confirmed | .cleanup.remainingResources=\$remaining" "$EVIDENCE" >"$tmp" && mv "$tmp" "$EVIDENCE"; fi
  echo "TRUYN_CLASS_D_100_CLEANUP confirmed=${CLEANUP_CONFIRMED} remaining=${left}"
}
trap cleanup EXIT
trap 'rc=$?; echo "::error title=TRUYN Class D 100-node failure::stage=$STAGE exit=$rc line=$LINENO"; exit $rc' ERR

STAGE=preflight
[[ "$(az group exists -n "$RG" -o tsv)" == true ]]
for ns in Microsoft.Network Microsoft.Compute; do
  state=$(az provider show --namespace "$ns" --query registrationState -o tsv --only-show-errors)
  [[ "$state" == Registered ]]
done

echo "TRUYN_CLASS_D_100 stage=preflight status=PASS commit=${GITHUB_SHA}"

STAGE=network
az network nsg create -g "$RG" -n "$NSG" -l "$LOCATION" --tags "truyn-class-d-run=${GITHUB_RUN_ID}" --only-show-errors >/dev/null
az network vnet create -g "$RG" -n "$VNET" -l "$LOCATION" --address-prefixes 10.253.0.0/16 --subnet-name "$SUBNET" --subnet-prefixes 10.253.1.0/24 --tags "truyn-class-d-run=${GITHUB_RUN_ID}" --only-show-errors >/dev/null

STAGE=provision
for i in $(seq 0 $((HOST_COUNT-1))); do
  az network public-ip create -g "$RG" -n "${PIPS[$i]}" -l "$LOCATION" --sku Standard --allocation-method Static --tags "truyn-class-d-run=${GITHUB_RUN_ID}" --only-show-errors >/dev/null
  az network nic create -g "$RG" -n "${NICS[$i]}" -l "$LOCATION" --vnet-name "$VNET" --subnet "$SUBNET" --network-security-group "$NSG" --public-ip-address "${PIPS[$i]}" --tags "truyn-class-d-run=${GITHUB_RUN_ID}" --only-show-errors >/dev/null
  created=0
  for size in "$VM_SIZE" Standard_D2s_v5 Standard_B2s; do
    if az vm create -g "$RG" -n "${VMS[$i]}" -l "$LOCATION" --image Ubuntu2204 --size "$size" --admin-username truynadmin --generate-ssh-keys --nics "${NICS[$i]}" --os-disk-name "${DISKS[$i]}" --os-disk-delete-option Delete --tags "truyn-class-d-run=${GITHUB_RUN_ID}" --only-show-errors >/dev/null 2>&1; then
      created=1; echo "TRUYN_CLASS_D_100 host=$i vmSize=$size provisioned=true"; break
    fi
  done
  [[ $created == 1 ]]
  PRIV+=("$(az network nic show -g "$RG" -n "${NICS[$i]}" --query 'ipConfigurations[0].privateIPAddress' -o tsv --only-show-errors)")
  [[ -n "${PRIV[$i]}" ]]
done

STAGE=install
for i in $(seq 0 $((HOST_COUNT-1))); do
  script=$(cat <<EOS
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl jq openssl ca-certificates python3 iptables >/dev/null
major=0; command -v node >/dev/null 2>&1 && major=\$(node -p 'parseInt(process.versions.node)' 2>/dev/null || echo 0)
if [ "\$major" -lt 22 ]; then curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null; apt-get install -y -qq nodejs >/dev/null; fi
rm -rf /opt/truyn
git clone -q https://github.com/inn-media/truyn.git /opt/truyn
cd /opt/truyn
git checkout -q '${GITHUB_SHA}'
npm install --ignore-scripts --no-audit --no-fund >/dev/null
install -d -m 0700 /var/lib/truyn-d100 /etc/truyn-d100
openssl req -x509 -newkey rsa:2048 -nodes -keyout /etc/truyn-d100/key.pem -out /etc/truyn-d100/cert.pem -subj '/CN=${PRIV[$i]}' -days 1 -addext 'subjectAltName=IP:${PRIV[$i]}' >/dev/null 2>&1
for j in \$(seq 0 24); do
  idx=\$(( ${i} * 25 + j ))
  q=\$(( ${QUIC_BASE} + j )); c=\$(( ${CONTROL_BASE} + j ))
  cat >/etc/truyn-d100/node-\${idx}.env <<ENV
TRUYN_IDENTITY_PATH=/var/lib/truin-d100/node-\${idx}-identity.json
TRUYN_NETWORK_STATE_PATH=/var/lib/truin-d100/node-\${idx}-state.json
TRUYN_TLS_KEY_PATH=/etc/truin-d100/key.pem
TRUYN_TLS_CERT_PATH=/etc/truin-d100/cert.pem
TRUYN_ADVERTISE_HOST=${PRIV[$i]}
TRUYN_QUIC_HOST=0.0.0.0
TRUYN_QUIC_PORT=\${q}
TRUYN_CONTROL_HOST=127.0.0.1
TRUYN_CONTROL_PORT=\${c}
TRUYN_PEER_RECORD_TTL_MS=1800000
TRUYN_DHT_REPLICATION_FACTOR=3
TRUYN_DHT_WRITE_QUORUM=2
TRUYN_DHT_RPC_TIMEOUT_MS=5000
TRUYN_TESTNET_FAULT_CONTROL=1
ENV
done
cat >/etc/systemd/system/truyn-d100@.service <<'UNIT'
[Unit]
After=network-online.target
[Service]
WorkingDirectory=/opt/truyn
EnvironmentFile=/etc/truyn-d100/node-%i.env
ExecStart=/usr/bin/node /opt/truyn/network/testnet/node-service.js
Restart=on-failure
RestartSec=1
LimitNOFILE=65536
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
for j in \$(seq 0 24); do idx=\$(( ${i} * 25 + j )); systemctl enable --now truyn-d100@\${idx}.service >/dev/null; done
ok=0
for n in \$(seq 1 90); do
  good=0; for j in \$(seq 0 24); do curl -fsS --max-time 1 http://127.0.0.1:\$(( ${CONTROL_BASE} + j ))/status >/dev/null 2>&1 && good=\$((good+1)); done
  if [ "\$good" -eq 25 ]; then ok=1; break; fi; sleep 2
done
[ "\$ok" -eq 1 ]
python3 - <<'PY'
import json, urllib.request
records=[]
for p in range(${CONTROL_BASE}, ${CONTROL_BASE}+25):
    records.append(json.load(urllib.request.urlopen(f'http://127.0.0.1:{p}/record'))['record'])
open('/var/lib/truin-d100/records.json','w').write(json.dumps(records,separators=(',',':')))
PY
pkill -f 'python3 -m http.server 9900' >/dev/null 2>&1 || true
cd /var/lib/truin-d100
nohup python3 -m http.server 9900 --bind '${PRIV[$i]}' >/tmp/truyn-record-server.log 2>&1 &
ids=\$(jq -r '.[].nodeId' records.json)
uc=\$(printf '%s\n' "\$ids" | sort -u | wc -l)
ep=\$(jq -r '.[].endpoints[0]' records.json | sort -u | wc -l)
proc=\$(pgrep -fc 'network/testnet/node-service.js')
[ "\$uc" -eq 25 ] && [ "\$ep" -eq 25 ] && [ "\$proc" -ge 25 ]
echo READY=25
echo IDENTITIES=\$uc
echo ENDPOINTS=\$ep
echo PROCESSES=\$proc
EOS
)
  out=$(remote "${VMS[$i]}" "$script")
  [[ "$(marker "$out" READY)" == 25 ]]
  echo "TRUYN_CLASS_D_100 stage=install host=$i processes=25 identities=25 endpoints=25 status=PASS"
done

STAGE=bootstrap
IPS_JSON=$(printf '%s\n' "${PRIV[@]}" | jq -R . | jq -s -c .)
for i in $(seq 0 $((HOST_COUNT-1))); do
  script=$(cat <<EOS
set -Eeuo pipefail
ips='${IPS_JSON}'
rm -f /tmp/all-records.jsonl
for ip in \$(printf '%s' "\$ips" | jq -r '.[]'); do curl -fsS --max-time 10 "http://\${ip}:9900/records.json" | jq -c '.[]' >>/tmp/all-records.jsonl; done
jq -s '.' /tmp/all-records.jsonl >/tmp/all-records.json
[ "\$(jq 'length' /tmp/all-records.json)" -eq 100 ]
[ "\$(jq -r '.[].nodeId' /tmp/all-records.json | sort -u | wc -l)" -eq 100 ]
[ "\$(jq -r '.[].endpoints[0]' /tmp/all-records.json | sort -u | wc -l)" -eq 100 ]
payload=\$(jq -c '{records:.}' /tmp/all-records.json)
t0=\$(date +%s%3N)
for j in \$(seq 0 24); do curl -fsS --max-time 60 -H 'content-type: application/json' --data-binary "\$payload" http://127.0.0.1:\$(( ${CONTROL_BASE} + j ))/bootstrap >/dev/null; done
t1=\$(date +%s%3N)
peers=0
for j in \$(seq 0 24); do p=\$(curl -fsS http://127.0.0.1:\$(( ${CONTROL_BASE} + j ))/status | jq -r '.peerCount'); [ "\$p" -ge 90 ] && peers=\$((peers+1)); done
[ "\$peers" -eq 25 ]
echo BOOTSTRAP_MS=\$((t1-t0))
echo FULL_PEERS=\$peers
EOS
)
  out=$(remote "${VMS[$i]}" "$script")
  [[ "$(marker "$out" FULL_PEERS)" == 25 ]]
  echo "TRUYN_CLASS_D_100 stage=bootstrap host=$i fullRoutingNodes=25 bootstrapMs=$(marker "$out" BOOTSTRAP_MS)"
done

STAGE=bandwidth-meter
for i in $(seq 0 $((HOST_COUNT-1))); do
  remote "${VMS[$i]}" "iptables -I OUTPUT 1 -p udp --dport ${QUIC_BASE}:$((QUIC_BASE+24)) -m comment --comment truyn-d100-meter-out -j ACCEPT; iptables -I INPUT 1 -p udp --sport ${QUIC_BASE}:$((QUIC_BASE+24)) -m comment --comment truyn-d100-meter-in -j ACCEPT; echo METER=1" >/dev/null
done
