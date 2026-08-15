# Changelog

All notable factual repository changes should be recorded here.

## Unreleased

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
