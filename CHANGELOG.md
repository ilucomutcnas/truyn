# Changelog

All notable factual repository changes should be recorded here without publishing privileged operational details.

## Unreleased

### Roadmap / status / operations synchronization — 2026-08-17

- Added `docs/architecture/IMPLEMENTATION_STATUS.md` as the canonical factual maturity matrix separating Defined, Implemented, CI-proven, bounded real-testnet, Productionized, Internet-scale and Stable states.
- Reworked `ROADMAP.md` so already-implemented Semantic Retrieval, Trustability, provider security/BYOK and benchmark layers are no longer presented as purely future sequential work.
- Kept network productionization as the primary next gate: repeatable real multi-host testnet, churn/partition/recovery, heterogeneous NAT, then 100/1,000 real nodes and real-underlay Byzantine/Sybil/eclipse/collusion exercises.
- Synchronized `ARCHITECTURE_CONTRACT.md`, `AUTHORIZATION_MODEL.md`, `PROVIDER_OWNERSHIP.md`, `BILLING_BOUNDARY.md` and `RELAY_SECURITY.md` with the actual implemented security/billing boundaries.
- Corrected sponsored billing documentation: process-local counters are not a production billing boundary; sponsored activation requires actor-bound signed entitlement verification plus a durable atomic usage store.
- Added real `docs/operations/` documentation for node, testnet and billing operations.
- Added a separate `docs/security/` layer for security architecture status and operational security while retaining root `SECURITY.md` as the public policy entry point.
- Added `docs/compatibility/` documentation separating software, protocol, wire/storage and adapter compatibility; current `0.1.0-dev` / draft `TRUYN/1` remains explicitly pre-stable.
- Updated `STRUCTURE.md` and `docs/README.md` so operations/security/compatibility are no longer placeholder directories.

### Network / trust status

- Closed v0.1 Connect as an implemented/CI-proven reference underlay with real QUIC/UDP, authenticated peer sessions, Kademlia network RPC/discovery, direct-first P2P, STUN/same-port hole punching, relay fallback and bounded backpressure.
- Added bounded real libp2p QUIC/Kademlia trust-testnet evidence covering decentralized verifier discovery, durable replicated signed transparency/revocation state, churn, transport-ID rotation, stale-record tolerance, stale-receipt rejection and zero relay calls in the tested trust path.
- Began real multi-host cloud network productionization exercises; temporary operational workflows/results are not promoted to durable productionized evidence until a completed reproducible report closes the gate.

### Security hardening

- Low-level provider access policy now defaults to `owner-only` in addition to runtime provider default-private behavior.
- Oversized HTTP bodies return 413 with connection close so unread bytes cannot poison a reusable keep-alive socket.
- Local-development mode hard-fails when combined with public/production relay markers.
- Origin proof is expiry-bound, supports an active+previous rotation window, and secret values are kept out of routine config enumeration/serialization.
- Sponsored billing cannot activate without a signed entitlement verifier and atomic durable usage store.

### Security sanitization / provider boundary

- Public provider discovery/dispatch is authorization-aware and private providers fail closed by default.
- Provider ownership is bound to the cryptographic sender of signed provider offers; requester-controlled ownership metadata is not authoritative.
- Provider-host access and billing decisions occur before adapter/upstream execution, with negative tests proving denied users cause zero execution.
- Protected benchmark evidence uses redact-not-delete handling.

### Provider ownership / BYOK architecture

- Defined **open protocol does not mean open billing account**.
- Implemented reference BYOK onboarding for supported provider profiles with secret values kept outside persisted profiles.
- BYOK requester/provider use separate cryptographic identities; private providers may sign requester allowlists.
- Owner-funded, sponsored, prepaid and subscription semantics remain fail-closed according to their current entitlement maturity.

### AI interoperability / provider reference paths

- Shared adapter/runtime contracts cover user-supplied and project reference provider integrations, provider usage/latency metadata and normalized media artifacts.
- Multi-cloud reference adapters support text/image/video capability families while model deployment entitlement remains independent from adapter presence.

### MVP foundation / architecture synchronization

- Signed `TRUYN/1` MVP envelopes and Ed25519 node identities established the original relay/node foundation.
- Canonical network modes are `local`, `testnet`, `mainnet`.
- Architecture includes `OBJECT`, `COMPUTE`, `TRUST_RECEIPT`, claim-centric Trustability, provenance, state/delta, compute-near-data and modular capability-economy concepts.

## 0.1.0-dev

- Established the initial repository architecture skeleton and draft TRUYN/1 specification/proto areas.
