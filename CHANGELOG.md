# Changelog

All notable factual repository changes should be recorded here without publishing privileged operational details.

## Unreleased

### Security sanitization
- Removed public privileged cloud provisioning/bootstrap/smoke/deployment workflows and replaced them with secret-free read-only CI.
- Removed raw production benchmark evidence and cloud-specific benchmark/proxy tooling that exposed unnecessary operational execution details.
- Removed obsolete experimental privileged provider/bootstrap paths from the public repository.
- Made production-style relay node registration explicit-enrollment only by default.
- Made provider dispatch trusted-requester only by default, while preserving a separately explicit public-dispatch opt-in for BYOK/network use.
- Made provider discovery and dispatch authorization-aware: requesters cannot enumerate or route to provider offers that their provider policy does not authorize.
- Bound provider ownership at the relay to the cryptographic sender of the signed `OFFER`; requester/provider metadata cannot forge another owner identity.
- Added provider-signed requester allowlists for private/BYOK providers, allowing a private provider to authorize its requester without a global relay trusted-requester entry.
- Added regression coverage across legacy NEED, compact NEED and WebSocket chain routing proving unauthorized owner-only providers are filtered before dispatch and receive zero queued events.
- Bound legacy OFFER/NEED/RESULT/REVOKE operations to active bearer sessions matching the signed node identity.
- Added registration freshness/replay rejection, session expiry, bounded request/WebSocket payloads, queue/capacity limits, and minimal public diagnostics.
- Reduced provider health/log disclosure to readiness only.
- Restricted permissive CLI relay mode to loopback local development.
- Made the runtime provider role default to `owner-only`; denied requesters are rejected by the provider host before adapter execution, with regression coverage proving zero adapter executions.
- Requiring public provider execution now needs two explicit runtime choices: `TRUYN_PROVIDER_ACCESS_MODE=public` and `TRUYN_ALLOW_PUBLIC_PROVIDER=1`; public mode fails closed if the second opt-in is absent.
- Added a production provider billing gate after access authorization and before adapter execution; runtime billing defaults to private `owner-funded` responsibility.
- Owner-funded billing refuses public provider execution even if public access was separately enabled, preserving zero owner-paid external execution by default.
- Added `byok`, `owner-funded`, `sponsored`, `prepaid`, and `subscription` billing-policy modes; prepaid/subscription fail closed without an entitlement resolver.
- Sponsored access is disabled by default with zero request/token allowance; any future sponsored reservation requires explicit enablement, positive daily quotas, and an explicit token budget.
- Added a public-network relay master switch: public registration/dispatch remain disabled by default and cannot be enabled without the separate `TRUYN_PUBLIC_NETWORK=1` opt-in.
- Added a dedicated runtime-security contract that asserts the `owner-only` default and verifies that the production provider entrypoint wires its access policy into `TruynAdapterHost`.
- Added a public-tree leakage guard that allowlists the safe workflow set and rejects known privileged paths/markers, credential/private-key patterns, and live cloud-topology patterns.
- Expanded safe read-only CI to future branch pushes and pull requests so public-tree policy is continuously checked from the sanitized baseline.
- Defined public benchmark/security publication policy and operational-data exclusions.
- Rewrote normal Git refs to a sanitized root commit after validation; contributors with pre-rewrite clones must re-clone before contributing.
- Recorded hosting-side pull-request refs/caches and historical Actions logs/artifacts as separate residual cleanup surfaces from the sanitized Git tree.

### Provider ownership / BYOK architecture
- Defined **open protocol does not mean open billing account**.
- Added provider ownership, tenant/visibility policy, BYOK, server-side authorization, relay/control-plane separation, billing/quota attribution and threat-model architecture.
- Implemented the first relay/runtime ownership boundary: signed provider identity is authoritative for provider ownership, private providers are hidden from unauthorized discovery/routing, and provider-signed requester allowlists support isolated BYOK/private providers.
- Implemented the first provider-runtime billing boundary: access authorization is followed by a fail-closed billing decision before adapter/upstream execution.
- Implemented official CLI BYOK setup for OpenAI, OpenAI-compatible, local OpenAI-compatible runtimes, Anthropic, Azure OpenAI, Vertex Gemini, generic custom HTTP providers and stateless MCP HTTP tool providers.
- BYOK profiles persist only non-secret provider settings, auth mode and credential environment-variable names where required; resolved credential/token values are not written into the TRUYN profile or printed by setup status.
- Added explicit no-auth support for user-controlled OpenAI-compatible/local runtimes without weakening the normal OpenAI credential requirement.
- Added a generic custom HTTP JSON provider that posts `{ capability, input, policy }`, supports no-auth or explicit bearer auth, and does not return endpoint/token details in normalized result metadata.
- Added a stateless MCP `2026-07-28` HTTP tool provider that maps one configured MCP tool to a TRUYN capability, supports optional bearer auth by env reference, and does not expose endpoint/token data in normalized results.
- BYOK requester and provider use separate cryptographic identities; remote providers publish `owner-only` access for the configured requester and run with billing mode `byok`.
- Non-loopback official CLI AI-workload entry points require a verified private BYOK profile; loopback development remains available without the remote gate.
- Defined BYOK as the default user model; raw upstream provider credentials remain at the provider runtime.
- Defined sponsored/free owner-funded access as explicit future entitlement, not an implicit public-network feature.

### AI interoperability MVP
- Added a shared Adapter SDK, local HTTP adapter, MCP stdio/HTTP support, and provider adapter contract.
- Added user-supplied OpenAI/Anthropic provider adapter support.
- Added provider usage/latency metadata and local reproducible demos.

### MVP foundation
- Implemented signed `TRUYN/1` MVP envelopes for `IDENTITY`, `OFFER`, `NEED`, `RESULT`, and `REVOKE`.
- Implemented Ed25519 node identities derived from public keys.
- Added the in-memory reference relay, `TruynNode` client, CLI, provisional `trustability-lite/1`, local demos, and automated tests.

### Architecture synchronization
- Canonicalized network modes as `local`, `testnet`, `mainnet`.
- Added `REVOKE`, `OBJECT`, `COMPUTE`, `TRUST_RECEIPT`, claim-centric Trustability, provenance, state/delta, compute-near-data and updater/rollback ownership.
- Preserved capability-economy work as a modular research track.

## 0.1.0-dev
- Established initial repository architecture skeleton.
- Added draft TRUYN/1 specification and proto areas.