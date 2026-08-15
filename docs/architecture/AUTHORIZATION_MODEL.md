# TRUYN Authorization Model

**Status:** fail-closed runtime execution gate and authoritative provider-ownership policy core implemented; tenant-aware relay wiring, billing attribution and quota enforcement remain incremental work.

## Implemented minimum security gates

The current provider runtime implements an identity-bound pre-inference gate:

```text
verified NEED
    ↓
requester identity (`from`)
    ↓
provider access policy
    ↓
ALLOW → materialize context → provider execution
DENY  → RESULT / PROVIDER_ACCESS_DENIED
          provider execution count = 0
```

Provider runtimes launched through `runtime/service.js` default to `owner-only`. With no explicit requester allowlist they fail closed. Public provider execution requires two explicit runtime signals: public access mode plus the separate public-provider opt-in. The regression suite verifies that the production entrypoint wires this policy into `TruynAdapterHost` before `adapter.execute()`.

The provider-ownership core adds a second, server-authoritative decision layer:

```text
signed provider identity
        ↓
authoritative node → tenant binding
        ↓
trusted provider policy or derived self/BYOK policy
        ↓
capability match + authorization filter
```

`core/security/provider-ownership.js` and `network/relay/provider-routing.js` implement this policy core. Requester/provider payload metadata cannot promote a provider into another owner or tenant.

**Important boundary:** the current `network/relay/server.js` on this feature branch has not yet been switched to the new tenant-aware registry/filter. Until that integration lands, the production-style relay remains on the stricter coarse trusted-requester deny model inherited from the current security baseline. This document does not claim full tenant-aware relay enforcement yet.

## Core rule

TRUYN authorization is **server-side, identity-bound and fail-closed**.

The official client, CLI and UI may provide helpful guardrails, but they are not a security boundary. A custom client that bypasses official UX must still be unable to invoke a provider it is not authorized to use.

## Canonical decision path

Every execution-capable request path must converge on one authorization pipeline:

```text
authenticate requester
        ↓
resolve authoritative requester identity / tenant
        ↓
resolve candidate provider policy
        ↓
authorize visibility + ownership + explicit grants
        ↓
resolve billing responsibility
        ↓
check quota / entitlement
        ↓
rank eligible providers
        ↓
dispatch
```

If any mandatory stage cannot produce a trustworthy answer, dispatch MUST NOT occur.

## Authoritative identity and tenant

The authorization layer may use a cryptographic TRUYN identity, authenticated relay session, account/tenant binding or another trusted provisioning mechanism. The invariant is that authorization attributes are not accepted merely because a requester or provider placed them in a payload.

In the implemented ownership registry:

- `OFFER.from` supplies the cryptographic provider identity;
- a trusted server-side `tenantBindings` map may bind multiple identities to the same tenant;
- trusted `providerPolicies` may define non-default visibility/billing/entitlement behavior;
- without trusted provisioning, the provider is derived as `self` + `byok` and its tenant is its authoritative node identity;
- payload fields such as `ownerId`, `tenantId`, `visibility`, `billingMode` or cross-tenant flags have no authority.

## Default deny

The following cases are denied by default:

- provider policy unresolved;
- requester identity unresolved;
- cross-tenant BYOK use;
- cross-tenant owner-funded use;
- sponsored use while sponsored access is disabled;
- explicit sharing required but no trusted grant exists;
- cross-tenant use requested without explicit trusted cross-tenant enablement;
- quota state unavailable when quota becomes mandatory;
- an execution route cannot reach the central authorization layer.

For the provider runtime gate specifically, `owner-only` with a missing or empty requester allowlist denies execution.

## BYOK invariant

Normal BYOK is self/tenant-scoped:

```text
requester tenant == provider tenant
billingMode == byok
```

The implemented ownership core hard-denies cross-tenant `byok`, even if a malicious wire payload claims network visibility or another owner.

If a user's requester identity and provider identity are different, they must be joined by an authoritative server-side tenant binding before they are considered the same tenant.

## Owner-funded invariant

The implemented ownership core hard-denies cross-tenant `owner-funded` access. A provider cannot turn owner-funded quota into a network resource with a payload flag or a permissive client.

TRUYN-operated reference providers therefore remain owner-private unless their requester is authoritatively bound to the same owner tenant. This preserves the core acceptance condition:

```text
foreign requester
+ public relay
+ known provider ID
+ custom client
= zero owner-funded provider execution
```

## Future cross-tenant entitlement

Cross-tenant provider use is not globally forbidden; it is explicit and commercially attributable. The current policy core permits trusted cross-tenant grants only after:

1. trusted server-side provider policy exists;
2. `allowCrossTenant` is explicitly enabled in that policy;
3. the billing mode is eligible for cross-tenant use, currently `prepaid` or `subscription`;
4. the requester has an exact caller/tenant grant, or the trusted policy intentionally exposes a network provider.

`sponsored` exists as an architectural billing class but is disabled by default. Enabling it later must also introduce the corresponding quota/cost controls; merely choosing the string `sponsored` does not grant access.

## Discovery and routing

Capability and authorization are separate filters:

```text
capability match
      ↓
authoritative provider policy
      ↓
authorization filter
      ↓
eligible provider set
      ↓
ranking / dispatch
```

`network/relay/provider-routing.js` implements the reusable candidate filter. A capability match never overrides ownership policy.

The next relay-integration package must use this same filter for HTTP, compact/fast and WebSocket chain routing, preserving zero provider events for unauthorized candidates.

## Legacy and alternate transports

HTTP, WebSocket, MCP, SDK and future native transports MUST NOT implement independent authorization shortcuts. They may authenticate differently at the edge, but provider authorization converges on one policy decision layer.

## Audit attributes

An authorization decision should be traceable without exposing credentials. A transaction/audit record should be able to identify, where applicable:

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

Operational identifiers and policy internals may remain private even when the semantic fields are public architecture.

## Non-goals

This document does not define a universal identity provider, payment processor or global account system. It defines authorization invariants that any implementation must preserve.
