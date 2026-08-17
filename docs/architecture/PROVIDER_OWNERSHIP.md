# TRUYN Provider Ownership Architecture

**Status:** implemented node-level provider identity/authorization boundary; richer account/organization tenancy remains future work.

## Principle

> **Open protocol does not mean open billing account.**

A provider has an accountable identity/owner, visibility and billing policy. Capability alone never grants access.

## Implemented authority

For the current reference relay, the signed/session-bound provider identity is authoritative:

```text
signed OFFER.from
        ↓
provider node identity
        ↓
reference owner identity = provider node identity
```

Requester/provider metadata cannot forge another owner by supplying `ownerId` or `tenantId` fields.

## Implemented provider policy

Stored provider offers resolve to access semantics equivalent to:

```text
accessMode: owner-only | public
visibility: private | network
allowedRequesterIds: [...]  # provider-signed for owner-only
```

Unknown/missing access mode fails closed to private/`owner-only` behavior.

Both the low-level provider policy and provider runtime also default to `owner-only`; public execution is explicit opt-in.

## BYOK

A private BYOK provider can sign an allowlist containing its intended requester identity. Unauthorized requesters cannot discover/dispatch to it and provider-host authorization remains a second execution gate.

Upstream provider credentials remain local to the provider runtime/secret boundary.

## Owner-funded providers

Owner-funded reference capacity is private by default. Network/public relay reachability does not expose its quota. Owner-funded billing denies a public provider mismatch before adapter execution.

## Shared / sponsored / commercial future layers

The architecture reserves semantic classes such as private/self/shared/network and billing modes such as sponsored/prepaid/subscription, but these do not imply entitlement.

Sponsored execution now requires actor-bound signed entitlement verification plus durable atomic usage reservation. Prepaid/subscription remain fail-closed without a resolver. Rich organization/account ownership and commercial grant administration are still future control-plane work.

## Authorization invariant

```text
foreign requester
+ public relay/network
+ known provider identity/capability
+ custom client
= no unauthorized provider execution
```

Authorization is applied before dispatch and independently at the provider host.

## Public documentation boundary

Public docs may describe this security model and safe generic metadata. Live tenant IDs, privileged requester lists, private origins, cloud identities, quotas/cost ceilings and secrets remain operational/private.
