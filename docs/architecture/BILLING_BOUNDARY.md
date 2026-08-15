# TRUYN Billing Boundary

**Status:** first provider-runtime billing gate plus explicit owner-runtime startup lock implemented; durable commercial entitlements/accounting remain future work.

## Principle

Before TRUYN causes a chargeable provider operation, it must be possible to answer:

> **Who is authorized to cause this call, and who is responsible for its cost?**

If billing responsibility is ambiguous, execution fails closed.

## Implemented reference gate

The production provider runtime now evaluates execution in this order:

```text
provider runtime configuration lock
        ↓
provider access authorization
        ↓
provider billing authorization
        ↓
adapter.execute()
        ↓
upstream provider call
```

The billing gate is independent from relay/provider access authorization. This is deliberate defense in depth: even if a provider runtime were separately switched to public access mode, its default `owner-funded` billing policy refuses public execution before `adapter.execute()`.

The current runtime default is:

```text
billing mode = owner-funded
provider access = owner-only
sponsored access = disabled
free sponsored requests = 0
free sponsored tokens = 0
```

## Explicit owner-runtime lock

An operator-funded cloud provider can now be marked explicitly with:

```text
TRUYN_OWNER_PROVIDER=1
```

For such a runtime, startup succeeds only when both of these already-resolved policies are true:

```text
provider access = owner-only
billing mode = owner-funded
```

The runtime validates this **before provider adapter initialization**, so an invalid owner-provider configuration fails before provider SDK setup or any upstream inference path can begin.

Two reserved emergency/entitlement switches are intentionally hard-disabled in the current implementation:

```text
OWNER_PAID_EXTERNAL_ACCESS=false
OWNER_PROVIDER_NETWORK_VISIBILITY=false
```

Setting either switch true on an owner runtime fails startup. Supplying either switch without explicitly marking the runtime as an owner provider also fails startup. This prevents a configuration typo from silently converting owner-paid capacity into public/shared capacity.

These switches are not a future sponsored-entitlement implementation. Enabling sponsored/prepaid/subscription access later requires its own explicit entitlement design and tests; the current owner-runtime lock remains fail-closed until that work exists.

## Billing modes

The reference billing policy recognizes:

- `byok` — provider credentials/capacity belong to the provider owner/requester relationship;
- `owner-funded` — provider owner is responsible for the upstream call;
- `prepaid` — reserved for future metered entitlement;
- `subscription` — reserved for future subscription entitlement;
- `sponsored` — explicit provider-owner-funded allowance governed by quota.

Current enforcement behavior:

- `byok` is allowed only for a private/`owner-only` provider and an access-authorized requester;
- `owner-funded` is allowed only for a private/`owner-only` provider and an access-authorized requester;
- `owner-funded` + public provider access is denied with no adapter execution;
- an explicitly marked owner runtime additionally refuses to start unless it is `owner-only + owner-funded`;
- `prepaid` and `subscription` are denied until an entitlement resolver exists;
- `sponsored` is denied unless explicitly enabled and both request/token quotas are positive;
- sponsored execution additionally requires an explicit positive token reservation (`policy.billing.maxTokens`) before the call can be created.

This is an MVP safety boundary, not a complete commercial accounting system.

## Default reference policy

For public TRUYN participation:

```text
sponsored access = disabled
free owner-funded requests = 0
free owner-funded tokens = 0
free owner-funded credits = 0
```

The architecture may support sponsored/free allowances later, but their existence in the model MUST NOT create an implicit entitlement today.

## Charge prevention order

The effective reference path is now:

```text
runtime owner configuration validation
authentication
authorization
provider selection / relay policy filter
provider-host access authorization
billing-owner/mode resolution
entitlement/quota check
adapter execution
upstream provider call
```

A relay or adapter MUST NOT optimistically call an upstream provider and decide authorization afterward.

## Sponsored quota behavior

The current sponsored quota implementation is intentionally conservative and in-memory:

- quotas are scoped per requester and UTC day;
- request count and reserved token budget are checked before execution;
- a sponsored call cannot execute without a positive token estimate/reservation;
- zero or missing quotas fail closed;
- disabling sponsored access overrides all quota values.

Durable/distributed quota state, reconciliation, actual-provider-usage settlement and payment entitlements remain future work. The in-memory implementation exists to prove the fail-closed policy shape, not to serve as production billing storage.

## Usage attribution

Provider RESULT metadata now carries non-secret billing classification for runtime-gated calls:

```text
billingMode
billingResponsibility
```

Relay/request state already binds requester and provider identities to the transaction. A future durable accounting layer can combine those identities with provider-native usage such as:

```text
requesterId
providerId
providerOwnerId
tenantId
billingMode
inputTokens
outputTokens
totalTokens
providerLatency
requestId
```

Not all providers expose token counters, and media providers may use different units. The accounting layer should preserve provider-native usage while exposing normalized high-level metrics where meaningful.

## Gross vs net cost

Public benchmarks should distinguish:

- provider list-price equivalent / gross provider cost;
- credits, sponsorship or negotiated discount coverage;
- net cash cost where it can be reported safely and accurately.

Private credit balances, negotiated prices, billing-account identifiers and internal cost ceilings are not public architecture.

## BYOK isolation

A BYOK request consumes the user's/provider owner's own upstream provider relationship, not a TRUYN operator's provider quota. The relay does not receive the user's raw API key.

The current reference implementation requires BYOK providers to remain private and access-authorized. A public BYOK provider is rejected by the billing policy because arbitrary network callers are not an authoritative same-owner binding.

## Marketplace compatibility

Future capability-market settlement can sit on top of this boundary. The core invariant remains unchanged: a network participant does not obtain another party's paid upstream capacity merely by discovering a capability.