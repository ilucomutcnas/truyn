# Changelog

All notable factual repository changes should be recorded here.

## Unreleased

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
