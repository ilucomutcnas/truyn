# TRUYN Origin Bypass Security Evaluation — 2026-08-16

## Status

**PARTIAL PASS / AZURE FINAL GATE BLOCKED BY CLOUDFLARE CONTROL-PLANE PERMISSION**

This report preserves the production evidence collected while testing the security invariant:

> A request sent directly to a cloud origin, without the authorized public-edge proof, must have zero path to the inner TRUYN relay.

The evaluation deliberately does **not** upgrade a partial result into a passing claim.

## Scope

Production surfaces tested:

- public relay: `relay.truyn.org`;
- Azure Container Apps relay origin, with the concrete origin hostname redacted from this public report;
- Google Cloud Run TRUYN runtime(s), with concrete service URLs redacted;
- Cloudflare DNS/proxy configuration for `relay.truyn.org`.

Sensitive cloud resource names, origin hostnames, account identifiers, tokens and live allowlists are intentionally not reproduced here.

## Acceptance gate

The target is considered passed only when all of the following are simultaneously true:

1. `relay.truyn.org` is actually proxied through Cloudflare;
2. the Cloudflare path still reaches the inner relay;
3. direct Azure-origin HTTP cannot reach the relay;
4. direct Azure-origin WebSocket upgrade cannot reach the relay;
5. spoofing ordinary Cloudflare-looking HTTP headers on a direct request does not bypass the origin boundary;
6. direct GCP origins expose no TRUYN relay execution path;
7. failed experiments are rolled back and production health is re-proven;
8. the edge-to-origin proof is account/zone-bound rather than merely "some traffic from the Cloudflare network".

## Findings

### 1. Initial production state: Azure origin boundary was not enabled

A production probe authenticated to Azure through the repository's main-only GitHub OIDC trust and inspected the live relay configuration.

**Run:** `31963428612`

Observed result:

```text
AZURE_ORIGIN_PROOF=FAIL guard_not_enabled
```

Therefore the requested Azure invariant was **not true** in the initial production state.

The runtime contains an origin-guard implementation, but the live relay was not configured to enforce it.

### 2. GCP direct-origin relay path: PASS

The GCP WIF-authenticated production probes enumerated the current TRUYN Cloud Run services and tested their direct service URLs.

Repeated result, including run `31965117962`:

```text
GCP_RELAY_ORIGIN_COUNT=0
GCP_DIRECT_RELAY_API=DENIED_OR_ABSENT
GCP_NETWORK_PROOF=PASS zero_direct_relay_execution_path
```

Meaning:

- no Cloud Run TRUYN relay origin is currently present in the tested region;
- the deployed TRUYN provider runtime did not expose `/v1/register` as a successful relay API;
- a direct GCP-origin request therefore had zero tested relay execution path.

**GCP gate: PASS for the current deployed topology.**

This is a topology-specific proof; it must be repeated if a public GCP relay is introduced later.

### 3. Cloudflare was initially bypassed at DNS

The existing Cloudflare credential could read and write DNS. The live `relay.truyn.org` record was discovered with proxying disabled.

That meant Cloudflare was not actually an enforced hop for the public relay at that point.

The DNS record was changed to `proxied=true`, and a live request then confirmed a `CF-Ray` response header.

**Run:** `31964663132`

Observed result:

```text
CF_DNS_PROXY=PASS proxied=true
```

A later canonical verification re-proved:

```text
CANONICAL_RELAY=PASS public_health=200 cloudflare_path=true cf_ray=true
```

### 4. Secret-header / Worker edge proof: blocked by Cloudflare API permission

A one-shot design attempted to deploy an edge worker which would overwrite any client-supplied origin-proof header with a secret server-side value before proxying to Azure.

Cloudflare rejected the deployment with authentication/authorization error code `10000` for the Workers control-plane operation.

No Azure origin lock was applied after that failure, so production traffic was not intentionally broken.

### 5. Request Transform Rule proof: blocked by Cloudflare API permission

A narrower approach attempted to use Cloudflare request-header transform rules to set the origin-proof header only on the proxied hostname.

Read access to the zone Rulesets API was denied with Cloudflare error code `10000`.

A read-only credential probe confirmed:

```text
CF_PRIMARY=MISSING
CF_LEGACY=RULESETS_READ_DENIED code=10000
CF_RULESETS_PROBE=FAIL no_authorized_credential
```

### 6. Authenticated Origin Pulls control plane: blocked by Cloudflare API permission

Both zone-level Authenticated Origin Pulls and the global AOP setting were probed without enabling them.

The existing Cloudflare credential was denied by the relevant SSL/zone-settings control-plane APIs with error code `10000`.

No AOP state was changed.

### 7. Cloudflare IPv4 allowlist experiment: direct Azure denial achieved, public path failed

A network-only fallback was evaluated using Azure Container Apps ingress restrictions.

The public DNS record was temporarily pinned, with rollback data retained, to the stable IPv4 of the Azure Container Apps environment so Cloudflare would not select an IPv6 origin path. Official Cloudflare IPv4 ranges were then installed as Azure allow rules.

The direct Azure origin converged to:

```text
direct=403
```

This demonstrated that the Azure platform restriction could block the direct GitHub-runner request.

However the Cloudflare path converged to:

```text
edge=525
direct=403
AZURE_NETWORK_PROOF=FAIL convergence edge=525 direct=403
```

A `525` means the public edge could not complete the TLS path to the origin in that pinned-A-record configuration. Because the acceptance gate requires both **edge success** and **direct-origin denial** at the same time, this experiment is **not a passing proof**.

The workflow automatically restored the prior Azure ingress and Cloudflare DNS configuration.

### 8. Production rollback / health: PASS

After the failed network-only experiment, a dedicated canonical verification restored and confirmed:

- proxied CNAME to the Azure relay origin;
- no experimental `cloudflare-*` Azure ingress restrictions;
- public `/health` = HTTP `200`;
- Cloudflare data path observable via `CF-Ray`.

**Run:** `31965354910`

Observed result:

```text
CANONICAL_RELAY_CONFIG=PASS proxied_cname=true experimental_ingress=false
CANONICAL_RELAY=PASS public_health=200 cloudflare_path=true cf_ray=true
```

Temporary privileged workflows were removed from `main` after the probes.

## Current conclusion

### GCP

**PASS for the current topology.** Direct GCP runtime URLs expose no successful TRUYN relay registration/execution path, and no GCP relay origin was present in the tested region.

### Azure

**NOT YET PASSED.**

The experiments proved that Azure can deny direct-origin traffic, but the only tested configuration that produced direct `403` simultaneously broke the Cloudflare path. Production was therefore rolled back to the healthy canonical path rather than leaving a false-positive security configuration in place.

At the end of this evaluation:

- `relay.truyn.org` is genuinely behind Cloudflare DNS proxying;
- the public path is healthy;
- experimental Azure IP restrictions are absent;
- a final account/zone-bound edge-to-origin authentication mechanism is still required before claiming `0 direct Azure origin access`.

## Required final hardening

The preferred next gate is **zone-level or per-hostname Cloudflare Authenticated Origin Pulls using a TRUYN-specific client certificate**, combined with Azure Container Apps client-certificate enforcement and application-side validation of the forwarded certificate identity.

This is stronger than an IP allowlist because the proof is cryptographic and account/zone-specific rather than merely allowing the shared Cloudflare network.

The currently stored Cloudflare credential does not have the Cloudflare SSL/certificate control-plane permission required to configure this.

## Final proof to run after permission is added

The follow-up production proof must show, in one run:

```text
PUBLIC_CLOUDFLARE_HEALTH=200
PUBLIC_CLOUDFLARE_INNER_RELAY=true
DIRECT_AZURE_HEALTH=DENIED
DIRECT_AZURE_REGISTER=DENIED
DIRECT_AZURE_WEBSOCKET=DENIED
DIRECT_AZURE_SPOOFED_HEADERS=DENIED
GCP_DIRECT_RELAY_PATH=0
INNER_RELAY_DIRECT_REQUEST_COUNT=0
ORIGIN_BYPASS_SECURITY_GATE=PASS
```

Only then should the Azure portion of this report be superseded by a PASS report/correction.

## Evidence runs

- `31963428612` — initial live Azure origin guard inspection; guard not enabled.
- `31963603171` — Worker edge-proof attempt; Cloudflare Workers permission denied.
- `31963799670` — Transform Rules attempt; Cloudflare Rulesets permission denied; GCP proof passed.
- `31963910280` — read-only Cloudflare credential capability probe; Rulesets unavailable.
- `31964025419` — zone-level AOP permission probe; denied.
- `31964374527` — first Azure Cloudflare-IP restriction experiment; GCP proof passed.
- `31964663132` — Cloudflare proxying enabled on `relay.truyn.org`; global AOP setting permission unavailable.
- `31964792286` — recovery of failed IP-restriction experiment; public Cloudflare path re-proven healthy.
- `31965117962` — IPv4-pinned Cloudflare network proof: direct Azure `403`, edge `525`; GCP PASS; automatic rollback.
- `31965354910` — canonical production path verification after rollback; PASS.

## Evidence-preservation note

This document intentionally preserves failed as well as successful security experiments. Failed attempts are part of the proof record because they establish which boundaries were actually tested and prevent a future summary from accidentally turning an unproven Azure claim into a production fact.
