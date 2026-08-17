# TRUYN Authorization Model

**Status:** implemented reference authorization baseline; richer account/organization tenancy, durable grant administration and commercial entitlement resolution remain incremental layers.

## Implemented minimum security gate

The current provider runtime implements an identity-bound pre-inference gate:

```text
verified NEED
    ↓
requester identity (`from`)
    ↓
provider access policy
    ↓
ALLOW → materialize context → provider billing decision → provider execution
DENY  → RESULT / PROVIDER_ACCESS_DENIED
          provider execution count = 0
```

Both the low-level provider access policy and provider runtime default to `owner-only`. With no explicit requester allowlist they fail closed. A public runtime requires explicit public-mode opt-in and still remains subject to billing policy.

The gate is covered by negative tests asserting an unauthorized requester is rejected before the adapter's `execute()` method is called.

The relay also applies authorization-aware provider discovery/matching before dispatch, so the provider-host gate is a second independent defense rather than the first/only check.

## Implemented relay ownership / discovery boundary

The reference relay binds provider ownership to the authenticated/signed provider identity that published the `OFFER`. Requester-controlled `ownerId`/`tenantId` fields are not authoritative.

For private/owner-only offers, provider-signed requester allowlists can authorize the intended requester without globally trusting that requester at the relay.

Unauthorized private offers are filtered from discovery and dispatch across legacy, compact and WebSocket-chain paths.

## What remains incomplete

The current reference security model is not yet the final account/organization control plane. Still open:

- multiple nodes/providers bound to one authoritative user/org account;
- authoritative tenant membership and lifecycle;
- durable grant/policy administration;
- production commercial entitlement issuance/revocation;
- prepaid/subscription resolver and reconciliation;
- deployed durable sponsored usage accounting;
- marketplace contract/settlement administration.

These future layers must preserve the current fail-closed execution order.

## Core rule

TRUYN authorization is **server-side, identity-bound and fail-closed**.

The official client, CLI and UI may provide helpful guardrails, but they are not a security boundary. A custom client that bypasses official UX must still be unable to invoke a provider it is not authorized to use.

## Canonical decision path

Every execution-capable request path must preserve the same logical authorization pipeline:

```text
authenticate requester
        ↓
resolve authoritative requester identity / tenant where available
        ↓
resolve candidate provider policy
        ↓
authorize visibility + ownership + explicit grants
        ↓
resolve billing responsibility
        ↓
check required entitlement / quota reservation
        ↓
apply hard request constraints
        ↓
rank eligible providers
        ↓
dispatch
        ↓
provider-host access + billing recheck where applicable
        ↓
execute
```

If any mandatory stage cannot produce a trustworthy answer, dispatch/execution MUST NOT occur.

## Authoritative identity

The authorization layer may use cryptographic TRUYN identity, authenticated relay session, account/tenant binding or trusted provisioning state. The key invariant is that requester authorization attributes are not accepted merely because the requester placed them in a payload.

Requester-controlled fields are claims. Authorization state is derived from authenticated context.

## Default deny

The following cases are denied by default:

- provider policy missing or unreadable;
- requester identity missing where required;
- requester tenant unresolved where tenant policy is mandatory;
- provider owner unresolved;
- billing owner/responsibility unresolved;
- visibility unknown;
- explicit sharing required but no trusted grant exists;
- quota/entitlement state unavailable when mandatory;
- owner-funded/BYOK provider configured public;
- sponsored mode lacks a valid actor-bound signed entitlement;
- sponsored usage store is missing/non-durable/unavailable;
- prepaid/subscription mode has no resolver;
- compatibility/legacy route cannot preserve equivalent authorization.

For the implemented provider-host gate specifically, `owner-only` with missing/empty requester allowlist denies execution.

## Explicit policy exception

Cross-owner execution is allowed only through explicit policy/entitlement. Such policy may represent a shared provider, paid capability, organization grant, sponsored allowance or future marketplace contract.

There is no implicit rule that `authenticated user` means `may use all registered providers`.

## Requester-owned provider / BYOK

For normal BYOK operation:

```text
requester identity
        ↑ provider-signed allowlist
private BYOK provider
        ↓ signed OFFER
TRUYN relay/routing
```

The provider consumes the user's/provider owner's upstream relationship. The relay does not receive the raw API key.

Another registered requester absent from that allowlist cannot discover/dispatch to the private provider and therefore cannot cause provider-host execution.

## Owner-funded provider

For owner-funded capacity, public relay/network reachability is not entitlement.

The current billing/access combination requires private/owner-only provider access. A public owner-funded provider mismatch is denied before adapter execution.

Rich explicit shared/sponsored owner-funded access is a separate entitlement layer, not a consequence of network authentication.

## Sponsored authorization interaction

Sponsored execution adds an entitlement decision after access authorization.

The current policy requires:

- signed entitlement verification;
- actor binding to the authenticated requester;
- valid expiry/limits;
- durable atomic usage reservation.

The requester cannot self-grant sponsored access by inventing billing fields in `NEED`.

## Legacy and alternate transports

HTTP, WebSocket, MCP, SDK and future native transports MUST NOT implement independent authorization shortcuts. They may authenticate differently at the edge, but provider authorization must remain equivalent before any chargeable/private execution.

Backward compatibility is not a reason to keep an execution bypass.

## Audit attributes

A durable authorization/accounting record should be able to identify, where applicable:

```text
requesterId
requesterTenant
providerId
providerOwner
providerTenant
billingMode
billingResponsibility
authorizationDecision
authorizationPolicyRef
entitlementId
quotaDecision
requestId
```

Operational identifiers and policy internals may remain private even when the semantic fields are public architecture.

## Non-goals

This document does not define a universal identity provider, payment processor or global account system. It defines authorization invariants that any implementation must preserve.
