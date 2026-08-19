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
"""

src = src[:pos] + '\n' + addition + src[pos:]
out.write_text(src)
PY

chmod 700 "$PATCHED"
exec "$PATCHED"
