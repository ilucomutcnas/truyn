#!/usr/bin/env bash
set -Eeuo pipefail

# Keep the already-reviewed Class C harness immutable while the live gate is being
# diagnosed. This launcher materializes that exact harness revision, applies the
# bootstrap corrections that were previously hidden in the temporary workflow,
# and makes VM service diagnostics visible on a failed node start.
BASE_COMMIT="5731e05bba01aadc58a2f9f3eeb0e93d0e3a4d21"
HARNESS="$(mktemp)"
trap 'rm -f "$HARNESS"' EXIT
curl -fsSL "https://raw.githubusercontent.com/inn-media/truyn/${BASE_COMMIT}/scripts/class-c-cross-cloud-proof.sh" -o "$HARNESS"

python3 - "$HARNESS" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
s = p.read_text()
for old, new in (
    ('/etc/truin-testnet/', '/etc/truyn-testnet/'),
    ('/opt/truin/', '/opt/truyn/'),
    ('/var/lib/truin-network', '/var/lib/truyn-network'),
    ('/etc/truin-cgnat', '/etc/truyn-cgnat'),
    ('/var/lib/truin-cgnat', '/var/lib/truyn-cgnat'),
):
    s = s.replace(old, new)
s = s.replace(
    'npm install --ignore-scripts --no-audit --no-fund',
    'npm install --no-audit --no-fund'
)
s = s.replace(
    'systemctl --no-pager status truyn-testnet.service || true; exit 31',
    "systemctl --no-pager status truyn-testnet.service || true; "
    "journalctl -u truyn-testnet.service --no-pager -n 120 || true; "
    "cd /opt/truyn && node -e \"import('@matrixai/quic').then(()=>console.log('TRUYN_QUIC_IMPORT=PASS')).catch(e=>{console.error(e);process.exitCode=1})\" || true; "
    "exit 31"
)
checks = {
    'out="$(az_remote "$AZ_A0" "$(install_script "$A0_PUB")")"; grep -Fq TRUYN_NODE_READY <<<"$out" || fail azure_a0_start 30':
      'out="$(az_remote "$AZ_A0" "$(install_script "$A0_PUB")")"; if ! grep -Fq TRUYN_NODE_READY <<<"$out"; then printf "%s\\n" "$out"; fail azure_a0_start 30; fi',
    'out="$(az_remote "$AZ_A2" "$(install_script "$A2_PUB")")"; grep -Fq TRUYN_NODE_READY <<<"$out" || fail azure_a2_start 31':
      'out="$(az_remote "$AZ_A2" "$(install_script "$A2_PUB")")"; if ! grep -Fq TRUYN_NODE_READY <<<"$out"; then printf "%s\\n" "$out"; fail azure_a2_start 31; fi',
    'out="$(az_remote "$AZ_AN" "$(install_script "$AN_PRIV")")"; grep -Fq TRUYN_NODE_READY <<<"$out" || fail azure_nat_start 32':
      'out="$(az_remote "$AZ_AN" "$(install_script "$AN_PRIV")")"; if ! grep -Fq TRUYN_NODE_READY <<<"$out"; then printf "%s\\n" "$out"; fail azure_nat_start 32; fi',
}
for old, new in checks.items():
    if old not in s:
        raise SystemExit(f'expected Class C bootstrap check not found: {old[:40]}')
    s = s.replace(old, new)
p.write_text(s)
PY

chmod +x "$HARNESS"
exec bash "$HARNESS"
