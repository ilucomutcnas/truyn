#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TMP="$(mktemp -d)"
cp benchmarks/scale/class-d-azure-1000-provision.sh "$TMP/provision.sh"
cp benchmarks/scale/class-d-azure-1000-campaign.sh "$TMP/campaign.sh"

python3 - "$TMP/provision.sh" "$TMP/campaign.sh" <<'PY'
from pathlib import Path
import sys
provision = Path(sys.argv[1])
campaign = Path(sys.argv[2])
p = provision.read_text()
# D-1000 provisioning can legitimately take longer than the D-100 gate. Keep the
# signed peer lease comfortably above the provisioning/campaign window; lease
# lifecycle itself is already a separate productionization proof.
p = p.replace('TRUYN_PEER_RECORD_TTL_MS=1800000', 'TRUYN_PEER_RECORD_TTL_MS=14400000')
provision.write_text(p)

c = campaign.read_text()
c = c.replace('truin-d1000@', 'truyn-d1000@')
campaign.write_text(c)
PY

# Cheap immutable preflight before any cloud mutation. These checks protect the
# acceptance contract itself: a prepared harness that loses a strict evidence
# stage must fail before Azure resources are created.
bash -n "$TMP/provision.sh"
bash -n "$TMP/campaign.sh"
bash -n scripts/class-d-1000-strict-acceptance.sh
node --check benchmarks/scale/class-d-1000-safety-probes.js
node --check benchmarks/scale/class-d-1000-evidence.js
node --check benchmarks/scale/evaluate-class-d-1000-evidence.js
node --check benchmarks/scale/verify-class-d-1000-terminal.js

grep -q 'STAGE=invalid-signed-state' "$TMP/campaign.sh"
grep -q 'class-d-1000-safety-probes.js' "$TMP/campaign.sh"
grep -q 'STAGE=packet-partition' "$TMP/campaign.sh"
grep -q 'STAGE=healed-routing' "$TMP/campaign.sh"
grep -q '"healedSuccessRatio":${healed_rate}' "$TMP/campaign.sh"
grep -q '"invalidSignedStateAcceptedCount":${invalid_signed_state_accepted}' "$TMP/campaign.sh"
grep -q '"staleRevokedReceiptAcceptedCount":${stale_receipt_accepted}' "$TMP/campaign.sh"
grep -q '"unauthorizedProviderExecutionCount":${unauthorized_provider_execution}' "$TMP/campaign.sh"
grep -q '"realPacketPath":true' "$TMP/campaign.sh"

echo "TRUYN_CLASS_D1000_PREPARED_HARNESS=PASS safetyContract=v2"

if [[ "${TRUYN_CLASS_D1000_PREPARE_ONLY:-0}" == 1 ]]; then
  rm -rf "$TMP"
  exit 0
fi

source "$TMP/provision.sh"
source "$TMP/campaign.sh"
rm -rf "$TMP"
