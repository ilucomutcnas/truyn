# TRUYN Provider Ownership Architecture

**Status:** node-level provider isolation implemented in the reference relay/runtime; authoritative tenant/billing policy core implemented on this branch; full tenant-aware relay wiring remains incremental work.

## Principle

> **Open protocol does not mean open billing account.**

A TRUYN provider is not merely a capability endpoint. It has an accountable owner, a tenant boundary, a visibility policy and a billing mode. Provider ownership is an authorization primitive, not descriptive metadata.

## Layer 1 — implemented node/provider boundary

The current reference relay binds provider ownership to the cryptographic sender of a signed, session-bound `OFFER`:

```text
signed OFFER.from
      ↓
providerNodeId
      ↓
ownerNodeId = providerNodeId
```

The relay does not accept requester/provider-supplied `ownerId` or `tenantId` as ownership authority.

For the current MVP execution path, a provider may publish its signed access mode/requester allowlist. The relay uses that provider-signed policy for discovery/dispatch, while the provider host independently enforces its own access policy before `adapter.execute()`.

This already proves an important BYOK invariant: a requester absent from a private provider's signed allowlist cannot discover or dispatch to that provider, creates zero provider events and therefore creates zero upstream adapter executions.

Provider runtimes default to `owner-only`. Making an individual runtime public requires both public access mode and the separate public-provider opt-in. Wider authenticated-network dispatch in the relay is also separately disabled unless explicitly enabled.

## Layer 2 — authoritative tenant/billing policy core

This branch adds `core/security/provider-ownership.js` and `network/relay/provider-routing.js`.

The authoritative registry introduces the account/tenant semantics required before TRUYN can safely evolve from node-level private providers into a multi-tenant provider network:

```text
providerId
ownerId
tenantId
visibility
billingMode
trusted grants
```

The registry treats wire metadata as non-authoritative. Trusted node-to-tenant bindings and non-default provider policy come from server provisioning/configuration.

Without trusted provisioning, a provider is derived as:

```text
ownerId     = signed provider node
 tenantId    = authoritative binding or provider node
visibility  = self
billingMode = byok
```

The policy core enforces:

- same authoritative tenant may use its own provider;
- cross-tenant `byok` is always denied;
- cross-tenant `owner-funded` is always denied;
- `sponsored` exists as a future class but is disabled by default;
- cross-tenant execution requires trusted policy, explicit cross-tenant enablement and an eligible entitlement class such as `prepaid` or `subscription`;
- caller/tenant grants are accepted only from trusted registry configuration;
- forged payload `ownerId`, `tenantId`, `visibility`, billing or cross-tenant fields cannot promote a provider;
- capability matching is followed by authorization filtering before a candidate is eligible.

The registry snapshots trusted policy on construction so later mutation of the input configuration does not silently change live authorization decisions.

**Boundary:** `network/relay/server.js` has not yet been migrated from the existing node/provider policy to this tenant-aware registry. The new filter is therefore a tested policy primitive, not yet a claim of full multi-tenant relay enforcement.

## Ownership rules

1. `ownerId` and `tenantId` MUST come from authenticated identity or trusted provisioning state.
2. Requester/provider payload ownership fields MUST NOT grant account/tenant authorization.
3. Providers are private/self-scoped by default.
4. Missing or ambiguous authorization state MUST fail closed.
5. Capability match MUST NOT override provider authorization.
6. Cross-tenant sharing requires explicit trusted policy/entitlement.
7. Owner-funded providers MUST NOT become public network resources merely because a relay is public.

## Visibility classes

- `private` — owner/tenant-private or explicitly authorized callers only;
- `self` — BYOK provider usable by its authoritative identity/tenant;
- `shared` — explicit trusted grant only;
- `network` — intentionally network-visible under trusted policy and commercial rules.

The current relay's `owner-only`/`public` mode is the smaller MVP boundary. The tenant registry reserves the richer visibility semantics without weakening that boundary.

## Billing modes

- `byok` — provider/requester tenant supplies and pays for its own intelligence;
- `owner-funded` — provider owner pays; cross-tenant use is hard-denied in the implemented tenant core;
- `prepaid` — future metered entitlement funded in advance;
- `subscription` — future subscription entitlement;
- `sponsored` — future owner-funded allowance with explicit quota.

The existence of `sponsored` does not enable it. The registry defaults sponsored cross-tenant access to disabled.

## Authorization invariant

For owner-private providers:

```text
foreign requester
+ public relay
+ known provider identity/capability
+ custom client
= no owner-funded provider invocation
```

The current relay/provider-host boundary already provides deny-before-upstream defense for its node-level policy. The tenant registry strengthens the future control-plane decision so billing/tenant semantics cannot be invented by wire payloads.

## Discovery and routing

```text
capability match
      ↓
provider policy
      ↓
authorization filter
      ↓
eligible provider set
      ↓
ranking / dispatch
```

`network/relay/provider-routing.js` implements the reusable tenant-aware candidate filter. A capability match never overrides ownership policy.

## Public/private boundary

This document publishes security semantics, not production tenants, provider identities, private endpoints, allowlists, quotas, cloud identities, cost ceilings or secret paths.

See also:

- `AUTHORIZATION_MODEL.md`
- `RELAY_SECURITY.md`
- `BILLING_BOUNDARY.md`
- `BYOK_ARCHITECTURE.md`
- `PUBLIC_PRIVATE_BOUNDARY.md`
