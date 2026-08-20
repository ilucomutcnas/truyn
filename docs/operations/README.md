# TRUYN Operations

**Status:** current reference operations baseline for `0.1.0-dev`; not a mainnet SRE/SLO claim.  
**Snapshot:** 2026-08-20.

Operations documentation describes how the implemented reference system is expected to be run safely and what remains unproven. It deliberately excludes private cloud topology, credentials, live allowlists, resource IDs and cost ceilings.

## Current operational surfaces

- [Node Operations](NODE_OPERATIONS.md) — identity/state/startup/restart/profile boundaries.
- [Testnet Operations](TESTNET_OPERATIONS.md) — signed bootstrap, QUIC/Kademlia, WAN/NAT, churn/repair and evidence discipline.
- [Productionization Execution Plan](PRODUCTIONIZATION_EXECUTION_PLAN.md) — canonical current engineering order from Class D-100 through stable mainnet.
- [Billing Operations](BILLING_OPERATIONS.md) — BYOK, owner-funded and entitlement safety rules.
- [Operational Security](../security/OPERATIONAL_SECURITY.md) — edge/origin/provider proof rotation and incident handling.

## Current operational maturity

The repository now has:

- executable relay/provider/node/testnet paths;
- CI-proven v0.1 QUIC/Kademlia underlay;
- bounded real QUIC/Kademlia trust-network evidence;
- **accepted Class B real multi-host evidence**;
- **accepted Class C heterogeneous Azure/GCP WAN/reachability evidence** including real packet-path partition/heal, real cloud NAT, double-NAT/CGNAT-like outbound behavior and authenticated relay outage/recovery;
- restart durability, peer-record renewal/repair, DHT replication/quorum/repair and bounded admission reference slices;
- an implemented Class D-100 harness/evaluator and D-1000 scaffolding.

At the 2026-08-20 snapshot, the pinned Class D-100 V14 acceptance run is active but has **not** yet produced a durable accepted PASS report.

## What is not yet operationally complete

- accepted 100-real-node scale evidence;
- accepted 1,000-real-node scale evidence;
- repeated randomized heterogeneous adversarial distributions;
- carrier-field CGNAT validation where required;
- replicated accepted-work survival after loss of the underlying host/volume;
- production SLOs/alerting/on-call commitments;
- long-duration production soak evidence;
- signed release/updater/rollback lifecycle for all supported OSes;
- stable public mainnet bootstrap;
- production account/tenant commercial control plane;
- deployed durable sponsored/prepaid/subscription accounting.

## Operational promotion rule

A temporary cloud workflow, successful provisioning step, one-shot deployment or local test is not by itself a production claim.

Promote an operational gate only when:

1. the declared acceptance contract passes;
2. cleanup/terminal verification passes where required;
3. durable sanitized evidence is preserved;
4. the resulting source/evidence tree is returned to normal security-green CI.

## Public/private boundary

Public runbooks may document generic configuration names, failure modes, acceptance invariants and sanitized measured results. Exact live origins, provider node IDs, cloud identities, privileged bootstrap sets, secret values, billing accounts and incident-sensitive data remain outside the public repository.

See `../architecture/PUBLIC_PRIVATE_BOUNDARY.md` and root `SECURITY.md`.