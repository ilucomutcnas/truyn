# TRUYN Architecture Contract

**Status synchronization:** 2026-08-20.

This document prevents architectural ideas and factual implementation status from being lost or silently diverging between the whitepaper, public README, protocol specification, implementation tree, operations and benchmark evidence.

## Document authority

| Concern | Source of truth |
|---|---|
| Scientific rationale and prior art | `WHITEPAPER.md` |
| Normative protocol behavior | `spec/protocol/<generation>/` |
| Wire representation | `proto/<generation>/` |
| Repository ownership | `STRUCTURE.md` and subsystem READMEs |
| Maturity roadmap | `ROADMAP.md` |
| Current productionization execution order | `docs/operations/PRODUCTIONIZATION_EXECUTION_PLAN.md` |
| Factual implementation maturity | `docs/architecture/IMPLEMENTATION_STATUS.md` |
| Public explanation | `README.md` |
| Network underlay | `docs/architecture/NETWORK_UNDERLAY_V01.md` |
| Network productionization gates | `docs/architecture/NETWORK_PRODUCTIONIZATION_GATE.md` |
| Provider ownership | `docs/architecture/PROVIDER_OWNERSHIP.md` |
| Provider authorization | `docs/architecture/AUTHORIZATION_MODEL.md` and `spec/protocol/v1/provider-policy.md` |
| Relay/control-plane boundary | `docs/architecture/RELAY_SECURITY.md` |
| BYOK model | `docs/architecture/BYOK_ARCHITECTURE.md` |
| Billing/quota/entitlement boundary | `docs/architecture/BILLING_BOUNDARY.md` |
| Provider/relay threat model | `docs/architecture/THREAT_MODEL.md` |
| Public/private information boundary | `docs/architecture/PUBLIC_PRIVATE_BOUNDARY.md` |
| Public multi-cloud provider architecture | `docs/architecture/MULTI_CLOUD_PROVIDER_ARCHITECTURE.md` |
| Semantic lifecycle / scale | `docs/architecture/SEMANTIC_INDEX_LIFECYCLE.md`, `SEMANTIC_SCALE_GATE_V3.md` |
| Distributed/decentralized semantic retrieval | `DISTRIBUTED_SEMANTIC_RETRIEVAL.md`, `DECENTRALIZED_PLACEMENT_BYZANTINE_RETRIEVAL.md` |
| Real trust-testnet slice | `KADEMLIA_QUIC_TRUST_TESTNET.md` |
| Trustability | `docs/trustability/` |
| Operations | `docs/operations/` |
| Detailed security status/runbooks | `docs/security/` plus root `SECURITY.md` |
| Compatibility | `docs/compatibility/` |
| Measured claims | `docs/benchmarks/` |
| Multimodal comparison methodology | `docs/benchmarks/MULTIMODAL_PROVIDER_PARITY.md` |

A mismatch is a defect to be reconciled. README/roadmap language MUST NOT silently create protocol semantics that do not exist in `spec/`. Architecture language MUST NOT promote a subsystem to a maturity state that its implementation/evidence does not support.

## Architecture status discipline

TRUYN documentation distinguishes:

- **Defined** — architecture/specification exists;
- **Implemented** — executable reference behavior exists;
- **CI-proven** — bounded automated tests prove the contract;
- **Bounded real-testnet proven** — a real network/process topology proves a bounded gate;
- **Accepted productionization gate** — a declared canonical evaluator/terminal contract passed and durable evidence exists;
- **Productionized** — intended deployment lifecycle/recovery/security/observability gates are satisfied;
- **Internet-scale proven** — large real-node/WAN/adversarial evidence exists;
- **Stable** — compatibility guarantees are declared.

The repository is intentionally mixed maturity. The v0.1 QUIC/Kademlia underlay is implemented/CI-proven; Class B real multi-host and Class C heterogeneous WAN/reachability are accepted bounded productionization evidence; semantic retrieval and provider security have substantial implementation/evidence; **Class D-100 is active but not yet accepted at the 2026-08-20 snapshot**; D-1000, randomized large real-network adversarial operation, operational closure and stable mainnet remain open.

An approved architecture document is not an implementation-complete security claim. Conversely, once a slice is implemented and evidenced, documentation must not continue describing it as purely planned.

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

`private`/`owner-only` is the default provider posture. Cross-owner execution requires explicit policy.

The current implemented reference owner binding is node/provider identity based; rich account/organization ownership remains future control-plane work.

### BYOK

TRUYN is BYOK by default: Bring Your Own Intelligence / Bring Your Own Provider. Normal users connect provider capacity they control. Upstream credentials remain local to the provider runtime/secure secret facility and are not TRUYN routing payloads.

The reference CLI/runtime implements private BYOK profiles for supported provider types. OS-native credential-store integration and stable account tenancy remain separate maturity gates.

### Need
`NEED` describes an outcome rather than a predetermined server. It can carry hard constraints for trustability, freshness, latency, cost, deadline, privacy, domain/purpose and compute placement.

A `NEED` cannot grant itself provider authorization by declaring ownership/tenant/billing fields.

### Object
`OBJECT` is immutable, content-addressed information identified by digest. It supports deduplication, cache reuse and location-independent retrieval. Mutable knowledge is represented by `STATE`, with immutable objects/deltas referenced as needed.

Implemented semantic-index/retrieval layers already apply content-addressed root/block concepts, persistent immutable-vector reuse and minimal-context retrieval. That does not mean every generic `OBJECT` network behavior is fully productionized.

### State and Delta
`STATE` identifies current state; `DELTA` represents a change against an identified base state. A receiver MUST know/verify the base before applying a delta.

Generic network-wide `STATE`/`DELTA`/`SUBSCRIBE` maturity remains broader than the implemented semantic/trust state slices.

### Compute
`COMPUTE` requests execution of an advertised capability. Execution placement can prefer the node where data already resides, enabling compute-near-data. Sandboxing, resource limits, data-release rules and result signing belong to the compute subsystem.

Any chargeable/private compute/provider invocation is subject to the same ownership/authorization/billing boundary as AI inference. General production `COMPUTE` sandboxing remains incomplete.

### Claim, Evidence and Attestation
A `CLAIM` is a signed assertion. Evidence/provenance are references attached to claims or attestations. `ATTEST` supports, disputes or reports insufficient evidence about a claim.

Claim-centric Trustability, provenance/source-lineage logic and bounded adversarial evidence are implemented reference slices.

### Active verification
`CHALLENGE`, `VERIFY` and `DISPUTE` are behaviors composed from existing TRUYN/1 messages. They are not separate envelope kinds. A challenge can create a verification `NEED`; independent nodes return `ATTEST`; the trust engine may issue a `TRUST_RECEIPT`.

The active trust lifecycle and a bounded real QUIC/Kademlia verifier-discovery/revocation path are implemented.

### Trustability
Trustability is **claim-centric and context-dependent**:

```text
T = Trust(claim, requester, purpose, domain, time, policy)
```

It is not a universal node score. Domain history, provenance, evidence, independence, freshness, integrity, consensus, anomaly and Sybil-resistance signals can contribute to a Trust Vector. The relying party decides how to interpret it.

Trustability and authorization are separate questions. A provider can be highly trusted but unauthorized; an authorized provider may still fail a trust threshold for a particular decision.

### Trust aggregation and receipts
A consumer should not need every raw attestation. Independent evidence can be aggregated into a signed `TRUST_RECEIPT` containing policy ID, trust vector/score, raw vs independent support counts, dispute counts, evidence commitment and expiry. Raw evidence remains retrievable/auditable when policy requires it.

The implemented trust-network slice additionally commits source-owner delegation/lifecycle state and can detect stale receipts after revocation-state advancement.

### Revocation
`REVOKE` invalidates/supersedes a revocable network object. Key revocation and security-critical revocations require rapid propagation. Revocation does not erase historical provenance; it changes current validity.

The real trust-testnet slice includes durable signed transparency/revocation state and replicated lifecycle advancement in a bounded topology.

### Routing, authorization and value
Routing is constraint-first and policy-local, but provider authorization precedes ranking.

The canonical pipeline is:

```text
authenticate requester
        ↓
resolve authoritative requester identity / tenant where available
        ↓
discover capability candidates
        ↓
provider ownership / visibility authorization
        ↓
billing responsibility + entitlement/quota
        ↓
hard request constraints
        ↓
ranking
        ↓
dispatch
        ↓
provider-host authorization/billing recheck where applicable
        ↓
execution
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

Before a chargeable provider call, TRUYN must determine who is authorized to cause it and who is responsible for its cost. If billing responsibility is ambiguous, execution fails closed.

Logical billing modes include `byok`, `owner-funded`, `prepaid`, `subscription` and `sponsored`.

Current implementation facts:

- BYOK and owner-funded execution require private/owner-only provider access;
- prepaid/subscription fail closed without an entitlement resolver;
- sponsored access is disabled unless explicitly enabled;
- sponsored activation requires actor-bound signed entitlement verification and an atomic durable usage store;
- a process-local usage counter is not an acceptable production billing boundary.

### Capability economy
Cost-aware routing is part of the core request model; mandatory settlement is not. A future capability market can add payment/settlement adapters without making TRUYN dependent on a blockchain, currency or provider.

Provider ownership remains intact in a market: paid/shared cross-owner execution requires an explicit contract/entitlement.

## Relay and control-plane contract

A relay may be public while providers remain private. Public reachability is not provider authorization.

Execution-capable HTTP, WebSocket, MCP, SDK and legacy paths MUST preserve equivalent central authorization before provider execution.

The reference provider security path is defense in depth: relay filtering plus provider-host access/billing checks.

Provider runtimes may use an authenticated machine-to-machine backchannel. Edge/WAF/cloud controls are additive and do not replace TRUYN authorization.

## Network productionization contract

Network maturity is evidence-classed rather than inferred from code presence:

```text
v0.1 Connect reference gate
        ↓
Class B real multi-host — accepted
        ↓
Class C heterogeneous WAN/NAT/relay — accepted
        ↓
Class D-100 real scale/adversarial — active
        ↓
Class D-1000
        ↓
randomized heterogeneous adversarial campaigns
        ↓
operational/stability closure
```

The current canonical D-100 contract requires 100 real nodes/identities/QUIC sockets, at least four hosts, ≥99% baseline/healed routing, recovery/convergence p95 ≤120 seconds, required churn/partition/Byzantine/Sybil/eclipse/collusion exercise, zero listed safety violations and cleanup. A harness or partial workflow is not accepted evidence.

See `NETWORK_PRODUCTIONIZATION_GATE.md` and `../operations/PRODUCTIONIZATION_EXECUTION_PLAN.md`.

## Reference edge/origin security

The reference runtime includes an optional origin guard, Cloudflare-compatible edge proxy and protected-provider M2M guard.

Origin proof is expiry-bound, supports an active+previous rotation window and is stripped before the inner relay. Protected-provider M2M proof is also transport-only and stripped before protocol handling. Oversized HTTP bodies return 413 and close the connection to prevent keep-alive poisoning. Local-development mode hard-fails if combined with public/production markers.

Reference code does not prove that a particular production perimeter is correctly activated; deployment proof is operational work.

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

A provider MAY require a long-running job or polling operation. That execution detail remains behind the provider adapter; the network boundary still observes a normal TRUYN request/result lifecycle.

### Provider identity isolation

Different provider families or materially different capability runtimes SHOULD remain independently attributable so TRUYN can preserve provider-specific provenance, health, latency, cost and trust history. Reusing implementation code does not require collapsing provider identities.

## Public/private information contract

Public architecture describes invariants, schemas, threats, generic deployment patterns and intentionally public service roles.

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
- `testnet`: public/controlled experimental network.
- `mainnet`: future stable public network.

Public network mode never overrides provider visibility/authorization.

## Versioning

Software, protocol, wire and storage versions are independent. Current software is `0.1.0-dev`; `TRUYN/1` remains draft. A new software release does not automatically imply a new wire generation.

See `docs/compatibility/`.

## Installation and upgrades

Installation, first-run bootstrap and update/rollback are infrastructure contracts, not ad-hoc shell-script semantics. Private keys should use OS secure storage where possible. Updates must eventually be authenticated, compatibility-checked and rollback-capable.

Production installer/updater/rollback maturity remains a v0.8/v1.0 gate.

## Interoperability

TRUYN is model/provider-neutral. Vendor adapters are replaceable edges. MCP, SDKs, HTTP/gRPC/WebSocket gateways and provider-specific adapters connect systems to TRUYN; none defines the network itself.

See `docs/compatibility/ADAPTER_COMPATIBILITY.md` for the factual adapter compatibility boundary.