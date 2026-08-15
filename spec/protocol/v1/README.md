# TRUYN/1 Protocol

**Status:** draft architecture specification.

TRUYN/1 is the first logical network protocol generation. It runs over existing Internet transport and defines semantics for identity, capability discovery, requests, content-addressed objects, state, computation, claims, verification, trust receipts, results, revocation and provider eligibility/authorization policy.

## Canonical exchange objects

| Object | Normative spec | Wire schema |
|---|---|---|
| `IDENTITY` | `identity.md` | `proto/v1/identity.proto` |
| `OFFER` | `offer.md` / `capability.md` | `offer.proto`, `capability.proto` |
| `NEED` | `need.md` | `need.proto` |
| `OBJECT` | `object.md` | `object.proto` |
| `CLAIM` | `claim.md` | `claim.proto` |
| `ATTEST` | `attest.md`, `verification.md` | `attest.proto` |
| `STATE` | `state.md` | `state.proto` |
| `DELTA` | `delta.md` | `delta.proto` |
| `SUBSCRIBE` | `subscribe.md` | `subscribe.proto` |
| `COMPUTE` | `compute.md` | `compute.proto` |
| `RESULT` | `result.md` | `result.proto` |
| `TRUST_RECEIPT` | `trust-receipt.md`, `trustability.md` | `trust_receipt.proto`, `trust.proto` |
| `REVOKE` | `revoke.md` | `revoke.proto` |

All top-level payloads are carried by `proto/v1/envelope.proto`.

## Provider policy

Provider ownership/visibility/billing policy is specified in `provider-policy.md`. It is an authorization layer around discovery and execution rather than a new top-level envelope kind.

Core invariants:

- provider capability match does not imply requester authorization;
- private is the default provider visibility;
- ownership/tenant attributes used for authorization are derived from authenticated context/trusted provisioning, not requester-controlled claims;
- chargeable/private execution fails closed when authorization or billing responsibility is unresolved;
- discovery SHOULD hide private providers from unauthorized requesters;
- every execution-capable transport converges on equivalent provider-policy enforcement.

The current MVP does not yet implement every provider-policy requirement in the draft target.

## Composed behaviors

`CHALLENGE`, `VERIFY` and `DISPUTE` are protocol behaviors composed from `NEED`, `CLAIM`, `ATTEST`, evidence references and `TRUST_RECEIPT`. They are deliberately not new envelope kinds in TRUYN/1.

## Request constraints

`NEED` may contain hard constraints and decision context including minimum trustability, freshness, latency, maximum cost, deadline, urgency, priority, decision value, domain, purpose, privacy requirements and compute-near-data preference.

Requester-supplied ownership, tenant or billing claims do not override provider policy.

## Routing order

Provider selection conceptually separates:

```text
capability discovery
      ↓
authorization / provider eligibility
      ↓
hard request constraints
      ↓
routing rank
      ↓
dispatch
```

Trustability, price or latency cannot make an unauthorized provider eligible.

## Trust model

Trustability is evaluated for a specific claim/request context, not as one universal node reputation:

```text
Trust(claim, requester, purpose, domain, time, policy)
```

Trustability and authorization are distinct: a trusted provider may still be unavailable to a requester because ownership policy denies access.

## Security

See `security.md` for protocol security assumptions and `provider-policy.md` for provider execution authorization. Public relay reachability does not create an entitlement to private provider capacity.

## Normative language

`MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT` and `MAY` are used in the RFC 2119 sense when capitalized. The current documents remain draft until the protocol is stabilized.
