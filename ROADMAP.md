# TRUYN Roadmap

This roadmap describes engineering sequence and maturity. Normative protocol semantics live in `spec/`; measured claims live in `docs/benchmarks/`.

TRUYN has not evolved in strict version order. Semantic retrieval, provider security, Trustability and benchmarking advanced ahead of the physical peer-network underlay. The roadmap therefore uses a maturity scale in addition to release labels.

## Maturity scale

Every substantial subsystem should be described using one of these states:

1. **Defined** — architecture/specification exists.
2. **Implemented** — executable reference code exists.
3. **CI-proven** — automated tests prove the bounded implementation contract.
4. **Bounded real-testnet proven** — exercised across real network processes/hosts in a bounded topology.
5. **Productionized** — operational lifecycle, recovery, durability, security and observability gates are satisfied for the intended deployment class.
6. **Internet-scale proven** — large real-node/WAN/adversarial evidence exists.
7. **Stable** — compatibility and upgrade guarantees are declared for a release/protocol generation.

A subsystem MUST NOT be described at a higher state merely because a design document exists.

## Current snapshot — 2026-08-17

| Area | Current state | Evidence / boundary |
|---|---|---|
| TRUYN/1 logical protocol | Defined / partial implementation | `spec/protocol/v1/`; MVP envelopes and multiple composed behaviors implemented, protocol remains draft |
| v0.1 Connect underlay | Implemented + CI-proven | real QUIC/UDP, authenticated peer sessions, Kademlia RPC/discovery, direct P2P, STUN, same-port hole punching, relay fallback, backpressure |
| Real trust-network slice | Bounded real-testnet proven | four-node libp2p QUIC/Kademlia trust-lifecycle testnet, replicated signed transparency/revocation state, churn and zero-relay verifier path |
| Semantic retrieval | Implemented + extensively CI/benchmark proven | persistent semantic index lifecycle, distributed retrieval, provenance, scale gates through 100k blocks |
| Provider ownership / authorization | Implemented reference baseline | signed provider identity, private-by-default discovery/dispatch filtering, provider-signed requester allowlists, provider-host second check |
| Billing safety boundary | Implemented reference baseline | BYOK/owner-funded fail-closed; sponsored mode requires signed actor entitlement + durable atomic usage store; prepaid/subscription remain closed without resolver |
| BYOK onboarding | Implemented reference CLI | verified provider profiles; secret values are not persisted in the profile |
| Multi-cloud providers | Implemented reference adapters | text/image/video paths across Google/Azure families; availability remains provider/deployment dependent |
| Trustability v1/v2 | Implemented + CI-proven; bounded real-testnet slice proven | claim evidence, provenance/independence, active lifecycle, receipts, revocation-aware trust network |
| Public edge/provider security | Implemented reference controls | fail-closed origin guard, Cloudflare-compatible proxy, protected-provider M2M guard, default-private providers |
| Network productionization | **In progress / next primary gate** | real multi-host cloud exercises are being run; durable public evidence must be published only after a bounded gate is complete |
| Operations / compatibility docs | Implemented documentation baseline in this synchronization | see `docs/operations/`, `docs/security/`, `docs/compatibility/` |
| Mainnet | Not productionized | no stable mainnet compatibility/SLO claim |

Canonical detailed status: `docs/architecture/IMPLEMENTATION_STATUS.md`.

## Security baseline before wider paid-provider coexistence

The following reference protections are already implemented and must remain invariant:

- provider ownership is bound to authenticated/signed provider identity rather than requester-controlled metadata;
- private/owner-only is the provider default at relay and provider-host layers;
- unauthorized providers are filtered before dispatch and checked again before adapter execution;
- BYOK credentials stay at the provider runtime/secret boundary;
- owner-funded capacity does not become public merely because the network is public;
- local-development relay mode cannot coexist with public/production markers;
- oversized HTTP requests close the connection after 413 to prevent keep-alive poisoning;
- origin proof is expiry-bound, supports active/previous rotation and is stripped before the inner relay;
- sponsored execution cannot activate without an actor-bound signed entitlement verifier and an atomic durable usage store;
- benchmark evidence follows redact-not-delete preservation.

Still not complete: rich account/organization tenancy, production commercial entitlement issuance, deployed durable sponsored/prepaid/subscription accounting, full operational IAM/perimeter proof and mainnet governance.

## v0.1 — Connect — **IMPLEMENTED / CI-PROVEN REFERENCE UNDERLAY**

Closed as a reference underlay: **2026-08-17**.

Implemented: cryptographic node identity, real QUIC/UDP, authenticated peer sessions, signed peer/bootstrap records, 256-bit Kademlia routing, networked `PING/FIND_NODE/STORE/FIND_VALUE`, direct signed envelopes, STUN, same-QUIC-socket hole punching, bounded backpressure, explicit relay fallback, `local`/`testnet` profiles and composed `TruynNetworkNode` lifecycle.

Evidence:

- `docs/architecture/NETWORK_UNDERLAY_V01.md`
- `docs/benchmarks/V01_CONNECT_GATE_2026-08-17.md`

This does not imply Internet-scale churn durability, universal NAT traversal or mainnet SLOs.

## Network Productionization Gate — **PRIMARY NEXT GATE**

Before TRUYN is described as a production decentralized network, prove and document:

- repeatable real multi-host public/private testnet operation;
- join/leave/crash/restart churn;
- DHT replication, refresh, repair and expiry under churn;
- durable routing/DHT state across restart where required;
- WAN partition and healing behavior;
- real NAT/reachability matrix across heterogeneous networks;
- relay degradation/outage/fallback recovery;
- durable admission/backpressure/queue behavior;
- measured convergence, packet/byte overhead and p50/p95/p99 recovery/latency;
- 100 simultaneously running real nodes, then 1,000;
- Byzantine provider/log behavior, stale-record floods, Sybil pressure, eclipse attempts and collusion exercises on the real underlay.

Bounded cloud experiments are not automatically durable evidence. Completed gates must be recorded in `docs/benchmarks/` with sanitized reproducibility identity.

## v0.2 — Verify — **SUBSTANTIALLY IMPLEMENTED, NOT INTERNET-SCALE PROVEN**

Implemented reference slices include `CLAIM`, `ATTEST` semantics, active `CHALLENGE → VERIFY → DISPUTE` behavior, provenance/independence handling, `TRUST_RECEIPT`, source-owner delegation, revocation-aware lifecycle and a real four-node QUIC/Kademlia trust testnet.

Remaining: larger adversarial real-network scale, stronger operational PKI lifecycle and stable protocol guarantees.

## v0.3 — Synchronize — **PARTIAL / MIXED**

Content-addressed immutable context/object techniques, persistent semantic indexes, reuse/invalidation and distributed retrieval are implemented and benchmarked. Full generic `STATE`, `DELTA`, `SUBSCRIBE` runtime semantics across the decentralized network are not yet productionized as a complete subsystem.

## v0.4 — Execute & Route — **PARTIAL / MIXED**

Implemented: multiple-provider capability routing paths, authorization-before-dispatch, provider-host execution gates, provider usage/latency metadata and semantic compute routing slices.

Remaining: general `COMPUTE` sandboxing, compute-near-data execution policy, production resource isolation, richer policy ranking and durable commercial attribution.

## v0.5 — Interoperate — **PARTIAL / ACTIVE**

Implemented reference surfaces include MCP, OpenAI/OpenAI-compatible, Anthropic, Azure OpenAI, Vertex Gemini, custom HTTP and additional project reference model-provider adapters. BYOK CLI onboarding exists for supported profiles.

Remaining: stable public SDK surface, broad agent-framework interoperability certification and compatibility matrices across released versions.

## v0.6 — Resist & Scale Trust — **IMPLEMENTED SLICES / SCALE GATE OPEN**

Implemented evidence covers claim-centric provenance/independence, active lifecycle, signed trust receipts, decentralized verifier discovery, signed transparency/revocation state, fork/equivocation detection semantics and bounded adversarial suites.

Remaining: real large-node Byzantine/Sybil/collusion/eclipsing pressure and production revocation/authority operations.

## v0.7 — Measure — **ACTIVE / STRONG EVIDENCE LEDGER**

The repository already contains measured token, latency, request-body, semantic, trust and scale reports. `docs/benchmarks/` is append-only public evidence. 100/1,000-block/node simulations do not substitute for 100/1,000 simultaneously running real WAN nodes.

## v0.8 — Operate — **PARTIAL / DOCUMENTATION BASELINE ESTABLISHED**

Current operations include executable node/relay/provider/testnet paths and cloud test exercises, but production installers, OS service lifecycle, signed updater channels, universal recovery/uninstall and stable rollback are not complete.

See `docs/operations/`.

## v1.0 — Stabilize — **NOT REACHED**

Requires stable `TRUYN/1`, stable compatibility policy, production authorization/tenant/BYOK boundary, production upgrade/rollback, public mainnet bootstrap and documented SDK compatibility.

## Post-v1 research — Capability Economy

Capability price discovery, provider quality/price/trust competition and settlement adapters remain modular research. No mandatory blockchain or single payment rail is required.

## Versioning rule

Software releases (`v0.1.0`, `v1.0.0`) and protocol generations (`TRUYN/1`, `TRUYN/2`) are independent. Current software remains `0.1.0-dev`; `TRUYN/1` remains a draft protocol generation until explicitly stabilized.
