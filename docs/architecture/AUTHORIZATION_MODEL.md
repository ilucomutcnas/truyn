# TRUYN Authorization Model

**Status:** fail-closed provider-host and node-level relay authorization implemented; authoritative tenant/billing policy core implemented on this branch; full tenant-aware relay wiring, billing attribution and quota enforcement remain incremental work.

## Existing execution boundary

The provider runtime enforces authorization before inference:

```text
verified NEED
    ↓
requester identity (`from`)
    ↓
provider access policy
    ↓
ALLOW → provider execution
DENY  → PROVIDER_ACCESS_DENIED
          adapter execution count = 0
```

Provider runtimes launched through `runtime/service.js` default to `owner-only`. An empty requester allowlist denies execution. Public execution requires both public mode and the separate public-provider opt-in.

The reference relay also applies its current node/provider policy to discovery and dispatch, so an unauthorized requester cannot create a provider event merely by knowing a capability/provider identity.

## Authoritative tenant policy core

This branch adds a stronger server-authoritative layer for the future multi-tenant network:

```text
authenticated requester identity
        ↓
authoritative requester tenant
        ↓
signed provider identity
        ↓
trusted provider policy / derived self-BYOK policy
        ↓
capability + authorization filter
```

`core/security/provider-ownership.js` resolves provider ownership/tenant/billing policy. `network/relay/provider-routing.js` filters candidate offers through that policy.

Wire payload metadata cannot grant tenant or billing authorization. Without trusted provisioning, a provider is derived as self-scoped BYOK owned by its signed provider identity.

**Current boundary:** `network/relay/server.js` has not yet been migrated to use this tenant registry directly. Its existing node/provider-signed allowlist remains the active relay boundary; the new registry is the tested next-layer policy primitive.

## Core rule

TRUYN authorization is **server-side, identity-bound and fail-closed**.

Official CLI/UI restrictions are product guardrails, not the security boundary. A custom client must not gain provider access by changing request fields or bypassing the official client.

## Canonical decision path

Every execution path ultimately converges on:

```text
authenticate requester
        ↓
resolve authoritative requester tenant
        ↓
resolve authoritative provider owner/tenant/policy
        ↓
capability filter
        ↓
authorization / entitlement
        ↓
billing responsibility
        ↓
quota / cost policy
        ↓
rank eligible providers
        ↓
dispatch
```

If a mandatory stage cannot produce a trustworthy decision, dispatch does not occur.

## Authoritative identity and tenant

The implemented tenant registry follows these rules:

- provider identity comes from signed `OFFER.from`;
- trusted server-side `tenantBindings` may bind several node identities to one tenant;
- trusted `providerPolicies` define non-default visibility/billing/grants;
- without trusted provisioning, provider tenant defaults to its signed node identity;
- payload `ownerId`, `tenantId`, `visibility`, billing mode or cross-tenant flags are non-authoritative.

Trusted policy is snapshotted when the registry is created, preventing later mutation of the input configuration from silently changing authorization.

## Default deny rules

The policy core denies by default when:

- requester or provider policy cannot be resolved;
- a BYOK provider is requested cross-tenant;
- an owner-funded provider is requested cross-tenant;
- sponsored access is requested while sponsorship is disabled;
- cross-tenant execution lacks explicit trusted enablement;
- required caller/tenant entitlement is missing;
- a route cannot reach the central authorization decision.

## BYOK

BYOK remains private/self-scoped by default:

```text
requester tenant == provider tenant
billingMode == byok
```

Cross-tenant BYOK is hard-denied in the implemented tenant core. If requester and provider use separate node identities, an authoritative tenant binding is required before the policy treats them as the same user/account.

Credentials remain at the provider runtime; they do not pass through relay envelopes.

## Owner-funded providers

Cross-tenant `owner-funded` execution is hard-denied in the tenant core, including when malicious payloads or untrusted configuration-like fields attempt to claim network visibility.

For TRUYN-operated providers the invariant is:

```text
foreign requester
+ public relay
+ known provider identity/capability
+ custom client
= zero owner-funded upstream execution
```

The provider host independently preserves the final pre-inference deny boundary.

## Explicit future entitlements

Cross-tenant execution is possible only through trusted commercial policy. The implemented core currently models eligible explicit entitlement classes such as `prepaid` and `subscription`.

A cross-tenant candidate requires:

1. trusted provider policy;
2. explicit cross-tenant enablement;
3. an eligible billing mode;
4. an exact caller/tenant grant or intentionally trusted network-provider policy.

`sponsored` is represented for future use but disabled by default. Enabling sponsored execution later must also introduce explicit quota/cost controls.

## Discovery and routing

Capability does not imply authorization:

```text
capability match
      ↓
authoritative provider policy
      ↓
authorization filter
      ↓
eligible provider set
```

The reusable filter is covered by tests proving that forged provider metadata cannot create a routable foreign provider and that explicit trusted prepaid tenant grants can become routable.

## Legacy and alternate transports

HTTP, WebSocket, compact/fast paths, chains, MCP and SDK integrations must converge on the same policy decision. No legacy route may dispatch around ownership authorization.

## Audit attributes

Future transaction/audit records should identify, without exposing credentials:

```text
requesterId
requesterTenant
providerId
providerOwner
providerTenant
billingMode
authorizationDecision
authorizationPolicyRef
quotaDecision
requestId
```

## Non-goals

This document does not define a universal identity provider, payment processor or global account system. It defines authorization invariants that those systems must preserve.
