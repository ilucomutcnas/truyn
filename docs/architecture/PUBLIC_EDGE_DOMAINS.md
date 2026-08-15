# TRUYN Public Edge Domains

Status: public hostname architecture for the current PoC and future service separation.

This document records **intentionally public DNS/service names and their logical roles only**. It deliberately does not publish live cloud resource names, private origins, edge account identifiers, privileged route configuration, service tokens or internal topology.

## Canonical public relay

- `relay.truyn.org` — canonical public TRUYN relay hostname for the current PoC.

Public reachability of the relay does **not** imply public access to private or owner-funded AI providers. Provider execution remains subject to the provider ownership/authorization architecture.

## Reserved public HTTPS surfaces

The following names are reserved as public compatibility/control surfaces:

- `api.truyn.org` — future public HTTP API surface.
- `discovery.truyn.org` — future HTTP discovery/bootstrap compatibility surface; this does not redefine native TRUYN discovery transport.
- `gateway.truyn.org` — future HTTP/REST/webhook compatibility gateway.
- `mcp.truyn.org` — future MCP interoperability surface.
- `trust.truyn.org` — future Trustability HTTP service surface.
- `status.truyn.org` — future public status/health surface.

Reservation of a hostname does not mean the corresponding service is implemented, active or authorized to reach private providers.

## Service ownership boundary

Each public hostname should have an independently owned logical service/backend when that service is implemented. Temporary PoC route reuse is an infrastructure detail and MUST NOT become a permanent architecture rule.

The architecture separates:

```text
public protocol / compatibility surfaces
              ↓
authentication + authorization boundary
              ↓
private owner control plane
private provider backchannels
```

The public API/MCP/gateway surface must never be treated as an alternate path around provider authorization.

## Native network transport boundary

Future native `testnet`/`mainnet` transport and bootstrap infrastructure may use protocols different from HTTP. Public HTTPS compatibility names do not redefine the native TRUYN transport contract.

## Edge and origin security

Public edge infrastructure should provide TLS and may provide WAF/rate limiting/abuse controls. Private/control-plane services may additionally use machine-to-machine access policies.

Origins should be protected against direct bypass where the deployment architecture supports it. Exact origin hostnames, edge application IDs, service tokens, firewall rules, account/zone IDs and bypass configuration are private operational data.

Edge controls are defense in depth. The provider authorization decision remains mandatory at the TRUYN execution boundary even if edge controls are misconfigured.

## Public/private source-of-truth rule

This file is **not** the source of truth for live cloud resources. Live deployment identifiers, private origins, route/backend IDs and security-control configuration belong to protected operational configuration/systems.

Public infrastructure-as-code and workflows should use generic/stable abstractions or placeholders where practical and must not rely on secrecy of architecture for security.

The current repository may still contain PoC implementation details created before this boundary was adopted. Removing or restructuring such implementation details is a separate security-hardening task and is intentionally not performed by this documentation-only change.

See:

- `RELAY_SECURITY.md`
- `PROVIDER_OWNERSHIP.md`
- `PUBLIC_PRIVATE_BOUNDARY.md`
