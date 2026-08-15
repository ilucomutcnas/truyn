# TRUYN Public Edge Domains

Status: implemented infrastructure reservation for the current Azure/Cloudflare PoC edge.

This document records the public HTTPS hostnames and Azure Front Door routes that have already been provisioned so future service activation does not unnecessarily repeat DNS ownership validation, managed-certificate setup, or initial route creation.

## Canonical live relay

- `relay.truyn.org` → `relay-route` — canonical public TRUYN relay HTTP endpoint for the current PoC.

`relay.truyn.org` resolves through Cloudflare DNS to the Front Door endpoint. The route remains attached to the current relay origin group.

## Prewarmed HTTPS surfaces

The following hostnames are reserved, Azure-approved managed-certificate custom domains and have dedicated Front Door route objects:

- `api.truyn.org` → `api-route` — future public HTTP API surface.
- `discovery.truyn.org` → `discovery-route` — future HTTP discovery/bootstrap compatibility surface; this does not redefine the native TRUYN QUIC/UDP discovery transport.
- `gateway.truyn.org` → `gateway-route` — future HTTP/REST/webhook compatibility gateway.
- `mcp.truyn.org` → `mcp-route` — future MCP interoperability surface.
- `trust.truyn.org` → `trust-route` — future Trustability HTTP service surface.
- `status.truyn.org` → `status-route` — future public status/health surface.

For every hostname, Cloudflare contains the Azure Front Door ownership-validation TXT record and a DNS-only CNAME to the shared Front Door endpoint. Azure Front Door reports each custom domain as approved with managed TLS configured.

Each future hostname owns exactly one dedicated route. For pre-provisioning only, those routes currently target the existing `relay-origin-group` as a placeholder. This is **not** a declaration that the future API, discovery, gateway, MCP, trust, or status services share relay ownership or implementation. When a dedicated service exists, preserve the approved hostname and route and replace the route's origin group/backend with the service-specific origin group.

The canonical `relay-route` owns only `relay.truyn.org`; future hostnames are not attached to it.

## Native network transport boundary

Do not pre-provision `bootstrap`, `testnet`, or `mainnet` hostnames as Azure Front Door HTTP routes merely for convenience. The TRUYN roadmap defines the native network underlay around QUIC/UDP/IP. HTTP compatibility surfaces and the native transport must remain separate architectural concerns.

## Infrastructure source of truth

- `.github/workflows/cloud-poc-domain-prewarm.yml` — idempotent reservation, Cloudflare DNS, Azure validation, and managed-TLS prewarming for future HTTPS hostnames.
- `.github/workflows/cloud-poc-public-edge-routes.yml` — idempotent provisioning and verification of one Front Door route per public hostname.
- `.github/workflows/cloud-poc-domain-diagnostic.yml` — DNS, Azure custom-domain, route-association, and HTTPS diagnostics for the canonical relay and all prewarmed names.
- `.github/workflows/cloud-poc-domain-associate.yml` — canonical `relay.truyn.org` route association helper.

Current PoC edge resources:

- Azure resource group: `truyn`
- Azure Front Door profile: `truyn-frontdoor`
- Azure Front Door endpoint: `truyn-edge-1334540181`
- Placeholder origin group for prewarmed routes: `relay-origin-group`
- DNS zone: `truyn.org` in Cloudflare

## Change rule

Do not delete and recreate an approved Front Door custom-domain resource or its dedicated route as part of a normal backend migration. Prefer changing the route's origin group/backend. Recreating a custom domain can reintroduce DNS validation and managed-certificate propagation delay that this prewarming stage is specifically intended to avoid.
