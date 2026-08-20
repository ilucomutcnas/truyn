#!/usr/bin/env bash
set -Eeuo pipefail

BASE="scripts/class-d-100-v13-acceptance.sh"
PATCHED="$(mktemp)"
trap 'rm -f "$PATCHED"' EXIT

python3 - "$BASE" "$PATCHED" <<'PY'
from pathlib import Path
import sys

src = Path(sys.argv[1]).read_text()
out = Path(sys.argv[2])
write_anchor = 'out.write_text(src)\nPY\n\nchmod 700 "$PATCHED"\nexec "$PATCHED"'
if src.count(write_anchor) != 1:
    raise SystemExit(f'expected exactly one V13 write/exec anchor, got {src.count(write_anchor)}')

injection = r'''v12_anchor = """if 'stage=healed-convergence status=PASS' not in campaign:
    raise SystemExit('V12 healed convergence diagnostic missing')
campaign_path.write_text(campaign)
"""
if src.count(v12_anchor) != 1:
    raise SystemExit(f'expected exactly one V12 healed-convergence write anchor, got {src.count(v12_anchor)}')

v16_addition = r"""

# V16: V15 proved the protocol stages through Byzantine rejection and a real
# packet partition/heal, then Azure's control plane returned HTTP 429 while
# polling the churn RunCommand. Arbitrary RunCommand replay remains forbidden:
# an ambiguous poll failure can occur after a guest script has already run.
# Only the two churn mutations below are retried because systemctl stop/start
# are explicitly idempotent. Non-429 failures still fail closed immediately;
# persistent 429s fail after a bounded four attempts. Acceptance thresholds are
# not changed by this transport-control hardening.
churn_marker = '\nSTAGE=churn\n'
if campaign.count(churn_marker) != 1:
    raise SystemExit(f'expected exactly one D-100 churn boundary, got {campaign.count(churn_marker)}')

retry_helper = r'''remote_churn_idempotent_arm_retry() {
  local vm="$1" script="$2"
  local attempt=1 rc=0 output=""
  while true; do
    if output=$(remote "$vm" "$script" 2>&1); then
      printf '%s\n' "$output"
      return 0
    else
      rc=$?
    fi

    if ! grep -Eqi 'Too Many Requests|HTTP[^0-9]*429|status[^0-9]*429|code[^0-9]*429' <<<"$output"; then
      printf '%s\n' "$output" >&2
      return "$rc"
    fi
    if (( attempt >= 4 )); then
      printf '%s\n' "$output" >&2
      return "$rc"
    fi

    echo "TRUYN_AZ_RUN_COMMAND_429_RETRY vm=${vm} attempt=${attempt} max=4" >&2
    sleep $((attempt * 15))
    attempt=$((attempt + 1))
  done
}
'''
campaign = campaign.replace(churn_marker, '\n' + retry_helper + churn_marker, 1)

stop_old = r'''remote "${VMS[2]}" "for idx in \$(seq 50 57); do systemctl stop truyn-d100@\${idx}.service; done; echo STOPPED=8" >/dev/null'''
stop_new = r'''remote_churn_idempotent_arm_retry "${VMS[2]}" "for idx in \$(seq 50 57); do systemctl stop truyn-d100@\${idx}.service; done; echo STOPPED=8" >/dev/null'''
start_old = r'''remote "${VMS[2]}" "for idx in \$(seq 50 57); do systemctl start truyn-d100@\${idx}.service; done; echo STARTED=8" >/dev/null'''
start_new = r'''remote_churn_idempotent_arm_retry "${VMS[2]}" "for idx in \$(seq 50 57); do systemctl start truyn-d100@\${idx}.service; done; echo STARTED=8" >/dev/null'''

if campaign.count(stop_old) != 1:
    raise SystemExit(f'expected exactly one direct D-100 churn stop boundary, got {campaign.count(stop_old)}')
if campaign.count(start_old) != 1:
    raise SystemExit(f'expected exactly one direct D-100 churn start boundary, got {campaign.count(start_old)}')
campaign = campaign.replace(stop_old, stop_new, 1)
campaign = campaign.replace(start_old, start_new, 1)

churn_check = campaign[campaign.find('STAGE=churn'):campaign.find('STAGE=sybil-eclipse')]
if churn_check.count('remote_churn_idempotent_arm_retry "${VMS[2]}"') != 2:
    raise SystemExit('V16 idempotent ARM retry is not limited to both churn mutations')
if stop_old in churn_check or start_old in churn_check:
    raise SystemExit('V16 direct churn RunCommand boundary survived')
if 'TRUYN_AZ_RUN_COMMAND_429_RETRY' not in campaign or 'Too Many Requests' not in campaign:
    raise SystemExit('V16 bounded Azure 429 diagnostic/matcher missing')
"""

src = src.replace(v12_anchor, v12_anchor.replace('campaign_path.write_text(campaign)\n', '') + v16_addition + '\ncampaign_path.write_text(campaign)\n', 1)
out.write_text(src)
'''

src = src.replace('out.write_text(src)', injection, 1)
out.write_text(src)
PY

chmod 700 "$PATCHED"
exec "$PATCHED"
