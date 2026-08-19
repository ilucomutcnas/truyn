#!/usr/bin/env bash
set -Eeuo pipefail

V10="scripts/class-d-100-v10-acceptance.sh"
CANONICAL="scripts/class-d-100-final-acceptance.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

BASE="$TMP/class-d-100-final-acceptance-v11.sh"
RUNNER="$TMP/class-d-100-v10-with-v11-base.sh"
cp "$CANONICAL" "$BASE"
cp "$V10" "$RUNNER"

python3 - "$BASE" <<'PY'
from pathlib import Path
import sys

p = Path(sys.argv[1])
src = p.read_text()

# Give the existing bounded NodeSource boundary two additional chances, but do
# not accept package-manager exit status as proof that the required runtime is
# actually present. The semantic verification below remains the authority.
if src.count('for node_attempt in 1 2 3 4; do') != 1:
    raise SystemExit('V11 expected exactly one canonical NodeSource retry loop')
src = src.replace('for node_attempt in 1 2 3 4; do', 'for node_attempt in 1 2 3 4 5 6; do', 1)
if src.count('TRUYN_NODE_BOOTSTRAP_TRANSIENT_RETRY attempt=\\$node_attempt max=4') != 1:
    raise SystemExit('V11 expected canonical NodeSource retry marker')
src = src.replace('TRUYN_NODE_BOOTSTRAP_TRANSIENT_RETRY attempt=\\$node_attempt max=4',
                  'TRUYN_NODE_BOOTSTRAP_TRANSIENT_RETRY attempt=\\$node_attempt max=6', 1)

anchor = "s = s.replace(apt_old, apt_new, 1)\n"
if src.count(anchor) != 1:
    raise SystemExit('V11 canonical APT preparation anchor missing')

v11 = r"""
# V11: V10 exposed a guest bootstrap false-positive: NodeSource setup could
# degrade to the Ubuntu nodejs package, `apt-get install nodejs` could return
# zero, and the guest still had no Node 22/npm. Verify the semantic runtime and
# retry the complete dependency + NodeSource boundary when it is not present.
node_anchor = r'''rm -rf /opt/truyn'''
node_guard = r'''major=0
command -v node >/dev/null 2>&1 && major=\$(node -p 'parseInt(process.versions.node)' 2>/dev/null || echo 0)
if [ "\$major" -lt 22 ] || ! command -v npm >/dev/null 2>&1; then
  node_verified=0
  for node_verify_attempt in \$(seq 1 6); do
    if apt-get update -qq \
      && apt-get install -y -qq apt-transport-https gnupg ca-certificates curl >/dev/null \
      && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null \
      && apt-get install -y -qq nodejs >/dev/null; then
      major=0
      command -v node >/dev/null 2>&1 && major=\$(node -p 'parseInt(process.versions.node)' 2>/dev/null || echo 0)
      if [ "\$major" -ge 22 ] && command -v npm >/dev/null 2>&1; then
        node_verified=1
        break
      fi
    fi
    echo "TRUYN_NODE_BOOTSTRAP_VERIFY_RETRY attempt=\$node_verify_attempt max=6 major=\${major:-0} npm=\$(command -v npm 2>/dev/null || echo missing)" >&2
    sleep \$((node_verify_attempt * 5))
  done
  if [ "\$node_verified" -ne 1 ]; then
    echo "TRUYN_NODE_BOOTSTRAP_VERIFY_FAIL major=\${major:-0} npm=\$(command -v npm 2>/dev/null || echo missing)" >&2
    node --version >&2 2>/dev/null || true
    npm --version >&2 2>/dev/null || true
    exit 1
  fi
fi
major=0
command -v node >/dev/null 2>&1 && major=\$(node -p 'parseInt(process.versions.node)' 2>/dev/null || echo 0)
npm_path=\$(command -v npm 2>/dev/null || true)
[ "\$major" -ge 22 ] && [ -n "\$npm_path" ]
echo "TRUYN_NODE_BOOTSTRAP_VERIFIED major=\$major npm=\$npm_path"
rm -rf /opt/truyn'''
if s.count(node_anchor) != 1:
    raise SystemExit(f'V11 expected one guest install anchor, got {s.count(node_anchor)}')
s = s.replace(node_anchor, node_guard, 1)

# V11: cleanup after an early failure must not be a one-shot delete race. VM
# deletion can complete before dependent NIC/disk/VNet deletion is admitted.
# Re-issue the bounded delete pass and inventory until the run prefix is gone.
cleanup_start = s.find('\ncleanup() {')
cleanup_end = s.find('\n}\ntrap cleanup EXIT', cleanup_start)
if cleanup_start < 0 or cleanup_end < 0 or s.count('\ncleanup() {') != 1:
    raise SystemExit('V11 canonical cleanup function boundary missing')
cleanup_new = r'''
cleanup_delete_pass() {
  for vm in "${VMS[@]}"; do az vm delete -g "$RG" -n "$vm" --yes --force-deletion --only-show-errors >/dev/null 2>&1 || true; done
  for nic in "${NICS[@]}"; do az network nic delete -g "$RG" -n "$nic" --only-show-errors >/dev/null 2>&1 || true; done
  for pip in "${PIPS[@]}"; do az network public-ip delete -g "$RG" -n "$pip" --only-show-errors >/dev/null 2>&1 || true; done
  for disk in "${DISKS[@]}"; do az disk delete -g "$RG" -n "$disk" --yes --only-show-errors >/dev/null 2>&1 || true; done
  az network vnet delete -g "$RG" -n "$VNET" --only-show-errors >/dev/null 2>&1 || true
  az network nsg delete -g "$RG" -n "$NSG" --only-show-errors >/dev/null 2>&1 || true
}

cleanup() {
  set +e
  STAGE=cleanup
  CLEANUP_CONFIRMED=false
  local left=999 resource_names='' cleanup_attempt=0
  for cleanup_attempt in $(seq 1 12); do
    cleanup_delete_pass
    if resource_names=$(az resource list -g "$RG" --query "[?starts_with(name, '${PREFIX}')].name" -o tsv --only-show-errors 2>/dev/null); then
      left=$(printf '%s\n' "$resource_names" | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')
    else
      left=999
    fi
    if [[ "$left" == 0 ]]; then
      CLEANUP_CONFIRMED=true
      break
    fi
    echo "TRUYN_CLASS_D_100_CLEANUP_RETRY attempt=${cleanup_attempt} max=12 remaining=${left}" >&2
    sleep $(( cleanup_attempt < 6 ? 5 : 10 ))
  done
  if [[ "$CLEANUP_CONFIRMED" != true ]]; then
    echo "TRUYN_CLASS_D_100_CLEANUP_EXHAUSTED remaining=${left}" >&2
  fi
  if [[ -f "$EVIDENCE" ]]; then
    tmp="${EVIDENCE}.tmp"
    jq --argjson confirmed "$CLEANUP_CONFIRMED" --argjson remaining "$left" ".cleanup.confirmed=\$confirmed | .cleanup.remainingResources=\$remaining" "$EVIDENCE" >"$tmp" && mv "$tmp" "$EVIDENCE"
  fi
  echo "TRUYN_CLASS_D_100_CLEANUP confirmed=${CLEANUP_CONFIRMED} remaining=${left}"
}'''
s = s[:cleanup_start] + cleanup_new + s[cleanup_end + 2:]

if 'TRUYN_NODE_BOOTSTRAP_VERIFIED' not in s or 'TRUYN_NODE_BOOTSTRAP_VERIFY_FAIL' not in s:
    raise SystemExit('V11 semantic Node/npm verification missing after preparation')
if 'TRUYN_CLASS_D_100_CLEANUP_RETRY' not in s or 'cleanup_delete_pass()' not in s:
    raise SystemExit('V11 bounded cleanup recovery missing after preparation')
"""
src = src.replace(anchor, anchor + v11 + "\n", 1)

guard_anchor = "  grep -q 'command az vm run-command invoke' \"$TMP/provision.sh\"\n"
if src.count(guard_anchor) != 1:
    raise SystemExit('V11 prepare-only guard anchor missing')
guards = (
    "  grep -q 'TRUYN_NODE_BOOTSTRAP_VERIFIED' \"$TMP/provision.sh\"\n"
    "  grep -q 'TRUYN_NODE_BOOTSTRAP_VERIFY_FAIL' \"$TMP/provision.sh\"\n"
    "  grep -q 'TRUYN_CLASS_D_100_CLEANUP_RETRY' \"$TMP/provision.sh\"\n"
    "  grep -q 'cleanup_delete_pass()' \"$TMP/provision.sh\"\n"
)
src = src.replace(guard_anchor, guard_anchor + guards, 1)

p.write_text(src)
PY

python3 - "$RUNNER" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
s = p.read_text()
old = 'BASE="scripts/class-d-100-final-acceptance.sh"'
new = 'BASE="${TRUYN_CLASS_D_V11_BASE:?TRUYN_CLASS_D_V11_BASE is required}"'
if s.count(old) != 1:
    raise SystemExit('V11 expected exactly one V10 BASE anchor')
p.write_text(s.replace(old, new, 1))
PY

export TRUYN_CLASS_D_V11_BASE="$BASE"
chmod 700 "$BASE" "$RUNNER"
exec "$RUNNER"
