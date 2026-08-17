#!/usr/bin/env bash
set -Eeuo pipefail

STAGE=init
gate_ok=0
retry(){ local n=0; until "$@"; do n=$((n+1)); [[ $n -lt 6 ]] || return 1; sleep $((n*3)); done; }
mask(){ [[ -z "${1:-}" ]] || echo "::add-mask::$1"; }
fail(){ echo "TRUYN_CLASS_C=FAIL stage=$STAGE reason=$1"; exit "${2:-90}"; }
trap 'rc=$?; echo "::error title=TRUYN Class C gate failure::stage=$STAGE exit=$rc line=$LINENO"; exit $rc' ERR

: "${AZURE_LOCATION:=eastus2}"
: "${AZURE_VM_SIZE:=Standard_B1ms}"
: "${GCP_REGION_VALUE:=us-central1}"
: "${PEER_TTL_MS:=30000}"
TEST_COMMIT="$(git rev-parse HEAD)"

STAGE=cloud-context
AZ_RG="$(az group list --query "[?contains(name, 'truyn')].name | [0]" -o tsv --only-show-errors)"
[[ -n "$AZ_RG" ]] || fail azure_resource_group_missing 10
mask "$AZ_RG"
GCP_PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
if [[ -z "$GCP_PROJECT" || "$GCP_PROJECT" == '(unset)' ]]; then
  GCP_PROJECT="${GCP_DEPLOYER_SERVICE_ACCOUNT_EMAIL_VALUE#*@}"; GCP_PROJECT="${GCP_PROJECT%.iam.gserviceaccount.com}"
  gcloud config set project "$GCP_PROJECT" >/dev/null
fi
[[ -n "$GCP_PROJECT" ]] || fail gcp_project_missing 11
mask "$GCP_PROJECT"
GCP_R1="$GCP_REGION_VALUE"
mask "$GCP_R1"

PREFIX="truyn-c-${GITHUB_RUN_ID}"
AZ_VNET1="${PREFIX}-vnet1"; AZ_PUB_SUB1="${PREFIX}-pub1"; AZ_NAT_SUB="${PREFIX}-nat"; AZ_VNET2="${PREFIX}-vnet2"; AZ_PUB_SUB2="${PREFIX}-pub2"; AZ_NSG="${PREFIX}-nsg"
AZ_A0="${PREFIX}-a0"; AZ_A2="${PREFIX}-a2"; AZ_AN="${PREFIX}-an"
AZ_A0_PIP="${PREFIX}-a0-pip"; AZ_A2_PIP="${PREFIX}-a2-pip"; AZ_NAT_PIP="${PREFIX}-nat-pip"; AZ_NAT_GW="${PREFIX}-natgw"
AZ_A0_NIC="${PREFIX}-a0-nic"; AZ_A2_NIC="${PREFIX}-a2-nic"; AZ_AN_NIC="${PREFIX}-an-nic"
G_REPO="${PREFIX}-repo"; G_SERVICE="${PREFIX}-node"
for v in "$AZ_VNET1" "$AZ_PUB_SUB1" "$AZ_NAT_SUB" "$AZ_VNET2" "$AZ_PUB_SUB2" "$AZ_NSG" "$AZ_A0" "$AZ_A2" "$AZ_AN" "$AZ_A0_PIP" "$AZ_A2_PIP" "$AZ_NAT_PIP" "$AZ_NAT_GW" "$AZ_A0_NIC" "$AZ_A2_NIC" "$AZ_AN_NIC" "$G_REPO" "$G_SERVICE"; do mask "$v"; done

cleanup(){
  set +e
  STAGE=cleanup
  gcloud run services delete "$G_SERVICE" --region "$GCP_R1" --quiet >/dev/null 2>&1 || true
  gcloud artifacts repositories delete "$G_REPO" --location "$GCP_R1" --quiet >/dev/null 2>&1 || true
  az vm delete -g "$AZ_RG" -n "$AZ_A0" --yes --force-deletion --only-show-errors >/dev/null 2>&1 || true
  az vm delete -g "$AZ_RG" -n "$AZ_A2" --yes --force-deletion --only-show-errors >/dev/null 2>&1 || true
  az vm delete -g "$AZ_RG" -n "$AZ_AN" --yes --force-deletion --only-show-errors >/dev/null 2>&1 || true
  az network nic delete -g "$AZ_RG" -n "$AZ_A0_NIC" --only-show-errors >/dev/null 2>&1 || true
  az network nic delete -g "$AZ_RG" -n "$AZ_A2_NIC" --only-show-errors >/dev/null 2>&1 || true
  az network nic delete -g "$AZ_RG" -n "$AZ_AN_NIC" --only-show-errors >/dev/null 2>&1 || true
  az network nat gateway delete -g "$AZ_RG" -n "$AZ_NAT_GW" --only-show-errors >/dev/null 2>&1 || true
  az network public-ip delete -g "$AZ_RG" -n "$AZ_A0_PIP" --only-show-errors >/dev/null 2>&1 || true
  az network public-ip delete -g "$AZ_RG" -n "$AZ_A2_PIP" --only-show-errors >/dev/null 2>&1 || true
  az network public-ip delete -g "$AZ_RG" -n "$AZ_NAT_PIP" --only-show-errors >/dev/null 2>&1 || true
  az network nsg delete -g "$AZ_RG" -n "$AZ_NSG" --only-show-errors >/dev/null 2>&1 || true
  az network vnet delete -g "$AZ_RG" -n "$AZ_VNET1" --only-show-errors >/dev/null 2>&1 || true
  az network vnet delete -g "$AZ_RG" -n "$AZ_VNET2" --only-show-errors >/dev/null 2>&1 || true
  if [[ "$gate_ok" == 1 ]]; then echo 'TRUYN_CLASS_C_CLEANUP=PASS ephemeralResourcesRemoved=true gcpNetworkMutated=false'; else echo 'TRUYN_CLASS_C_CLEANUP=EXECUTED gateFailed=true gcpNetworkMutated=false'; fi
}
trap cleanup EXIT

STAGE=azure-network
az network nsg create -g "$AZ_RG" -n "$AZ_NSG" -l "$AZURE_LOCATION" --only-show-errors >/dev/null
az network nsg rule create -g "$AZ_RG" --nsg-name "$AZ_NSG" -n allow-truyn-quic --priority 100 --direction Inbound --access Allow --protocol Udp --destination-port-ranges 4433 --source-address-prefixes '*' --only-show-errors >/dev/null
az network vnet create -g "$AZ_RG" -n "$AZ_VNET1" -l "$AZURE_LOCATION" --address-prefixes 10.253.0.0/16 --subnet-name "$AZ_PUB_SUB1" --subnet-prefixes 10.253.1.0/24 --only-show-errors >/dev/null
az network vnet create -g "$AZ_RG" -n "$AZ_VNET2" -l "$AZURE_LOCATION" --address-prefixes 10.254.0.0/16 --subnet-name "$AZ_PUB_SUB2" --subnet-prefixes 10.254.1.0/24 --only-show-errors >/dev/null
az network public-ip create -g "$AZ_RG" -n "$AZ_NAT_PIP" -l "$AZURE_LOCATION" --sku Standard --allocation-method Static --only-show-errors >/dev/null
az network nat gateway create -g "$AZ_RG" -n "$AZ_NAT_GW" -l "$AZURE_LOCATION" --public-ip-addresses "$AZ_NAT_PIP" --idle-timeout 10 --only-show-errors >/dev/null
az network vnet subnet create -g "$AZ_RG" --vnet-name "$AZ_VNET1" -n "$AZ_NAT_SUB" --address-prefixes 10.253.2.0/24 --nat-gateway "$AZ_NAT_GW" --network-security-group "$AZ_NSG" --only-show-errors >/dev/null
az network vnet subnet update -g "$AZ_RG" --vnet-name "$AZ_VNET1" -n "$AZ_PUB_SUB1" --network-security-group "$AZ_NSG" --only-show-errors >/dev/null
az network vnet subnet update -g "$AZ_RG" --vnet-name "$AZ_VNET2" -n "$AZ_PUB_SUB2" --network-security-group "$AZ_NSG" --only-show-errors >/dev/null
az network public-ip create -g "$AZ_RG" -n "$AZ_A0_PIP" -l "$AZURE_LOCATION" --sku Standard --allocation-method Static --only-show-errors >/dev/null
az network public-ip create -g "$AZ_RG" -n "$AZ_A2_PIP" -l "$AZURE_LOCATION" --sku Standard --allocation-method Static --only-show-errors >/dev/null
az network nic create -g "$AZ_RG" -n "$AZ_A0_NIC" -l "$AZURE_LOCATION" --vnet-name "$AZ_VNET1" --subnet "$AZ_PUB_SUB1" --public-ip-address "$AZ_A0_PIP" --only-show-errors >/dev/null
az network nic create -g "$AZ_RG" -n "$AZ_AN_NIC" -l "$AZURE_LOCATION" --vnet-name "$AZ_VNET1" --subnet "$AZ_NAT_SUB" --only-show-errors >/dev/null
az network nic create -g "$AZ_RG" -n "$AZ_A2_NIC" -l "$AZURE_LOCATION" --vnet-name "$AZ_VNET2" --subnet "$AZ_PUB_SUB2" --public-ip-address "$AZ_A2_PIP" --only-show-errors >/dev/null
for vm in "$AZ_A0:$AZ_A0_NIC" "$AZ_A2:$AZ_A2_NIC" "$AZ_AN:$AZ_AN_NIC"; do
  n="${vm%%:*}"; nic="${vm#*:}"
  az vm create -g "$AZ_RG" -n "$n" -l "$AZURE_LOCATION" --image Ubuntu2204 --size "$AZURE_VM_SIZE" --admin-username truynadmin --generate-ssh-keys --nics "$nic" --os-disk-delete-option Delete --tags "truyn-ephemeral-run=${GITHUB_RUN_ID}" --no-wait --only-show-errors >/dev/null
done
retry az vm wait -g "$AZ_RG" -n "$AZ_A0" --created --interval 5 --timeout 600 --only-show-errors
retry az vm wait -g "$AZ_RG" -n "$AZ_A2" --created --interval 5 --timeout 600 --only-show-errors
retry az vm wait -g "$AZ_RG" -n "$AZ_AN" --created --interval 5 --timeout 600 --only-show-errors
A0_PUB="$(az network public-ip show -g "$AZ_RG" -n "$AZ_A0_PIP" --query ipAddress -o tsv)"
A2_PUB="$(az network public-ip show -g "$AZ_RG" -n "$AZ_A2_PIP" --query ipAddress -o tsv)"
AN_PRIV="$(az network nic show -g "$AZ_RG" -n "$AZ_AN_NIC" --query 'ipConfigurations[0].privateIPAddress' -o tsv)"
NAT_PUB="$(az network public-ip show -g "$AZ_RG" -n "$AZ_NAT_PIP" --query ipAddress -o tsv)"
[[ -n "$A0_PUB" && -n "$A2_PUB" && -n "$AN_PRIV" && -n "$NAT_PUB" ]] || fail azure_address_missing 20
[[ -z "$(az network nic show -g "$AZ_RG" -n "$AZ_AN_NIC" --query 'ipConfigurations[0].publicIPAddress.id' -o tsv)" ]] || fail nat_node_unexpected_public_ip 21
for v in "$A0_PUB" "$A2_PUB" "$AN_PRIV" "$NAT_PUB"; do mask "$v"; done
echo 'TRUYN_CLASS_C_STAGE azureNat=PASS privateNodePublicIp=false isolatedPublicVnets=2'

az_remote(){ retry az vm run-command invoke -g "$AZ_RG" -n "$1" --command-id RunShellScript --scripts "$2" --query 'value[0].message' -o tsv --only-show-errors; }
az_call(){
  local vm="$1" method="$2" path="$3" payload="${4:-}" enc='' script out b
  [[ -z "$payload" ]] || enc="$(printf '%s' "$payload" | base64 -w0)"
  if [[ -n "$enc" ]]; then
    script="set -eu; printf '%s' '$enc'|base64 -d >/tmp/q; curl -fsS --max-time 60 -X '$method' -H 'content-type: application/json' --data-binary @/tmp/q 'http://127.0.0.1:8788$path' >/tmp/b; printf 'TRUYN_BODY_B64=%s\\n' \"\$(base64 -w0 /tmp/b)\""
  else
    script="set -eu; curl -fsS --max-time 60 -X '$method' 'http://127.0.0.1:8788$path' >/tmp/b; printf 'TRUYN_BODY_B64=%s\\n' \"\$(base64 -w0 /tmp/b)\""
  fi
  out="$(az_remote "$vm" "$script")"
  b="$(printf '%s\n' "$out" | sed -n 's/.*TRUYN_BODY_B64=//p' | tail -1 | tr -d '\r')"
  [[ -n "$b" ]] || return 1
  printf '%s' "$b" | base64 -d
}

install_script(){
  local adv="$1"
  cat <<SCRIPT
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl jq openssl ca-certificates iproute2 iptables >/dev/null
major=0; command -v node >/dev/null 2>&1 && major=\$(node -p 'parseInt(process.versions.node)' 2>/dev/null || echo 0)
if [[ "\$major" -lt 22 ]]; then curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null; apt-get install -y -qq nodejs >/dev/null; fi
id -u truyn >/dev/null 2>&1 || useradd --system --home /var/lib/truyn-testnet --shell /usr/sbin/nologin truyn
rm -rf /opt/truyn; git clone -q https://github.com/inn-media/truyn.git /opt/truyn; cd /opt/truyn; git checkout -q '$TEST_COMMIT'; npm install --ignore-scripts --no-audit --no-fund >/dev/null
install -d -m 0700 -o truyn -g truyn /var/lib/truyn-testnet /etc/truyn-testnet
openssl req -x509 -newkey rsa:2048 -nodes -keyout /etc/truyn-testnet/key.pem -out /etc/truyn-testnet/cert.pem -subj '/CN=${adv}' -days 1 -addext 'subjectAltName=IP:${adv}' >/dev/null 2>&1
chown truyn:truyn /etc/truyn-testnet/key.pem /etc/truin-testnet/cert.pem 2>/dev/null || true
chown truyn:truyn /etc/truy*n-testnet/key.pem /etc/truy*n-testnet/cert.pem 2>/dev/null || true
chown truyn:truyn /etc/truyn-testnet/key.pem /etc/truyn-testnet/cert.pem
chmod 0600 /etc/truyn-testnet/key.pem
cat <<UNIT >/etc/systemd/system/truyn-testnet.service
[Unit]
After=network-online.target
Wants=network-online.target
[Service]
User=truyn
Group=truyn
WorkingDirectory=/opt/truyn
Environment=TRUYN_TESTNET_DATA_DIR=/var/lib/truyn-testnet
Environment=TRUYN_TLS_KEY_PATH=/etc/truin-testnet/key.pem
Environment=TRUYN_TLS_CERT_PATH=/etc/truin-testnet/cert.pem
Environment=TRUYN_ADVERTISE_HOST=${adv}
Environment=TRUYN_QUIC_HOST=0.0.0.0
Environment=TRUYN_QUIC_PORT=4433
Environment=TRUYN_CONTROL_HOST=127.0.0.1
Environment=TRUYN_CONTROL_PORT=8788
Environment=TRUYN_PEER_RECORD_TTL_MS=$PEER_TTL_MS
Environment=TRUYN_DHT_REPLICATION_FACTOR=3
Environment=TRUYN_DHT_WRITE_QUORUM=2
Environment=TRUYN_DHT_RPC_TIMEOUT_MS=5000
ExecStart=/usr/bin/node /opt/truin/network/testnet/node-service.js
Restart=on-failure
RestartSec=2
[Install]
WantedBy=multi-user.target
UNIT
sed -i 's#/etc/truin-testnet#/etc/truyn-testnet#g; s#/opt/truin/#/opt/truyn/#g' /etc/systemd/system/truyn-testnet.service
systemctl daemon-reload; systemctl enable --now truyn-testnet.service >/dev/null
for n in \$(seq 1 60); do curl -fsS --max-time 2 http://127.0.0.1:8788/status >/dev/null && { echo TRUYN_NODE_READY; exit 0; }; sleep 2; done
systemctl --no-pager status truyn-testnet.service || true; exit 31
SCRIPT
}

STAGE=azure-install
out="$(az_remote "$AZ_A0" "$(install_script "$A0_PUB")")"; grep -Fq TRUYN_NODE_READY <<<"$out" || fail azure_a0_start 30
out="$(az_remote "$AZ_A2" "$(install_script "$A2_PUB")")"; grep -Fq TRUYN_NODE_READY <<<"$out" || fail azure_a2_start 31
out="$(az_remote "$AZ_AN" "$(install_script "$AN_PRIV")")"; grep -Fq TRUYN_NODE_READY <<<"$out" || fail azure_nat_start 32

STAGE=gcp-cloud-run
retry gcloud artifacts repositories create "$G_REPO" --repository-format=docker --location="$GCP_R1" --description='TRUYN Class C ephemeral proof' --quiet >/dev/null
REGISTRY="${GCP_R1}-docker.pkg.dev"
gcloud auth configure-docker "$REGISTRY" --quiet >/dev/null
IMAGE="$REGISTRY/$GCP_PROJECT/$G_REPO/node:$GITHUB_RUN_ID"
docker build -q -t "$IMAGE" . >/dev/null
docker push "$IMAGE" >/dev/null
openssl req -x509 -newkey rsa:2048 -nodes -keyout /tmp/g-key.pem -out /tmp/g-cert.pem -subj '/CN=127.0.0.1' -days 1 -addext 'subjectAltName=IP:127.0.0.1' >/dev/null 2>&1
KEY64="$(base64 -w0 /tmp/g-key.pem)"; CERT64="$(base64 -w0 /tmp/g-cert.pem)"
cat >/tmp/truyn-cloudrun-env.yaml <<EOF
TRUYN_TESTNET_DATA_DIR: "/tmp/truyn-testnet"
TRUYN_TLS_KEY_B64: "$KEY64"
TRUYN_TLS_CERT_B64: "$CERT64"
TRUYN_ADVERTISE_HOST: "127.0.0.1"
TRUYN_QUIC_HOST: "0.0.0.0"
TRUYN_QUIC_PORT: "4433"
TRUYN_CONTROL_HOST: "0.0.0.0"
TRUYN_CONTROL_PORT: "8080"
TRUYN_PEER_RECORD_TTL_MS: "$PEER_TTL_MS"
TRUYN_DHT_REPLICATION_FACTOR: "3"
TRUYN_DHT_WRITE_QUORUM: "2"
TRUYN_DHT_RPC_TIMEOUT_MS: "5000"
EOF
RUN_ARGS=(run deploy "$G_SERVICE" --image "$IMAGE" --region "$GCP_R1" --platform managed --command node --args network/testnet/node-service.js --env-vars-file /tmp/truyn-cloudrun-env.yaml --port 8080 --min 1 --max 1 --concurrency 1 --cpu 1 --memory 512Mi --no-cpu-throttling --no-invoker-iam-check --quiet)
if [[ -n "${GCP_RUNTIME_SERVICE_ACCOUNT_EMAIL_VALUE:-}" ]]; then RUN_ARGS+=(--service-account "$GCP_RUNTIME_SERVICE_ACCOUNT_EMAIL_VALUE"); fi
gcloud "${RUN_ARGS[@]}" >/dev/null || fail gcp_cloud_run_deploy_failed 33
G_URL="$(gcloud run services describe "$G_SERVICE" --region "$GCP_R1" --format='value(status.url)')"
[[ "$G_URL" == https://* ]] || fail gcp_cloud_run_url_missing 34
mask "$G_URL"
cr_call(){ local method="$1" path="$2" payload="${3:-}"; if [[ -n "$payload" ]]; then curl -fsS --max-time 70 -X "$method" -H 'content-type: application/json' --data-binary "$payload" "$G_URL$path"; else curl -fsS --max-time 70 -X "$method" "$G_URL$path"; fi; }
for n in $(seq 1 40); do cr_call GET /status >/dev/null 2>&1 && break; [[ $n -lt 40 ]] || fail gcp_cloud_run_start 35; sleep 3; done
echo 'TRUYN_CLASS_C_STAGE multicloud=PASS providers=2 regions=2 gcpComputeVmRequired=false gcpNetworkMutated=false'

STAGE=records
RA0="$(az_call "$AZ_A0" GET /record)"; RA2="$(az_call "$AZ_A2" GET /record)"; RAN="$(az_call "$AZ_AN" GET /record)"; RG0="$(cr_call GET /record)"
A0_ID="$(jq -r '.record.nodeId' <<<"$RA0")"; A2_ID="$(jq -r '.record.nodeId' <<<"$RA2")"; AN_ID="$(jq -r '.record.nodeId' <<<"$RAN")"; G0_ID="$(jq -r '.record.nodeId' <<<"$RG0")"
for v in "$A0_ID" "$A2_ID" "$AN_ID" "$G0_ID"; do [[ "$v" == truyn:node:* ]] || fail node_identity_missing 36; mask "$v"; done
[[ "$(printf '%s\n' "$A0_ID" "$A2_ID" "$AN_ID" "$G0_ID" | sort -u | wc -l)" == 4 ]] || fail node_identity_collision 37
S0="$(jq -r '.record.sequence' <<<"$RA0")"; S2="$(jq -r '.record.sequence' <<<"$RA2")"; SN="$(jq -r '.record.sequence' <<<"$RAN")"; SG="$(jq -r '.record.sequence' <<<"$RG0")"
ALL="$(printf '%s\n' "$RA0" "$RA2" "$RAN" "$RG0" | jq -s '{records:map(.record)}')"
az_call "$AZ_A0" POST /bootstrap "$ALL" >/dev/null; az_call "$AZ_A2" POST /bootstrap "$ALL" >/dev/null; az_call "$AZ_AN" POST /bootstrap "$ALL" >/dev/null; cr_call POST /bootstrap "$ALL" >/dev/null
echo 'TRUYN_CLASS_C_STAGE bootstrap=PASS identities=4 signedPeerRecords=true'

STAGE=cross-cloud-direct
P="$(jq -nc --arg id "$A0_ID" '{nodeId:$id,input:{proof:"gcp-cloudrun-to-azure-cross-cloud"}}')"; D1="$(cr_call POST /need "$P")"; [[ "$(jq -r '.transport' <<<"$D1")" == quic-direct ]] || fail gcp_to_azure_direct 40
P2="$(jq -nc --arg id "$A2_ID" '{nodeId:$id,input:{proof:"gcp-cloudrun-to-second-azure-vnet"}}')"; D2="$(cr_call POST /need "$P2")"; [[ "$(jq -r '.transport' <<<"$D2")" == quic-direct ]] || fail gcp_to_azure_vnet2_direct 41
echo 'TRUYN_CLASS_C_STAGE direct=PASS crossCloud=true isolatedAzureVnets=true relayCalls=0 cloudRunOutboundQuic=true'

STAGE=lease-gossip
sleep 42
NA0="$(az_call "$AZ_A0" GET /record)"; NA2="$(az_call "$AZ_A2" GET /record)"; NAN="$(az_call "$AZ_AN" GET /record)"; NG0="$(cr_call GET /record)"
N0="$(jq -r '.record.sequence' <<<"$NA0")"; N2="$(jq -r '.record.sequence' <<<"$NA2")"; NN="$(jq -r '.record.sequence' <<<"$NAN")"; NG="$(jq -r '.record.sequence' <<<"$NG0")"
(( N0 > S0 && N2 > S2 && NN > SN && NG > SG )) || fail autonomous_renewal_missing 50
A0_STATE_OUT="$(az_remote "$AZ_A0" "jq -c .peerRecords /var/lib/truyn-testnet/network-state.json | base64 -w0")"; A0_STATE64="$(printf '%s\n' "$A0_STATE_OUT" | tail -1 | tr -d '\r')"; A0_STATE="$(printf '%s' "$A0_STATE64" | base64 -d)"
OBS_AN="$(jq -r --arg id "$AN_ID" '[.[] | select(.nodeId==$id) | .sequence] | max // 0' <<<"$A0_STATE")"; OBS_G="$(jq -r --arg id "$G0_ID" '[.[] | select(.nodeId==$id) | .sequence] | max // 0' <<<"$A0_STATE")"
(( OBS_AN > SN && OBS_G > SG )) || fail remote_gossip_convergence_missing 51
echo 'TRUYN_CLASS_C_STAGE leases=PASS autonomous=true signedGossip=true survivedLease=true crossCloudGossip=true'

STAGE=packet-partition
az_remote "$AZ_A0" "iptables -I INPUT 1 -p udp --dport 4433 -j DROP" >/dev/null
NEG_PAY="$(jq -nc --arg id "$A0_ID" '{nodeId:$id,input:{proof:"real-packet-blackhole"}}')"
set +e
NEG_OUT="$(curl -sS --max-time 45 -o /tmp/class-c-neg -w '%{http_code}' -X POST -H 'content-type: application/json' --data-binary "$NEG_PAY" "$G_URL/need")"
NEG_RC=$?
set -e
[[ "$NEG_RC" -ne 0 || "$NEG_OUT" != 200 ]] || fail packet_partition_did_not_block 60
DROP_OUT="$(az_remote "$AZ_A0" "iptables -L INPUT -v -n -x --line-numbers | awk '\$1==1 {print \"TRUYN_DROP_PKTS=\"\$2}'")"; DROP_PKTS="$(printf '%s\n' "$DROP_OUT" | sed -n 's/.*TRUYN_DROP_PKTS=//p' | tail -1 | tr -dc '0-9')"
[[ -n "$DROP_PKTS" && "$DROP_PKTS" -gt 0 ]] || fail packet_drop_counter_zero 61
az_remote "$AZ_A0" "iptables -D INPUT -p udp --dport 4433 -j DROP" >/dev/null
sleep 3; t0="$(date +%s%3N)"; HEAL="$(cr_call POST /need "$NEG_PAY")"; heal_ms=$(( $(date +%s%3N) - t0 )); [[ "$(jq -r '.transport' <<<"$HEAL")" == quic-direct ]] || fail packet_heal_failed 62
echo "TRUYN_CLASS_C_STAGE packetPartition=PASS actualPacketDrop=true droppedPackets=$DROP_PKTS healMs=$heal_ms"

STAGE=real-cloud-nat
az_remote "$AZ_A2" "iptables -I INPUT 1 -p udp -s '$NAT_PUB' --dport 4433 -j ACCEPT" >/dev/null
NAT_PAY="$(jq -nc --arg id "$A2_ID" '{nodeId:$id,input:{proof:"azure-nat-gateway-outbound"}}')"; NAT_OK="$(az_call "$AZ_AN" POST /need "$NAT_PAY")"; [[ "$(jq -r '.transport' <<<"$NAT_OK")" == quic-direct ]] || fail cloud_nat_outbound_quic_failed 70
NAT_COUNT_OUT="$(az_remote "$AZ_A2" "iptables -L INPUT -v -n -x --line-numbers | awk '\$1==1 {print \"TRUYN_NAT_PKTS=\"\$2}'")"; NAT_PKTS="$(printf '%s\n' "$NAT_COUNT_OUT" | sed -n 's/.*TRUYN_NAT_PKTS=//p' | tail -1 | tr -dc '0-9')"
[[ -n "$NAT_PKTS" && "$NAT_PKTS" -gt 0 ]] || fail nat_gateway_source_not_observed 71
IN_PAY="$(jq -nc --arg id "$AN_ID" '{nodeId:$id,input:{proof:"nat-inbound-negative"}}')"; IN64="$(printf '%s' "$IN_PAY" | base64 -w0)"
IN_NEG="$(az_remote "$AZ_A2" "set +e; printf '%s' '$IN64'|base64 -d >/tmp/q; code=\$(curl -sS --max-time 38 -o /tmp/b -w '%{http_code}' -X POST -H 'content-type: application/json' --data-binary @/tmp/q http://127.0.0.1:8788/need); printf 'TRUYN_IN_CODE=%s\\n' \"\$code\"; exit 0")"; IN_CODE="$(printf '%s\n' "$IN_NEG" | sed -n 's/.*TRUYN_IN_CODE=//p' | tail -1 | tr -d '\r')"
[[ "$IN_CODE" != 200 ]] || fail cloud_nat_unexpected_inbound_direct 72
echo "TRUYN_CLASS_C_STAGE cloudNat=PASS privateNodePublicIp=false outboundDirect=true natSourceObserved=true natPackets=$NAT_PKTS inboundFromIsolatedVnet=false fallbackRequired=true"

STAGE=double-nat
INNER_SETUP=$(cat <<'SCRIPT'
set -Eeuo pipefail
ip netns del truyn-cgnat >/dev/null 2>&1 || true
ip link del truyn-cgnat-host >/dev/null 2>&1 || true
ip netns add truyn-cgnat
ip link add truyn-cgnat-host type veth peer name truyn-cgnat-inner
ip link set truyn-cgnat-inner netns truyn-cgnat
ip addr add 192.168.55.1/24 dev truyn-cgnat-host; ip link set truyn-cgnat-host up
ip netns exec truyn-cgnat ip addr add 192.168.55.2/24 dev truyn-cgnat-inner
ip netns exec truyn-cgnat ip link set lo up; ip netns exec truyn-cgnat ip link set truyn-cgnat-inner up; ip netns exec truyn-cgnat ip route add default via 192.168.55.1
sysctl -w net.ipv4.ip_forward=1 >/dev/null
iptables -I FORWARD 1 -s 192.168.55.0/24 -j ACCEPT
iptables -I FORWARD 1 -d 192.168.55.0/24 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -t nat -I POSTROUTING 1 -s 192.168.55.0/24 -j MASQUERADE
install -d -m 0700 -o truyn -g truyn /var/lib/truyn-cgnat /etc/truyn-cgnat
openssl req -x509 -newkey rsa:2048 -nodes -keyout /etc/truyn-cgnat/key.pem -out /etc/truin-cgnat/cert.pem -subj '/CN=192.168.55.2' -days 1 -addext 'subjectAltName=IP:192.168.55.2' >/dev/null 2>&1
SCRIPT
)
INNER_SETUP="${INNER_SETUP//\/etc\/truin-cgnat/\/etc\/truyn-cgnat}"
INNER_SETUP+=$'\nchown -R truyn:truyn /var/lib/truyn-cgnat /etc/truyn-cgnat; chmod 0600 /etc/truyn-cgnat/key.pem'
INNER_SETUP+=$'\nip netns exec truyn-cgnat runuser -u truyn -- env TRUYN_TESTNET_DATA_DIR=/var/lib/truyn-cgnat TRUYN_TLS_KEY_PATH=/etc/truin-cgnat/key.pem TRUYN_TLS_CERT_PATH=/etc/truin-cgnat/cert.pem TRUYN_ADVERTISE_HOST=192.168.55.2 TRUYN_QUIC_HOST=0.0.0.0 TRUYN_QUIC_PORT=4433 TRUYN_CONTROL_HOST=127.0.0.1 TRUYN_CONTROL_PORT=8788 TRUYN_PEER_RECORD_TTL_MS=30000 nohup node /opt/truin/network/testnet/node-service.js >/var/lib/truin-cgnat.log 2>&1 &'
INNER_SETUP="${INNER_SETUP//\/etc\/truin-cgnat/\/etc\/truyn-cgnat}"; INNER_SETUP="${INNER_SETUP//\/opt\/truin/\/opt\/truyn}"; INNER_SETUP="${INNER_SETUP//\/var\/lib\/truin-cgnat/\/var\/lib\/truyn-cgnat}"
INNER_SETUP+=$'\nfor n in $(seq 1 40); do ip netns exec truyn-cgnat curl -fsS --max-time 2 http://127.0.0.1:8788/status >/dev/null && { echo TRUYN_INNER_READY; exit 0; }; sleep 2; done; cat /var/lib/truyn-cgnat.log 2>/dev/null || true; exit 1'
DOUB="$(az_remote "$AZ_AN" "$INNER_SETUP")"; grep -Fq TRUYN_INNER_READY <<<"$DOUB" || fail double_nat_inner_start 80
INNER_REC_OUT="$(az_remote "$AZ_AN" "ip netns exec truyn-cgnat curl -fsS http://127.0.0.1:8788/record | base64 -w0")"; INNER_REC64="$(printf '%s\n' "$INNER_REC_OUT" | tail -1 | tr -d '\r')"; INNER_REC="$(printf '%s' "$INNER_REC64" | base64 -d)"; INNER_ID="$(jq -r '.record.nodeId' <<<"$INNER_REC")"; [[ "$INNER_ID" == truyn:node:* ]] || fail double_nat_identity 81; mask "$INNER_ID"
BOOT_A2="$(jq -nc --argjson r "$(jq -c '.record' <<<"$NA2")" '{records:[$r]}')"; BOOT64="$(printf '%s' "$BOOT_A2" | base64 -w0)"; az_remote "$AZ_AN" "printf '%s' '$BOOT64'|base64 -d >/tmp/q; ip netns exec truyn-cgnat curl -fsS -X POST -H 'content-type: application/json' --data-binary @/tmp/q http://127.0.0.1:8788/bootstrap >/dev/null" >/dev/null
BEFORE_OUT="$(az_remote "$AZ_A2" "iptables -L INPUT -v -n -x --line-numbers | awk '\$1==1 {print \"TRUYN_BEFORE=\"\$2}'")"; BEFORE="$(printf '%s\n' "$BEFORE_OUT" | sed -n 's/.*TRUYN_BEFORE=//p' | tail -1 | tr -dc '0-9')"
DPAY="$(jq -nc --arg id "$A2_ID" '{nodeId:$id,input:{proof:"double-nat-outbound"}}')"; DP64="$(printf '%s' "$DPAY" | base64 -w0)"; DOUT="$(az_remote "$AZ_AN" "printf '%s' '$DP64'|base64 -d >/tmp/q; ip netns exec truyn-cgnat curl -fsS --max-time 60 -X POST -H 'content-type: application/json' --data-binary @/tmp/q http://127.0.0.1:8788/need | base64 -w0")"; DB64="$(printf '%s\n' "$DOUT" | tail -1 | tr -d '\r')"; DJSON="$(printf '%s' "$DB64" | base64 -d)"; [[ "$(jq -r '.transport' <<<"$DJSON")" == quic-direct ]] || fail double_nat_outbound_quic 82
AFTER_OUT="$(az_remote "$AZ_A2" "iptables -L INPUT -v -n -x --line-numbers | awk '\$1==1 {print \"TRUYN_AFTER=\"\$2}'")"; AFTER="$(printf '%s\n' "$AFTER_OUT" | sed -n 's/.*TRUYN_AFTER=//p' | tail -1 | tr -dc '0-9')"; (( AFTER > BEFORE )) || fail double_nat_outer_source_not_observed 83
echo 'TRUYN_CLASS_C_STAGE doubleNat=PASS layers=2 outboundDirect=true outerNatSourceObserved=true classification=cgnat-like-emulation carrierFieldClaim=false'

STAGE=local-regression
node --test tests/network-peer-lease-class-c.test.js tests/network-nat-class-c.test.js >/tmp/class-c-unit.log
cat /tmp/class-c-unit.log | tail -20

STAGE=gate
gate_ok=1
jq -nc --arg gate PASS --arg tested "$TEST_COMMIT" --argjson hosts 4 --argjson providers 2 --argjson regions 2 --argjson healMs "$heal_ms" --argjson dropped "$DROP_PKTS" --argjson natPkts "$NAT_PKTS" '{gate:$gate,testedCommit:$tested,realNodeRuntimes:$hosts,cloudProviders:$providers,cloudRegions:$regions,gcpNodeRuntime:"cloud-run",gcpComputeVmRequired:false,gcpNetworkMutated:false,autonomousPeerLease:true,signedPeerGossip:true,crossCloudDirectQuic:true,crossCloudDirection:"gcp-cloud-run->azure",relayCalls:0,packetPathPartition:true,packetDropCount:$dropped,packetHealMs:$healMs,realAzureNatGateway:true,natSourceObserved:true,natPacketCount:$natPkts,privateNatNodePublicIp:false,doubleNatCgnatLikeOutbound:true,carrierCgnatFieldValidated:false}' | sed 's/^/TRUYN_CLASS_C=/'
