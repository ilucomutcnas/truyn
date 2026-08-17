# TRUYN Operations

**Status:** current reference operations baseline for `0.1.0-dev`; not a mainnet SRE/SLO claim.

Operations documentation describes how the implemented reference system is expected to be run safely and what remains unproven. It deliberately excludes private cloud topology, credentials, live allowlists, resource IDs and cost ceilings.

## Current operational surfaces

- [Node Operations](NODE_OPERATIONS.md) — identity/state/startup/restart/profile boundaries.
- [Testnet Operations](TESTNET_OPERATIONS.md) — signed bootstrap, QUIC/Kademlia, churn/repair and evidence discipline.
- [Billing Operations](BILLING_OPERATIONS.md) — BYOK, owner-funded and entitlement safety rules.
- [Operational Security](../security/OPERATIONAL_SECURITY.md) — edge/origin/provider proof rotation and incident handling.

## Current maturity

The repository has executable relay/provider/node/testnet paths and a CI-proven v0.1 QUIC/Kademlia underlay. A four-node real QUIC/Kademlia trust-lifecycle testnet has also passed a bounded evidence gate.

What is **not** yet operationally complete:

- stable public mainnet bootstrap;
- universal NAT/reachability support;
- 100/1,000 simultaneously running real-node evidence;
- production SLOs/alerting/on-call commitments;
- signed release/updater/rollback lifecycle for all supported OSes;
- production account/tenant commercial control plane;
- deployed durable sponsored/prepaid/subscription accounting.

## Operational rule

A temporary cloud workflow, successful one-shot deployment or local test is not by itself a production claim. Promote operational maturity only when the result is reproducible and recorded in the durable evidence ledger or a stable release contract.

## Public/private boundary

Public runbooks may document generic configuration names, failure modes and acceptance invariants. Exact live origins, provider node IDs, cloud identities, privileged bootstrap sets, secret values, billing accounts and incident-sensitive data remain outside the public repository.
