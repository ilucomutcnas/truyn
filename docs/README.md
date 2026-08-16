# Documentation

Human-facing documentation for TRUYN architecture, concepts, setup, operations, security, Trustability, compatibility, benchmarks, and architecture decisions.

## Current architecture references

### Core architecture

- [Architecture Contract](architecture/ARCHITECTURE_CONTRACT.md) — canonical architecture constraints and concept ownership.
- [Provider Ownership](architecture/PROVIDER_OWNERSHIP.md) — provider owner/tenant/visibility/billing boundary.
- [Authorization Model](architecture/AUTHORIZATION_MODEL.md) — server-side fail-closed provider authorization.
- [Relay Security](architecture/RELAY_SECURITY.md) — public relay, owner control plane, provider backchannel, and legacy-route rules.
- [Billing Boundary](architecture/BILLING_BOUNDARY.md) — BYOK, owner-funded, sponsored/prepaid/subscription semantics and quota attribution.
- [BYOK Architecture](architecture/BYOK_ARCHITECTURE.md) — Bring Your Own Intelligence / Bring Your Own Provider.
- [Threat Model](architecture/THREAT_MODEL.md) — provider/relay abuse scenarios and the required negative security matrix.
- [Public / Private Information Boundary](architecture/PUBLIC_PRIVATE_BOUNDARY.md) — what belongs in the public repository versus private operations.
- [Production Semantic Index Lifecycle](architecture/SEMANTIC_INDEX_LIFECYCLE.md) — persistent root-CID index lifecycle, immutable block-vector reuse, explicit preparation, invalidation, and cold/warm startup for Semantic Retrieval Gate v2.

### Provider and edge architecture

- [Multi-Cloud Provider Architecture](architecture/MULTI_CLOUD_PROVIDER_ARCHITECTURE.md) — public Google Cloud / Microsoft Azure capability architecture without private deployment identifiers.
- [Public Edge Domains](architecture/PUBLIC_EDGE_DOMAINS.md) — intentionally public hostname roles and the public/control-plane separation; live origin/resource identifiers are deliberately excluded.

### Benchmarks and evidence

- [Benchmark evidence policy and index](benchmarks/README.md) — append-only evidence rules and the current public benchmark record.
- [Cross-Cloud A/B — 2026-08-15](benchmarks/CROSS_CLOUD_AB_2026-08-15.md) — immutable measured baseline.
- [Cross-Cloud 8× Optimization — 2026-08-15](benchmarks/CROSS_CLOUD_8X_OPTIMIZATION_2026-08-15.md) — fixed hot-path optimization gate.
- [Context Efficiency — 2026-08-15](benchmarks/CONTEXT_EFFICIENCY_2026-08-15.md) — content-addressed context economic gate.
- [Semantic Retrieval Gate — 2026-08-15](benchmarks/SEMANTIC_RETRIEVAL_GATE_2026-08-15.md) — question + root CID retrieval/provenance gate.
- [Semantic Retrieval 7-Actor Gate — 2026-08-15](benchmarks/SEMANTIC_RETRIEVAL_MULTI_ACTOR_2026-08-15.md) — functional scaling from two to seven heterogeneous AI actors.
- [Semantic Retrieval v2 Confidence Gate — 2026-08-16](benchmarks/SEMANTIC_RETRIEVAL_V2_CONFIDENCE_GATE_2026-08-16.md) — final Semantic v2 accuracy/stability/economic evidence.
- [Multimodal Provider Parity Benchmark](benchmarks/MULTIMODAL_PROVIDER_PARITY.md) — public apples-to-apples methodology for reasoning, image and video comparisons.

### Benchmark documentation boundary

Published benchmark reports are part of TRUYN's verification record and are preserved in the repository. A sanitized public report should retain the methodology, measured results, limitations, public model versions, tested commit SHA, workflow/run identity where safe, artifact identity/digest where safe, and provenance needed to audit the claim.

Security review must **redact sensitive fields rather than delete the report**. Credentials, private keys, privileged cloud identities, private deployment/resource names, private origins, customer data, secret-bearing URLs, live allowlists and exact operational quota/cost ceilings remain forbidden. Raw artifacts or logs that contain those details stay outside the public repository; their non-sensitive identifiers and cryptographic digests may remain in the report as evidence.

A benchmark result never grants access to the provider accounts used to produce it.

### Getting started

- [BYOK](getting-started/BYOK.md) — target user-facing provider onboarding and credential-locality contract.
- [MVP Quickstart](getting-started/MVP_QUICKSTART.md) — current executable relay/node MVP with explicit non-production security boundary.
- [MVP AI Interoperability](getting-started/MVP_AI_INTEROP.md) — current adapters and live-demo boundary.

## Architecture status rule

Documents explicitly label whether they describe:

- implemented MVP behavior;
- approved target architecture;
- planned future work.

An approved architecture document is **not** an implementation-complete security claim. A fail-closed requester allowlist gate is now implemented before provider execution, but the broader provider-ownership, tenant, BYOK onboarding, billing/quota, private-discovery, and marketplace policy model remains incremental implementation work until code/tests prove each layer.

## Public documentation rule

Provider catalogs, model versions, regions, quotas and access requirements change over time. Public architecture documents describe stable TRUYN capabilities and security invariants. Exact deployment details are resolved during preflight/operations and are not published when they reveal private topology, cloud identities, quotas, billing information, privileged allowlists or secret paths.

See [Public / Private Information Boundary](architecture/PUBLIC_PRIVATE_BOUNDARY.md).
