#!/usr/bin/env bash
set -Eeuo pipefail

BASE="scripts/class-d-100-v11-acceptance.sh"
PATCHED="$(mktemp)"
trap 'rm -f "$PATCHED"' EXIT

python3 - "$BASE" "$PATCHED" <<'PY'
from pathlib import Path
import sys

src = Path(sys.argv[1]).read_text()
out = Path(sys.argv[2])
anchor = """if 'TRUYN_CLASS_D_100_CLEANUP_RETRY' not in s or 'az resource delete --ids' not in s:
    raise SystemExit('V11 bounded cleanup recovery missing')
"""
if src.count(anchor) != 1:
    raise SystemExit(f'expected exactly one V11 hardening anchor, got {src.count(anchor)}')

addition = r'''

# V12: V11 reached the final healed-baseline after every adversarial phase, but
# sampled immediately after recovery had only been proven from host0 into the
# restarted churn set. The final baseline uses one source on every host; host2's
# source is itself one of the restarted processes. Require the complete source
# failure-domain set to converge before taking the one accepted healed sample.
# This is a strict readiness gate, not threshold relaxation: readiness itself
# must reach the canonical >=99% within <=120s or the campaign fails closed.
healed_marker = '\nSTAGE=healed-baseline\n'
if campaign.count(healed_marker) != 1:
    raise SystemExit(f'expected exactly one healed-baseline boundary, got {campaign.count(healed_marker)}')
healed_convergence = r'''STAGE=healed-convergence
healed_convergence_start=$(date +%s%3N)
healed_ready_rate=0
healed_ready_success=0
healed_ready_total=0
for convergence_attempt in $(seq 1 30); do
  healed_ready_success=0
  healed_ready_total=0
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
    out=$(remote "${VMS[$i]}" "$script")
    healed_ready_success=$((healed_ready_success + $(marker "$out" READY_OK)))
    healed_ready_total=$((healed_ready_total + $(marker "$out" READY_TOTAL)))
  done
  healed_ready_rate=$(python3 -c "print(round($healed_ready_success/$healed_ready_total,6))")
  healed_convergence_ms=$(( $(date +%s%3N) - healed_convergence_start ))
  echo "TRUYN_CLASS_D_100 stage=healed-convergence attempt=${convergence_attempt} success=${healed_ready_success}/${healed_ready_total} routingSuccess=${healed_ready_rate} convergenceMs=${healed_convergence_ms}"
  if python3 - "$healed_ready_rate" <<'PYRATE'
import sys
raise SystemExit(0 if float(sys.argv[1]) >= .99 else 1)
PYRATE
  then
    break
  fi
  [[ "$healed_convergence_ms" -lt 120000 ]] || break
  sleep 2
done
healed_convergence_ms=$(( $(date +%s%3N) - healed_convergence_start ))
python3 - "$healed_ready_rate" "$healed_convergence_ms" <<'PYREADYASSERT'
import sys
rate=float(sys.argv[1]); elapsed=float(sys.argv[2])
assert rate >= .99, f'healed readiness routingSuccess={rate}'
assert elapsed <= 120000, f'healed readiness convergenceMs={elapsed}'
PYREADYASSERT
echo "TRUYN_CLASS_D_100 stage=healed-convergence status=PASS routingSuccess=${healed_ready_rate} convergenceMs=${healed_convergence_ms}"
'''
campaign = campaign.replace(healed_marker, '\n' + healed_convergence + healed_marker, 1)

# Keep the accepted measurement and canonical threshold untouched.
if "assert float('$healed_rate') >= .99" not in campaign:
    raise SystemExit('V12 canonical healed >=99% assertion missing')
if 'assert elapsed <= 120000' not in campaign:
    raise SystemExit('V12 bounded healed convergence gate missing')
if 'stage=healed-convergence status=PASS' not in campaign:
    raise SystemExit('V12 healed convergence diagnostic missing')
campaign_path.write_text(campaign)
'''

src = src.replace(anchor, anchor + addition, 1)
out.write_text(src)
PY

chmod 700 "$PATCHED"
exec "$PATCHED"
