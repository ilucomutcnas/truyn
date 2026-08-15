# TRUYN Relay Security Architecture

**Status:** approved target architecture; not an implementation-complete security claim.

## Public relay, private intelligence

A TRUYN relay may be publicly reachable while the providers behind it remain private.

> **Public relay access is permission to speak TRUYN, not permission to spend another party's AI quota.**

The relay is a routing and coordination surface. It is not a shared credential broker and it must not convert public reachability into provider authorization.

## Security boundary

The target dispatch path is:

```text
public requester
      ↓
relay authentication / session validation
      ↓
central authorization decision
      ↓
visibility + ownership + billing + quota checks
      ↓
only eligible provider routes
      ↓
private/authenticated provider backchannel
      ↓
provider execution
```

No provider invocation may occur before authorization succeeds.

## Discovery boundary

Discovery is authorization-aware. A requester should receive only:

- its own private/BYOK providers;
- providers explicitly shared with it;
- providers intentionally published for network-wide use.

Owner-private providers should not appear in foreign discovery responses. Hiding them is defense in depth; authorization remains mandatory even if a provider ID becomes known.

## Provider backchannel

Provider runtimes should connect through an authenticated machine-to-machine path that is distinct from an unauthenticated public invocation endpoint.

The concrete transport may be WebSocket, QUIC, private HTTP, service-to-service identity, Cloudflare Access/service tokens, cloud-native identity or another mechanism. Perimeter controls are additive; they do not replace TRUYN provider authorization.

## Public edge vs control plane

The architecture distinguishes:

- **public protocol/data plane** — network participation, authenticated request transport and public capabilities intentionally exposed by policy;
- **owner control plane** — deployment, provider registration, privileged proofs, configuration, billing/quota operations and internal administration;
- **provider backchannel** — authenticated task delivery to provider runtimes.

The owner control plane SHOULD NOT share the same trust assumptions as the public protocol surface.

## Legacy-route rule

Every route capable of causing execution must pass through the same provider authorization decision. This includes legacy HTTP endpoints, fast paths, WebSocket paths, SDKs, MCP gateways and future compatibility bridges.

A new secure endpoint does not fix an older endpoint that can still dispatch around policy.

## Abuse controls

Authorization is the primary billing boundary. Rate limits, replay protection, request size limits, concurrency limits, per-tenant quotas, anomaly detection and edge/WAF rules provide additional protection.

Failure of an abuse-control subsystem must not silently change an unauthorized request into an authorized provider call.

## Kill switches

The architecture reserves explicit operational kill switches for owner-funded external access and owner-provider network visibility. Their safe default is disabled/false. Exact variable names, values, thresholds and production policy state are operational/private information.

## Origin protection

Where a public domain is fronted by an edge provider, the origin should be protected against direct bypass. Exact origin hostnames, edge application IDs, service tokens, firewall rules and bypass configuration are private operational data and are not documented here.

## Acceptance invariant

The relay security gate is complete only when negative testing proves:

```text
anonymous/foreign requester
+ public relay
+ known private provider ID
+ arbitrary custom client
= zero owner-funded upstream calls
```
