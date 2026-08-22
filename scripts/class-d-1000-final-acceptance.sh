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

# The prepared harness is the only artifact allowed to reach Azure. Normalize
# every known historical typo family before syntax checks so no remote command
# depends on a later shell rescue after cloud resources exist.
def canonical(text: str) -> str:
    for bad, good in (
        ('truy n', 'truyn'),
        ('truin-d1000', 'truyn-d1000'),
        ('truqyn', 'truyn'),
        ('truyqn', 'truyn'),
        ('/opt/truin', '/opt/truyn'),
    ):
        text = text.replace(bad, good)
    return text

p = canonical(provision.read_text())
# D-1000 provisioning can legitimately take longer than the D-100 gate. Keep the
# signed peer lease comfortably above the provisioning/campaign window; lease
# lifecycle itself is already a separate productionization proof.
p = p.replace('TRUYN_PEER_RECORD_TTL_MS=1800000', 'TRUYN_PEER_RECORD_TTL_MS=14400000')
c = canonical(campaign.read_text())

for name, text in (('provision', p), ('campaign', c)):
    for forbidden in ('truy n', 'truin-d1000', 'truqyn', 'truyqn', '/opt/truin'):
        if forbidden in text:
            raise SystemExit(f'noncanonical D-1000 prepared token survived in {name}: {forbidden}')

provision.write_text(p)
campaign.write_text(c)
PY

# Cheap immutable preflight before any cloud mutation. These checks protect the
# acceptance contract itself: a prepared harness that loses a strict evidence
# stage or revives a bad remote path must fail before Azure resources are created.
bash -n "$TMP/provision.sh"
bash -n "$TMP/campaign.sh"
bash -n scripts/class-d-1000-strict-acceptance.sh
node --check benchmarks/scale/class-d-1000-safety-probes.js
node --check benchmarks/scale/class-d-1000-remote-dht-probe.js
node --check benchmarks/scale/class-d-1000-evidence.js
node --check benchmarks/scale/evaluate-class-d-1000-evidence.js
node --check benchmarks/scale/verify-class-d-1000-terminal.js

grep -q 'STAGE=invalid-signed-state' "$TMP/campaign.sh"
grep -q 'class-d-1000-remote-dht-probe.js' "$TMP/campaign.sh"
grep -q 'remoteQuicControl' "$TMP/campaign.sh"
grep -q 'invalid_dht_record:dht_record_signature' "$TMP/campaign.sh"
grep -q 'class-d-1000-safety-probes.js' "$TMP/campaign.sh"
grep -q 'STAGE=packet-partition' "$TMP/campaign.sh"
grep -q 'STAGE=healed-routing' "$TMP/campaign.sh"
grep -q '"healedSuccessRatio":${healed_rate}' "$TMP/campaign.sh"
grep -q '"invalidSignedStateAcceptedCount":${invalid_signed_state_accepted}' "$TMP/campaign.sh"
grep -q '"staleRevokedReceiptAcceptedCount":${stale_receipt_accepted}' "$TMP/campaign.sh"
grep -q '"unauthorizedProviderExecutionCount":${unauthorized_provider_execution}' "$TMP/campaign.sh"
grep -q '"realPacketPath":true' "$TMP/campaign.sh"
grep -q '/bin/bash /tmp/truqyn-d1000-run.sh' "$TMP/provision.sh" && exit 1 || true
grep -q '/bin/bash /tmp/truyqn-d1000-run.sh' "$TMP/provision.sh" && exit 1 || true
grep -q '/bin/bash /tmp/truin-d1000-run.sh' "$TMP/provision.sh" && exit 1 || true
grep -q '/bin/bash /tmp/truy n-d1000-run.sh' "$TMP/provision.sh" && exit 1 || true
grep -q '/bin/bash /tmp/truyn-d1000-run.sh' "$TMP/provision.sh"
grep -q 'WorkingDirectory=/opt/truyn' "$TMP/provision.sh"
grep -q 'EnvironmentFile=/etc/truqyn-d1000/node-%i.env' "$TMP/provision.sh" && exit 1 || true
grep -q 'EnvironmentFile=/etc/truyqn-d1000/node-%i.env' "$TMP/provision.sh" && exit 1 || true
grep -q 'EnvironmentFile=/etc/truin-d1000/node-%i.env' "$TMP/provision.sh" && exit 1 || true
grep -q 'EnvironmentFile=/etc/truy n-d1000/node-%i.env' "$TMP/provision.sh" && exit 1 || true
grep -q 'EnvironmentFile=/etc/truyn-d1000/node-%i.env' "$TMP/provision.sh"
grep -q 'ExecStart=/usr/bin/node /opt/truyqn/network/testnet/node-service.js' "$TMP/provision.sh" && exit 1 || true
grep -q 'ExecStart=/usr/bin/node /opt/truqyn/network/testnet/node-service.js' "$TMP/provision.sh" && exit 1 || true
grep -q 'ExecStart=/usr/bin/node /opt/truin/network/testnet/node-service.js' "$TMP/provision.sh" && exit 1 || true
grep -q 'ExecStart=/usr/bin/node /opt/truy n/network/testnet/node-service.js' "$TMP/provision.sh" && exit 1 || true
grep -q 'ExecStart=/usr/bin/node /opt/truyn/network/testnet/node-service.js' "$TMP/provision.sh"

echo "TRUYN_CLASS_D1000_PREPARED_HARNESS=PASS safetyContract=v2 remoteDht=target-side-quic paths=canonical"

if [[ "${TRUYN_CLASS_D1000_PREPARE_ONLY:-0}" == 1 ]]; then
  rm -rf "$TMP"
  exit 0
fi

source "$TMP/provision.sh"
source "$TMP/campaign.sh"
rm -rf "$TMP"
