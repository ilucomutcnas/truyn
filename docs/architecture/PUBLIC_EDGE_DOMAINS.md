# TRUYN Public Edge Domains

Status: implemented infrastructure reservation for the current Azure/Cloudflare PoC edge.

This document records the public HTTPS hostnames that have already completed DNS ownership validation in Azure Front Door so future service activation does not unnecessarily repeat the custom-domain approval cycle.

## Canonical live relay

- `relay.truyn.org` — canonical public TRUYN relay HTTP endpoint for the current PoC.

`relay.truyn.org` is attached to the Azure Front Door route `relay-route` in profile `truyn-frontdoor` and resolves through Cloudflare DNS to the Front Door endpoint.

## Prewarmed HTTPS hostnames

The following hostnames are reserved and pre-provisioned as Azure Front Door managed-certificate custom domains:

- `api.truyn.org` — future public HTTP API surface.
- `discovery.truyn.org` — future HTTP discovery/bootstrap compatibility surface; this does not redefine the native TRUYN QUIC/UDP discovery transport.
- `gateway.truyn.org` — future HTTP/REST/webhook compatibility gateway.
- `mcp.truyn.org` — future MCP interoperability surface.
- `trust.truyn.org` — future Trustability HTTP service surface.
- `status.truyn.org` — future public status/health surface.

For each hostname, Cloudflare contains the Azure Front Door ownership-validation TXT record and a DNS-only CNAME to the shared Front Door endpoint. Azure Front Door reports the custom domain as approved with managed TLS configured.

These hostnames are currently associated with `relay-route` only to complete/prewarm the edge lifecycle. That association is **not** a declaration that the future API, discovery, gateway, MCP, trust, or status services share relay ownership or implementation. When a dedicated service exists, move the already-approved hostname to its dedicated Front Door route/origin group while preserving the custom-domain resource and DNS records wherever possible.

## Native network transport boundary

Do not pre-provision `bootstrap`, `testnet`, or `mainnet` hostnames as Azure Front Door HTTP routes merely for convenience. The TRUYN roadmap defines the native network underlay around QUIC/UDP/IP. HTTP compatibility surfaces and the native transport must remain separate architectural concerns.

## Infrastructure source of truth

- `.github/workflows/cloud-poc-domain-prewarm.yml` — idempotent reservation, Cloudflare DNS, Azure validation, and route prewarming for future HTTPS hostnames.
- `.github/workflows/cloud-poc-domain-diagnostic.yml` — DNS, Azure custom-domain, route-association, and HTTPS diagnostics for the canonical relay and all prewarmed names.
- `.github/workflows/cloud-poc-domain-associate.yml` — canonical `relay.truyn.org` route association helper.

Current PoC edge resources:

- Azure resource group: `truyn`
- Azure Front Door profile: `truyn-frontdoor`
- Azure Front Door endpoint: `truyn-edge-1334540181`
- Current shared route: `relay-route`
- DNS zone: `truyn.org` in Cloudflare

## Change rule

Do not delete and recreate an approved Front Door custom-domain resource as part of a normal backend migration. Prefer changing route/origin association. Recreating a custom domain can reintroduce DNS validation and managed-certificate propagation delay that this prewarming stage is specifically intended to avoid.
