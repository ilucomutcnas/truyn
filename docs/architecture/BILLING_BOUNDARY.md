# TRUYN Billing Boundary

**Status:** approved target architecture; no billing/quota implementation is introduced by this document.

## Principle

Before TRUYN causes a chargeable provider operation, it must be possible to answer:

> **Who is authorized to cause this call, and who is responsible for its cost?**

If billing responsibility is ambiguous, execution fails closed.

## Billing modes

The architecture supports these logical modes:

- `byok` — the requester/provider owner supplies its own upstream provider account;
- `owner-funded` — the provider owner pays and access is restricted by owner policy;
- `prepaid` — future metered entitlement funded in advance;
- `subscription` — future entitlement associated with a subscription;
- `sponsored` — future owner-funded allowance governed by explicit quota.

These modes are policy concepts and do not require any particular payment processor.

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

A chargeable upstream request is created only after:

```text
authentication
authorization
billing-owner resolution
entitlement/quota check
provider selection
```

A relay or adapter MUST NOT optimistically call an upstream provider and decide authorization afterward.

## Usage attribution

A provider transaction should be attributable to fields such as:

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

## Quotas

The policy model may express request, token, cost, concurrency or provider-specific quotas. Owner-private providers may have internal safety budgets even when external access is zero.

Exact production thresholds are private operational data.

## BYOK isolation

A BYOK request should consume the user's/provider owner's own quota, not a TRUYN operator's provider quota. The relay does not need the user's raw API key to enforce this ownership rule.

## Marketplace compatibility

Future capability-market settlement can sit on top of this boundary. The core invariant remains unchanged: a network participant does not obtain another party's paid upstream capacity merely by discovering a capability.
