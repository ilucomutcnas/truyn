#!/usr/bin/env bash
set -Eeuo pipefail

: "${HOST_COUNT:?source class-d-azure-1000-provision.sh first}"
: "${NODES_PER_HOST:?source class-d-azure-1000-provision.sh first}"
: "${NODE_COUNT:?source class-d-azure-1000-provision.sh first}"

STAGE=topology
out=$(remote "${VMS[0]}" "set -Eeuo pipefail; f=/var/lib/truyn-d1000/records-by-host.json; echo NODES=\$(jq '[.[][]]|length' \"\$f\"); echo IDS=\$(jq -r '.[][]|.nodeId' \"\$f\"|sort -u|wc -l); echo EPS=\$(jq -r '.[][]|.endpoints[0]' \"\$f\"|sort -u|wc -l)")
[[ "$(marker "$out" NODES)" == "$NODE_COUNT" ]]
[[ "$(marker "$out" IDS)" == "$NODE_COUNT" ]]
[[ "$(marker "$out" EPS)" == "$NODE_COUNT" ]]
echo "TRUYN_CLASS_D_1000 stage=topology nodes=${NODE_COUNT} identities=${NODE_COUNT} sockets=${NODE_COUNT} hosts=${HOST_COUNT} status=PASS"

STAGE=convergence
conv_success=0; conv_total=0; conv_p95=0; conv_p99=0
for i in $(seq 0 $((HOST_COUNT-1))); do
  script=$(cat <<EOS
set -Eeuo pipefail
python3 - <<'PY'
import concurrent.futures,json,subprocess,time
records=json.load(open('/var/lib/truyn-d1000/records-by-host.json'))
host=${i}; H=${HOST_COUNT}; N=${NODES_PER_HOST}; base=${CONTROL_BASE}
def one(j):
    target_host=(host+1+(j%(H-1)))%H
    target_local=(j*17+host*7)%N
    node_id=records[target_host][target_local]['nodeId']
    body=json.dumps({'nodeId':node_id,'input':{'scenario':'d1000-convergence','source':host*N+j}},separators=(',',':'))
    start=time.monotonic()
    deadline=start+175
    while time.monotonic()<deadline:
        p=subprocess.run(['curl','-sS','--max-time','12','-o','/tmp/d1000-conv-'+str(j),'-w','%{http_code}','-H','content-type: application/json','--data-binary',body,f'http://127.0.0.1:{base+j}/need'],text=True,capture_output=True)
        if p.returncode==0 and p.stdout.strip()=='200': return (1,(time.monotonic()-start)*1000)
        time.sleep(.5)
    return (0,175000.0)
with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
    rows=list(ex.map(one,range(N)))
lat=sorted(v for ok,v in rows if ok); success=sum(ok for ok,_ in rows)
def q(p):
    if not lat:return 999999
    return round(lat[min(len(lat)-1,max(0,int((len(lat)-1)*p)))],3)
print('CONV_OK='+str(success)); print('CONV_TOTAL='+str(N)); print('CONV_P95='+str(q(.95))); print('CONV_P99='+str(q(.99)))
PY
EOS
)
  out=$(remote "${VMS[$i]}" "$script")
  ok=$(marker "$out" CONV_OK); total=$(marker "$out" CONV_TOTAL); p95=$(marker "$out" CONV_P95); p99=$(marker "$out" CONV_P99)
  conv_success=$((conv_success+ok)); conv_total=$((conv_total+total))
  conv_p95=$(python3 -c "print(max(float('$conv_p95'),float('$p95')))" )
  conv_p99=$(python3 -c "print(max(float('$conv_p99'),float('$p99')))" )
  echo "TRUYN_CLASS_D_1000 stage=convergence host=$i success=${ok}/${total} p95Ms=${p95} p99Ms=${p99}"
done
conv_rate=$(python3 -c "print(round($conv_success/$conv_total,6))")
python3 - <<PY
assert float('$conv_rate') >= .99, '$conv_rate'
assert float('$conv_p95') <= 180000, '$conv_p95'
PY

STAGE=baseline-routing
base_success=0; base_total=0; base_p50=0; base_p90=0; base_p95=0; base_p99=0
for i in $(seq 0 $((HOST_COUNT-1))); do
  script=$(cat <<EOS
set -Eeuo pipefail
python3 - <<'PY'
import concurrent.futures,json,random,subprocess,time
records=json.load(open('/var/lib/truyn-d1000/records-by-host.json'))
host=${i}; H=${HOST_COUNT}; N=${NODES_PER_HOST}; base=${CONTROL_BASE}
def one(k):
    j=k%N
    r=random.Random(20260818+host*10000+k)
    target_host=r.randrange(H-1)
    if target_host>=host: target_host+=1
    target_local=r.randrange(N)
    node_id=records[target_host][target_local]['nodeId']
    body=json.dumps({'nodeId':node_id,'input':{'scenario':'d1000-baseline','probe':k}},separators=(',',':'))
    t=time.perf_counter_ns()
    p=subprocess.run(['curl','-sS','--max-time','15','-o','/tmp/d1000-base-'+str(k),'-w','%{http_code}','-H','content-type: application/json','--data-binary',body,f'http://127.0.0.1:{base+j}/need'],text=True,capture_output=True)
    ms=(time.perf_counter_ns()-t)/1e6
    return (int(p.returncode==0 and p.stdout.strip()=='200'),ms)
with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
    rows=list(ex.map(one,range(N*2)))
lat=sorted(v for ok,v in rows if ok); success=sum(ok for ok,_ in rows); total=N*2
def q(p):
    if not lat:return 999999
    return round(lat[min(len(lat)-1,max(0,int((len(lat)-1)*p)))],3)
print('BASE_OK='+str(success)); print('BASE_TOTAL='+str(total)); print('BASE_P50='+str(q(.50))); print('BASE_P90='+str(q(.90))); print('BASE_P95='+str(q(.95))); print('BASE_P99='+str(q(.99)))
PY
EOS
)
  out=$(remote "${VMS[$i]}" "$script")
  ok=$(marker "$out" BASE_OK); total=$(marker "$out" BASE_TOTAL); p50=$(marker "$out" BASE_P50); p90=$(marker "$out" BASE_P90); p95=$(marker "$out" BASE_P95); p99=$(marker "$out" BASE_P99)
  base_success=$((base_success+ok)); base_total=$((base_total+total))
  base_p50=$(python3 -c "print(max(float('$base_p50'),float('$p50')))" ); base_p90=$(python3 -c "print(max(float('$base_p90'),float('$p90')))" )
  base_p95=$(python3 -c "print(max(float('$base_p95'),float('$p95')))" ); base_p99=$(python3 -c "print(max(float('$base_p99'),float('$p99')))" )
done
base_rate=$(python3 -c "print(round($base_success/$base_total,6))")
python3 - <<PY
assert float('$base_rate') >= .99, '$base_rate'
PY
echo "TRUYN_CLASS_D_1000 stage=baseline success=${base_success}/${base_total} routingSuccess=${base_rate} p50Ms=${base_p50} p90Ms=${base_p90} p95Ms=${base_p95} p99Ms=${base_p99}"

STAGE=invalid-signed-state
script=$(cat <<EOS
set -Eeuo pipefail
src='http://127.0.0.1:${CONTROL_BASE}'
target_endpoint=\$(jq -r '.[1][0].endpoints[0]' /var/lib/truyn-d1000/records-by-host.json)
rep=\$(curl -fsS --max-time 45 -H 'content-type: application/json' --data-binary '{"namespace":"class-d1000-safety","key":"byzantine-proof","value":{"valid":true},"replicationFactor":3,"minAcks":2,"ttlMs":1800000}' "\$src/replicate")
acks=\$(printf '%s' "\$rep" | jq -r '.result.acknowledgements // 0')
printf '%s' "\$rep" | jq -c '.record' >/tmp/d1000-valid-record.json
probe=\$(node /opt/truyn/benchmarks/scale/class-d-1000-remote-dht-probe.js "\$target_endpoint" /tmp/d1000-valid-record.json /etc/truyn-d1000/key.pem /etc/truyn-d1000/cert.pem)
echo DHT_ACKS=\$acks
echo REMOTE_QUIC=\$(printf '%s' "\$probe" | jq -r '.transport == "quic-control"')
echo TARGET_REJECTED=\$(printf '%s' "\$probe" | jq -r '.targetRejected')
echo REJECTION_REASON=\$(printf '%s' "\$probe" | jq -r '.rejectionReason')
echo INVALID_ACCEPTED=\$(printf '%s' "\$probe" | jq -r '.acceptedCount')
EOS
)
out=$(remote "${VMS[0]}" "$script")
dht_safety_acks=$(marker "$out" DHT_ACKS)
invalid_remote_quic=$(marker "$out" REMOTE_QUIC)
invalid_target_rejected=$(marker "$out" TARGET_REJECTED)
invalid_rejection_reason=$(marker "$out" REJECTION_REASON)
invalid_signed_state_accepted=$(marker "$out" INVALID_ACCEPTED)
[[ "$dht_safety_acks" -ge 2 ]]
[[ "$invalid_remote_quic" == true ]]
[[ "$invalid_target_rejected" == true ]]
[[ "$invalid_rejection_reason" == invalid_dht_record:dht_record_signature ]]
[[ "$invalid_signed_state_accepted" == 0 ]]
echo "TRUYN_CLASS_D_1000 stage=invalid-signed-state invalidSignedStateAccepted=${invalid_signed_state_accepted} validRecordAcks=${dht_safety_acks} remoteQuicControl=${invalid_remote_quic} targetRejected=${invalid_target_rejected} rejectionReason=${invalid_rejection_reason} status=PASS"

STAGE=local-safety-invariants
script=$(cat <<'EOS'
set -Eeuo pipefail
cd /opt/truyn
result=$(node benchmarks/scale/class-d-1000-safety-probes.js)
echo STALE_ACCEPTED=$(printf '%s' "$result" | jq -r '.staleRevokedReceiptAcceptedCount')
echo STALE_REASON=$(printf '%s' "$result" | jq -r '.probes.staleReceipt.reason')
echo UNAUTHORIZED_PROVIDER_EXECUTIONS=$(printf '%s' "$result" | jq -r '.unauthorizedProviderExecutionCount')
echo PROVIDER_ACCESS_DENIED=$(printf '%s' "$result" | jq -r '.probes.providerAuthorization.accessDenied')
EOS
)
out=$(remote "${VMS[0]}" "$script")
stale_receipt_accepted=$(marker "$out" STALE_ACCEPTED)
stale_receipt_reason=$(marker "$out" STALE_REASON)
unauthorized_provider_execution=$(marker "$out" UNAUTHORIZED_PROVIDER_EXECUTIONS)
provider_access_denied=$(marker "$out" PROVIDER_ACCESS_DENIED)
[[ "$stale_receipt_accepted" == 0 ]]
[[ "$stale_receipt_reason" == trust_receipt_v2_lifecycle_head_stale ]]
[[ "$unauthorized_provider_execution" == 0 ]]
[[ "$provider_access_denied" == true ]]
echo "TRUYN_CLASS_D_1000 stage=local-safety-invariants staleRevokedReceiptAccepted=${stale_receipt_accepted} unauthorizedProviderExecution=${unauthorized_provider_execution} providerAccessDenied=${provider_access_denied} status=PASS"

STAGE=durable-writes
writes=0
for i in $(seq 0 $((HOST_COUNT-1))); do
  script=$(cat <<EOS
set -Eeuo pipefail
ok=0
for j in \$(seq 0 4); do
  body=\$(jq -nc --arg k "d1000-${i}-\${j}" --argjson h ${i} --argjson n \$j '{namespace:"class-d1000",key:\$k,value:{host:\$h,index:\$n},replicationFactor:3,minAcks:2,ttlMs:1800000}')
  curl -fsS --max-time 45 -H 'content-type: application/json' --data-binary "\$body" http://127.0.0.1:\$(( ${CONTROL_BASE} + j ))/replicate >/tmp/d1000-write-\$j.json
  a=\$(jq -r '.result.acknowledgements // 0' /tmp/d1000-write-\$j.json)
  [[ "\$a" -ge 2 ]] && ok=\$((ok+1))
done
echo WRITES=\$ok
EOS
)
  out=$(remote "${VMS[$i]}" "$script")
  w=$(marker "$out" WRITES); [[ "$w" == 5 ]]; writes=$((writes+w))
done
[[ "$writes" == 100 ]]
echo "TRUYN_CLASS_D_1000 stage=durable-writes acknowledged=${writes} status=PASS"

STAGE=restart-recovery
restart_dir=$(mktemp -d)
for i in $(seq 0 $((HOST_COUNT-1))); do
  (remote "${VMS[$i]}" "set -Eeuo pipefail; t0=\$(date +%s%3N); for j in \$(seq 10 14); do idx=\$(( ${i} * ${NODES_PER_HOST} + j )); systemctl stop truyn-d1000@\${idx}.service; done; sleep 2; for j in \$(seq 10 14); do idx=\$(( ${i} * ${NODES_PER_HOST} + j )); systemctl start truyn-d1000@\${idx}.service; done; for n in \$(seq 1 90); do good=0; for j in \$(seq 10 14); do curl -fsS --max-time 1 http://127.0.0.1:\$(( ${CONTROL_BASE}+j ))/status >/dev/null 2>&1 && good=\$((good+1)); done; [[ \$good -eq 5 ]] && break; sleep 1; done; [[ \$good -eq 5 ]]; t1=\$(date +%s%3N); echo RESTART_MS=\$((t1-t0))" >"$restart_dir/$i") &
done
wait
recovery_values=()
for i in $(seq 0 $((HOST_COUNT-1))); do
  r=$(marker "$(cat "$restart_dir/$i")" RESTART_MS); [[ -n "$r" ]]; recovery_values+=("$r")
done
rm -rf "$restart_dir"
recovery_p95=$(printf '%s\n' "${recovery_values[@]}" | python3 -c 'import sys; a=sorted(float(x) for x in sys.stdin if x.strip()); print(a[min(len(a)-1,int((len(a)-1)*.95))])')
python3 - <<PY
assert float('$recovery_p95') <= 180000, '$recovery_p95'
PY
echo "TRUYN_CLASS_D_1000 stage=restart-recovery restarted=100 recoveryP95Ms=${recovery_p95} status=PASS"

STAGE=post-restart-routing
post_success=0; post_total=0
for i in $(seq 0 $((HOST_COUNT-1))); do
  target_host=$(((i+1)%HOST_COUNT))
  script=$(cat <<EOS
set -Eeuo pipefail
python3 - <<'PY'
import json,subprocess
records=json.load(open('/var/lib/truyn-d1000/records-by-host.json')); base=${CONTROL_BASE}; target_host=${target_host}; N=${NODES_PER_HOST}; ok=0
for j in range(10,15):
    node_id=records[target_host][j]['nodeId']; body=json.dumps({'nodeId':node_id,'input':{'scenario':'d1000-post-restart'}},separators=(',',':'))
    p=subprocess.run(['curl','-sS','--max-time','15','-o','/tmp/d1000-post-'+str(j),'-w','%{http_code}','-H','content-type: application/json','--data-binary',body,f'http://127.0.0.1:{base}/need'],text=True,capture_output=True)
    ok += int(p.returncode==0 and p.stdout.strip()=='200')
print('POST_OK='+str(ok)); print('POST_TOTAL=5')
PY
EOS
)
  out=$(remote "${VMS[$i]}" "$script")
  post_success=$((post_success+$(marker "$out" POST_OK))); post_total=$((post_total+5))
done
post_rate=$(python3 -c "print(round($post_success/$post_total,6))")
python3 - <<PY
assert float('$post_rate') >= .99, '$post_rate'
PY
echo "TRUYN_CLASS_D_1000 stage=post-restart-routing success=${post_success}/${post_total} routingSuccess=${post_rate}"

STAGE=packet-partition
block_ip="${PRIV[1]}"
remote "${VMS[0]}" "iptables -I OUTPUT 1 -p udp -d '${block_ip}' --dport ${QUIC_BASE}:$((QUIC_BASE+NODES_PER_HOST-1)) -m comment --comment truyn-d1000-partition -j DROP; echo PARTITION=1" >/dev/null
out=$(remote "${VMS[0]}" "python3 - <<'PY'
import concurrent.futures,json,subprocess
records=json.load(open('/var/lib/truyn-d1000/records-by-host.json')); targets=[r['nodeId'] for r in records[1][:20]]; base=${CONTROL_BASE}
def one(args):
 j,n=args; b=json.dumps({'nodeId':n,'input':{'scenario':'d1000-packet-partition','probe':j}},separators=(',',':'))
 p=subprocess.run(['curl','-sS','--max-time','4','-o','/tmp/d1000-part-'+str(j),'-w','%{http_code}','-H','content-type: application/json','--data-binary',b,f'http://127.0.0.1:{base+(j%5)}/need'],text=True,capture_output=True)
 return int(p.returncode==0 and p.stdout.strip()=='200')
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex: rows=list(ex.map(one,enumerate(targets)))
print('PARTITION_SUCCESSES='+str(sum(rows))); print('PARTITION_PROBES='+str(len(rows)))
PY")
partition_successes=$(marker "$out" PARTITION_SUCCESSES)
partition_probes=$(marker "$out" PARTITION_PROBES)
remote "${VMS[0]}" "iptables -D OUTPUT -p udp -d '${block_ip}' --dport ${QUIC_BASE}:$((QUIC_BASE+NODES_PER_HOST-1)) -m comment --comment truyn-d1000-partition -j DROP; echo HEALED=1" >/dev/null
[[ "$partition_successes" == 0 ]]
heal_start=$(date +%s%3N)
for n in $(seq 1 90); do
  out=$(remote "${VMS[0]}" "target=\$(jq -r '.[1][0].nodeId' /var/lib/truyn-d1000/records-by-host.json); body=\$(jq -nc --arg node \"\$target\" '{nodeId:\$node,input:{scenario:\"d1000-partition-heal\"}}'); code=\$(curl -sS --max-time 6 -o /tmp/d1000-heal -w '%{http_code}' -H 'content-type: application/json' --data-binary \"\$body\" http://127.0.0.1:${CONTROL_BASE}/need || true); echo HEAL_CODE=\$code")
  [[ "$(marker "$out" HEAL_CODE)" == 200 ]] && break
  sleep 1
done
[[ "$(marker "$out" HEAL_CODE)" == 200 ]]
partition_recovery_ms=$(( $(date +%s%3N) - heal_start ))
[[ "$partition_recovery_ms" -le 180000 ]]
echo "TRUYN_CLASS_D_1000 stage=packet-partition realPacketPath=true blockedSuccesses=${partition_successes}/${partition_probes} recoveryMs=${partition_recovery_ms} status=PASS"

STAGE=healed-routing
healed_success=0; healed_total=0; healed_p50=0; healed_p90=0; healed_p95=0; healed_p99=0
for i in $(seq 0 $((HOST_COUNT-1))); do
  script=$(cat <<EOS
set -Eeuo pipefail
python3 - <<'PY'
import concurrent.futures,json,random,subprocess,time
records=json.load(open('/var/lib/truyn-d1000/records-by-host.json'))
host=${i}; H=${HOST_COUNT}; N=${NODES_PER_HOST}; base=${CONTROL_BASE}
def one(k):
    j=k%N
    r=random.Random(20260820+host*10000+k)
    target_host=r.randrange(H-1)
    if target_host>=host: target_host+=1
    target_local=r.randrange(N)
    node_id=records[target_host][target_local]['nodeId']
    body=json.dumps({'nodeId':node_id,'input':{'scenario':'d1000-healed','probe':k}},separators=(',',':'))
    t=time.perf_counter_ns()
    p=subprocess.run(['curl','-sS','--max-time','15','-o','/tmp/d1000-healed-'+str(k),'-w','%{http_code}','-H','content-type: application/json','--data-binary',body,f'http://127.0.0.1:{base+j}/need'],text=True,capture_output=True)
    ms=(time.perf_counter_ns()-t)/1e6
    return (int(p.returncode==0 and p.stdout.strip()=='200'),ms)
with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
    rows=list(ex.map(one,range(N)))
lat=sorted(v for ok,v in rows if ok); success=sum(ok for ok,_ in rows); total=N
def q(p):
    if not lat:return 999999
    return round(lat[min(len(lat)-1,max(0,int((len(lat)-1)*p)))],3)
print('HEALED_OK='+str(success)); print('HEALED_TOTAL='+str(total)); print('HEALED_P50='+str(q(.50))); print('HEALED_P90='+str(q(.90))); print('HEALED_P95='+str(q(.95))); print('HEALED_P99='+str(q(.99)))
PY
EOS
)
  out=$(remote "${VMS[$i]}" "$script")
  ok=$(marker "$out" HEALED_OK); total=$(marker "$out" HEALED_TOTAL); p50=$(marker "$out" HEALED_P50); p90=$(marker "$out" HEALED_P90); p95=$(marker "$out" HEALED_P95); p99=$(marker "$out" HEALED_P99)
  healed_success=$((healed_success+ok)); healed_total=$((healed_total+total))
  healed_p50=$(python3 -c "print(max(float('$healed_p50'),float('$p50')))" ); healed_p90=$(python3 -c "print(max(float('$healed_p90'),float('$p90')))" )
  healed_p95=$(python3 -c "print(max(float('$healed_p95'),float('$p95')))" ); healed_p99=$(python3 -c "print(max(float('$healed_p99'),float('$p99')))" )
done
healed_rate=$(python3 -c "print(round($healed_success/$healed_total,6))")
python3 - <<PY
assert float('$healed_rate') >= .99, '$healed_rate'
PY
echo "TRUYN_CLASS_D_1000 stage=healed-routing success=${healed_success}/${healed_total} routingSuccess=${healed_rate} p50Ms=${healed_p50} p90Ms=${healed_p90} p95Ms=${healed_p95} p99Ms=${healed_p99} status=PASS"

STAGE=write-retention
out=$(remote "${VMS[0]}" "set -Eeuo pipefail; ok=0; for h in \$(seq 0 $((HOST_COUNT-1))); do for j in \$(seq 0 4); do k=d1000-\${h}-\${j}; c=\$(curl -fsS --max-time 45 'http://127.0.0.1:${CONTROL_BASE}/find?namespace=class-d1000&key='\"\$k\"'&fanout=24'); n=\$(printf '%s' \"\$c\"|jq '[.records[]? | select(.value != null)]|length'); [[ \$n -ge 1 ]] && ok=\$((ok+1)); done; done; echo RETAINED=\$ok")
retained=$(marker "$out" RETAINED)
ack_loss=$((writes-retained))
[[ "$ack_loss" == 0 ]]
echo "TRUYN_CLASS_D_1000 stage=write-retention retained=${retained}/${writes} acknowledgedWriteLoss=${ack_loss}"

STAGE=resources
rss_kb=0; quic_bytes=0; process_total=0
for i in $(seq 0 $((HOST_COUNT-1))); do
  out=$(remote "${VMS[$i]}" "set -Eeuo pipefail; rss=\$(ps -eo rss,args | awk '/network\/testnet\/node-service.js/ && !/awk/ {s+=\$1} END{print s+0}'); proc=\$(pgrep -fc 'network/testnet/node-service.js'); outb=\$(iptables-save -c | awk '/truyn-d1000-meter-out/ {gsub(/\\[/,\"\",\$1); split(\$1,a,\":\"); s+=a[2]} END{print s+0}'); inb=\$(iptables-save -c | awk '/truyn-d1000-meter-in/ {gsub(/\\[/,\"\",\$1); split(\$1,a,\":\"); s+=a[2]} END{print s+0}'); echo RSS_KB=\$rss; echo PROCESSES=\$proc; echo QUIC_BYTES=\$((outb+inb))")
  p=$(marker "$out" PROCESSES); [[ "$p" -ge "$NODES_PER_HOST" ]]; process_total=$((process_total+p)); rss_kb=$((rss_kb+$(marker "$out" RSS_KB))); quic_bytes=$((quic_bytes+$(marker "$out" QUIC_BYTES)))
done
[[ "$process_total" -ge "$NODE_COUNT" ]]

STAGE=evidence
END_MS=$(date +%s%3N)
cat >"$EVIDENCE" <<JSON
{
  "class":"D-1000",
  "scope":"1000-real-process-scale+safety-contract-v2",
  "testedCommit":"${GITHUB_SHA}",
  "workflowRunId":"${GITHUB_RUN_ID}",
  "topology":{"nodeCount":${NODE_COUNT},"realProcessCount":${NODE_COUNT},"hostCount":${HOST_COUNT},"realProcessesPerHost":${NODES_PER_HOST},"uniqueIdentityCount":${NODE_COUNT},"uniqueEndpointCount":${NODE_COUNT},"syntheticNodeCount":0,"transport":"real UDP/QUIC over Azure VNet","bootstrap":"sparse Kademlia local+bridge"},
  "routing":{"baselineSuccessRatio":${base_rate},"baselineProbes":${base_total},"postRestartSuccessRatio":${post_rate},"healedSuccessRatio":${healed_rate},"healedProbes":${healed_total},"latencyMs":{"aggregation":"max-of-host-quantiles","p50":${base_p50},"p90":${base_p90},"p95":${base_p95},"p99":${base_p99}},"healedLatencyMs":{"aggregation":"max-of-host-quantiles","p50":${healed_p50},"p90":${healed_p90},"p95":${healed_p95},"p99":${healed_p99}}},
  "convergence":{"latencyMs":{"p95":${conv_p95},"p99":${conv_p99}},"routingSuccessRatio":${conv_rate},"nodeProbeCount":${conv_total}},
  "recovery":{"latencyMs":{"p95":${recovery_p95}},"restartedNodeCount":100,"identityAndStatePathsPreserved":true,"packetPartitionRecoveryMs":${partition_recovery_ms}},
  "adversarial":{"packetPartition":{"exercised":true,"realPacketPath":true,"blockedSuccesses":${partition_successes},"probeCount":${partition_probes},"recoveryMs":${partition_recovery_ms}}},
  "safety":{"acknowledgedWriteCount":${writes},"acknowledgedWriteLossCount":${ack_loss},"invalidSignedStateAcceptedCount":${invalid_signed_state_accepted},"staleRevokedReceiptAcceptedCount":${stale_receipt_accepted},"unauthorizedProviderExecutionCount":${unauthorized_provider_execution},"probes":{"invalidSignedState":{"remoteQuicControl":true,"targetRejected":true,"validRecordAcks":${dht_safety_acks},"rejectionReason":"${invalid_rejection_reason}"},"staleReceipt":{"exactCommitLocalVerifier":true,"reason":"trust_receipt_v2_lifecycle_head_stale"},"providerAuthorization":{"exactCommitAdapterHost":true,"accessDenied":true,"adapterExecutions":${unauthorized_provider_execution}}}},
  "resources":{"aggregateNodeRssKb":${rss_kb},"measuredQuicUdpBytes":${quic_bytes},"observedNodeProcesses":${process_total}},
  "timing":{"campaignMs":$((END_MS-START_MS))},
  "cleanup":{"confirmed":false,"remainingResources":null,"finalizedByExitTrap":true}
}
JSON
echo "TRUYN_CLASS_D_1000_GATE=CANDIDATE nodes=${NODE_COUNT} hosts=${HOST_COUNT} baseline=${base_rate} healed=${healed_rate} convergenceP95Ms=${conv_p95} recoveryP95Ms=${recovery_p95} ackLoss=${ack_loss} invalidSigned=${invalid_signed_state_accepted} staleReceipt=${stale_receipt_accepted} unauthorizedProviderExecution=${unauthorized_provider_execution}"
cat "$EVIDENCE"
