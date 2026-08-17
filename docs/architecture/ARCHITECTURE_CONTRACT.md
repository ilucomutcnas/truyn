# TRUYN Architecture Contract

This document defines source-of-truth ownership and cross-subsystem invariants so architecture, implementation, operations and evidence cannot silently diverge.

## Document authority

| Concern | Source of truth |
|---|---|
| Scientific rationale / prior art | `WHITEPAPER.md` |
| Normative protocol semantics | `spec/protocol/<generation>/` |
| Wire representation | `proto/<generation>/` |
| Repository ownership | `STRUCTURE.md` and subsystem READMEs |
| Engineering sequence | `ROADMAP.md` |
| Factual implementation maturity | `docs/architecture/IMPLEMENTATION_STATUS.md` |
| Public explanation | `README.md` |
| Network underlay | `NETWORK_UNDERLAY_V01.md` |
| Provider ownership | `PROVIDER_OWNERSHIP.md` |
| Provider authorization | `AUTHORIZATION_MODEL.md` + `spec/protocol/v1/provider-policy.md` |
| Relay/control-plane security | `RELAY_SECURITY.md` |
| Billing/entitlement safety | `BILLING_BOUNDARY.md` |
| BYOK | `BYOK_ARCHITECTURE.md` |
| Threat model | `THREAT_MODEL.md` |
| Public/private information boundary | `PUBLIC_PRIVATE_BOUNDARY.md` |
| Multi-cloud provider capability architecture | `MULTI_CLOUD_PROVIDER_ARCHITECTURE.md` |
| Semantic lifecycle/scale | `SEMANTIC_INDEX_LIFECYCLE.md`, `SEMANTIC_SCALE_GATE_V3.md` |
| Distributed/decentralized retrieval | `DISTRIBUTED_SEMANTIC_RETRIEVAL.md`, `DECENTRALIZED_PLACEMENT_BYZANTINE_RETRIEVAL.md` |
| Real trust-testnet slice | `KADEMLIA_QUIC_TRUST_TESTNET.md` |
| Operations | `docs/operations/` |
| Security status/runbooks | `docs/security/` and root `SECURITY.md` |
| Compatibility | `docs/compatibility/` |
| Measured claims | `docs/benchmarks/` |

A mismatch is a defect. README/roadmap language MUST NOT create protocol semantics, and architecture language MUST NOT promote an unproven implementation state.

## Status discipline

TRUYN uses these maturity states: Defined, Implemented, CI-proven, Bounded real-testnet proven, Productionized, Internet-scale proven and Stable.

An approved architecture is not automatically an implementation claim. Conversely, once code/evidence exists, documents must stop describing that slice as purely future work.

The current system is mixed maturity: the v0.1 QUIC/Kademlia underlay is implemented and CI-proven; the trust lifecycle has a bounded real four-node QUIC/Kademlia testnet proof; semantic retrieval/provider security have substantial implementation/evidence; mainnet, large real-node adversarial scale and rich commercial/account control planes remain open.

## Canonical concepts

### Identity
Long-lived TRUYN identity is cryptographic and independent of current IP or transport address. Addresses are reachability data.

### Capability / Offer
Capability describes what can be provided. `OFFER` advertises capability and conditions. Capability match never implies authorization.

### Provider ownership and authorization
Execution providers have accountable ownership/visibility/billing semantics. Authenticated/signed provider identity or trusted provisioning is authoritative; requester-controlled `ownerId`, `tenantId` or billing claims cannot grant access.

Private/owner-only is the default. Authorization precedes ranking and dispatch. Provider-host authorization independently precedes adapter execution.

### BYOK
TRUYN is BYOK by default. Upstream credentials remain local to the provider runtime or secure secret facility and are not protocol payloads.

### NEED
`NEED` describes an outcome and may carry trust, freshness, latency, cost, deadline, privacy, domain/purpose and placement constraints. It cannot self-authorize provider access.

### Content, state and semantic reuse
Immutable content can be addressed by digest/root identity. Implemented semantic-index and retrieval layers reuse immutable block vectors, retrieve minimal context and preserve provenance. Generic `OBJECT`/`STATE`/`DELTA`/`SUBSCRIBE` protocol semantics remain broader than the currently productionized runtime slices.

### Compute
`COMPUTE` requests capability execution. Any chargeable/private compute path is subject to the same ownership/authorization/billing boundary as AI inference. General production sandboxing/compute-near-data remains incomplete.

### Claims, evidence and Trustability
A signature proves attribution, not truth. `CLAIM`/`ATTEST`, provenance, source-lineage independence, active challenge/verify/dispute behavior and `TRUST_RECEIPT` form the Trustability model.

Trust is claim-centric and context-dependent:

```text
Trust(claim, requester, purpose, domain, time, policy)
```

Authorization and Trustability are separate decisions.

### Revocation
`REVOKE` and the trust lifecycle change current validity without erasing historical provenance. The real trust-testnet slice includes durable signed transparency/revocation state and stale-receipt detection after lifecycle advancement.

## Canonical routing/execution order

```text
authenticate requester
        ↓
resolve authoritative identity / provider policy
        ↓
discover capability candidates
        ↓
authorization / visibility filter
        ↓
billing responsibility + entitlement/quota decision
        ↓
hard request constraints
        ↓
ranking / routing
        ↓
dispatch
        ↓
provider-host access + billing recheck where applicable
        ↓
execution
```

A high trust score, low price or low latency cannot make an unauthorized provider eligible.

## Billing contract

Before a chargeable operation, TRUYN must resolve who may cause the call and who pays. Ambiguity fails closed.

Reference billing modes: `byok`, `owner-funded`, `sponsored`, `prepaid`, `subscription`.

Current implementation facts:

- BYOK and owner-funded execution require private/owner-only access;
- prepaid/subscription deny without an entitlement resolver;
- sponsored access is disabled unless explicitly enabled;
- sponsored activation requires an actor-bound signed entitlement verifier and an atomic durable usage store;
- process-local counters are not accepted as a production billing boundary.

## Relay / edge / provider boundary

Public relay reachability is permission to speak TRUYN, not permission to consume another party's provider quota.

Execution-capable HTTP, WebSocket, MCP, SDK and compatibility paths must preserve equivalent authorization semantics. Edge/WAF controls are defense in depth, not authorization.

The reference security layer includes an optional origin guard, Cloudflare-compatible edge proxy and protected-provider M2M guard. Origin proof is expiry-bound, rotation-capable and transport-only; protected-provider proof is also transport-only. Both are stripped before the inner protocol boundary.

## Network modes

Exactly three canonical profiles are reserved:

```text
local
testnet
mainnet
```

Network mode changes reachability/compatibility assumptions, never provider entitlement.

## Versioning / compatibility

Software version, protocol generation, wire schema and storage/config format evolve independently. Current software is `0.1.0-dev`; `TRUYN/1` is still draft. Compatibility promises are therefore conservative and documented in `docs/compatibility/`.

## Public/private information

Public architecture may disclose design, invariants, generic code, public service roles and sanitized evidence. Credentials, private keys, private cloud topology, privileged allowlists, live quotas/cost ceilings, secret paths and sensitive incident/customer data remain private operational state.

Security must remain correct even if the public architecture is fully known.
