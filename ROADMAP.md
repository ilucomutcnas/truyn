# TRUYN Roadmap

This roadmap describes intended engineering milestones and factual maturity. Protocol semantics live in `spec/`; measured claims live in `docs/benchmarks/`.

The implementation has not evolved strictly in version order: semantic, provider, Trustability and benchmark layers advanced faster than the physical peer-network underlay. As of 2026-08-17, v0.1 Connect is implemented as a real QUIC/Kademlia/P2P/NAT reference underlay, while several later roadmap slices already have bounded implementations/evidence. The immediate engineering priority is network failure/churn durability and real multi-host scale rather than additional semantic sophistication.

## Maturity scale

Every substantial subsystem should be described with an explicit maturity state:

1. **Defined** — architecture/specification exists.
2. **Implemented** — executable reference code exists.
3. **CI-proven** — automated tests prove the bounded contract.
4. **Bounded real-testnet proven** — exercised across real network processes/hosts in a bounded topology.
5. **Productionized** — operational lifecycle, recovery, durability, security and observability gates are satisfied for the intended deployment class.
6. **Internet-scale proven** — large real-node/WAN/adversarial evidence exists.
7. **Stable** — compatibility and upgrade guarantees are declared.

A design document does not promote implementation maturity. Conversely, once implementation/evidence exists, the roadmap must stop describing that slice as purely future work.

Canonical status matrix: `docs/architecture/IMPLEMENTATION_STATUS.md`.

## Current snapshot — 2026-08-17

| Area | Current maturity |
|---|---|
| TRUYN/1 logical protocol | Defined / partial implementation; still draft |
| v0.1 Connect underlay | Implemented + CI-proven |
| Real QUIC/Kademlia trust-network slice | Bounded real-testnet proven (four-node bounded topology) |
| Semantic retrieval/index/distributed retrieval | Implemented + extensive CI/benchmark evidence |
| Provider ownership/authorization/BYOK | Implemented reference baseline |
| Billing safety | BYOK/owner-funded implemented; sponsored guard implemented but requires external durable store/issuer; prepaid/subscription fail closed |
| Trustability v1/v2 | Implemented + CI/benchmark proven; bounded real-network trust slice proven |
| Multi-cloud text/image/video providers | Implemented reference adapter paths; individual deployment availability varies |
| Network productionization | **In progress / primary next gate** |
| Operations / compatibility / separate security docs | Documentation baseline implemented in current synchronization |
| Mainnet | Not productionized / not stable |

## Immediate security baseline — before wider paid-provider coexistence

The repository already contains an executable MVP/reference implementation and cloud/testnet work. The following boundaries are implemented and must remain invariant:

1. provider ownership bound to authenticated/signed provider identity rather than requester-controlled metadata;
2. server-side authorization before dispatch and again at provider-host execution;
3. default-deny/fail-closed provider behavior;
4. authorization-aware discovery hiding unauthorized private providers;
5. BYOK-by-default onboarding and credential locality;
6. billing responsibility checks before chargeable calls;
7. authenticated protected-provider backchannel option and public/control-plane separation;
8. legacy/fast/WebSocket execution paths preserving equivalent authorization semantics;
9. owner-funded/public-provider misconfiguration denied;
10. negative tests proving foreign users cause zero provider execution;
11. low-level provider policy as well as runtime provider defaults to `owner-only`;
12. local-development mode cannot coexist with public/production relay markers;
13. oversized HTTP body closes the connection after 413;
14. origin proof is expiry-bound and rotation-capable;
15. sponsored mode cannot activate without actor-bound signed entitlement verification and an atomic durable usage store.

This baseline is not a claim that rich account/organization tenancy, commercial entitlement issuance, deployed durable accounting, full cloud perimeter proof or mainnet security operations are complete.

See:

- `docs/architecture/PROVIDER_OWNERSHIP.md`
- `docs/architecture/AUTHORIZATION_MODEL.md`
- `docs/architecture/RELAY_SECURITY.md`
- `docs/architecture/BILLING_BOUNDARY.md`
- `docs/architecture/BYOK_ARCHITECTURE.md`
- `docs/architecture/THREAT_MODEL.md`
- `docs/security/`

## v0.1 — Connect — **IMPLEMENTED / CI-PROVEN REFERENCE UNDERLAY**

Closed: **2026-08-17**

- [x] Cryptographic node identity independent of IP address
- [x] Real QUIC/UDP underlay session
- [x] Signed HELLO/ACCEPT authenticated peer sessions with replay/freshness checks
- [x] Signed peer/bootstrap records
- [x] Kademlia 256-bit XOR routing table
- [x] Iterative peer discovery over authenticated QUIC
- [x] Networked `PING`, `FIND_NODE`, `STORE`, `FIND_VALUE`
- [x] Direct peer-to-peer signed TRUYN envelope communication
- [x] Direct-first routing with explicit relay fallback
- [x] STUN binding discovery
- [x] Same-QUIC-socket UDP hole-punch path
- [x] Explicit bounded backpressure instead of silent direct-path loss
- [x] `OFFER`, `NEED`, `RESULT`
- [x] Minimal `REVOKE` path for offers/keys/results
- [x] `local` and initial `testnet` network profiles
- [x] Provider-policy semantics compatible with owner/tenant/default-private authorization
- [x] Composed `TruynNetworkNode` lifecycle
- [x] Full repository regression/security gate green on the v0.1 evidence commit

Evidence:

- `docs/architecture/NETWORK_UNDERLAY_V01.md`
- `docs/benchmarks/V01_CONNECT_GATE_2026-08-17.md`

Closing v0.1 is **not** a claim that Internet-scale churn, universal NAT traversal, DHT durability or mainnet SLOs are already proved.

## Network Productionization Gate — **PRIMARY NEXT**

Do this before treating TRUYN as a production decentralized network:

- repeatable real multi-host public/private testnet nodes;
- join/leave/crash/restart churn exercises;
- Kademlia record replication, refresh, repair and expiry under churn;
- durable routing/DHT state across process restart where required;
- WAN partition and healing behavior;
- NAT/reachability matrix across real network environments;
- relay degradation, outage and fallback recovery;
- durable admission/backpressure/queue behavior;
- 100 simultaneously running real network nodes;
- 1,000 simultaneously running real network nodes;
- Byzantine provider/log behavior, stale-record floods, Sybil pressure, eclipse attempts and collusion exercises on the real underlay;
- measured convergence, packet/byte overhead, p50/p95/p99 and failure recovery.

Real multi-host cloud productionization exercises are active work as of this synchronization. Temporary workflow success/failure is not promoted to durable maturity until a completed reproducible report is recorded in `docs/benchmarks/`.

This gate is deliberately prioritized ahead of further semantic-router feature expansion.

## v0.2 — Verify — **SUBSTANTIALLY IMPLEMENTED / SCALE GATE OPEN**

Original milestone scope:

- `CLAIM`, `ATTEST`
- Active verification behaviors: `CHALLENGE`, `VERIFY`, `DISPUTE`
- Domain-scoped claim-centric Trustability
- Signed provenance
- Trust evidence aggregation and `TRUST_RECEIPT`

Current factual state: claim-centric Trustability, provenance/independence, active lifecycle and receipts have executable implementations and CI/benchmark evidence. A real four-node libp2p QUIC/Kademlia trust-lifecycle slice also proves decentralized verifier discovery, replicated signed transparency/revocation state and churn in a bounded topology.

Remaining: larger real-node adversarial scale, stronger operational authority/revocation lifecycle and stable protocol guarantees.

## v0.3 — Synchronize — **PARTIAL / MIXED**

Original milestone scope:

- Content-addressed `OBJECT`
- `STATE`, `DELTA`, `SUBSCRIBE`
- Cache, freshness, object reuse and invalidation semantics

Current factual state: content-addressed context techniques, persistent semantic index lifecycle, immutable-vector reuse, invalidation and distributed retrieval are implemented and benchmarked. Full generic `STATE`/`DELTA`/`SUBSCRIBE` runtime behavior across the decentralized network remains broader than the currently productionized slices.

## v0.4 — Execute & Route — **PARTIAL / MIXED**

Original milestone scope:

- `COMPUTE` and compute-near-data execution
- Execution policy and sandbox boundary
- Multiple-provider capability routing
- Authorization-before-ranking for private/shared/network providers
- Trust/latency/freshness/cost/privacy selection within the authorized provider set
- Explicit deadline, urgency, priority and decision-value inputs
- Verification effort proportional to decision risk/value
- Billing/usage attribution for chargeable capability execution

Current factual state: multiple-provider routing paths, authorization-before-dispatch, provider-host security/billing gates, semantic routing and provider usage/latency metadata are implemented reference slices. General `COMPUTE` sandboxing, resource isolation, complete compute-near-data execution and durable commercial attribution remain incomplete.

## v0.5 — Interoperate — **PARTIAL / ACTIVE**

Original milestone scope:

- MCP adapter
- Initial OpenAI/Codex, Claude, Gemini, Grok, Perplexity and local-model adapters
- Provider adapter contract for Copilot, Amazon Q, Cursor, Windsurf, Mistral, DeepSeek, Qwen, Cohere, NVIDIA and future systems
- Public SDK surface
- User-facing BYOK setup for common providers
- Secure local/provider-runtime credential storage contract

Current factual state: MCP, OpenAI/OpenAI-compatible, Anthropic, Azure OpenAI, Vertex Gemini, custom HTTP and additional project reference provider paths exist; BYOK CLI setup exists for supported profiles; multi-cloud text/image/video reference adapters are present. Broad ecosystem certification and stable public SDK compatibility remain open.

## v0.6 — Resist & Scale Trust — **IMPLEMENTED SLICES / LARGE REAL-NETWORK GATE OPEN**

Original milestone scope:

- Provenance graph
- Independence/lineage estimation
- Sybil/collusion defenses
- Domain history
- Scalable attestation aggregation, receipts, pruning and revocation propagation
- Provider/resource abuse and anomaly controls

Current factual state: provenance/independence, active trust lifecycle, receipts, decentralized placement/read-quorum work, signed transparency/revocation state, fork/equivocation detection semantics and bounded adversarial evidence exist. Large real-network Sybil/eclipse/collusion pressure remains unproven.

## v0.7 — Measure — **ACTIVE / STRONG EVIDENCE LEDGER**

- [x] Token, latency, request-body, semantic, trust and infrastructure-scale benchmark work exists
- [x] Reproducible public reports are preserved under `docs/benchmarks/`
- [x] Provider-security negative evidence is published without exposing private topology where safe
- [ ] 100/1,000 simultaneously running **real** network-node evidence
- [ ] large real-WAN adversarial distributions

100/1,000-node simulations or 100k semantic blocks must not be described as 100/1,000 simultaneously running real network nodes.

## v0.8 — Operate — **PARTIAL / DOCUMENTATION BASELINE NOW ESTABLISHED**

Original milestone scope:

- Verified installers for Windows/macOS/Linux
- Service registration for `truynd`
- First-run identity/config/bootstrap lifecycle
- Signed updater channels
- Compatibility preflight, migrations and rollback
- Recovery and uninstall paths
- Operational separation of public data plane, owner control plane and provider backchannels

Current factual state: executable node/relay/provider/testnet paths and cloud test exercises exist; `docs/operations/`, `docs/security/` and `docs/compatibility/` now document the current boundary. Production installers, signed updater/rollback and stable mainnet operations remain open.

## v1.0 — Stabilize — **NOT REACHED**

- Stable `TRUYN/1`
- Stable node identity, provider policy, object/state, execution and Trustability contracts
- Stable `local` / `testnet` / `mainnet` semantics
- Production-grade authorization/tenant/BYOK boundary
- Production-grade upgrade/rollback contract
- Public mainnet bootstrap
- Documented SDKs and compatibility policy

## Post-v1 research track — Capability Economy

- Capability price discovery
- Provider quality/price/trust competition
- Optional settlement adapters
- Resource accounting and receipts
- Explicit provider-owner entitlements for cross-owner execution
- No mandatory blockchain or single payment rail

## Versioning rule

Software releases (`v0.1.0`, `v1.0.0`) and network protocol generations (`TRUYN/1`, `TRUYN/2`) are deliberately separate. A newer node may support multiple protocol generations simultaneously. Current software remains `0.1.0-dev`; `TRUYN/1` remains draft until explicitly stabilized.
