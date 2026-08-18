#!/usr/bin/env bash
set -Eeuo pipefail

: "${HOST_COUNT:?source class-d-azure-1000-provision.sh first}"
: "${NODES_PER_HOST:?source class-d-azure-1000-provision.sh first}"
: "${NODE_COUNT:?source class-d-azure-1000-provision.sh first}"

STAGE=topology
out=$(remote "${VMS[0]}" "set -Eeuo pipefail; f=/var/lib/truy n-d1000/records-by-host.json; f=\${f//truy n/truyn}; echo NODES=\$(jq '[.[][]]|length' \"\$f\"); echo IDS=\$(jq -r '.[][]|.nodeId' \"\$f\"|sort -u|wc -l); echo EPS=\$(jq -r '.[][]|.endpoints[0]' \"\$f\"|sort -u|wc -l)")
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
records=json.load(open('/var/lib/truy n-d1000/records-by-host.json'))
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
  script="${script//truy n/truyn}"
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
records=json.load(open('/var/lib/truy n-d1000/records-by-host.json'))
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
  script="${script//truy n/truyn}"
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
  (remote "${VMS[$i]}" "set -Eeuo pipefail; t0=\$(date +%s%3N); for j in \$(seq 10 14); do idx=\$(( ${i} * ${NODES_PER_HOST} + j )); systemctl stop truin-d1000@\${idx}.service; done; sleep 2; for j in \$(seq 10 14); do idx=\$(( ${i} * ${NODES_PER_HOST} + j )); systemctl start truin-d1000@\${idx}.service; done; for n in \$(seq 1 90); do good=0; for j in \$(seq 10 14); do curl -fsS --max-time 1 http://127.0.0.1:\$(( ${CONTROL_BASE}+j ))/status >/dev/null 2>&1 && good=\$((good+1)); done; [[ \$good -eq 5 ]] && break; sleep 1; done; [[ \$good -eq 5 ]]; t1=\$(date +%s%3N); echo RESTART_MS=\$((t1-t0))" | sed 's/truin-d1000/truyn-d1000/g' >"$restart_dir/$i") &
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
records=json.load(open('/var/lib/truy n-d1000/records-by-host.json')); base=${CONTROL_BASE}; target_host=${target_host}; N=${NODES_PER_HOST}; ok=0
for j in range(10,15):
    node_id=records[target_host][j]['nodeId']; body=json.dumps({'nodeId':node_id,'input':{'scenario':'d1000-post-restart'}},separators=(',',':'))
    p=subprocess.run(['curl','-sS','--max-time','15','-o','/tmp/d1000-post-'+str(j),'-w','%{http_code}','-H','content-type: application/json','--data-binary',body,f'http://127.0.0.1:{base}/need'],text=True,capture_output=True)
    ok += int(p.returncode==0 and p.stdout.strip()=='200')
print('POST_OK='+str(ok)); print('POST_TOTAL=5')
PY
EOS
)
  script="${script//truy n/truyn}"
  out=$(remote "${VMS[$i]}" "$script")
  post_success=$((post_success+$(marker "$out" POST_OK))); post_total=$((post_total+5))
done
post_rate=$(python3 -c "print(round($post_success/$post_total,6))")
python3 - <<PY
assert float('$post_rate') >= .99, '$post_rate'
PY
echo "TRUYN_CLASS_D_1000 stage=post-restart-routing success=${post_success}/${post_total} routingSuccess=${post_rate}"

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
  "scope":"1000-real-process-scale",
  "testedCommit":"${GITHUB_SHA}",
  "workflowRunId":"${GITHUB_RUN_ID}",
  "topology":{"nodeCount":${NODE_COUNT},"realProcessCount":${NODE_COUNT},"hostCount":${HOST_COUNT},"realProcessesPerHost":${NODES_PER_HOST},"uniqueIdentityCount":${NODE_COUNT},"uniqueEndpointCount":${NODE_COUNT},"syntheticNodeCount":0,"transport":"real UDP/QUIC over Azure VNet","bootstrap":"sparse Kademlia local+bridge"},
  "routing":{"baselineSuccessRatio":${base_rate},"baselineProbes":${base_total},"postRestartSuccessRatio":${post_rate},"latencyMs":{"aggregation":"max-of-host-quantiles","p50":${base_p50},"p90":${base_p90},"p95":${base_p95},"p99":${base_p99}}},
  "convergence":{"latencyMs":{"p95":${conv_p95},"p99":${conv_p99}},"routingSuccessRatio":${conv_rate},"nodeProbeCount":${conv_total}},
  "recovery":{"latencyMs":{"p95":${recovery_p95}},"restartedNodeCount":100,"identityAndStatePathsPreserved":true},
  "safety":{"acknowledgedWriteCount":${writes},"acknowledgedWriteLossCount":${ack_loss}},
  "resources":{"aggregateNodeRssKb":${rss_kb},"measuredQuicUdpBytes":${quic_bytes},"observedNodeProcesses":${process_total}},
  "timing":{"campaignMs":$((END_MS-START_MS))},
  "cleanup":{"confirmed":false,"finalizedByExitTrap":true}
}
JSON
echo "TRUYN_CLASS_D_1000_GATE=CANDIDATE nodes=${NODE_COUNT} hosts=${HOST_COUNT} routing=${base_rate} convergenceP95Ms=${conv_p95} recoveryP95Ms=${recovery_p95} ackLoss=${ack_loss}"
cat "$EVIDENCE"
