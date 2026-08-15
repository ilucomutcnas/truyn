# Changelog

All notable factual repository changes should be recorded here without publishing privileged operational details.

## Unreleased

### Security sanitization
- Removed public privileged cloud provisioning/bootstrap/smoke/deployment workflows and replaced them with secret-free read-only CI.
- Removed raw production benchmark evidence and cloud-specific benchmark/proxy tooling that exposed unnecessary operational execution details.
- Removed obsolete experimental privileged provider/bootstrap paths from the public repository.
- Made production-style relay node registration explicit-enrollment only by default.
- Made provider dispatch trusted-requester only by default.
- Made provider discovery authorization-aware: untrusted requesters cannot enumerate foreign provider offers.
- Bound legacy OFFER/NEED/RESULT/REVOKE operations to active bearer sessions matching the signed node identity.
- Added registration freshness/replay rejection, session expiry, bounded request/WebSocket payloads, queue/capacity limits, and minimal public diagnostics.
- Reduced provider health/log disclosure to readiness only.
- Restricted permissive CLI relay mode to loopback local development.
- Defined public benchmark/security publication policy and operational-data exclusions.
- Rewrote normal Git refs to a sanitized root commit after validation; hosting-provider PR refs/caches/forks require separate purge where applicable.

### Provider ownership / BYOK architecture
- Defined **open protocol does not mean open billing account**.
- Added provider ownership, tenant/visibility policy, BYOK, server-side authorization, relay/control-plane separation, billing/quota attribution and threat-model architecture.
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
