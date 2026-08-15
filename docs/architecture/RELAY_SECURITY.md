# TRUYN Relay Security Architecture

**Status:** relay/provider authorization core and an optional reference origin guard are implemented; deployment-specific edge/origin activation remains operational work.

## Public relay, private intelligence

A TRUYN relay may be publicly reachable while the providers behind it remain private.

> **Public relay access is permission to speak TRUYN, not permission to spend another party's AI quota.**

The relay is a routing and coordination surface. It is not a shared credential broker and it must not convert public reachability into provider authorization.

## Security boundary

The implemented dispatch boundary is:

```text
public requester
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

No provider invocation occurs before the provider-host access and billing decisions succeed. Private offers are filtered before dispatch, and provider-host authorization remains an independent second check before adapter execution.

Additional account-level tenancy, durable distributed quota/accounting and commercial entitlement resolution remain later layers and must preserve this fail-closed order.

## Discovery boundary

Discovery is authorization-aware. A requester receives only:

- its own private/BYOK providers;
- private providers whose provider-signed requester policy authorizes it;
- providers intentionally published for network-wide use when public dispatch is explicitly enabled.

Owner-private providers do not appear as usable foreign discovery matches. Hiding them is defense in depth; authorization remains mandatory even if a provider ID becomes known.

## Provider backchannel

Provider runtimes connect to the relay using signed TRUYN identity, a session bound to that node identity, and the same authorization-aware fast/legacy paths used by the relay core. Provider execution is additionally protected by provider-host access and billing checks.

A separate deployment perimeter is still useful for owner infrastructure. The concrete edge/backchannel mechanism may be service-to-service identity, Cloudflare Access/service tokens, cloud-native network controls or another mechanism. Perimeter controls are additive; they do not replace TRUYN provider authorization.

## Public edge vs control plane

The architecture distinguishes:

- **public protocol/data plane** — network participation, authenticated request transport and public capabilities intentionally exposed by policy;
- **owner control plane** — deployment, provider registration, privileged proofs, configuration, billing/quota operations and internal administration;
- **provider backchannel** — authenticated task delivery to provider runtimes.

The owner control plane SHOULD NOT share the same trust assumptions as the public protocol surface.

## Reference origin guard

The reference runtime now contains an optional origin-guard layer for deployments that expose the relay through a trusted edge.

When enabled:

1. the actual TRUYN relay binds only to a loopback address on an internal ephemeral port;
2. the outer origin guard owns the configured external host/port;
3. HTTP data-plane requests and WebSocket upgrades require a deployment-supplied edge-to-origin secret;
4. unauthorized data-plane requests are rejected before reaching the inner relay;
5. unauthenticated `/health` returns only a minimal protocol-health response and does not proxy inner relay diagnostics;
6. the edge-to-origin secret is stripped before a request is forwarded to the inner relay;
7. partial origin-guard configuration fails closed at runtime startup.

The comparison is constant-time for equal-length tokens. The regression suite covers HTTP denial, WebSocket denial, secret stripping, minimal health output and runtime loopback wiring.

This is an **implementation capability**, not a claim that a particular production origin is already protected. Edge configuration, token provisioning/rotation, firewall/tunnel policy and direct-origin denial remain deployment-specific operational controls and must be verified separately.

## Legacy-route rule

Every route capable of causing execution must pass through the same provider authorization decision. This includes legacy HTTP endpoints, fast paths, WebSocket paths, SDKs, MCP gateways and future compatibility bridges.

A new secure endpoint does not fix an older endpoint that can still dispatch around policy.

## Abuse controls

Authorization is the primary billing boundary. Rate limits, replay protection, request size limits, concurrency limits, per-tenant quotas, anomaly detection and edge/WAF rules provide additional protection.

Failure of an abuse-control subsystem must not silently change an unauthorized request into an authorized provider call.

## Kill switches

The architecture reserves explicit operational kill switches for owner-funded external access and owner-provider network visibility. Their safe default is disabled/false. Exact values, thresholds and production policy state are operational/private information.

## Origin protection

Where a public domain is fronted by an edge provider, the origin should be protected against direct bypass. The optional reference origin guard makes edge-authenticated origin access possible without turning the edge token into a TRUYN user credential.

Exact origin hostnames, edge application IDs, secret values, firewall rules and bypass configuration are private operational data and are not documented here.

## Acceptance invariant

The relay/provider security invariant remains:

```text
anonymous/foreign requester
+ public relay
+ known private provider ID
+ arbitrary custom client
= zero owner-funded upstream calls
```

For an origin-guarded deployment, a second deployment-specific invariant must also be proven:

```text
direct origin request without trusted edge proof
= zero inner-relay data-plane requests
```
