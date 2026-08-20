#!/usr/bin/env bash
set -Eeuo pipefail

BASE="scripts/class-d-100-v12-acceptance.sh"
PATCHED="$(mktemp)"
trap 'rm -f "$PATCHED"' EXIT

python3 - "$BASE" "$PATCHED" <<'PY'
from pathlib import Path
import sys

src = Path(sys.argv[1]).read_text()
out = Path(sys.argv[2])
old = r"""  for i in $(seq 0 $((HOST_COUNT-1))); do
    script=$(cat <<EOS
set -Eeuo pipefail
python3 - <<'PYREADY'
import json,random,subprocess
random.seed(${SEED}+1000+${i}+${convergence_attempt})
records=json.load(open('/tmp/all-records.json'))
local='${PRIV[$i]}'
targets=[r for r in records if local not in r['endpoints'][0]]
random.shuffle(targets)
ok=0; total=25
for k in range(total):
    target=targets[k % len(targets)]['nodeId']
    body=json.dumps({'nodeId':target,'input':{'scenario':'healed-convergence','attempt':${convergence_attempt},'probe':k}},separators=(',',':'))
    p=subprocess.run(['curl','-sS','--max-time','8','-o','/tmp/b','-w','%{http_code}','-H','content-type: application/json','--data-binary',body,'http://127.0.0.1:${CONTROL_BASE}/need'],text=True,capture_output=True)
    ok += int(p.returncode == 0 and p.stdout.strip() == '200')
print(f'READY_OK={ok}')
print(f'READY_TOTAL={total}')
PYREADY
EOS
)
    out=$(remote "${VMS[$i]}" "$script")
    healed_ready_success=$((healed_ready_success + $(marker "$out" READY_OK)))
    healed_ready_total=$((healed_ready_total + $(marker "$out" READY_TOTAL)))
  done
"""
new = r"""  ready_dir=$(mktemp -d)
  pids=()
  for i in $(seq 0 $((HOST_COUNT-1))); do
    script=$(cat <<EOS
set -Eeuo pipefail
python3 - <<'PYREADY'
import json,random,subprocess
random.seed(${SEED}+1000+${i}+${convergence_attempt})
records=json.load(open('/tmp/all-records.json'))
local='${PRIV[$i]}'
targets=[r for r in records if local not in r['endpoints'][0]]
random.shuffle(targets)
ok=0; total=25
for k in range(total):
    target=targets[k % len(targets)]['nodeId']
    body=json.dumps({'nodeId':target,'input':{'scenario':'healed-convergence','attempt':${convergence_attempt},'probe':k}},separators=(',',':'))
    p=subprocess.run(['curl','-sS','--max-time','8','-o','/tmp/b','-w','%{http_code}','-H','content-type: application/json','--data-binary',body,'http://127.0.0.1:${CONTROL_BASE}/need'],text=True,capture_output=True)
    ok += int(p.returncode == 0 and p.stdout.strip() == '200')
print(f'READY_OK={ok}')
print(f'READY_TOTAL={total}')
PYREADY
EOS
)
    (remote "${VMS[$i]}" "$script" >"${ready_dir}/host-${i}.out") &
    pids+=("$!")
  done
  ready_rc=0
  for pid in "${pids[@]}"; do wait "$pid" || ready_rc=1; done
  [[ "$ready_rc" == 0 ]]
  for i in $(seq 0 $((HOST_COUNT-1))); do
    out=$(cat "${ready_dir}/host-${i}.out")
    healed_ready_success=$((healed_ready_success + $(marker "$out" READY_OK)))
    healed_ready_total=$((healed_ready_total + $(marker "$out" READY_TOTAL)))
  done
  rm -rf "$ready_dir"
"""

if src.count(old) != 1:
    raise SystemExit(f'expected exactly one sequential V12 healed convergence host loop, got {src.count(old)}')
src = src.replace(old, new, 1)
if 'pids+=("$!")' not in src or 'for pid in "${pids[@]}"' not in src:
    raise SystemExit('V13 parallel healed convergence orchestration missing')
if "assert float('$healed_rate') >= .99" not in src:
    raise SystemExit('V13 canonical healed >=99% assertion missing')
if "assert rate >= .99" not in src or 'assert elapsed <= 120000' not in src:
    raise SystemExit('V13 strict healed convergence thresholds missing')
out.write_text(src)
PY

chmod 700 "$PATCHED"
exec "$PATCHED"
