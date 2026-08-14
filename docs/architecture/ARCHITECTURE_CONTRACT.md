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

A mismatch is a defect to be reconciled. README/roadmap language MUST NOT silently create protocol semantics that do not exist in `spec/`.

## Canonical concepts

### Identity
Cryptographic identity is independent of current IP address. Underlay addresses are reachability data, not the long-lived logical identity.

### Capability and Offer
A capability describes what can be provided or computed. `OFFER` advertises a capability with validity, location/policy conditions and optional price.

### Need
`NEED` describes an outcome rather than a predetermined server. It can carry hard constraints for trustability, freshness, latency, cost, deadline, privacy, domain/purpose and compute placement.

### Object
`OBJECT` is immutable, content-addressed information identified by digest. It supports deduplication, cache reuse and location-independent retrieval. Mutable knowledge is represented by `STATE`, with immutable objects/deltas referenced as needed.

### State and Delta
`STATE` identifies current state; `DELTA` represents a change against an identified base state. A receiver MUST know/verify the base before applying a delta.

### Compute
`COMPUTE` requests execution of an advertised capability. Execution placement can prefer the node where data already resides, enabling compute-near-data. Sandboxing, resource limits, data-release rules and result signing belong to the compute subsystem.

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

### Trust aggregation and receipts
A consumer should not need every raw attestation. Independent evidence can be aggregated into a signed `TRUST_RECEIPT` containing policy ID, trust vector/score, raw vs independent support counts, dispute counts, evidence commitment and expiry. Raw evidence remains retrievable/auditable when policy requires it.

### Revocation
`REVOKE` invalidates/supersedes a revocable network object. Key revocation and security-critical revocations require rapid propagation. Revocation does not erase historical provenance; it changes current validity.

### Routing and value
Routing is constraint-first and policy-local. Candidates violating hard constraints are removed before ranking. Ranking can consider trust, latency, freshness, cost, privacy, availability, quality and locality. Deadline, urgency, priority and decision value can influence route choice and verification budget.

A useful verification rule is based on expected value of information:

```text
EVI ≈ ExpectedDecisionUtility(after verification)
      − DecisionUtility(now)
      − VerificationCost
```

When EVI is positive and policy permits, additional verification is justified.

### Capability economy
Cost-aware routing is part of the core request model; mandatory settlement is not. A future capability market can add payment/settlement adapters without making TRUYN dependent on a blockchain, currency or provider.

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

## Versioning

Software, protocol, wire and storage versions are independent. A new software release does not automatically imply a new wire generation.

## Installation and upgrades

Installation, first-run bootstrap and update/rollback are infrastructure contracts, not ad-hoc shell scripts. Private keys should use OS secure storage where possible. Updates must be authenticated, compatibility-checked and rollback-capable.

## Interoperability

TRUYN is model/provider-neutral. Vendor adapters are replaceable edges. MCP, SDKs, HTTP/gRPC/WebSocket gateways and provider-specific adapters connect systems to TRUYN; none of them defines the TRUYN network itself.
