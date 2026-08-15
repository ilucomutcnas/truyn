# TRUYN Architecture Contract

This document prevents architectural ideas from being lost between the whitepaper, public README, protocol specification and implementation tree.

## Document authority

| Concern | Source of truth |
|---|---|
| Scientific rationale and prior art | `WHITEPAPER.md` |
| Normative protocol behavior | `spec/protocol/<generation>/` |
| Wire representation | `proto/<generation>/` |
| Repository ownership | `STRUCTURE.md` and subsystem READMEs |
| Implementation sequence | `ROADMAP.md` |
| Public explanation | `README.md` |
| Provider ownership | `docs/architecture/PROVIDER_OWNERSHIP.md` |
| Provider authorization | `docs/architecture/AUTHORIZATION_MODEL.md` and `spec/protocol/v1/provider-policy.md` |
| Relay/control-plane boundary | `docs/architecture/RELAY_SECURITY.md` |
| BYOK model | `docs/architecture/BYOK_ARCHITECTURE.md` |
| Billing/quota boundary | `docs/architecture/BILLING_BOUNDARY.md` |
| Provider/relay threat model | `docs/architecture/THREAT_MODEL.md` |
| Public/private information boundary | `docs/architecture/PUBLIC_PRIVATE_BOUNDARY.md` |
| Public multi-cloud provider target | `docs/architecture/MULTI_CLOUD_PROVIDER_ARCHITECTURE.md` |
| Multimodal comparison methodology | `docs/benchmarks/MULTIMODAL_PROVIDER_PARITY.md` |

A mismatch is a defect to be reconciled. README/roadmap language MUST NOT silently create protocol semantics that do not exist in `spec/`.

## Architecture status discipline

TRUYN documentation distinguishes:

- **implemented behavior** — supported by current executable code/tests;
- **approved target architecture** — accepted design that implementation must converge toward;
- **planned/research work** — not yet an implementation contract.

The provider-ownership/BYOK/security documents added to the architecture are approved targets. They do not retroactively make the current MVP relay production-safe.

## Canonical concepts

### Identity
Cryptographic identity is independent of current IP address. Underlay addresses are reachability data, not the long-lived logical identity.

### Capability and Offer
A capability describes what can be provided or computed. `OFFER` advertises a capability with validity, location/policy conditions and optional price.

Capability does not imply authorization. A matching provider is only a candidate until provider ownership, visibility, billing and entitlement policy make it eligible for the requester.

### Provider ownership

Execution providers have an accountable ownership boundary conceptually equivalent to:

```text
providerId
ownerId
tenantId
visibility
billingMode
explicit access policy
```

Authorization-sensitive ownership attributes are derived from authenticated context or trusted provisioning state, not accepted as authoritative merely because a requester supplied them.

`private` is the default provider visibility. Cross-owner execution requires explicit policy.

### BYOK

TRUYN is BYOK by default: Bring Your Own Intelligence / Bring Your Own Provider. Normal users connect provider capacity they control. Upstream credentials remain local to the provider runtime/secure secret facility and are not TRUYN routing payloads.

### Need
`NEED` describes an outcome rather than a predetermined server. It can carry hard constraints for trustability, freshness, latency, cost, deadline, privacy, domain/purpose and compute placement.

A `NEED` cannot grant itself provider authorization by declaring ownership/tenant/billing fields.

### Object
`OBJECT` is immutable, content-addressed information identified by digest. It supports deduplication, cache reuse and location-independent retrieval. Mutable knowledge is represented by `STATE`, with immutable objects/deltas referenced as needed.

### State and Delta
`STATE` identifies current state; `DELTA` represents a change against an identified base state. A receiver MUST know/verify the base before applying a delta.

### Compute
`COMPUTE` requests execution of an advertised capability. Execution placement can prefer the node where data already resides, enabling compute-near-data. Sandboxing, resource limits, data-release rules and result signing belong to the compute subsystem.

Any chargeable/private compute/provider invocation is subject to the same ownership/authorization/billing boundary as AI inference.

### Claim, Evidence and Attestation
A `CLAIM` is a signed assertion. Evidence/provenance are references attached to claims or attestations. `ATTEST` supports, disputes or reports insufficient evidence about a claim.

### Active verification
`CHALLENGE`, `VERIFY` and `DISPUTE` are behaviors composed from existing TRUYN/1 messages. They are not separate envelope kinds. A challenge can create a verification `NEED`; independent nodes return `ATTEST`; the trust engine may issue a `TRUST_RECEIPT`.

### Trustability
Trustability is **claim-centric and context-dependent**:

```text
T = Trust(claim, requester, purpose, domain, time, policy)
```

It is not a universal node score. Domain history, provenance, evidence, independence, freshness, integrity, consensus, anomaly and Sybil-resistance signals can contribute to a Trust Vector. The relying party decides how to interpret it.

Trustability and authorization are separate questions. A provider can be highly trusted but unauthorized for a requester; an authorized provider may still fail a trust threshold for a particular decision.

### Trust aggregation and receipts
A consumer should not need every raw attestation. Independent evidence can be aggregated into a signed `TRUST_RECEIPT` containing policy ID, trust vector/score, raw vs independent support counts, dispute counts, evidence commitment and expiry. Raw evidence remains retrievable/auditable when policy requires it.

### Revocation
`REVOKE` invalidates/supersedes a revocable network object. Key revocation and security-critical revocations require rapid propagation. Revocation does not erase historical provenance; it changes current validity.

### Routing, authorization and value
Routing is constraint-first and policy-local, but provider authorization precedes ranking.

The canonical target pipeline is:

```text
authenticate requester
        ↓
resolve requester identity / tenant
        ↓
discover capability candidates
        ↓
provider ownership / visibility authorization
        ↓
billing responsibility + quota/entitlement
        ↓
hard request constraints
        ↓
ranking
        ↓
dispatch
```

A candidate that fails authorization MUST NOT be recoverable by a high trust score, low price or excellent latency.

A useful verification rule is based on expected value of information:

```text
EVI ≈ ExpectedDecisionUtility(after verification)
      − DecisionUtility(now)
      − VerificationCost
```

When EVI is positive and policy permits, additional verification is justified.

### Billing boundary

Before a chargeable provider call, TRUYN must be able to determine who is authorized to cause it and who is responsible for its cost. If billing responsibility is ambiguous, execution fails closed.

Logical billing modes include `byok`, `owner-funded`, `prepaid`, `subscription` and `sponsored`. Sponsored/free owner-funded access is an explicit entitlement, not a default consequence of public network access.

### Capability economy
Cost-aware routing is part of the core request model; mandatory settlement is not. A future capability market can add payment/settlement adapters without making TRUYN dependent on a blockchain, currency or provider.

Provider ownership remains intact in a market: paid/shared cross-owner execution requires an explicit contract/entitlement.

## Relay and control-plane contract

A relay may be public while providers remain private. Public reachability is not provider authorization.

Execution-capable HTTP, WebSocket, MCP, SDK and legacy paths MUST converge on one central authorization decision before provider dispatch.

Provider runtimes SHOULD use an authenticated machine-to-machine backchannel. Edge/WAF/Cloudflare/cloud-native controls are defense in depth and do not replace TRUYN authorization.

Discovery SHOULD hide owner-private providers from unauthorized requesters, while execution authorization remains mandatory even if a private provider ID is known.

## Multi-cloud and multimodal provider contract

TRUYN routes stable logical capabilities. Cloud vendors, model families and concrete model versions are provider metadata and policy inputs; they are not the primary capability namespace.

Reference capabilities include:

```text
reasoning.general
media.image.generate
media.image.edit
media.video.generate
media.video.transform
```

The public reference target maintains capability parity across Google Cloud and Microsoft Azure so benchmarks can compare reasoning with reasoning, image generation with image generation, and video generation with video generation.

Reference providers funded by the project/operator are owner-private by default. Benchmark presence does not make their quota public.

### Media results

Large image/video binaries SHOULD NOT be embedded directly in signed TRUYN envelopes when an authenticated/content-addressed artifact reference can represent them.

A media `RESULT` should carry a logical artifact descriptor such as:

```text
artifact id
media type
content digest
size
provenance
retrieval reference
```

Provider-specific temporary URLs, bucket names and credentials are adapter/storage concerns, not protocol identity.

### Asynchronous providers

A provider MAY require a long-running job or polling operation. That execution detail MUST remain behind the provider adapter. At the network boundary the requester still observes a normal TRUYN request/result lifecycle.

### Provider identity isolation

Different provider families or materially different capability runtimes SHOULD remain independently attributable so TRUYN can preserve provider-specific provenance, health, latency, cost and trust history. Reusing implementation code does not require collapsing provider identities.

## Public/private information contract

Public architecture describes invariants, schemas, threats, generic deployment patterns and intentionally public service names.

Private operational state includes credentials/private keys, unnecessary cloud identity details, private origins/backchannels, privileged allowlists, exact quotas/cost ceilings, billing/credit information, secret paths and sensitive incident/customer data.

Security MUST remain correct even if the public architecture is fully known.

## Network modes

Exactly three canonical runtime profiles are reserved:

```text
local
testnet
mainnet
```

- `local`: isolated development/LAN.
- `testnet`: public experimental network.
- `mainnet`: future stable public network.

Public network mode never overrides provider visibility/authorization.

## Versioning

Software, protocol, wire and storage versions are independent. A new software release does not automatically imply a new wire generation.

## Installation and upgrades

Installation, first-run bootstrap and update/rollback are infrastructure contracts, not ad-hoc shell scripts. Private keys should use OS secure storage where possible. Updates must be authenticated, compatibility-checked and rollback-capable.

## Interoperability

TRUYN is model/provider-neutral. Vendor adapters are replaceable edges. MCP, SDKs, HTTP/gRPC/WebSocket gateways and provider-specific adapters connect systems to TRUYN; none of them defines the TRUYN network itself.
