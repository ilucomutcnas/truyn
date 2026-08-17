# TRUYN Billing Boundary

**Status:** implemented fail-closed reference billing safety boundary. Production commercial entitlement issuance, durable accounting/reconciliation and rich tenant billing remain incomplete.

## Principle

Before TRUYN causes a chargeable provider operation, it must answer:

> **Who is authorized to cause this call, and who is responsible for its cost?**

If the answer is ambiguous, execution fails closed.

## Implemented execution order

```text
runtime configuration validation
        ↓
provider access authorization
        ↓
provider billing authorization
        ↓
adapter.execute()
        ↓
upstream provider call/job
```

Billing authorization is deliberately independent from relay/provider access authorization.

## Current billing modes

### `byok`

Implemented reference behavior. The provider must remain private/`owner-only` and the requester must pass access authorization. The upstream provider relationship belongs to the provider owner/user, not the TRUYN operator.

### `owner-funded`

Implemented reference behavior. The provider must remain private/`owner-only`; public provider access is denied before adapter execution. Owner-funded capacity does not become a public network resource merely because the relay/network is public.

An explicitly marked owner-provider runtime is also subject to startup configuration locks so invalid owner-public combinations fail before provider adapter initialization.

### `sponsored`

The security boundary was hardened on 2026-08-17. **The old process-local quota counter is not accepted as a billing boundary.**

Sponsored execution can activate only when all of the following are true:

1. billing mode is `sponsored`;
2. sponsored access is explicitly enabled;
3. configured request/token limits are positive;
4. a positive estimated token reservation exists for the request;
5. the request carries a signed entitlement;
6. the entitlement verifier validates the signature and returns an actor-bound entitlement;
7. entitlement `actorId` matches the authenticated requester;
8. entitlement is unexpired and has a non-empty entitlement ID;
9. entitlement request/token limits are valid;
10. an injected usage store declares itself durable and exposes an atomic `reserve(...)` operation;
11. the atomic reservation succeeds.

The effective quota is the stricter of provider policy and entitlement claims. If the verifier/store is absent, invalid, unavailable or exhausted, the provider does not execute.

The repository contains the verification/policy interfaces; **deployment of a production durable store and commercial entitlement issuer is still operational work**.

### `prepaid` / `subscription`

Recognized policy modes but intentionally fail closed with `entitlement_resolver_unavailable` until a trusted resolver/accounting implementation exists.

## Sponsored entitlement boundary

A sponsored token is an authorization artifact, not a payment instrument by itself. It binds at least:

```text
version
actorId
entitlementId
expiresAt
maxDailyRequests
maxDailyTokens
signature
```

A requester cannot use another actor's entitlement merely by copying the token.

## Usage store contract

The sponsored usage store is a production safety boundary and therefore must be:

- durable across process restart;
- atomic for reservation updates;
- keyed so one actor/entitlement/day cannot race past limits;
- fail-closed when unavailable;
- auditable without exposing provider secrets.

An in-memory `Map` or per-process counter is insufficient for production sponsored billing.

## What is not yet implemented as a production commercial system

- account/organization billing ownership;
- payment processor integration as a TRUYN protocol requirement;
- prepaid balance reconciliation;
- subscription lifecycle/webhook reconciliation;
- production sponsored entitlement issuance/rotation/revocation service;
- deployed distributed durable usage store;
- final provider-native actual-usage reconciliation and invoicing.

## Usage attribution

Provider result/runtime metadata may expose non-secret classification such as billing mode/responsibility and provider-native usage/latency where available. A future durable accounting layer should bind requester, provider, owner/tenant, entitlement, request identity and native usage units.

Text tokens are not the only unit: image/video providers may expose jobs, seconds, pixels or provider-specific billing units. Accounting must preserve native units before normalization.

## Gross vs net benchmark cost

Public benchmarks should distinguish provider list-price equivalent from credits/discount coverage and net cash cost where safe. Private credit balances, negotiated prices, billing-account identifiers and operational ceilings are not public architecture.

## Operational contract

See `docs/operations/BILLING_OPERATIONS.md` for safe-mode startup/incident rules. Billing uncertainty always resolves to **do not execute the chargeable call**.
