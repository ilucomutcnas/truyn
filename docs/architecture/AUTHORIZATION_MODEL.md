# TRUYN Authorization Model

**Status:** implemented reference authorization baseline; richer account/organization tenancy and commercial grant resolution remain future layers.

## Implemented baseline

The current reference implementation already enforces:

```text
verified/signed requester identity
        ↓
relay provider ownership + visibility policy
        ↓
authorization-aware discovery / matching
        ↓
provider-host access policy
        ↓
provider billing policy
        ↓
adapter.execute()
```

Key facts:

- provider ownership is bound to authenticated/signed provider identity, not requester-controlled owner/tenant metadata;
- missing/unknown provider access policy fails closed to private/`owner-only` behavior;
- the low-level provider policy and runtime provider both default to `owner-only`;
- an empty requester allowlist denies execution;
- private providers can carry provider-signed requester allowlists;
- unauthorized private offers are excluded from discovery/dispatch before provider work is queued;
- provider-host authorization is a second independent gate immediately before adapter execution;
- regression tests assert zero adapter executions for denied requesters;
- public provider mode is explicit opt-in and does not bypass billing rules.

## What remains incomplete

The current node/provider identity model is not yet a complete commercial identity/control plane. Still open:

- rich account and organization identities that can own multiple node/provider identities;
- authoritative tenant membership lifecycle;
- durable policy/grant administration;
- commercial prepaid/subscription entitlement resolver;
- production sponsored-entitlement issuance and durable usage-store deployment;
- marketplace contract/settlement administration.

These future layers must preserve the existing fail-closed execution invariant.

## Core rule

Authorization is **server-side, identity-bound and fail-closed**. UI/CLI controls, hidden IDs, DNS or network obscurity are never sufficient authorization.

## Canonical decision path

```text
authenticate requester
        ↓
resolve authoritative requester identity / tenant when available
        ↓
resolve candidate provider ownership/policy
        ↓
authorize visibility + explicit grants
        ↓
resolve billing responsibility
        ↓
resolve mandatory entitlement/quota
        ↓
apply hard request constraints
        ↓
rank eligible providers
        ↓
dispatch
```

If a mandatory stage cannot produce a trustworthy answer, chargeable/private dispatch does not occur.

## Default deny cases

At minimum deny when:

- requester identity is missing where identity is required;
- provider policy is missing/unknown;
- explicit sharing is required but no trusted grant exists;
- owner-funded/BYOK provider is configured public;
- prepaid/subscription resolver is absent;
- sponsored access lacks a valid signed actor entitlement;
- sponsored usage state is unavailable/non-durable when sponsored mode requires it;
- an execution-capable compatibility path cannot reach equivalent authorization logic.

## BYOK

The normal private path is:

```text
requester identity
        ↑ provider-signed allowedRequesterIds
private BYOK provider
        ↓ signed OFFER
TRUYN routing
```

The relay does not receive the upstream API key. Another requester absent from the allowlist cannot discover/use that private provider.

## Owner-funded providers

Owner-funded capacity remains private by default. A public relay or known provider ID does not create entitlement. Wider sponsored/shared access requires a separate explicit contract/entitlement and billing decision.

## Alternate transports

HTTP, WebSocket, MCP, SDK, fast paths and legacy bridges may authenticate differently at the edge but MUST preserve equivalent provider authorization before any upstream execution.

## Audit attributes

A durable future audit/accounting record should be able to bind non-secret identifiers such as requester identity, provider identity/owner, tenant when available, billing mode/responsibility, authorization policy reference, quota/entitlement decision and request ID.
