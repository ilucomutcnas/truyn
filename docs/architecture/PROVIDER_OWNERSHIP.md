# TRUYN Provider Ownership Architecture

**Status:** first provider-identity/authorization boundary implemented; richer account/tenant/billing semantics remain target architecture.

## Principle

> **Open protocol does not mean open billing account.**

A TRUYN provider is not merely a capability endpoint. It has an accountable owner, a visibility policy and eventually a tenant/billing boundary. Provider ownership is an authorization primitive, not descriptive metadata.

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

## Implemented MVP ownership boundary

The current reference relay implements a deliberately smaller, cryptographically authoritative subset:

```text
signed OFFER.from
      ↓
providerNodeId
      ↓
ownerNodeId = providerNodeId
```

The relay does **not** trust requester/provider-supplied `ownerId` or `tenantId` metadata to establish ownership. The cryptographic sender identity of the signed, session-bound `OFFER` is authoritative for the current MVP provider owner.

Each stored offer also receives a relay-side provider policy:

```text
accessMode: owner-only | public
visibility: private | network
allowedRequesterIds: [...]   # only for owner-only
```

Unknown or missing access mode fails closed to `owner-only` / `private`.

For an `owner-only` provider, `allowedRequesterIds` is taken from the provider-signed `OFFER` metadata. This enables a private/BYOK provider to authorize its own requester identity without adding that user to a global relay trusted-requester list.

This node-level owner binding is not yet the final account-level tenant model. A future control plane may bind multiple provider nodes to one authenticated account/tenant, but it must not weaken the rule that requester-controlled fields cannot create ownership or entitlement.

## Ownership rules

1. `ownerId` and `tenantId` MUST be derived from authenticated server-side identity or trusted provisioning state.
2. A requester-supplied `ownerId` or `tenantId` MUST NOT grant authorization.
3. Providers are private by default.
4. A missing, unreadable or ambiguous provider policy MUST fail closed.
5. A requester MUST NOT be routed to a provider merely because the provider advertises a matching capability.
6. Explicit sharing is an opt-in policy decision by the provider owner.
7. Owner-funded providers MUST NOT become public network resources solely because they are connected to a public relay.

The implemented reference relay already enforces rules 2–7 at the node/provider-offer level.

## Visibility classes

The target architecture reserves these semantic classes:

- `private` — usable only by the owning tenant or explicitly authorized callers;
- `self` — BYOK provider usable by the identity/account that configured it;
- `shared` — visible/usable only by an explicit allow policy;
- `network` — intentionally advertised for wider network use under explicit commercial or policy terms.

`private` is the default.

The current MVP maps:

- `owner-only` → `private`;
- `public` → `network`.

Additional `self` / `shared` account-level semantics remain future work.

## Billing modes

The architecture distinguishes at least:

- `byok` — the requester/provider owner supplies and pays for its own intelligence provider;
- `owner-funded` — the provider owner pays and access is private unless explicitly delegated;
- `prepaid` — future metered entitlement funded in advance;
- `subscription` — future entitlement governed by a subscription policy;
- `sponsored` — future provider-owner-funded allowance subject to explicit quota.

The existence of `sponsored` in the architecture does not enable it. Sponsored/free owner-funded access remains disabled until an explicit entitlement/quota layer is implemented and deliberately activated.

## Owner-private reference providers

TRUYN-operated reference providers used for internal proofs, benchmarks or development are owner-private. Public documentation may describe their logical capability class, but MUST NOT imply that outside users are entitled to consume their provider quota.

The runtime defaults to `owner-only`. Switching an individual provider runtime to public requires both an explicit public access mode and a second public-provider opt-in. Separately, the relay keeps wider authenticated-network dispatch disabled unless it is explicitly enabled. These independent controls are intentional defense in depth.

## BYOK providers

A normal user-connected provider is expected to be `byok` and private/self-scoped by default. Provider credentials remain at the provider runtime or user's secure local environment; the relay does not receive them.

The current reference implementation proves this private-provider flow:

```text
user requester identity
        ↑ explicitly included in provider-signed allowlist
private BYOK provider
        ↓ signed OFFER
TRUYN relay
```

A second registered requester that is absent from that allowlist cannot discover or dispatch to the provider. The provider receives zero queued events, and the provider host therefore performs zero adapter/upstream executions for that denied requester.

## Authorization invariant

For an owner-private provider, the safety invariant is:

```text
foreign requester
+ public relay
+ known provider capability/identity
+ custom/malicious client
= no provider invocation
```

The denial occurs before dispatch in the relay and is independently checked again before adapter execution in the provider host.

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

The current relay applies this same filtered provider set to legacy NEED, compact NEED and chain routing. Unauthorized private offers are also omitted from discovery.

A capability match never overrides ownership policy.

## Public/private documentation boundary

This document intentionally publishes the security model. It does not publish production tenant identifiers, privileged caller lists, provider node IDs, cloud identities, private endpoints, quotas, cost ceilings or secret paths.

See also:

- `AUTHORIZATION_MODEL.md`
- `RELAY_SECURITY.md`
- `BILLING_BOUNDARY.md`
- `BYOK_ARCHITECTURE.md`
- `PUBLIC_PRIVATE_BOUNDARY.md`