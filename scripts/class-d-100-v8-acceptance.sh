#!/usr/bin/env bash
set -Eeuo pipefail

BASE="scripts/class-d-100-final-acceptance.sh"
PATCHED="$(mktemp)"
trap 'rm -f "$PATCHED"' EXIT

python3 - "$BASE" "$PATCHED" <<'PY'
from pathlib import Path
import sys

src = Path(sys.argv[1]).read_text()
out = Path(sys.argv[2])
anchor = "\np.write_text(s)\nPY\n\nif [[ \"${TRUYN_CLASS_D100_PREPARE_ONLY:-0}\" == 1 ]]; then"
if anchor not in src:
    raise SystemExit('canonical D-100 acceptance preparation anchor not found')

hardening = r"""
# Preserve the V7 record-cardinality hardening: validate the 25 live records
# with Python rather than introducing a second jq parse boundary in the guest.
install_start = "ids=\\$(jq -r '.[].nodeId'"
install_end = r'''[ "\$uc" -eq 25 ] && [ "\$ep" -eq 25 ] && [ "\$proc" -ge 25 ]'''
start = s.find(install_start)
if start < 0:
    raise SystemExit('expected D-100 install jq validation start not found')
end = s.find(install_end, start)
if end < 0:
    raise SystemExit('expected D-100 install jq validation end not found')
end += len(install_end)
install_new = r'''python3 - <<'PYVALIDATE'
import json
path = '/var/lib/truyn-d100/records.json'
with open(path, 'r', encoding='utf-8') as fh:
    records = json.load(fh)
if len(records) != 25:
    raise SystemExit(f'expected 25 records, got {len(records)}')
node_ids = [r.get('nodeId') for r in records]
endpoints = [((r.get('endpoints') or [None])[0]) for r in records]
if any(not x for x in node_ids) or len(set(node_ids)) != 25:
    raise SystemExit('expected 25 distinct node identities')
if any(not x for x in endpoints) or len(set(endpoints)) != 25:
    raise SystemExit('expected 25 distinct QUIC endpoints')
with open('/var/lib/truyn-d100/record-stats.env', 'w', encoding='utf-8') as fh:
    fh.write('IDENTITIES=25\nENDPOINTS=25\n')
PYVALIDATE
. /var/lib/truyn-d100/record-stats.env
uc=\$IDENTITIES
ep=\$ENDPOINTS
proc=\$(pgrep -fc 'network/testnet/node-service.js')
[ "\$uc" -eq 25 ] && [ "\$ep" -eq 25 ] && [ "\$proc" -ge 25 ]'''
s = s[:start] + install_new + s[end:]

# V8 exposed the exact guest-side blocker: GNU mv rejects a source and
# destination that are the same file. Under set -e that harmless no-op became
# a hard install failure after the 25 real node services were already healthy.
# Remove exactly that one command; no acceptance threshold is changed.
self_move = 'mv /etc/systemd/system/truyn-d100-records.service /etc/systemd/system/truwyn-d100-records.service'
if s.count(self_move) != 1:
    raise SystemExit(f'expected exactly one D-100 record-service self-move, got {s.count(self_move)}')
s = s.replace(self_move, ': # record-service unit already at canonical path', 1)

# Capture every RunCommand message component. The command remains fail-closed;
# this only makes a guest-side failure observable in immutable run evidence.
s = s.replace("--query 'value[0].message' -o tsv --only-show-errors", "--query 'value[].message' -o tsv --only-show-errors", 1)

# If the 25 real node services never all become healthy, print the first unit's
# status and recent journal before preserving the original hard failure.
readiness = r'''[ "\$ok" -eq 1 ]'''
readiness_diag = r'''if [ "\$ok" -ne 1 ]; then
  echo "TRUYN_D100_INSTALL_DIAG readiness=FAIL good=\${good:-0}" >&2
  systemctl --no-pager --full status truyn-d100@$(( ${i} * 25 )).service >&2 || true
  journalctl --no-pager -u truyn-d100@$(( ${i} * 25 )).service -n 120 >&2 || true
fi
[ "\$ok" -eq 1 ]'''
if readiness not in s:
    raise SystemExit('expected D-100 readiness gate not found')
s = s.replace(readiness, readiness_diag, 1)

# The previous run captured the Azure RunCommand output in `out` but then died
# on a marker assertion without emitting `out`. Emit it only on marker mismatch;
# the same strict assertions still decide success/failure.
marker_block = r'''  out=$(remote "${VMS[$i]}" "$script")
  [[ "$(marker "$out" TESTED_COMMIT)" == "$TRUYN_TESTED_COMMIT" ]]
  [[ "$(marker "$out" READY)" == 25 ]]
  [[ "$(marker "$out" RECORD_SERVICE)" == PASS ]]'''
marker_diag = r'''  out=$(remote "${VMS[$i]}" "$script")
  if [[ "$(marker "$out" TESTED_COMMIT)" != "$TRUYN_TESTED_COMMIT" || "$(marker "$out" READY)" != 25 || "$(marker "$out" RECORD_SERVICE)" != PASS ]]; then
    printf '%s\n' "$out" >&2
  fi
  [[ "$(marker "$out" TESTED_COMMIT)" == "$TRUYN_TESTED_COMMIT" ]]
  [[ "$(marker "$out" READY)" == 25 ]]
  [[ "$(marker "$out" RECORD_SERVICE)" == PASS ]]'''
if marker_block not in s:
    raise SystemExit('expected D-100 install marker block not found')
s = s.replace(marker_block, marker_diag, 1)

if install_start in s:
    raise SystemExit('legacy D-100 install jq validation survived V8 preparation')
if self_move in s:
    raise SystemExit('fatal D-100 record-service self-move survived V8 preparation')
if "TRUYN_D100_INSTALL_DIAG readiness=FAIL" not in s:
    raise SystemExit('V8 guest install diagnostics missing after preparation')
if "printf '%s\\n' \"$out\" >&2" not in s:
    raise SystemExit('V8 RunCommand marker diagnostics missing after preparation')
if "--query 'value[].message' -o tsv --only-show-errors" not in s:
    raise SystemExit('V8 RunCommand all-message extraction missing after preparation')
"""

src = src.replace(anchor, "\n" + hardening + "\np.write_text(s)\nPY\n\nif [[ \"${TRUYN_CLASS_D100_PREPARE_ONLY:-0}\" == 1 ]]; then", 1)
out.write_text(src)
PY

chmod 700 "$PATCHED"
exec "$PATCHED"
