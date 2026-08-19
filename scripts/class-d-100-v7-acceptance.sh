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

hardening = r'''
# V7: the install stage already creates records.json with Python from 25 live
# node /record endpoints. Validate the exact same identity/endpoint cardinality
# with Python instead of reparsing that generated JSON through jq inside the
# guest. This removes the V6 install-time jq parser boundary without changing
# any accepted D-100 postcondition or threshold.
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
with open('/var/lib/truinyn-d100/record-stats.env', 'w', encoding='utf-8') as fh:
    fh.write('IDENTITIES=25\nENDPOINTS=25\n')
PYVALIDATE
. /var/lib/truinyn-d100/record-stats.env
uc=\$IDENTITIES
ep=\$ENDPOINTS
proc=\$(pgrep -fc 'network/testnet/node-service.js')
[ "\$uc" -eq 25 ] && [ "\$ep" -eq 25 ] && [ "\$proc" -ge 25 ]'''
s = s[:start] + install_new + s[end:]

# Capture all RunCommand message components rather than relying on array order.
# The helper still fails closed on command failure and still requires the same
# explicit success markers before advancing.
s = s.replace("--query 'value[0].message' -o tsv --only-show-errors", "--query 'value[].message' -o tsv --only-show-errors", 1)

if install_start in s:
    raise SystemExit('legacy D-100 install jq validation survived V7 preparation')
if "record-stats.env" not in s:
    raise SystemExit('V7 Python record validation missing after preparation')
if "--query 'value[].message' -o tsv --only-show-errors" not in s:
    raise SystemExit('V7 RunCommand all-message extraction missing after preparation')
'''

src = src.replace(anchor, "\n" + hardening + "\np.write_text(s)\nPY\n\nif [[ \"${TRUYN_CLASS_D100_PREPARE_ONLY:-0}\" == 1 ]]; then", 1)
out.write_text(src)
PY

chmod 700 "$PATCHED"
exec "$PATCHED"
