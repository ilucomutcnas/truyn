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

### Provider and edge architecture

- [Multi-Cloud Provider Architecture](architecture/MULTI_CLOUD_PROVIDER_ARCHITECTURE.md) — public Google Cloud / Microsoft Azure reasoning, image and video provider target without private deployment identifiers.
- [Multi-Cloud Provider Implementation Status](providers/MULTICLOUD_PROVIDER_IMPLEMENTATION_STATUS_2026-08-15.md) — implemented adapters and isolated live smoke evidence for text, image, and video providers.
- [Public Edge Domains](architecture/PUBLIC_EDGE_DOMAINS.md) — intentionally public hostname roles and the public/control-plane separation; live origin/resource identifiers are deliberately excluded.
- [Multimodal Provider Parity Benchmark](benchmarks/MULTIMODAL_PROVIDER_PARITY.md) — planned apples-to-apples methodology for reasoning, image and video comparisons.

### Measured benchmark evidence

- [Cross-Cloud A/B Baseline](benchmarks/CROSS_CLOUD_AB_2026-08-15.md) — measured baseline; explicitly records where the early PoC did not improve tokens/cost/latency.
- [Cross-Cloud 8× Hot-Path Optimization](benchmarks/CROSS_CLOUD_8X_OPTIMIZATION_2026-08-15.md) — measured transport/orchestration optimization gate.
- [Content-Addressed Context Efficiency](benchmarks/CONTEXT_EFFICIENCY_2026-08-15.md) — measured sparse context/delta economic gate.
- [Semantic Retrieval Gate](benchmarks/SEMANTIC_RETRIEVAL_GATE_2026-08-15.md) — measured natural-language question + root CID retrieval/provenance/economic gate.

Public benchmark evidence describes performance under authorized project-controlled providers. It does not grant public access to the underlying provider accounts and does not substitute for the independent provider-security negative test gate.

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
