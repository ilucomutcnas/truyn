# TRUYN/1 Protocol

**Status:** draft architecture specification.

TRUYN/1 is the first logical network protocol generation. It runs over existing Internet transport and defines semantics for identity, capability discovery, requests, content-addressed objects, state, computation, claims, verification, trust receipts, results and revocation.

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

## Composed behaviors

`CHALLENGE`, `VERIFY` and `DISPUTE` are protocol behaviors composed from `NEED`, `CLAIM`, `ATTEST`, evidence references and `TRUST_RECEIPT`. They are deliberately not new envelope kinds in TRUYN/1.

## Request constraints

`NEED` may contain hard constraints and decision context including minimum trustability, freshness, latency, maximum cost, deadline, urgency, priority, decision value, domain, purpose, privacy requirements and compute-near-data preference.

## Trust model

Trustability is evaluated for a specific claim/request context, not as one universal node reputation:

```text
Trust(claim, requester, purpose, domain, time, policy)
```

## Normative language

`MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT` and `MAY` are used in the RFC 2119 sense when capitalized. The current documents remain draft until the protocol is stabilized.
