# Documentation

Human-facing documentation for TRUYN architecture, factual implementation status, productionization sequencing, setup, operations, security, Trustability, compatibility, benchmarks and architecture decisions.

**Status snapshot:** 2026-08-20 — Class B **PASS**, Class C **PASS**, Class D-100 real-node acceptance **active / not yet accepted**.

## Start here

- [Architecture Contract](architecture/ARCHITECTURE_CONTRACT.md) — canonical subsystem ownership and cross-subsystem invariants.
- [Implementation Status](architecture/IMPLEMENTATION_STATUS.md) — canonical factual defined/implemented/proven/open matrix.
- [Roadmap](../ROADMAP.md) — maturity milestones and critical path.
- [Productionization Execution Plan](operations/PRODUCTIONIZATION_EXECUTION_PLAN.md) — current hard-gated engineering order from D-100 through stable mainnet.
- [Security Policy](../SECURITY.md) — public repository/security baseline.
- [Benchmark Evidence](benchmarks/README.md) — append-only public evidence ledger.

## Current network productionization position

```text
v0.1 Connect — CLOSED
        ↓
Class B real multi-host — ACCEPTED / PASS
        ↓
Class C heterogeneous Azure/GCP WAN/NAT/relay — ACCEPTED / PASS
        ↓
Class D-100 real nodes — ACTIVE / terminal acceptance pending
        ↓
Class D-1000
        ↓
randomized heterogeneous adversarial campaign
        ↓
operational / durability / SRE / distribution closure
        ↓
stable TRUYN/1 / production mainnet
```

The current pinned D-100 V14 run is `32367799512`, testing immutable commit `b835c8fa0283a004d616ce8d25d7aa78cee1a1c0`. At this snapshot immutable preflight and Azure login passed while the real 4-host/100-node campaign remained active. No durable D-100 PASS report exists yet.

## Core architecture

- [v0.1 Connect Network Underlay](architecture/NETWORK_UNDERLAY_V01.md) — real QUIC/UDP, authenticated peer sessions, Kademlia discovery/state RPC, direct-first P2P, STUN/same-port hole punching, backpressure and relay fallback; includes later-status synchronization without changing historical v0.1 evidence.
- [Network Productionization Gate](architecture/NETWORK_PRODUCTIONIZATION_GATE.md) — Class B/Class C accepted boundaries, current D-100/D-1000 contracts, durability and adversarial gates.
- [Provider Ownership](architecture/PROVIDER_OWNERSHIP.md) — node-level provider owner/visibility boundary and future account/tenant model.
- [Authorization Model](architecture/AUTHORIZATION_MODEL.md) — fail-closed provider authorization baseline and remaining control-plane layers.
- [Relay Security](architecture/RELAY_SECURITY.md) — public relay, owner control plane, provider backchannel, origin guard, edge proxy and legacy-route rules.
- [Billing Boundary](architecture/BILLING_BOUNDARY.md) — BYOK/owner-funded/sponsored/prepaid/subscription safety semantics.
- [BYOK Architecture](architecture/BYOK_ARCHITECTURE.md) — Bring Your Own Intelligence / Provider.
- [Threat Model](architecture/THREAT_MODEL.md) — provider/relay abuse scenarios and negative security matrix.
- [Public / Private Information Boundary](architecture/PUBLIC_PRIVATE_BOUNDARY.md) — public repository versus private operations.
- [Production Semantic Index Lifecycle](architecture/SEMANTIC_INDEX_LIFECYCLE.md) — persistent root-CID lifecycle, immutable-vector reuse, preparation/invalidation and cold/warm startup.
- [Semantic Retrieval Scale Gate v3](architecture/SEMANTIC_SCALE_GATE_V3.md) — measured 600 → 10,000 → 100,000-block semantic infrastructure scale; explicitly not real-node scale.
- [Distributed Semantic Retrieval](architecture/DISTRIBUTED_SEMANTIC_RETRIEVAL.md) — signed distributed holders, bounded candidates, provenance and fail-closed coverage.
- [Decentralized Placement and Byzantine Read Quorum](architecture/DECENTRALIZED_PLACEMENT_BYZANTINE_RETRIEVAL.md) — relay-independent placement discovery and distinct-holder immutable-CID quorum.
- [Kademlia/QUIC Trust Testnet](architecture/KADEMLIA_QUIC_TRUST_TESTNET.md) — bounded relay-free verifier discovery + replicated signed trust lifecycle state.

## Trustability

- [Trustability index](trustability/README.md)
- [Claim-Centric Trustability v1](trustability/CLAIM_TRUSTABILITY_V1.md)
- [Active Trustability Lifecycle v2](trustability/ACTIVE_TRUST_LIFECYCLE_V2.md)

The Trustability line has substantial implementation/CI/benchmark evidence, but large real-network Sybil/eclipse/collusion resistance remains a later productionization gate.

## Provider and edge architecture

- [Multi-Cloud Provider Architecture](architecture/MULTI_CLOUD_PROVIDER_ARCHITECTURE.md) — Google Cloud / Microsoft Azure capability architecture without private deployment identifiers.
- [Public Edge Domains](architecture/PUBLIC_EDGE_DOMAINS.md) — intentionally public hostname roles and public/control-plane separation.

Provider reachability never implies provider entitlement. The low-level/default provider security boundary is owner-private/fail-closed unless explicitly configured otherwise.

## Operations

- [Operations index](operations/README.md)
- [Productionization Execution Plan](operations/PRODUCTIONIZATION_EXECUTION_PLAN.md)
- [Node Operations](operations/NODE_OPERATIONS.md)
- [Testnet Operations](operations/TESTNET_OPERATIONS.md)
- [Billing Operations](operations/BILLING_OPERATIONS.md)

These documents describe the actual reference operational boundary and explicitly separate it from future mainnet/SLO claims.

## Security docs layer

- [Security docs index](security/README.md)
- [Security Architecture Status](security/SECURITY_ARCHITECTURE_STATUS.md)
- [Operational Security](security/OPERATIONAL_SECURITY.md)

Root `SECURITY.md` remains the public policy/reporting entry point; `docs/security/` provides detailed architecture/status/runbook documentation.

## Compatibility

- [Compatibility index](compatibility/README.md)
- [Protocol and Node Compatibility](compatibility/PROTOCOL_AND_NODE_COMPATIBILITY.md)
- [Adapter Compatibility](compatibility/ADAPTER_COMPATIBILITY.md)

Current software is `0.1.0-dev`; `TRUYN/1` remains draft. No stable mainnet compatibility promise is implied.

## Benchmarks and evidence

The durable ledger is [Benchmark Evidence](benchmarks/README.md). Key network-productionization reports:

- [v0.1 Connect Gate — 2026-08-17](benchmarks/V01_CONNECT_GATE_2026-08-17.md)
- [Network Productionization Azure Four-Host / Class B — 2026-08-17](benchmarks/NETWORK_PRODUCTIONIZATION_AZURE_4HOST_2026-08-17.md)
- [Class C Heterogeneous WAN — 2026-08-18](benchmarks/CLASS_C_HETEROGENEOUS_WAN_2026-08-18.md) — **ACCEPTED / PASS**
- [First Class D-100 Attempt — 2026-08-17](benchmarks/CLASS_D_100_ATTEMPT_2026-08-17.md) — preserved **negative/unaccepted** evidence; it must not be overwritten by a later successful run.

Key semantic/trust/security evidence includes:

- [Cross-Cloud A/B — 2026-08-15](benchmarks/CROSS_CLOUD_AB_2026-08-15.md)
- [Cross-Cloud 8× Optimization — 2026-08-15](benchmarks/CROSS_CLOUD_8X_OPTIMIZATION_2026-08-15.md)
- [Context Efficiency — 2026-08-15](benchmarks/CONTEXT_EFFICIENCY_2026-08-15.md)
- [Semantic Retrieval Gate — 2026-08-15](benchmarks/SEMANTIC_RETRIEVAL_GATE_2026-08-15.md)
- [Semantic Retrieval 7-Actor Gate — 2026-08-15](benchmarks/SEMANTIC_RETRIEVAL_MULTI_ACTOR_2026-08-15.md)
- [Semantic Retrieval v2 Confidence Gate — 2026-08-16](benchmarks/SEMANTIC_RETRIEVAL_V2_CONFIDENCE_GATE_2026-08-16.md)
- [Semantic Index Lifecycle — 2026-08-16](benchmarks/SEMANTIC_INDEX_LIFECYCLE_2026-08-16.md)
- [Semantic Scale Gate v3 — 2026-08-16](benchmarks/SEMANTIC_SCALE_GATE_V3_2026-08-16.md)
- [Semantic Concurrent Load — 2026-08-16](benchmarks/SEMANTIC_CONCURRENT_LOAD_2026-08-16.md)
- [Distributed Semantic Retrieval — 2026-08-16](benchmarks/DISTRIBUTED_SEMANTIC_RETRIEVAL_2026-08-16.md)
- [Claim-Centric Trustability v1 — 2026-08-16](benchmarks/CLAIM_TRUSTABILITY_V1_2026-08-16.md)
- [Trust Network v2 — 2026-08-16](benchmarks/TRUST_NETWORK_V2_2026-08-16.md)
- [Kademlia/QUIC Trust Testnet — 2026-08-17](benchmarks/KADEMLIA_QUIC_TRUST_TESTNET_2026-08-17.md)
- [Origin Bypass Security Evaluation — 2026-08-16](benchmarks/ORIGIN_BYPASS_SECURITY_EVALUATION_2026-08-16.md)
- [Multimodal Provider Parity](benchmarks/MULTIMODAL_PROVIDER_PARITY.md) — methodology, not a completed parity-result claim.

## Benchmark documentation boundary

Published reports are append-only verification records. A sanitized report should retain methodology, measured results, limitations, tested commit SHA, run/artifact identity/digest where safe and provenance needed to audit the claim.

Security review must **redact sensitive fields rather than delete the report**. A failed or superseded benchmark remains historically visible with an explicit correction/superseding record.

A benchmark result never grants access to provider accounts used to produce it.

## Getting started

- [BYOK](getting-started/BYOK.md) — user-facing provider onboarding/credential locality.
- [MVP Quickstart](getting-started/MVP_QUICKSTART.md) — fastest original local relay proof plus the current, much broader decentralized/security maturity boundary.
- [MVP AI Interoperability](getting-started/MVP_AI_INTEROP.md) — current adapters, BYOK/security boundary, multi-cloud providers and decentralized network status.

## Architecture status rule

Documents explicitly distinguish:

- Defined;
- Implemented;
- CI-proven;
- bounded real-testnet proven;
- accepted productionization gate;
- Productionized;
- Internet-scale proven;
- Stable.

A lower maturity state must not be promoted by wording alone. The canonical status matrix is [Implementation Status](architecture/IMPLEMENTATION_STATUS.md).

## Public documentation rule

Provider catalogs, model versions, regions, quotas and access requirements change over time. Public docs describe stable TRUYN capabilities/security invariants and sanitized evidence. Exact deployment details remain private when they reveal topology, cloud identities, quotas, billing information, privileged allowlists or secret paths.

See [Public / Private Information Boundary](architecture/PUBLIC_PRIVATE_BOUNDARY.md).