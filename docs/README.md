# Documentation

Human-facing documentation for TRUYN architecture, factual implementation status, setup, operations, security, compatibility, Trustability and benchmark evidence.

## Start here

- [Architecture Contract](architecture/ARCHITECTURE_CONTRACT.md) — source-of-truth ownership and cross-subsystem invariants.
- [Implementation Status](architecture/IMPLEMENTATION_STATUS.md) — canonical factual matrix of defined / implemented / proven / remaining work.
- [Roadmap](../ROADMAP.md) — sequencing and maturity gates.
- [Security Policy](../SECURITY.md) — repository/public security baseline.
- [Benchmark Evidence](benchmarks/README.md) — append-only public evidence ledger.

## Core architecture

- [v0.1 Connect Network Underlay](architecture/NETWORK_UNDERLAY_V01.md) — implemented real QUIC/UDP, authenticated sessions, Kademlia discovery/state RPC, direct-first P2P, STUN/same-port hole punching and backpressure.
- [Provider Ownership](architecture/PROVIDER_OWNERSHIP.md) — provider identity/owner/visibility boundary.
- [Authorization Model](architecture/AUTHORIZATION_MODEL.md) — implemented fail-closed provider authorization baseline and remaining account/tenant work.
- [Billing Boundary](architecture/BILLING_BOUNDARY.md) — actual BYOK/owner-funded/sponsored/prepaid/subscription safety semantics.
- [BYOK Architecture](architecture/BYOK_ARCHITECTURE.md) — Bring Your Own Intelligence / Provider.
- [Relay Security](architecture/RELAY_SECURITY.md) — relay, origin guard, edge and protected-provider backchannel boundaries.
- [Threat Model](architecture/THREAT_MODEL.md) — abuse scenarios and negative-test requirements.
- [Public / Private Boundary](architecture/PUBLIC_PRIVATE_BOUNDARY.md) — what may be public vs operationally private.
- [Multi-Cloud Provider Architecture](architecture/MULTI_CLOUD_PROVIDER_ARCHITECTURE.md) — Google/Azure capability architecture.
- [Semantic Index Lifecycle](architecture/SEMANTIC_INDEX_LIFECYCLE.md) — persistent index/reuse/invalidation lifecycle.
- [Semantic Scale Gate v3](architecture/SEMANTIC_SCALE_GATE_V3.md) — measured infrastructure-scale semantic architecture.
- [Distributed Semantic Retrieval](architecture/DISTRIBUTED_SEMANTIC_RETRIEVAL.md) — signed distributed holders/provenance/minimal-context retrieval.
- [Decentralized Placement / Byzantine Read Quorum](architecture/DECENTRALIZED_PLACEMENT_BYZANTINE_RETRIEVAL.md) — relay-independent placement and distinct-holder quorum.
- [Kademlia/QUIC Trust Testnet](architecture/KADEMLIA_QUIC_TRUST_TESTNET.md) — real relay-free trust-network slice.

## Trustability

- [Trustability index](trustability/README.md)
- [Claim-Centric Trustability v1](trustability/CLAIM_TRUSTABILITY_V1.md)
- [Active Trustability Lifecycle v2](trustability/ACTIVE_TRUST_LIFECYCLE_V2.md)

## Operations

- [Operations index](operations/README.md)
- [Node Operations](operations/NODE_OPERATIONS.md)
- [Testnet Operations](operations/TESTNET_OPERATIONS.md)
- [Billing Operations](operations/BILLING_OPERATIONS.md)

These describe the actual current reference operational boundary and explicitly separate it from future mainnet/SLO claims.

## Security documentation layer

- [Security docs index](security/README.md)
- [Security Architecture Status](security/SECURITY_ARCHITECTURE_STATUS.md)
- [Operational Security](security/OPERATIONAL_SECURITY.md)

Root `SECURITY.md` remains the public security policy; this layer provides architecture/status/runbook detail.

## Compatibility

- [Compatibility index](compatibility/README.md)
- [Protocol and Node Compatibility](compatibility/PROTOCOL_AND_NODE_COMPATIBILITY.md)
- [Adapter Compatibility](compatibility/ADAPTER_COMPATIBILITY.md)

Current software is `0.1.0-dev`; `TRUYN/1` remains draft. No stable mainnet compatibility promise is implied.

## Getting started

- [BYOK](getting-started/BYOK.md)
- [MVP Quickstart](getting-started/MVP_QUICKSTART.md)
- [MVP AI Interoperability](getting-started/MVP_AI_INTEROP.md)

## Benchmark evidence

`docs/benchmarks/` is protected append-only evidence. Current reports cover the v0.1 Connect gate, real QUIC/Kademlia trust-testnet slice, semantic retrieval/index/scale/concurrency, distributed retrieval, Trustability, origin-bypass security and cross-cloud/context economics.

Security cleanup uses **redact-not-delete** handling: retain methodology, measured results, limitations, tested commit/run/artifact identity and digests whenever safe.

See [Benchmark evidence policy and index](benchmarks/README.md).

## Architecture status rule

Documents must distinguish:

- architecture defined;
- implementation present;
- CI evidence;
- bounded real-testnet evidence;
- productionization;
- Internet-scale evidence;
- stable compatibility.

A lower maturity state must not be promoted by wording alone. The canonical current matrix is [Implementation Status](architecture/IMPLEMENTATION_STATUS.md).

## Public documentation rule

Public docs describe stable invariants and safe evidence, not private deployment topology. Exact live identities, origins, credentials, privileged allowlists, quotas, billing accounts, cloud project/subscription details and secret paths remain private operations.
