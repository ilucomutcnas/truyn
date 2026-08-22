# Changelog

All notable factual repository changes should be recorded here without publishing privileged operational details.

## Unreleased

### A2A / MCP interoperability architecture — 2026-08-22

- Added `docs/architecture/A2A_MCP_INTEROPERABILITY.md` as the canonical external agent/tool protocol bridge architecture.
- Added `docs/compatibility/A2A_MCP_COMPATIBILITY.md` with a factual maturity/version-support matrix.
- Corrected interoperability status: the repository already has bounded executable MCP server/provider paths; A2A and the general bidirectional A2A↔TRUYN↔MCP bridge remain unimplemented.
- Added an explicit v0.5 A2A/MCP Interoperability Bridge Gate to `ROADMAP.md`, including MCP conformance closure, A2A server/client adapters, bidirectional round-trip proof, artifact/asynchronous-task coverage and negative security evidence.
- Defined A2A Agent Card skill → authorized TRUYN capability/OFFER projection, A2A Message → `NEED`, task/context IDs → adapter correlation state and A2A Artifact → `RESULT`/artifact-reference mapping without adding new TRUYN/1 wire primitives.
- Defined MCP Tools/Resources as adapter-level compatibility objects; general MCP discovery/import remains a future implementation step.
- Made A2A/MCP versions independent compatibility dimensions so external protocol upgrades do not force a TRUYN protocol generation unless core network semantics change.
- Synchronized root README, architecture contract, implementation status, repository structure, adapter docs, compatibility docs and MVP interoperability guide with the new boundary.
- Preserved security invariants: external protocol authentication does not replace TRUYN provider authorization, billing responsibility, Trustability or settlement; public Agent Cards/MCP discovery must not leak private owner-only/BYOK providers.

### SDK / developer experience architecture — 2026-08-22

- Made SDK/developer experience an explicit architecture and roadmap implementation track rather than a generic future `Public SDK surface` item.
- Fixed the required first-party SDK targets as JavaScript/TypeScript, Python, Go, Java and C#/.NET; retained Rust as an optional additional track rather than a substitute for those five.
- Added `docs/architecture/SDK_DEVELOPER_EXPERIENCE.md` with common SDK semantics, package/distribution targets, security invariants, shared conformance requirements and DX-0…DX-4 implementation gates.
- Added draft `spec/protocol/v1/agent-descriptor.md` defining the **TRUYN Agent Descriptor** as signed, expiry-bound bootstrap/self-description metadata rather than a new top-level TRUYN envelope kind.
- Reserved `/.well-known/truyn-agent.json` as the target public HTTP discovery location for intentionally public participants while preserving native/direct/registry discovery options.
- Kept the Agent Descriptor distinct from dynamic `OFFER`: Descriptor advertises identity/protocol/interfaces/intentionally visible capability classes; `OFFER` remains dynamic availability/conditions and neither grants provider authorization by itself.
- Added public/scoped Descriptor privacy requirements so private providers/capabilities, credentials, private topology and privileged allowlists cannot leak through onboarding metadata.
- Added SDK scaffolding documentation under `sdk/typescript`, `sdk/python`, `sdk/go`, `sdk/java`, `sdk/dotnet` and `sdk/rust`, with Java and .NET now represented explicitly in the repository structure.
- Added `docs/getting-started/SDK_QUICKSTART.md` with target cross-language onboarding examples and `docs/compatibility/SDK_COMPATIBILITY.md` with protocol/descriptor/SDK versioning and stable-v1 parity requirements.
- Updated README, architecture contract, implementation status, repository structure, compatibility, interoperability guidance and contributing rules to make SDK/Descriptor maturity and security boundaries explicit.
- Stable v1 now requires all five first-party SDKs to pass a shared conformance/security suite against stable TRUYN/1 and a stabilized Agent Descriptor contract.

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
- Class C heterogeneous packet-path WAN, NAT/CGNAT and relay-failure evidence remains open.

### Security hardening — 2026-08-17

- Made the low-level provider access policy default `owner-only`, aligning the bottom security layer with runtime provider default-private behavior.
- Closed oversized-body keep-alive poisoning: oversized HTTP input returns 413 and closes the connection before a fresh request can reuse it.
- Made local-development relay mode hard-fail when combined with public/production markers.
- Added expiry-bound, rotation-capable origin proof and protected-provider machine-to-machine proof boundaries.
- Preserved authorization equivalence across HTTP, WebSocket, fast-path, MCP and other execution-capable routes.

## 0.1.0-dev

- Established initial repository architecture skeleton.
- Added draft TRUYN/1 specification and proto areas.
