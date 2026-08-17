# TRUYN Relay Security Architecture

**Status:** relay/provider authorization core, optional origin guard, generic Cloudflare-compatible edge proxy and optional protected-provider M2M backchannel guard are implemented reference controls; deployment-specific edge/origin/perimeter activation remains operational work.

## Public relay, private intelligence

A TRUYN relay may be publicly reachable while providers behind it remain private.

> **Public relay access is permission to speak TRUYN, not permission to spend another party's AI quota.**

The relay is a routing/coordination surface. It is not a shared credential broker and must not convert public reachability into provider authorization.

## Security boundary

The implemented dispatch boundary is:

```text
public/authenticated requester
      ↓
relay authentication / session validation
      ↓
provider visibility + authorization-aware matching
      ↓
provider-host access decision
      ↓
provider-host billing decision
      ↓
provider execution
```

No provider invocation occurs before provider-host access and billing decisions succeed. Private offers are filtered before dispatch, and provider-host authorization remains an independent second check before adapter execution.

Additional account-level tenancy, production commercial entitlement issuance and durable distributed accounting remain later layers and must preserve this fail-closed order.

## Discovery boundary

Discovery is authorization-aware. A requester receives only:

- its own private/BYOK providers;
- private providers whose provider-signed requester policy authorizes it;
- providers intentionally published for network-wide use when public dispatch is explicitly enabled.

Owner-private providers do not appear as usable foreign discovery matches. Hiding them is defense in depth; authorization remains mandatory even if a provider ID becomes known.

## Provider default posture

Both the low-level provider access policy and runtime provider process default to `owner-only`. Missing/empty requester authorization denies access. Switching a runtime provider to public mode requires explicit operator opt-in and does not bypass billing policy; owner-funded billing still refuses public execution.

## Local-development/public separation

The user-facing CLI can start only a loopback local-development relay. The low-level/runtime relay additionally hard-fails if local-development mode is combined with production/public markers.

This prevents a permissive development configuration from being accidentally exposed as a public production relay.

## Bounded request handling

HTTP/WebSocket payload sizes are bounded.

When an HTTP body exceeds the allowed limit, the server returns 413 and closes that connection. This prevents unread oversized body bytes from remaining on a reusable keep-alive socket and being misinterpreted as another request.

## Provider backchannel

Provider runtimes connect using signed TRUYN identity, a session bound to that node identity and the same authorization-aware fast/legacy paths used by the relay core. Provider execution is additionally protected by provider-host access and billing checks.

The reference runtime also supports an optional **protected-provider M2M proof** for specifically enumerated owner-provider identities. It is an additional transport-layer boundary, not a replacement for TRUYN signatures, provider policy or billing authorization.

When enabled:

1. protected identities must present the exact M2M proof during registration before any relay session is issued;
2. possession of a protected relay session without the M2M proof remains insufficient;
3. protected HTTP/WebSocket traffic continues to require proof;
4. ordinary non-protected/BYOK nodes preserve normal transport behavior;
5. proof is a transport header only and is stripped before the inner relay;
6. incomplete protected-node/proof configuration fails closed.

Regression tests cover missing/wrong proof, stolen protected sessions, WebSocket access, ordinary-node compatibility and proof stripping.

## Public edge vs control plane

The architecture distinguishes:

- **public protocol/data plane** — network participation, authenticated request transport and intentionally public capabilities;
- **owner control plane** — deployment, privileged provider/edge configuration, billing/quota operations and administration;
- **provider backchannel** — authenticated task delivery to protected provider runtimes.

The owner control plane SHOULD NOT share the public protocol trust assumptions.

## Reference origin guard

The reference runtime contains an optional origin-guard layer for deployments exposed through a trusted edge.

When enabled:

1. the actual inner TRUYN relay binds only to loopback on an internal listener;
2. the outer origin guard owns the origin-side listener;
3. HTTP data-plane requests and WebSocket upgrades require deployment-supplied edge proof;
4. unauthorized data-plane requests are rejected before the inner relay;
5. unauthenticated `/health` returns only minimal protocol-health output;
6. edge proof is stripped before forwarding inward;
7. partial origin-guard configuration fails closed.

### Origin-proof expiry and rotation

The default `x-truyn-origin-token` is expiry-bound. Runtime configuration supports an **active + previous** token window so an operator can rotate proof without requiring an unsafe permanent static token or an instantaneous cutover.

Expired, missing or invalid proof is denied before inner-relay access.

Secret proof values are deliberately kept non-enumerable in routine runtime configuration objects so ordinary object logging/JSON serialization does not print them.

Comparison remains constant-time for equal-length proof values.

When both origin and provider-backchannel guards are enabled, the logical chain is:

```text
trusted edge
   ↓
origin guard
   ↓
protected-provider M2M guard
   ↓
inner TRUYN relay
```

Each guard removes only its own proof before forwarding inward.

This is an **implementation capability**, not a claim that a particular production origin is already protected. Edge configuration, proof issuance/rotation, firewall/tunnel policy and direct-origin denial remain deployment-specific operational controls.

## Reference Cloudflare-compatible edge proxy

The public reference code contains a generic Cloudflare Worker-compatible proxy that pairs with the origin guard without making origin proof a TRUYN client credential.

Its fail-closed behavior is:

- origin URL and origin-guard token must be supplied through protected bindings;
- only an HTTPS origin without embedded credentials/path/query configuration is accepted;
- any proof supplied by the public requester is discarded and replaced with the Worker secret binding;
- request path/query/method/body/requester authorization/WebSocket upgrade headers are preserved as appropriate;
- redirects are handled manually so proof is not automatically forwarded to another host;
- same public/origin hostname, including alternate ports, is refused to avoid recursive proxying;
- proxy failures are sanitized and do not expose binding values/upstream exception details;
- missing/invalid/expired origin-token binding fails before upstream fetch.

No concrete Worker name, route, private origin hostname or secret value belongs in public source.

## Legacy-route rule

Every route capable of causing execution must pass through equivalent provider authorization. This includes legacy HTTP endpoints, fast paths, WebSocket paths, SDKs, MCP gateways and future compatibility bridges.

A new secure endpoint does not fix an older endpoint that can dispatch around policy.

## Abuse controls

Authorization is the primary billing boundary. Rate limits, replay protection, request size limits, concurrency limits, quotas, anomaly detection and edge/WAF rules provide additional protection.

Failure of an abuse-control subsystem must not silently change an unauthorized request into an authorized provider call.

## Billing interaction

Network access never creates sponsored entitlement. Sponsored execution is independently fail closed unless actor-bound signed entitlement verification succeeds and a durable atomic usage-store reservation succeeds. See `BILLING_BOUNDARY.md`.

## Kill switches

The architecture reserves operational kill switches for owner-funded external access and owner-provider network visibility. Their safe default is disabled/false. Exact values, thresholds and live policy state are private operational information.

## Origin protection

Where a public domain is fronted by an edge provider, the origin should be protected against direct bypass. The reference origin guard + edge proxy support edge-authenticated origin access without turning edge proof into a user credential.

Exact origin addresses, protected provider node IDs, proof values, firewall rules and bypass configuration remain private operations.

## Operational non-claims

The repository does not by itself prove that every deployment has:

- direct-origin firewall/tunnel denial;
- correctly issued/rotated live edge proof;
- correctly issued/rotated protected-provider M2M proof;
- production IAM/tenant separation;
- deployed durable sponsored accounting;
- production mainnet SLOs.

These require deployment evidence.

## Acceptance invariants

```text
anonymous/foreign requester
+ public relay
+ known private provider ID
+ arbitrary custom client
= zero unauthorized provider execution
```

```text
protected provider identity or stolen protected session
+ missing/wrong M2M proof
= zero protected relay access
```

```text
direct origin request
+ missing/expired/wrong trusted edge proof
= zero inner-relay data-plane access
```

See `docs/security/` for the detailed security documentation layer and `docs/operations/` for operational responsibilities.
