# TRUYN Authorization Model

**Status:** approved target architecture; implementation is intentionally out of scope for this documentation-only change.

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

## Authoritative identity

The authorization layer may use a cryptographic TRUYN identity, authenticated relay session, account/tenant binding or another trusted provisioning mechanism. The important invariant is that requester authorization attributes are not accepted merely because the requester placed them in a payload.

Requester-controlled fields are claims. Authorization state is derived from authenticated context.

## Default deny

The following cases are denied by default:

- provider policy missing;
- requester tenant unresolved;
- provider owner unresolved;
- billing owner unresolved;
- visibility unknown;
- explicit sharing required but no grant exists;
- quota state unavailable when quota is mandatory;
- legacy route cannot reach the central authorization layer.

## Explicit policy exception

Cross-owner execution is allowed only through an explicit policy/entitlement. Such a policy may represent a shared provider, paid capability, organization grant, sponsored allowance or future marketplace contract.

There is no implicit rule that `authenticated user` means `may use all registered providers`.

## Requester-owned provider

For normal BYOK operation:

```text
requester owner == provider owner
billingMode == byok
```

is the simplest authorization path. It allows TRUYN to route intelligence while the user remains responsible for the upstream provider account.

## Owner-funded provider

For an owner-funded provider:

```text
provider owner != foreign requester owner
visibility == private
```

must result in denial unless a trusted explicit grant exists. The denial must happen before any upstream model request, token reservation or chargeable job is created.

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
