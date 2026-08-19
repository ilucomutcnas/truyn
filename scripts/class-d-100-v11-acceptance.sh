#!/usr/bin/env bash
set -Eeuo pipefail

BASE="scripts/class-d-100-v10-acceptance.sh"
PATCHED="$(mktemp)"
trap 'rm -f "$PATCHED"' EXIT

python3 - "$BASE" "$PATCHED" <<'PY'
from pathlib import Path
import sys

src = Path(sys.argv[1]).read_text()
out = Path(sys.argv[2])
needle = '\n"""\n\nsrc = src.replace(anchor,'
pos = src.rfind(needle)
if pos < 0:
    raise SystemExit('V10 hardening insertion boundary not found')

addition = r"""
# V11: V10 proved that a transient Azure Ubuntu/NodeSource mirror failure can
# leave the guest without npm even when an installer command happened to return
# successfully. Treat Node bootstrap as successful only after verifying the
# actual tools required by the accepted harness: Node >=22 AND npm present.
node_old = r'''major=0; command -v node >/dev/null 2>&1 && major=\$(node -p 'parseInt(process.versions.node)' 2>/dev/null || echo 0)
if [ "\$major" -lt 22 ]; then
  node_ok=0
  for node_attempt in 1 2 3 4; do
    if curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null && apt-get install -y -qq nodejs >/dev/null; then node_ok=1; break; fi
    echo "TRUYN_NODE_BOOTSTRAP_TRANSIENT_RETRY attempt=\$node_attempt max=4" >&2
    sleep 3
  done
  [ "\$node_ok" -eq 1 ]
fi'''
node_new = r'''node_ok=0
for node_attempt in 1 2 3 4; do
  major=0
  command -v node >/dev/null 2>&1 && major=\$(node -p 'parseInt(process.versions.node)' 2>/dev/null || echo 0)
  if [ "\$major" -ge 22 ] && command -v npm >/dev/null 2>&1; then
    node_ok=1
    break
  fi

  echo "TRUYN_NODE_BOOTSTRAP_VERIFY_RETRY attempt=\$node_attempt max=4 major=\$major npm=\$(command -v npm >/dev/null 2>&1 && echo present || echo missing)" >&2
  rm -f /etc/apt/apt.conf.d/50command-not-found
  curl -fsSL --retry 3 --retry-delay 2 --retry-all-errors https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1 || true
  apt-get -o Acquire::Retries=3 update -qq >/dev/null 2>&1 || true
  apt-get -o Acquire::Retries=3 install -y -qq --fix-missing nodejs >/dev/null 2>&1 || true

  major=0
  command -v node >/dev/null 2>&1 && major=\$(node -p 'parseInt(process.versions.node)' 2>/dev/null || echo 0)
  if [ "\$major" -ge 22 ] && command -v npm >/dev/null 2>&1; then
    node_ok=1
    break
  fi
  sleep 4
done
if [ "\$node_ok" -ne 1 ]; then
  echo "TRUYN_D100_NODE_BOOTSTRAP_DIAG node=\$(command -v node 2>/dev/null || echo missing) npm=\$(command -v npm 2>/dev/null || echo missing) major=\${major:-0}" >&2
  node --version >&2 2>/dev/null || true
  npm --version >&2 2>/dev/null || true
  apt-cache policy nodejs >&2 2>/dev/null || true
fi
[ "\$node_ok" -eq 1 ]'''
if s.count(node_old) != 1:
    raise SystemExit(f'expected exactly one legacy D-100 Node bootstrap block, got {s.count(node_old)}')
s = s.replace(node_old, node_new, 1)
if node_old in s:
    raise SystemExit('legacy D-100 Node bootstrap survived V11 preparation')
if 'command -v npm >/dev/null 2>&1' not in s or '[ "\\$major" -ge 22 ]' not in s:
    raise SystemExit('V11 verified Node/npm readiness gate missing')
if 'TRUYN_D100_NODE_BOOTSTRAP_DIAG' not in s:
    raise SystemExit('V11 Node bootstrap diagnostics missing')

# V11 cleanup hardening: V10 cleanup left one prefixed resource after an early
# install failure. Preserve the explicit first delete pass, then repeatedly
# inventory and delete the remaining run-prefixed resources. Acceptance still
# requires cleanup.confirmed=true and remainingResources=0.
cleanup_start = s.find('\ncleanup() {')
cleanup_end = s.find('\n}\ntrap cleanup EXIT', cleanup_start)
if cleanup_start < 0 or cleanup_end < 0 or s.count('\ncleanup() {') != 1:
    raise SystemExit('V11 canonical cleanup function boundary missing')
cleanup_new = r'''
cleanup() {
  set +e
  STAGE=cleanup
  CLEANUP_CONFIRMED=false
  for vm in "${VMS[@]}"; do az vm delete -g "$RG" -n "$vm" --yes --force-deletion --only-show-errors >/dev/null 2>&1 || true; done
  for nic in "${NICS[@]}"; do az network nic delete -g "$RG" -n "$nic" --only-show-errors >/dev/null 2>&1 || true; done
  for pip in "${PIPS[@]}"; do az network public-ip delete -g "$RG" -n "$pip" --only-show-errors >/dev/null 2>&1 || true; done
  for disk in "${DISKS[@]}"; do az disk delete -g "$RG" -n "$disk" --yes --only-show-errors >/dev/null 2>&1 || true; done
  az network vnet delete -g "$RG" -n "$VNET" --only-show-errors >/dev/null 2>&1 || true
  az network nsg delete -g "$RG" -n "$NSG" --only-show-errors >/dev/null 2>&1 || true

  left=999
  for cleanup_pass in 1 2 3 4 5 6 7 8; do
    ids_out=$(az resource list -g "$RG" --query "[?starts_with(name, '${PREFIX}')].id" -o tsv --only-show-errors 2>/dev/null)
    inventory_rc=$?
    if [[ "$inventory_rc" -ne 0 ]]; then
      echo "TRUYN_CLASS_D_100_CLEANUP_INVENTORY_RETRY pass=${cleanup_pass} max=8" >&2
      sleep 10
      continue
    fi
    mapfile -t ids <<<"$ids_out"
    filtered=()
    for id in "${ids[@]}"; do [[ -n "$id" ]] && filtered+=("$id"); done
    left=${#filtered[@]}
    if [[ "$left" == 0 ]]; then
      CLEANUP_CONFIRMED=true
      break
    fi
    echo "TRUYN_CLASS_D_100_CLEANUP_RETRY pass=${cleanup_pass} max=8 remaining=${left}" >&2
    for id in "${filtered[@]}"; do az resource delete --ids "$id" --only-show-errors >/dev/null 2>&1 || true; done
    sleep 10
  done

  if [[ "$CLEANUP_CONFIRMED" != true ]]; then
    ids_out=$(az resource list -g "$RG" --query "[?starts_with(name, '${PREFIX}')].id" -o tsv --only-show-errors 2>/dev/null)
    inventory_rc=$?
    if [[ "$inventory_rc" -eq 0 ]]; then
      left=$(printf '%s\n' "$ids_out" | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')
      [[ "$left" == 0 ]] && CLEANUP_CONFIRMED=true
    else
      left=999
    fi
  fi

  if [[ -f "$EVIDENCE" ]]; then tmp="${EVIDENCE}.tmp"; jq --argjson confirmed "$CLEANUP_CONFIRMED" --argjson remaining "$left" ".cleanup.confirmed=\$confirmed | .cleanup.remainingResources=\$remaining" "$EVIDENCE" >"$tmp" && mv "$tmp" "$EVIDENCE"; fi
  echo "TRUYN_CLASS_D_100_CLEANUP confirmed=${CLEANUP_CONFIRMED} remaining=${left}"
}'''
s = s[:cleanup_start] + cleanup_new + s[cleanup_end + 2:]
if 'TRUYN_CLASS_D_100_CLEANUP_RETRY' not in s or 'az resource delete --ids' not in s:
    raise SystemExit('V11 bounded cleanup recovery missing')
"""

src = src[:pos] + '\n' + addition + src[pos:]
out.write_text(src)
PY

chmod 700 "$PATCHED"
exec "$PATCHED"
