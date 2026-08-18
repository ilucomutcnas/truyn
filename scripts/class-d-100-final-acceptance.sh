#!/usr/bin/env bash
set -Eeuo pipefail

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' RETURN
cp benchmarks/scale/class-d-azure-100-provision.sh "$TMP/provision.sh"
cp benchmarks/scale/class-d-azure-100-campaign.sh "$TMP/campaign.sh"

python3 - "$TMP/provision.sh" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
s = p.read_text()
s = s.replace('npm install --ignore-scripts --no-audit --no-fund', 'npm install --no-audit --no-fund')
old = '''remote() {
  local vm="$1" script="$2"
  retry az vm run-command invoke -g "$RG" -n "$vm" --command-id RunShellScript --scripts "$script" --query 'value[0].message' -o tsv --only-show-errors
}'''
new = '''remote() {
  local vm="$1" script="$2" enc remote_script
  enc="$(printf '%s' "$script" | base64 -w0)"
  remote_script="printf '%s' '$enc' | base64 -d >/tmp/truyn-d100-run.sh; chmod 700 /tmp/truyn-d100-run.sh; /bin/bash /tmp/truyn-d100-run.sh"
  retry az vm run-command invoke -g "$RG" -n "$vm" --command-id RunShellScript --scripts "$remote_script" --query 'value[0].message' -o tsv --only-show-errors
}'''
if old not in s:
    raise SystemExit('expected Class D remote helper not found')
s = s.replace(old, new)
p.write_text(s)
PY

source "$TMP/provision.sh"
source "$TMP/campaign.sh"
