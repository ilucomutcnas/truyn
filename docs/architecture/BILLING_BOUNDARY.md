# TRUYN Billing Boundary

**Status:** provider-runtime billing gate and normalized billing-attribution receipt implemented; durable commercial entitlements/accounting remain future work.

## Principle

Before TRUYN causes a chargeable provider operation, it must be possible to answer:

> **Who is authorized to cause this call, and who is responsible for its cost?**

If billing responsibility is ambiguous, execution fails closed.

## Implemented reference gate

The production provider runtime evaluates execution in this order:

```text
provider access authorization
        ↓
provider billing authorization
        ↓
adapter.execute()
        ↓
upstream provider call
        ↓
normalized billing attribution
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

The effective reference path is:

```text
authentication
authorization
provider selection / relay policy filter
provider-host access authorization
billing-owner/mode resolution
entitlement/quota check
adapter execution
upstream provider call
billing attribution receipt
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

## Implemented usage attribution

`core/security/billing-attribution.js` defines `billing-attribution/1`, a normalized non-secret receipt. For a billing-authorized provider execution it records:

```text
requestId
requesterId
requesterTenant       # nullable until authoritative tenant binding exists
providerId
providerOwnerId
providerTenant        # nullable until authoritative tenant binding exists
billingMode
billingResponsibility
status
usage.inputTokens
usage.outputTokens
usage.totalTokens
usage.estimatedTokens
usage.reservedTokens
usage.requestBytes
usage.responseBytes
usage.artifactBytes
latencyMs
providerRequestId
authorizationDecision
quotaDecision
```

The current `AdapterHost` obtains `providerId` and `providerOwnerId` from the local cryptographic TRUYN node identity, not from provider/request payload metadata. Requester identity comes from the verified NEED. Unknown tenant fields remain `null`; the receipt does not invent account ownership.

The receipt uses an allowlisted usage schema. Arbitrary provider metadata, API keys, authorization headers, tokens or other unknown fields are not copied into the receipt.

For an execution that passed billing authorization:

- successful provider execution emits a `status=success` receipt;
- provider execution failure emits a `status=failed` receipt while preserving requester/provider/payer attribution;
- a request denied by access or billing before `adapter.execute()` does not receive a misleading successful charge receipt and creates zero adapter executions.

This receipt is an execution/audit primitive, not durable accounting storage. A future ledger may persist these receipts and enrich the nullable tenant fields through the authoritative provider-ownership/account layer.

Not all providers expose token counters, and media providers may use different units. Missing usage values remain null rather than being estimated silently. Provider-native usage should be preserved where available.

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
