# Documentation

Human-facing documentation for TRUYN architecture, concepts, setup, security, Trustability, compatibility, and public benchmark methodology.

## Core architecture

- [Architecture Contract](architecture/ARCHITECTURE_CONTRACT.md) — canonical architecture constraints and concept ownership.
- [Provider Ownership](architecture/PROVIDER_OWNERSHIP.md) — provider owner/tenant/visibility/billing boundary.
- [Authorization Model](architecture/AUTHORIZATION_MODEL.md) — server-side fail-closed provider authorization.
- [Relay Security](architecture/RELAY_SECURITY.md) — relay, control-plane, provider-backchannel, and legacy-route security rules.
- [Billing Boundary](architecture/BILLING_BOUNDARY.md) — BYOK, owner-funded and future sponsored/prepaid/subscription semantics.
- [BYOK Architecture](architecture/BYOK_ARCHITECTURE.md) — Bring Your Own Intelligence / Bring Your Own Provider.
- [Threat Model](architecture/THREAT_MODEL.md) — provider/relay abuse scenarios and negative security requirements.
- [Public / Private Information Boundary](architecture/PUBLIC_PRIVATE_BOUNDARY.md) — what belongs in this public repository.

## Provider and edge architecture

- [Multi-Cloud Provider Architecture](architecture/MULTI_CLOUD_PROVIDER_ARCHITECTURE.md) — logical provider/capability architecture without live deployment identifiers.
- [Public Edge Domains](architecture/PUBLIC_EDGE_DOMAINS.md) — intentionally public hostname roles only.
- [Multimodal Provider Parity Benchmark](benchmarks/MULTIMODAL_PROVIDER_PARITY.md) — public methodology for apples-to-apples reasoning/image/video comparisons.
- [Benchmark publication policy](../benchmarks/README.md) — what benchmark material is safe to publish.

## Getting started

- [BYOK](getting-started/BYOK.md) — target user-facing provider onboarding and credential-locality contract.
- [MVP Quickstart](getting-started/MVP_QUICKSTART.md) — local-development relay/node MVP.
- [MVP AI Interoperability](getting-started/MVP_AI_INTEROP.md) — local adapters and user-supplied provider credentials.

## Security status

The reference runtime is now **fail closed by default**: production-style relay registration requires explicit node enrollment, provider execution requires an explicitly trusted requester, discovery does not expose foreign provider offers to untrusted requesters, and legacy mutation/execution routes are bound to active authenticated sessions.

This is an immediate safety boundary, not the final multi-tenant BYOK authorization system. Full owner/tenant/visibility/billing semantics remain governed by the architecture documents above and require their complete negative test matrix before a public provider marketplace is enabled.

## Public documentation rule

The public repository describes protocol semantics, security invariants, generic adapters, reproducible local examples, and reviewed benchmark methodology. It does **not** store raw production benchmark artifacts, GitHub Actions run identifiers, private cloud resource names, private origins, privileged cloud identities, live quota/cost ceilings, secret names whose disclosure is unnecessary, allowlists, incident data, or deployment runbooks.

Measured results may be published only after a security review has removed operational identifiers and confirmed that the report cannot be used to reconstruct privileged infrastructure.
