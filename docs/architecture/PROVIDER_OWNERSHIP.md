# TRUYN Provider Ownership Architecture

**Status:** provider ownership policy core implemented; relay integration remains incremental work.

## Principle

> **Open protocol does not mean open billing account.**

A TRUYN provider is not merely a capability endpoint. It has an accountable owner, a tenant boundary, a visibility policy and a billing mode. Provider ownership is an authorization primitive, not descriptive metadata.

The policy model is conceptually:

```text
providerId
ownerId
tenantId
visibility
billingMode
allowedCallers / policy reference
```

These fields describe policy semantics. Their final wire/storage representation remains compatible with the normative protocol.

## Implemented policy core

`core/security/provider-ownership.js` now provides an authoritative provider ownership registry, and `network/relay/provider-routing.js` provides an authorization-aware candidate filter.

The current core guarantees:

- an unprovisioned provider is derived from the authenticated OFFER signer as `self` + `byok`;
- requester-supplied `ownerId`, `tenantId`, `visibility`, billing mode or cross-tenant flags do not alter authoritative policy;
- node-to-tenant bindings and non-default provider policy come only from trusted server configuration passed to the registry;
- same authoritative tenant can use its own provider;
- `byok` is never cross-tenant;
- `owner-funded` is never cross-tenant;
- `sponsored` exists as a future billing class but is disabled by default;
- cross-tenant use currently requires trusted provisioning, explicit cross-tenant enablement and an allowed entitlement class such as `prepaid` or `subscription`;
- provider policy is snapshotted at registry construction so later mutation of the input configuration does not silently change authorization;
- capability filtering is applied together with provider authorization; capability match never overrides ownership policy.

Automated negative tests cover forged payload policy, foreign BYOK access, owner-funded cross-tenant access, disabled sponsored access, private discovery, exact tenant grants and trusted network-provider policy.

**Not yet claimed:** `network/relay/server.js` has not yet been switched from its coarse trusted-requester gate to this tenant-aware candidate filter. Until that integration is complete, the production-style reference relay remains on the stricter global trusted-requester deny model already documented in `AUTHORIZATION_MODEL.md`.

## Ownership rules

1. `ownerId` and `tenantId` MUST be derived from authenticated server-side identity or trusted provisioning state.
2. A requester-supplied `ownerId` or `tenantId` MUST NOT grant authorization.
3. Providers are private/self-scoped by default.
4. A missing, unreadable or ambiguous provider policy MUST fail closed.
5. A requester MUST NOT be routed to a provider merely because the provider advertises a matching capability.
6. Explicit sharing is an opt-in policy decision by the provider owner and entitlement system.
7. Owner-funded providers MUST NOT become public network resources solely because they are connected to a public relay.

## Visibility classes

- `private` — usable only by the owning tenant or a future explicit authorization policy;
- `self` — BYOK provider usable by its authoritative identity/tenant;
- `shared` — visible/usable only through explicit trusted policy;
- `network` — intentionally advertised for wider network use under explicit trusted commercial/policy terms.

Unprovisioned providers resolve to `self`.

## Billing modes

The architecture distinguishes at least:

- `byok` — the provider/requester tenant supplies and pays for its own intelligence provider;
- `owner-funded` — the provider owner pays; cross-tenant use is disabled in the implemented core;
- `prepaid` — future metered entitlement funded in advance;
- `subscription` — future entitlement governed by a subscription policy;
- `sponsored` — future provider-owner-funded allowance subject to explicit quota.

The existence of `sponsored` does not enable it. The implemented registry defaults sponsored access to disabled.

## Owner-private reference providers

TRUYN-operated reference providers used for internal proofs, benchmarks or development are owner-private. Public documentation may describe their logical capability class, but MUST NOT imply that outside users are entitled to consume their provider quota.

## BYOK providers

A normal user-connected provider is `byok` and self-scoped by default. Provider credentials remain at the provider runtime or user's secure local environment; the relay does not receive them.

When requester and provider use distinct TRUYN identities, an authoritative server-side tenant binding is required before they are treated as the same tenant.

## Authorization invariant

For an owner-private provider:

```text
foreign requester
+ public relay
+ known provider ID
+ custom/malicious client
= no provider invocation
```

The denial must occur before a paid upstream provider call is created.

## Relationship to capability discovery

Capability describes **what** a provider can do. Ownership policy determines **who may see or use** that provider. These are independent filters.

```text
capability match
      ↓
authorization filter
      ↓
eligible provider set
      ↓
ranking / routing
```

A capability match never overrides ownership policy.

## Public/private documentation boundary

This document intentionally publishes the security model. It does not publish production tenant identifiers, privileged caller lists, provider node IDs, cloud identities, private endpoints, quotas, cost ceilings or secret paths.

See also:

- `AUTHORIZATION_MODEL.md`
- `RELAY_SECURITY.md`
- `BILLING_BOUNDARY.md`
- `BYOK_ARCHITECTURE.md`
- `PUBLIC_PRIVATE_BOUNDARY.md`
