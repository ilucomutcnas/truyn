# Changelog

All notable factual repository changes should be recorded here without publishing privileged operational details.

## Unreleased

### Documentation / productionization synchronization — 2026-08-20

- Synchronized all status-bearing documentation with the actual network implementation/evidence boundary instead of the stale 2026-08-17 snapshot.
- Promoted Class C heterogeneous WAN/reachability to its factual **ACCEPTED / PASS** state using the durable 2026-08-18 evidence report; the accepted boundary includes cross-cloud direct QUIC, real packet-path partition/heal, real cloud NAT, double-NAT/CGNAT-like outbound behavior, authenticated relay fallback/outage/recovery and cleanup.
- Kept the Class C limitation explicit: the accepted result does not claim carrier-operated field CGNAT.
- Recorded Class D-100 as the active acceptance gate, **not** a completed claim. At this snapshot pinned V14 run `32367799512` tests immutable commit `b835c8fa0283a004d616ce8d25d7aa78cee1a1c0`; immutable preflight and Azure login passed while the real 4-host/100-node campaign remained active.
- Documented the canonical D-100 thresholds from `benchmarks/scale/class-d.js`: 100 real nodes/identities/QUIC sockets, ≥4 hosts, ≥99% baseline/healed routing, recovery/convergence p95 ≤120s, required churn/partition/Byzantine/Sybil/eclipse/collusion exercise, zero listed safety violations and complete cleanup.
- Documented D-1000 implementation readiness separately from evidence maturity: scaffolding exists, but no accepted 1,000-real-node result exists; evaluator defaults require 1,000 real nodes/identities/sockets, ≥10 hosts, ≥99% routing, recovery/convergence p95 ≤180s, zero acknowledged write loss and cleanup.
- Added `docs/operations/PRODUCTIONIZATION_EXECUTION_PLAN.md` as the canonical current engineering sequence: D-100 → security-green evidence commit → Class C regression pin → D-1000 → randomized heterogeneous adversarial campaign → operational/durability/SRE/distribution closure → stable TRUYN/1/mainnet.
- Updated `ROADMAP.md`, `IMPLEMENTATION_STATUS.md`, `NETWORK_PRODUCTIONIZATION_GATE.md`, `NETWORK_UNDERLAY_V01.md`, network/testnet operations, security status and documentation indexes to use one consistent maturity vocabulary and gate order.
- Updated `MVP_QUICKSTART.md` and `MVP_AI_INTEROP.md` so they no longer describe decentralized QUIC/Kademlia, provider ownership/default-deny authorization, BYOK and private-provider security as future work. The original relay MVP remains documented as the fastest local proof, not as the ceiling of the current implementation.
- Updated the benchmark ledger without rewriting historical reports: Class B/Class C remain durable accepted evidence; the first D-100 attempt remains preserved negative evidence; a future D-100 PASS must be a new report.
- Reaffirmed that temporary privileged benchmark workflows are execution mechanisms, not durable public operations/evidence, and that scale work must not weaken provider authorization/billing boundaries.

### Roadmap / status / documentation synchronization — 2026-08-17

- Added `docs/architecture/IMPLEMENTATION_STATUS.md` as the canonical factual maturity matrix separating Defined, Implemented, CI-proven, bounded real-testnet, Productionized, Internet-scale and Stable states.
- Reworked `ROADMAP.md` so already-implemented Semantic Retrieval, Trustability, provider security/BYOK and benchmark layers are no longer presented as purely future sequential work.
- Kept network productionization as the primary next gate: repeatable real multi-host testnet, churn/partition/recovery, heterogeneous NAT, then 100/1,000 real nodes and real-underlay Byzantine/Sybil/eclipse/collusion exercises.
- Synchronized `ARCHITECTURE_CONTRACT.md`, `AUTHORIZATION_MODEL.md`, `PROVIDER_OWNERSHIP.md`, `BILLING_BOUNDARY.md`, `RELAY_SECURITY.md`, `STRUCTURE.md` and `docs/README.md` with actual implemented/evidenced boundaries.
- Corrected sponsored billing documentation: process-local counters are not a production billing boundary; sponsored activation requires actor-bound signed entitlement verification plus a durable atomic usage store.
- Added real `docs/operations/` documentation for node, testnet and billing operations.
- Added a separate `docs/security/` layer for security architecture status and operational security while retaining root `SECURITY.md` as public policy/reporting entry point.
- Added `docs/compatibility/` documentation separating software, protocol, wire/storage and adapter compatibility; current `0.1.0-dev` / draft `TRUYN/1` remains explicitly pre-stable.

### Network productionization / trust-network status

- Closed v0.1 Connect as an implemented/CI-proven reference underlay with real QUIC/UDP, authenticated peer sessions, Kademlia discovery/state RPC, direct-first P2P, STUN/same-port hole punching, relay fallback and bounded backpressure.
- Added bounded real libp2p QUIC/Kademlia trust-testnet evidence covering decentralized verifier discovery, durable replicated signed transparency/revocation state, bootstrap loss, transport-ID rotation, stale-record tolerance, revocation convergence, stale-receipt rejection and zero relay calls in the tested trust path.
- Closed the signed peer-record lifecycle prerequisite at CI evidence level: automatic renewal before expiry, renewed sequence durability before dissemination, authenticated `peer.announce`, later-contact PING repair and stale P2P/DHT-RPC client invalidation.
- Prevented re-entrant stale-client teardown when a newer signed peer record arrives inside an active PING control response by deferring ingestion until the native QUIC response stack has unwound.
- Class B real multi-host proof remains historical evidence; the later peer-lifecycle CI slice does not relabel that run as renewal/WAN/NAT evidence.
- At the 2026-08-17 snapshot Class C remained open; it was subsequently accepted on 2026-08-18 and is now indexed as durable Class C evidence.
- Added durable verified expired peer-record recovery hints while keeping live peer lookup/snapshot behavior fail-closed; this correction supports the active D-100 V14 recovery path.

### Security hardening — 2026-08-17

- Made the low-level provider access policy default `owner-only`, aligning the bottom security layer with runtime provider default-private behavior.
- Closed oversized-body keep-alive poisoning: oversized HTTP input returns 413 and closes the connection before a fresh request can reuse it.
- Made local-development relay mode hard-fail when combined with public/production markers.
- Hardened origin proof with expiry plus active/previous rotation and non-enumerable secret handling in runtime config.
- Replaced process-local sponsored quota assumptions with an actor-bound signed-entitlement verifier + atomic durable usage-store activation requirement.

### Security sanitization

- Removed public privileged cloud provisioning/bootstrap/smoke/deployment workflows where they exposed unnecessary operational execution details and kept safe public CI/read-only boundaries.
- Removed temporary Class C and later scale acceptance cloud runner workflows after bounded operational use; public `main` returns to the normal allowlisted non-privileged workflow surface after pinned runs are started.
- Removed obsolete experimental privileged provider/bootstrap paths from the public repository.
- Made production-style relay node registration explicit-enrollment only by default.
- Made provider dispatch trusted/authorized requester only by default while preserving separately explicit public-network/provider opt-ins.
- Made provider discovery and dispatch authorization-aware: requesters cannot enumerate or route to provider offers their provider policy does not authorize.
- Bound provider ownership at the relay to the cryptographic sender of signed `OFFER`; requester/provider metadata cannot forge another owner identity.
- Added provider-signed requester allowlists for private/BYOK providers, allowing a private provider to authorize its requester without global relay trust.
- Added regression coverage across legacy NEED, compact NEED and WebSocket chain routing proving unauthorized owner-only providers are filtered before dispatch and receive zero queued events.
- Bound legacy OFFER/NEED/RESULT/REVOKE operations to active bearer sessions matching signed node identity.
- Added registration freshness/replay rejection, session expiry, bounded request/WebSocket payloads, queue/capacity limits and minimal public diagnostics.
- Reduced provider health/log disclosure to readiness/minimal output.
- Restricted permissive CLI relay mode to loopback local development.
- Made provider-host authorization deny requesters before adapter execution, with regression coverage proving zero adapter executions.
- Requiring public provider execution needs explicit provider-mode opt-in; public mode fails closed when required opt-ins are absent.
- Added production/reference provider billing gate after access authorization and before adapter execution; runtime billing defaults to private owner-funded responsibility.
- Owner-funded billing refuses public provider execution even if public access was separately enabled.
- Added `byok`, `owner-funded`, `sponsored`, `prepaid`, `subscription` policy modes; prepaid/subscription fail closed without entitlement resolver.
- Added public-network relay master gating: public registration/dispatch remain disabled by default and require explicit operator intent.
- Added runtime-security contracts asserting owner-only defaults and production provider policy wiring.
- Added public-tree leakage guard rejecting credential/private-key/live-topology markers while protecting benchmark evidence paths.
- Defined public benchmark/security publication policy and operational-data exclusions.
- Rewrote normal Git refs onto a sanitized root after validation; contributors with pre-rewrite clones must re-clone before contributing.
- Recorded hosting-side pull-request refs/caches and historical Actions logs/artifacts as separate residual cleanup surfaces.

### Benchmark evidence preservation

- Restored/preserved `docs/benchmarks/` as an append-only public evidence ledger.
- Security cleanup follows **redact-not-delete** handling for published measured reports.
- Regression tests protect established benchmark reports from accidental deletion/truncation while scanning them for credentials/private keys/private topology.

### Provider ownership / BYOK architecture

- Defined **open protocol does not mean open billing account**.
- Added provider ownership, tenant/visibility policy, BYOK, server-side authorization, relay/control-plane separation, billing/quota attribution and threat-model architecture.
- Implemented first relay/runtime ownership boundary: signed provider identity is authoritative, private providers are hidden from unauthorized discovery/routing and provider-signed requester allowlists support isolated BYOK/private providers.
- Implemented provider-runtime billing boundary: access authorization is followed by fail-closed billing decision before adapter/upstream execution.
- Implemented official CLI BYOK setup for OpenAI, OpenAI-compatible/local runtimes, Anthropic, Azure OpenAI, Vertex Gemini, generic custom HTTP providers and stateless MCP HTTP tool providers.
- BYOK profiles persist non-secret provider settings, auth mode and credential environment-variable names where required; resolved credential/token values are not written into TRUYN profile/status output.
- Added explicit no-auth support for user-controlled OpenAI-compatible/local runtimes without weakening normal OpenAI credential requirements.
- Added generic custom HTTP JSON provider and stateless MCP HTTP tool provider reference paths without exposing endpoint/token details in normalized results.
- BYOK requester and provider use separate cryptographic identities; remote providers publish private owner-only access for configured requester and run with billing mode `byok`.
- Non-loopback official CLI AI-workload entry points require a verified private BYOK profile as defense in depth.
- Defined sponsored/free owner-funded access as explicit entitlement, not implicit public-network/provider behavior.

### AI interoperability MVP / multi-cloud reference providers

- Added shared Adapter SDK, local HTTP adapter, MCP stdio/HTTP support and provider adapter contracts.
- Added user-supplied OpenAI/Anthropic and additional BYOK provider support.
- Added provider usage/latency metadata and local reproducible demos.
- Added reference multi-cloud provider paths across Google/Azure text/image/video capability families with provider-specific provenance/artifact handling.

### Semantic retrieval / trust evidence

- Added content-addressed context efficiency, question + root-CID semantic retrieval and seven-actor provider-chain evidence.
- Added production Semantic Retrieval v2 confidence/stability/economic gates.
- Added persistent semantic index lifecycle with immutable-vector reuse, incremental roots, single-flight preparation and invalidation.
- Added 600/10k/100k-block semantic infrastructure scale evidence and concurrent-load evidence.
- Added distributed semantic retrieval, decentralized placement/Byzantine read-quorum, claim-centric Trustability and active trust-network evidence.

### MVP foundation

- Implemented signed `TRUYN/1` MVP envelopes for `IDENTITY`, `OFFER`, `NEED`, `RESULT`, `REVOKE` and later protocol/reference slices.
- Implemented Ed25519 node identities derived from public keys.
- Added original in-memory reference relay, `TruynNode` client, CLI, provisional trustability path, local demos and automated tests.

### Architecture synchronization

- Canonicalized network modes as `local`, `testnet`, `mainnet`.
- Added `REVOKE`, `OBJECT`, `COMPUTE`, `TRUST_RECEIPT`, claim-centric Trustability, provenance, state/delta, compute-near-data and updater/rollback ownership.
- Preserved capability-economy work as a modular research track.

## 0.1.0-dev

- Established initial repository architecture skeleton.
- Added draft TRUYN/1 specification and proto areas.