# TRUYN Provider Ownership Architecture

**Status:** approved target architecture; this document does not claim that the ownership enforcement described here is already implemented.

## Principle

> **Open protocol does not mean open billing account.**

A TRUYN provider is not merely a capability endpoint. It has an accountable owner, a tenant boundary, a visibility policy and a billing mode. Provider ownership is an authorization primitive, not descriptive metadata.

The target policy model is conceptually:

```text
providerId
ownerId
tenantId
visibility
billingMode
allowedCallers / policy reference
```

These fields describe policy semantics. Their final wire/storage representation is an implementation detail that must remain compatible with the normative protocol.

## Ownership rules

1. `ownerId` and `tenantId` MUST be derived from authenticated server-side identity or trusted provisioning state.
2. A requester-supplied `ownerId` or `tenantId` MUST NOT grant authorization.
3. Providers are private by default.
4. A missing, unreadable or ambiguous provider policy MUST fail closed.
5. A requester MUST NOT be routed to a provider merely because the provider advertises a matching capability.
6. Explicit sharing is an opt-in policy decision by the provider owner.
7. Owner-funded providers MUST NOT become public network resources solely because they are connected to a public relay.

## Visibility classes

The target architecture reserves these semantic classes:

- `private` — usable only by the owning tenant or explicitly authorized callers;
- `self` — BYOK provider usable by the identity/account that configured it;
- `shared` — visible/usable only by an explicit allow policy;
- `network` — intentionally advertised for wider network use under explicit commercial or policy terms.

`private` is the default.

## Billing modes

The architecture distinguishes at least:

- `byok` — the requester/provider owner supplies and pays for its own intelligence provider;
- `owner-funded` — the provider owner pays and access is private unless explicitly delegated;
- `prepaid` — future metered entitlement funded in advance;
- `subscription` — future entitlement governed by a subscription policy;
- `sponsored` — future provider-owner-funded allowance subject to explicit quota.

The existence of `sponsored` in the architecture does not enable it. The reference policy target is sponsored access disabled and zero free owner-funded allowance until deliberately activated.

## Owner-private reference providers

TRUYN-operated reference providers used for internal proofs, benchmarks or development are owner-private. Public documentation may describe their logical capability class, but MUST NOT imply that outside users are entitled to consume their provider quota.

## BYOK providers

A normal user-connected provider is expected to be `byok` and private/self-scoped by default. Provider credentials remain at the provider runtime or user's secure local environment; the relay does not receive them.

## Authorization invariant

For an owner-private provider, the safety invariant is:

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
