# Changelog

All notable factual repository changes should be recorded here.

## Unreleased

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
