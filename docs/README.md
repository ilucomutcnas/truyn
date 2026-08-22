# Documentation

Human-facing documentation for TRUYN architecture, factual implementation status, governance, concepts, setup, operations, security, Trustability, compatibility, developer experience, benchmarks and architecture decisions.

## Start here

- [Governance](../GOVERNANCE.md) — canonical project governance, bootstrap stewardship, roles, TSC target and G0→G5 maturity.
- [Governance Architecture](architecture/GOVERNANCE_ARCHITECTURE.md) — governance as an architectural boundary of the standard.
- [Governance Process](governance/README.md) — RFC, extension and decision-process index.
- [Architecture Contract](architecture/ARCHITECTURE_CONTRACT.md) — canonical source-of-truth ownership and cross-subsystem invariants.
- [Implementation Status](architecture/IMPLEMENTATION_STATUS.md) — factual defined/implemented/proven/remaining-work matrix including governance maturity.
- [SDK & Developer Experience](architecture/SDK_DEVELOPER_EXPERIENCE.md) — required first-party SDK languages, Agent Descriptor, conformance and implementation stages.
- [A2A / MCP Interoperability Architecture](architecture/A2A_MCP_INTEROPERABILITY.md) — canonical external agent/tool protocol bridge contract and implementation gate.
- [Roadmap](../ROADMAP.md) — engineering + governance sequence and maturity gates.
- [Security Policy](../SECURITY.md) — public repository/security baseline.
- [Benchmark Evidence](benchmarks/README.md) — append-only public evidence ledger.

## Governance and standardization

TRUYN governance is part of the architecture because it determines how normative protocol and conformance rules may change.

Current factual state:

```text
Public governance/RFC/extension/decision contracts: defined (G1)
Founding Steward: InnMedia
External/independent maintainer model: not yet operating
Multi-organization TSC: not yet constituted
Neutral legal stewardship: not yet established
```

Do not describe this as already neutral or foundation governance.

Canonical governance documents:

- [GOVERNANCE.md](../GOVERNANCE.md) — roles, bootstrap → TSC transition, voting and maturity.
- [MAINTAINERS.md](../MAINTAINERS.md) — factual current role roster.
- [Governance Architecture](architecture/GOVERNANCE_ARCHITECTURE.md) — protocol governance vs repository/infrastructure/commercial ownership.
- [RFC Process](governance/RFC_PROCESS.md) — Draft → Discussion → Accepted/Rejected/Withdrawn → Implemented/Superseded.
- [Extension Governance](governance/EXTENSIONS.md) — Community → Experimental → Official → Core Candidate → Core.
- [Decision Process](governance/DECISION_PROCESS.md) — Class A-D decisions, quorum, supermajority, conflicts and public records.
- [Roadmap Governance Gate](../ROADMAP.md) — GOV-0…GOV-5 implementation sequence.

Community Extensions are permissionless in third-party namespaces. Official project namespace/status requires governance approval. Promotion from an extension to Core requires a separate normative RFC and should be rare.

## Core architecture

- [v0.1 Connect Network Underlay](architecture/NETWORK_UNDERLAY_V01.md) — implemented real QUIC/UDP, authenticated peer sessions, Kademlia discovery/state RPC, direct-first P2P, STUN/same-port hole punching, backpressure and relay fallback.
- [Network Productionization Gate](architecture/NETWORK_PRODUCTIONIZATION_GATE.md) — durability, bounded admission, restart continuity, DHT replication/repair and controlled failure requirements proven by the bounded Azure four-host gate.
- [Governance Architecture](architecture/GOVERNANCE_ARCHITECTURE.md) — public governance as a first-class standard architecture dimension.
- [SDK & Developer Experience](architecture/SDK_DEVELOPER_EXPERIENCE.md) — SDK ownership, required language matrix, TRUYN Agent Descriptor and cross-language conformance gate.
- [Provider Ownership](architecture/PROVIDER_OWNERSHIP.md) — implemented node-level provider owner/visibility boundary and future account/tenant model.
- [Authorization Model](architecture/AUTHORIZATION_MODEL.md) — implemented fail-closed provider authorization baseline and remaining control-plane layers.
- [Relay Security](architecture/RELAY_SECURITY.md) — public relay, owner control plane, provider backchannel, origin guard, edge proxy and legacy-route rules.
- [Billing Boundary](architecture/BILLING_BOUNDARY.md) — actual BYOK/owner-funded/sponsored/prepaid/subscription safety semantics.
- [A2A / MCP Interoperability Architecture](architecture/A2A_MCP_INTEROPERABILITY.md) — A2A Agent Card/task/artifact and MCP tool/resource bridge boundary; MCP bounded reference exists, A2A and cross-protocol proof remain open.
- [Settlement Adapter Architecture](architecture/SETTLEMENT_ADAPTERS.md) — settlement-neutral core plus deferred x402/AP2 extension path; architecture only, implementation not started.
- [BYOK Architecture](architecture/BYOK_ARCHITECTURE.md) — Bring Your Own Intelligence / Provider.
- [Threat Model](architecture/THREAT_MODEL.md) — provider/relay abuse scenarios and required negative security matrix.
- [Public / Private Information Boundary](architecture/PUBLIC_PRIVATE_BOUNDARY.md) — public repository versus private operations.
- [Production Semantic Index Lifecycle](architecture/SEMANTIC_INDEX_LIFECYCLE.md) — persistent root-CID lifecycle, immutable-vector reuse, explicit preparation/invalidation and cold/warm startup.
- [Semantic Retrieval Scale Gate v3](architecture/SEMANTIC_SCALE_GATE_V3.md) — implemented/measured 600 → 10,000 → 100,000-block semantic infrastructure scale.
- [Distributed Semantic Retrieval](architecture/DISTRIBUTED_SEMANTIC_RETRIEVAL.md) — signed distributed holders, bounded candidates, provenance and fail-closed coverage.
- [Decentralized Placement and Byzantine Read Quorum](architecture/DECENTRALIZED_PLACEMENT_BYZANTINE_RETRIEVAL.md) — relay-independent placement discovery, Trustability-aware replica selection and distinct-holder immutable-CID quorum.
- [Kademlia/QUIC Trust Testnet](architecture/KADEMLIA_QUIC_TRUST_TESTNET.md) — real relay-free verifier discovery + replicated signed trust lifecycle state.

## Developer experience and SDKs

TRUYN now has an explicit first-party SDK implementation program for:

- **JavaScript / TypeScript** — npm target;
- **Python** — PyPI target;
- **Go** — Go module target;
- **Java** — Maven-compatible publication target;
- **C# / .NET** — NuGet target.

Rust is an optional additional track and does not replace the five required first-party targets.

Current status: architecture/specification and repository scaffolding are defined; the production client libraries and package publications are still open implementation work.

Developer documents:

- [SDK & Developer Experience Architecture](architecture/SDK_DEVELOPER_EXPERIENCE.md) — common SDK surface, security contract, Agent Descriptor and DX-0…DX-4 gates.
- [SDK Quickstart target](getting-started/SDK_QUICKSTART.md) — intended cross-language install/connect/discover/NEED/RESULT flow.
- [SDK Compatibility](compatibility/SDK_COMPATIBILITY.md) — protocol/descriptor/SDK version declarations and stable-v1 parity gate.
- [SDK repository index](../sdk/README.md) — language directories and distribution targets.
- [TRUYN Agent Descriptor](../spec/protocol/v1/agent-descriptor.md) — draft discovery metadata semantics.

For intentionally public HTTP-facing participants, the target Agent Descriptor discovery path is:

```text
https://<domain>/.well-known/truyn-agent.json
```

The Descriptor is self-description/bootstrap metadata. It does not replace dynamic `OFFER`, does not grant provider authorization and must not disclose private providers/capabilities that provider policy hides from the requester.

## Trustability

- [Trustability index](trustability/README.md) — retrieval integrity, claim evidence and operational trust separation.
- [Claim-Centric Trustability v1](trustability/CLAIM_TRUSTABILITY_V1.md) — signed `CLAIM`/`ATTEST`, provenance, source-lineage independence and trust receipts.
- [Active Trustability Lifecycle v2](trustability/ACTIVE_TRUST_LIFECYCLE_V2.md) — signed challenge/verify/dispute lifecycle, authority/revocation/freshness semantics.

## Provider, interoperability and edge architecture

- [Multi-Cloud Provider Architecture](architecture/MULTI_CLOUD_PROVIDER_ARCHITECTURE.md) — Google Cloud / Microsoft Azure capability architecture without private deployment identifiers.
- [A2A / MCP Interoperability Architecture](architecture/A2A_MCP_INTEROPERABILITY.md) — external protocol edges and bidirectional bridge target.
- [A2A / MCP Compatibility Matrix](compatibility/A2A_MCP_COMPATIBILITY.md) — factual current implementation/version support and remaining gate.
- [Public Edge Domains](architecture/PUBLIC_EDGE_DOMAINS.md) — intentionally public hostname roles and public/control-plane separation.

A2A and MCP are adapter-level interoperability edges. They do not redefine TRUYN identity, provider authorization, Trustability, billing or settlement semantics. Their official TRUYN bindings/compatibility profiles are also subject to the public governance/extension process rather than vendor-specific promotion into core.

## Economics and settlement

- [Capability Economy](concepts/CAPABILITY_ECONOMY.md) — price-aware capability routing without a mandatory payment system.
- [TRUYN/1 Economics](../spec/protocol/v1/economics.md) — protocol-level settlement neutrality.
- [Settlement Adapter Architecture](architecture/SETTLEMENT_ADAPTERS.md) — planned x402 and AP2 integration boundary.

TRUYN/1 does not prescribe currency, billing provider, blockchain, smart contract or settlement rail. x402/AP2 are optional future adapters, not TRUYN/1 wire dependencies. Their presence does not bypass the extension/core promotion process.

## Operations

- [Operations index](operations/README.md)
- [Node Operations](operations/NODE_OPERATIONS.md)
- [Testnet Operations](operations/TESTNET_OPERATIONS.md)
- [Billing Operations](operations/BILLING_OPERATIONS.md)

These documents describe the actual reference operational boundary and explicitly separate it from future mainnet/SLO claims.

## Separate security docs layer

- [Security docs index](security/README.md)
- [Security Architecture Status](security/SECURITY_ARCHITECTURE_STATUS.md)
- [Operational Security](security/OPERATIONAL_SECURITY.md)

Root `SECURITY.md` remains the public policy/reporting entry point; `docs/security/` provides detailed architecture/status/runbook documentation. Governance allows time-bounded security embargoes but requires a durable public decision record for material permanent normative changes after safe disclosure.

## Compatibility

- [Compatibility index](compatibility/README.md)
- [Protocol and Node Compatibility](compatibility/PROTOCOL_AND_NODE_COMPATIBILITY.md)
- [Adapter Compatibility](compatibility/ADAPTER_COMPATIBILITY.md)
- [A2A / MCP Compatibility](compatibility/A2A_MCP_COMPATIBILITY.md)
- [SDK Compatibility](compatibility/SDK_COMPATIBILITY.md)

Current software is `0.1.0-dev`; `TRUYN/1` remains draft. No stable mainnet, external A2A/MCP or first-party SDK compatibility promise is implied yet. External A2A/MCP versions are independently versioned adapter concerns.

Governance maturity is independently versioned as G0-G5 and is not implied by a software/protocol version.

## Benchmarks and evidence

- [Benchmark evidence policy and index](benchmarks/README.md) — append-only evidence rules/current public record.
- [v0.1 Connect Gate — 2026-08-17](benchmarks/V01_CONNECT_GATE_2026-08-17.md) — full-suite proof for real QUIC direct messaging, relay-free Kademlia discovery/state, STUN/same-port hole punching and backpressure.
- [Kademlia/QUIC Trust Testnet — 2026-08-17](benchmarks/KADEMLIA_QUIC_TRUST_TESTNET_2026-08-17.md) — bounded four-node real QUIC/Kademlia trust-lifecycle proof under churn with zero relay calls in the tested path.
- [Network Productionization Azure Four-Host Gate — 2026-08-17](benchmarks/NETWORK_PRODUCTIONIZATION_AZURE_4HOST_2026-08-17.md) — Class B direct-QUIC, partition/heal, RF=3 replication, holder-crash repair and restart-continuity proof on four Azure hosts.
- [Cross-Cloud A/B — 2026-08-15](benchmarks/CROSS_CLOUD_AB_2026-08-15.md) — immutable paired baseline.
- [Cross-Cloud 8× Optimization — 2026-08-15](benchmarks/CROSS_CLOUD_8X_OPTIMIZATION_2026-08-15.md) — fixed hot-path optimization gate.
- [Context Efficiency — 2026-08-15](benchmarks/CONTEXT_EFFICIENCY_2026-08-15.md) — content-addressed context economic gate.
- [Semantic Retrieval Gate — 2026-08-15](benchmarks/SEMANTIC_RETRIEVAL_GATE_2026-08-15.md) — question + root CID retrieval/provenance gate.
- [Semantic Retrieval 7-Actor Gate — 2026-08-15](benchmarks/SEMANTIC_RETRIEVAL_MULTI_ACTOR_2026-08-15.md) — seven heterogeneous actor scaling evidence.
- [Semantic Retrieval v2 Confidence Gate — 2026-08-16](benchmarks/SEMANTIC_RETRIEVAL_V2_CONFIDENCE_GATE_2026-08-16.md) — production-v2 accuracy/stability/economic evidence.
- [Semantic Index Lifecycle — 2026-08-16](benchmarks/SEMANTIC_INDEX_LIFECYCLE_2026-08-16.md) — persistence/reuse/single-flight/invalidation proof.
- [Semantic Scale Gate v3 — 2026-08-16](benchmarks/SEMANTIC_SCALE_GATE_V3_2026-08-16.md) — 600/10k/100k-block infrastructure-scale proof.
- [Semantic Concurrent Load — 2026-08-16](benchmarks/SEMANTIC_CONCURRENT_LOAD_2026-08-16.md) — concurrent signed NEED/single-flight evidence including preserved queue-boundary failure.
- [Distributed Semantic Retrieval — 2026-08-16](benchmarks/DISTRIBUTED_SEMANTIC_RETRIEVAL_2026-08-16.md) — distributed immutable-root retrieval evidence.
- [Claim-Centric Trustability v1 — 2026-08-16](benchmarks/CLAIM_TRUSTABILITY_V1_2026-08-16.md) — trust evidence/resistance proof.
- [Trust Network v2 — 2026-08-16](benchmarks/TRUST_NETWORK_V2_2026-08-16.md) — placement/read-quorum/active Trustability resistance proof.
- [Origin Bypass Security Evaluation — 2026-08-16](benchmarks/ORIGIN_BYPASS_SECURITY_EVALUATION_2026-08-16.md) — production-origin bypass evaluation with negative experiments/limitations.
- [Multimodal Provider Parity](benchmarks/MULTIMODAL_PROVIDER_PARITY.md) — apples-to-apples methodology for text/image/video; methodology, not a completed parity result.

A future A2A/MCP interoperability report belongs in `docs/benchmarks/` only after the bidirectional bridge and negative security matrix have actually run.

Governance evidence is different from benchmark evidence: G2-G5 require actual public role/decision/organizational/legal facts, not synthetic test output.

## Benchmark documentation boundary

Published reports are part of TRUYN's verification record. A sanitized report should retain methodology, measured results, limitations, public model versions, tested commit SHA, workflow/run identity where safe, artifact identity/digest where safe and provenance needed to audit the claim.

Security review must **redact sensitive fields rather than delete the report**. Credentials, private keys, privileged cloud identities, private deployment/resource names, private origins, customer data, secret-bearing URLs, live allowlists and exact operational quota/cost ceilings remain forbidden.

A benchmark result never grants access to provider accounts used to produce it.

## Getting started

- [BYOK](getting-started/BYOK.md) — user-facing provider onboarding/credential locality.
- [MVP Quickstart](getting-started/MVP_QUICKSTART.md) — current executable relay/node MVP boundary.
- [MVP AI Interoperability](getting-started/MVP_AI_INTEROP.md) — current adapters/live-demo boundary.
- [SDK Quickstart target](getting-started/SDK_QUICKSTART.md) — planned first-party cross-language onboarding shape.

## Architecture status rule

Documents explicitly distinguish:

- Defined architecture;
- Implemented reference behavior;
- CI-proven behavior;
- bounded real-testnet evidence;
- Productionized operation;
- Internet-scale evidence;
- Stable compatibility.

Governance separately distinguishes G0-G5. A lower technical or governance maturity state must not be promoted by wording alone. The canonical factual matrix is [Implementation Status](architecture/IMPLEMENTATION_STATUS.md).

## Public documentation rule

Provider catalogs, model versions, external protocol versions, regions, quotas and access requirements change over time. Public docs describe stable TRUYN capabilities/security invariants and sanitized evidence. Exact deployment details remain private when they reveal topology, cloud identities, quotas, billing information, privileged allowlists or secret paths.

The same rule applies to Agent Descriptors, A2A Agent Cards, MCP discovery and SDK examples: public onboarding/interoperability metadata must disclose only intentionally public interfaces/capabilities and must never contain provider credentials/private operational state.

Governance decisions should be public, but an active security embargo may temporarily keep vulnerability details private. The permanent normative outcome must enter the public record when safe.

See [Public / Private Information Boundary](architecture/PUBLIC_PRIVATE_BOUNDARY.md).
