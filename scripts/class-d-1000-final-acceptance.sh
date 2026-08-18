#!/usr/bin/env bash
set -Eeuo pipefail

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

source "$TMP/provision.sh"
source "$TMP/campaign.sh"
rm -rf "$TMP"
