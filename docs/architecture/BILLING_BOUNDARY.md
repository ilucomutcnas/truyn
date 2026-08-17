# TRUYN Billing Boundary

**Status:** implemented fail-closed reference billing safety boundary plus owner-runtime startup lock; production commercial entitlement issuance, durable accounting/reconciliation and rich tenant billing remain future work.

## Principle

Before TRUYN causes a chargeable provider operation, it must be possible to answer:

> **Who is authorized to cause this call, and who is responsible for its cost?**

If billing responsibility is ambiguous, execution fails closed.

## Implemented reference gate

The production/reference provider runtime evaluates execution in this order:

```text
provider runtime configuration lock
        ↓
provider access authorization
        ↓
provider billing authorization
        ↓
adapter.execute()
        ↓
upstream provider call/job
```

The billing gate is independent from relay/provider access authorization. This is deliberate defense in depth: even if a provider runtime were separately switched to public access mode, its default `owner-funded` billing policy refuses public execution before `adapter.execute()`.

The current runtime default is conceptually:

```text
billing mode = owner-funded
provider access = owner-only
sponsored access = disabled
free sponsored requests = 0
free sponsored tokens = 0
```

## Explicit owner-runtime lock

An operator-funded cloud provider can be explicitly marked as an owner provider. For such a runtime, startup succeeds only when already-resolved policy remains equivalent to:

```text
provider access = owner-only
billing mode = owner-funded
```

Validation occurs before provider adapter initialization so invalid owner-provider configuration fails before provider SDK setup or upstream inference can begin.

Reserved emergency/entitlement switches for owner-paid external access/provider visibility remain fail-closed by default; enabling shared/paid capacity requires explicit future entitlement architecture rather than a configuration typo.

## Billing modes

The reference billing policy recognizes:

- `byok` — provider credentials/capacity belong to the provider owner/requester relationship;
- `owner-funded` — provider owner is responsible for the upstream call;
- `prepaid` — reserved for future metered entitlement;
- `subscription` — reserved for future subscription entitlement;
- `sponsored` — explicit provider-owner-funded allowance subject to entitlement and durable quota reservation.

### BYOK

Implemented reference behavior:

- allowed only for a private/`owner-only` provider;
- requester must already pass provider access authorization;
- raw upstream credentials remain at the provider runtime/secret boundary;
- public network reachability does not change who pays.

### Owner-funded

Implemented reference behavior:

- allowed only for private/`owner-only` provider access;
- owner-funded + public provider access is denied with no adapter execution;
- an explicitly marked owner runtime additionally refuses invalid startup configuration.

### Prepaid / subscription

Both are recognized policy modes but remain fail closed until an authoritative entitlement resolver exists. Current behavior is denial rather than optimistic execution.

### Sponsored — hardened current behavior

The sponsored boundary was hardened on 2026-08-17. **The old process-local quota counter is not accepted as a production billing boundary.**

Sponsored execution can activate only when all of the following are satisfied:

1. billing mode is `sponsored`;
2. `sponsoredAccess` is explicitly enabled;
3. provider-side daily request/token ceilings are positive;
4. the request has a positive estimated token reservation;
5. the request carries a signed entitlement artifact;
6. an injected signed-entitlement verifier validates the artifact;
7. entitlement `actorId` equals the authenticated requester identity;
8. entitlement has a non-empty entitlement ID and valid future expiry;
9. entitlement request/token limits are valid positive integers;
10. an injected usage store declares itself durable and exposes atomic `reserve(...)` behavior;
11. the reservation succeeds.

The effective request/token ceiling is the stricter intersection of provider policy and signed entitlement claims.

If entitlement verification fails, actor binding mismatches, expiry is invalid, the usage store is unavailable/non-durable, or reservation fails, execution is denied before adapter work.

## Sponsored entitlement semantics

The signed entitlement verifier returns claims conceptually containing:

```text
version
actorId
entitlementId
expiresAt
maxDailyRequests
maxDailyTokens
```

The signature protects the encoded claims; actor binding prevents token copying from granting another identity sponsored capacity.

This is an authorization/usage entitlement. It is not by itself a payment-processor transaction or settlement rail.

## Durable usage-store contract

Sponsored usage is a security/billing boundary, so the production store must be:

- durable across process restart;
- atomic for reservation updates;
- scoped so concurrent calls cannot race past limits;
- fail-closed when unavailable;
- auditable without exposing provider credentials.

A process-local `Map`, in-memory counter or per-worker best-effort tally is insufficient for production sponsored billing.

The repository currently enforces the interface requirement. **Deployment of the production durable store remains operational work.**

## Default reference policy

For public TRUYN participation:

```text
sponsored access = disabled
free owner-funded requests = 0
free owner-funded tokens = 0
free owner-funded credits = 0
```

The architecture may support sponsored/free allowances later, but their existence in the model MUST NOT create an implicit entitlement.

## Charge prevention order

The effective reference path is:

```text
runtime owner configuration validation
authentication
authorization
provider selection / relay policy filter
provider-host access authorization
billing-owner/mode resolution
entitlement/quota reservation where required
adapter execution
upstream provider call
```

A relay or adapter MUST NOT optimistically call an upstream provider and decide authorization afterward.

## Usage attribution

Provider RESULT/runtime metadata may carry non-secret billing classification such as:

```text
billingMode
billingResponsibility
```

Relay/request state binds requester and provider identities to the transaction. A future durable accounting layer can combine those identities with entitlement ID and provider-native usage such as:

```text
requesterId
providerId
providerOwnerId
tenantId
billingMode
entitlementId
inputTokens
outputTokens
totalTokens
providerLatency
requestId
```

Not all providers expose token counters. Media providers may use jobs, seconds, pixels or other provider-native units. Accounting should preserve provider-native usage before normalization.

## What is not yet a production commercial system

The repository does not yet claim completion of:

- rich account/organization billing ownership;
- payment processor integration as a protocol requirement;
- prepaid balance reconciliation;
- subscription lifecycle/reconciliation;
- production sponsored entitlement issuance/rotation/revocation service;
- deployed distributed durable sponsored-usage store;
- provider-native actual-usage reconciliation/invoicing;
- marketplace settlement administration.

## Gross vs net cost

Public benchmarks should distinguish:

- provider list-price equivalent / gross provider cost;
- credits, sponsorship or negotiated discount coverage;
- net cash cost where it can be reported safely and accurately.

Private credit balances, negotiated prices, billing-account identifiers and internal cost ceilings are not public architecture.

## BYOK isolation

A BYOK request consumes the user's/provider owner's upstream provider relationship, not a TRUYN operator's provider quota. The relay does not receive the raw API key.

The current reference implementation requires BYOK providers to remain private and access-authorized. A public BYOK provider is rejected by billing policy because arbitrary network callers are not an authoritative same-owner binding.

## Marketplace compatibility

Future capability-market settlement can sit on top of this boundary. The invariant remains unchanged: a participant does not obtain another party's paid upstream capacity merely by discovering a capability.

See `docs/operations/BILLING_OPERATIONS.md` for operational fail-closed rules.
