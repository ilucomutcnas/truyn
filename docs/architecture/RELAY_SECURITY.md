# TRUYN Relay Security Architecture

**Status:** core relay/provider authorization, origin guard, Cloudflare-compatible edge proxy and protected-provider M2M reference guards are implemented; deployment-specific perimeter activation remains operational work.

## Public relay, private intelligence

> **Public relay access is permission to speak TRUYN, not permission to spend another party's AI quota.**

A relay is routing/coordination infrastructure, not a credential broker.

## Implemented dispatch boundary

```text
public/authenticated requester
        ↓
relay authentication/session validation
        ↓
authorization-aware provider discovery/matching
        ↓
provider-host access decision
        ↓
provider-host billing decision
        ↓
adapter execution
```

Unauthorized private providers are filtered before dispatch and checked again at the provider host.

## Provider defaults

Both the low-level provider access policy and runtime provider role default to `owner-only`. Missing/empty requester authorization denies access. `public` is always an explicit opt-in, and owner-funded billing still refuses public execution.

## Development/public separation

The low-level/runtime relay hard-fails if permissive local-development mode is combined with production/public markers. The user-facing CLI local relay is loopback-only.

This prevents a development convenience mode from being accidentally exposed as a production public relay.

## Request-body boundary

HTTP/WebSocket payloads are bounded. If an HTTP request body exceeds the configured limit, the relay returns 413 and closes that connection so unread bytes cannot poison a reusable keep-alive socket. Subsequent traffic must arrive on a fresh connection.

## Protected-provider M2M backchannel

The reference runtime can require a transport-layer M2M proof for explicitly protected provider node identities.

The proof:

- is required before a protected registration can obtain a relay session;
- remains required on protected HTTP/WebSocket traffic;
- is not replaced by possession of a stolen relay session;
- is transport-only and stripped before the inner relay;
- does not replace signed TRUYN identity, provider policy or billing authorization;
- fails closed when configuration is incomplete.

Ordinary non-protected/BYOK nodes retain their normal transport behavior.

## Origin guard

When enabled, the inner relay binds only to loopback and an outer origin guard owns the exposed origin-side listener.

HTTP data-plane requests and WebSocket upgrades require trusted edge proof. Unauthorized health responses remain minimal; edge proof is stripped before forwarding inward.

The default `x-truyn-origin-token` is expiry-bound. Runtime configuration supports an **active + previous** token window so rotation can occur without a forced single-instant cutover. Secret token values are deliberately kept non-enumerable in routine runtime config objects so ordinary logging/JSON serialization does not print them.

Expired/missing/invalid proof is denied before inner-relay access.

## Cloudflare-compatible edge proxy

The generic reference edge proxy:

- requires an HTTPS origin and secret binding;
- overwrites any client-supplied origin proof;
- preserves normal requester/session and WebSocket headers;
- handles redirects manually to avoid secret forwarding;
- refuses same-host recursive origin configuration, including alternate ports;
- sanitizes upstream failures.

Concrete production Worker names, origin addresses and secret values do not belong in public source.

## Combined reference chain

```text
public client
    ↓
trusted edge
    ↓  expiry-bound origin proof
origin guard
    ↓  proof stripped
protected-provider M2M guard (where applicable)
    ↓  M2M proof stripped
inner TRUYN relay
    ↓
provider policy + billing
```

Each layer authenticates only its own boundary and removes its own proof before forwarding inward.

## Sponsored billing interaction

Network reachability never creates sponsored entitlement. Sponsored execution is independently fail-closed unless the provider billing policy has a valid actor-bound signed entitlement verifier and durable atomic usage store reservation. See `BILLING_BOUNDARY.md`.

## Operational non-claims

Reference code does not prove that every deployment has:

- direct-origin firewall/tunnel denial;
- correctly issued/rotated live edge proof;
- correctly issued/rotated protected-provider M2M proof;
- production IAM/tenant separation;
- deployed durable sponsored accounting;
- production mainnet SLOs.

Those are deployment/operations gates and must be verified separately.

## Acceptance invariants

```text
foreign requester
+ public relay
+ known private provider ID
+ custom client
= zero unauthorized provider execution
```

```text
protected provider identity/session
+ missing or wrong M2M proof
= zero protected relay access
```

```text
direct origin request
+ missing/expired/wrong trusted edge proof
= zero inner-relay data-plane access
```

See `docs/security/` for the separate security documentation layer and operational responsibilities.
