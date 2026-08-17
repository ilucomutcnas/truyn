# TRUYN Provider Ownership Architecture

**Status:** implemented node-level provider identity/authorization boundary; richer account/organization tenancy, shared-provider administration and commercial ownership semantics remain target architecture.

## Principle

> **Open protocol does not mean open billing account.**

A TRUYN provider is not merely a capability endpoint. It has an accountable owner, visibility policy and billing boundary. Provider ownership is an authorization primitive, not descriptive metadata.

The long-term policy model is conceptually:

```text
providerId
ownerId
tenantId
visibility
billingMode
allowedCallers / policy reference
```

These fields describe policy semantics. Their final wire/storage representation is an implementation detail that must remain compatible with the normative protocol.

## Implemented reference ownership boundary

The current relay implements a deliberately smaller, cryptographically authoritative subset:

```text
signed OFFER.from
      ↓
providerNodeId
      ↓
reference ownerNodeId = providerNodeId
```

The relay does **not** trust requester/provider-supplied `ownerId` or `tenantId` metadata to establish ownership. The cryptographic sender identity of the signed, session-bound `OFFER` is authoritative for the current node-level provider owner.

This is not yet the final account-level model. A future control plane may bind multiple provider nodes to one authenticated account/organization/tenant, but requester-controlled fields must still never create ownership or entitlement.

## Implemented provider policy

Each stored offer receives relay-side provider policy equivalent to:

```text
accessMode: owner-only | public
visibility: private | network
allowedRequesterIds: [...]   # only for owner-only
```

Unknown/missing access mode fails closed to `owner-only` / private behavior.

For an `owner-only` provider, `allowedRequesterIds` is taken from provider-signed `OFFER` metadata. This enables a private/BYOK provider to authorize its own requester identity without adding that user to a global relay trusted-requester list.

The low-level provider access policy and provider runtime also default to `owner-only`. Public execution therefore requires explicit operator intent at more than one layer.

## Ownership rules

1. `ownerId` and `tenantId` used for authorization MUST be derived from authenticated server-side identity or trusted provisioning state.
2. A requester-supplied `ownerId` or `tenantId` MUST NOT grant authorization.
3. Providers are private by default.
4. Missing/unreadable/ambiguous provider policy MUST fail closed.
5. A requester MUST NOT be routed to a provider merely because capability matches.
6. Explicit sharing is an opt-in policy decision by the provider owner.
7. Owner-funded providers MUST NOT become public network resources solely because they are connected to a public relay/network.
8. Billing/entitlement policy MUST NOT be inferred from provider discoverability.

The current reference relay/runtime enforces these rules at the node/provider-offer execution boundary.

## Visibility classes

The target architecture reserves semantic classes:

- `private` — owning tenant or explicitly authorized callers only;
- `self` — BYOK provider usable by the identity/account that configured it;
- `shared` — explicit allow policy;
- `network` — intentionally advertised for wider use under explicit commercial/policy terms.

`private` is the default.

Current reference mapping:

- `owner-only` → private;
- `public` → network.

Additional account-level `self`/`shared` semantics remain future control-plane work.

## Billing modes

The architecture distinguishes:

- `byok` — requester/provider owner supplies/pays for its own intelligence provider;
- `owner-funded` — provider owner pays and access remains private unless explicitly delegated;
- `prepaid` — future metered entitlement;
- `subscription` — future subscription entitlement;
- `sponsored` — explicit provider-owner-funded allowance subject to signed entitlement and durable usage reservation.

The existence of a mode in architecture does not enable it.

Current facts:

- BYOK/owner-funded require private/owner-only access;
- prepaid/subscription fail closed without a resolver;
- sponsored mode cannot activate without actor-bound signed entitlement verification and durable atomic usage-store reservation.

## Owner-private reference providers

TRUYN-operated reference providers used for internal proofs, benchmarks or development are owner-private unless explicitly shared through a future entitlement policy.

Public documentation may describe their logical capability/model family where safe, but MUST NOT imply outside users are entitled to consume their quota.

The runtime defaults to `owner-only`. Switching a provider runtime to public requires explicit public access opt-in; owner-funded billing independently denies public execution.

## BYOK providers

A normal user-connected provider is expected to be `byok` and private/self-scoped by default. Provider credentials remain at the provider runtime or user's secure local/cloud secret environment; the relay does not receive them.

The current reference flow is:

```text
user requester identity
        ↑ explicitly included in provider-signed allowlist
private BYOK provider
        ↓ signed OFFER
TRUYN relay
```

A second registered requester absent from the allowlist cannot discover or dispatch to the provider. Provider-host authorization independently prevents adapter/upstream execution for denied requesters.

## Shared / sponsored future ownership

Cross-owner execution requires explicit grant/entitlement.

For sponsored execution, the current reference billing boundary requires a signed actor-bound entitlement and durable atomic usage reservation. A public provider flag alone is not sufficient authorization to spend owner-funded quota.

## Authorization invariant

For an owner-private provider:

```text
foreign requester
+ public relay/network
+ known provider capability/identity
+ custom/malicious client
= no unauthorized provider execution
```

Denial happens before dispatch and is independently checked again before adapter execution.

## Relationship to capability discovery

Capability describes **what** a provider can do. Ownership policy determines **who may see/use** it.

```text
capability match
      ↓
authorization filter
      ↓
eligible provider set
      ↓
billing/entitlement filter
      ↓
ranking / routing
```

A capability match never overrides ownership policy.

## Public/private documentation boundary

This document intentionally publishes the security model. It does not publish production tenant IDs, privileged caller lists, protected provider IDs, cloud identities, private endpoints, quotas, cost ceilings or secret paths.

See also:

- `AUTHORIZATION_MODEL.md`
- `RELAY_SECURITY.md`
- `BILLING_BOUNDARY.md`
- `BYOK_ARCHITECTURE.md`
- `PUBLIC_PRIVATE_BOUNDARY.md`
- `../security/`
