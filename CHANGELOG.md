# Changelog

All notable factual repository changes should be recorded here.

## Unreleased

### Provider ownership / BYOK security architecture — documentation only
- Defined the approved target principle **open protocol does not mean open billing account**.
- Added public architecture for provider ownership, tenant/visibility policy, BYOK, central server-side authorization, relay/control-plane separation, billing/quota attribution and provider threat modeling.
- Added draft TRUYN/1 provider-policy semantics: private-by-default providers, authoritative server-side ownership binding, authorization-aware discovery and fail-closed chargeable execution.
- Added the required negative security matrix proving that foreign requesters, known private provider IDs, forged owner/tenant fields and legacy routes cannot cause owner-funded upstream calls.
- Defined BYOK as the default user model and documented that raw upstream provider credentials stay at the user/provider runtime rather than in TRUYN envelopes/relay state.
- Defined sponsored/free owner-funded access as an explicit future entitlement with a default allowance of zero/disabled, not an implicit public-network feature.
- Defined a public/private documentation boundary: protocol/security invariants are public; live credentials, private origins, privileged cloud identities, allowlists, quotas/cost ceilings and other operational details remain private.
- Removed live Azure edge resource names from the current public edge architecture document while preserving intentionally public `truyn.org` service hostnames.
- Updated README, security policy, roadmap, repository structure, protocol docs, network/adapters docs and MVP quickstarts to distinguish implemented MVP behavior from the approved-but-not-yet-implemented provider-security target.
- **No runtime, relay, provider adapter, workflow, cloud IAM, quota or provider execution implementation is introduced by this documentation change.**

### AI interoperability MVP
- Added a shared Adapter SDK with a provider execution host that publishes capabilities, polls signed `NEED` events, executes an adapter, and returns signed `RESULT` messages.
- Added a universal local HTTP adapter for identity, discovery, offers, needs, events, and results.
- Added MCP stdio and HTTP support with `server/discover`, `tools/list`, `tools/call`, modern `2026-07-28` request handling, and legacy initialize compatibility for `2025-11-25` / `2025-06-18` clients.
- Added executable OpenAI Responses API and Anthropic Messages API provider adapters; live calls require user-supplied credentials and explicit model IDs.
- Added a reproducible no-credentials AI interoperability demo and a separate live OpenAI -> TRUYN -> Anthropic demo path.
- Added provider usage/latency metadata propagation into signed TRUYN results.
- Added a structural handoff benchmark that measures bytes exactly and labels token counts as estimates rather than provider billing-token measurements.
- Expanded automated coverage from 5 to 9 tests; all 9 pass in the local validation used for this implementation.
- Added factual AI interoperability quickstart and documented the remaining MVP/non-production boundaries.

### MVP foundation
- Added the first executable TRUYN vertical slice using dependency-free Node.js runtime code.
- Implemented canonical signed `TRUYN/1` envelopes for `IDENTITY`, `OFFER`, `NEED`, `RESULT`, and `REVOKE`.
- Implemented Ed25519 node identities with Node IDs derived from public keys.
- Added an in-memory HTTP relay for registration, capability discovery, request/result routing, event polling, and offer revocation.
- Added the `TruynNode` client, CLI, provisional `trustability-lite/1`, two-node demo, and automated end-to-end tests.
- Added an MVP quickstart and explicitly documented that the relay and Trustability Lite formula are provisional MVP implementation choices rather than final network/trust contracts.

### Architecture synchronization
- Reconciled the repository skeleton with the full TRUYN design discussion.
- Canonicalized network modes as `local`, `testnet`, `mainnet`.
- Added explicit `REVOKE`, `OBJECT`, `COMPUTE` and `TRUST_RECEIPT` protocol ownership.
- Defined `CHALLENGE`, `VERIFY`, `DISPUTE` as composed verification behaviors.
- Added domain-scoped Trustability, scalable trust aggregation/receipts and content-addressed object ownership.
- Added deadline/urgency/priority/decision-value routing inputs.
- Added compute-near-data execution/sandbox ownership.
- Added updater/rollback and first-run lifecycle ownership.
- Synchronized provider-adapter targets with the public README.
- Preserved capability-economy work as an explicit modular research track.

## 0.1.0-dev
- Established initial repository architecture skeleton.
- Added draft TRUYN/1 specification and proto areas.
