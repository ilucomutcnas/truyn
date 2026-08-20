# TRUYN Implementation Status

**Status:** canonical factual status index.  
**Snapshot date:** 2026-08-20  
**Software version:** `0.1.0-dev`  
**Protocol generation:** `TRUYN/1` draft

This document answers one question: **what is actually implemented and proven now, versus only designed, active, or planned?**

Architecture documents define contracts. Benchmark reports prove bounded claims. `ROADMAP.md` describes maturity sequencing. `docs/operations/PRODUCTIONIZATION_EXECUTION_PLAN.md` describes the current execution order.

## Status vocabulary

- **Defined** — architecture/spec exists.
- **Implemented** — executable reference code exists.
- **CI-proven** — bounded automated tests prove the contract.
- **Bounded real-testnet proven** — exercised across real network processes/hosts in a bounded topology.
- **Accepted productionization gate** — the declared gate evaluator/terminal contract passed and durable evidence exists.
- **Productionized** — operational lifecycle, recovery, durability, security and observability gates are satisfied for the intended deployment class.
- **Internet-scale proven** — large real-node/WAN/adversarial evidence exists.
- **Stable** — compatibility guarantees are declared.

`Active` / `in progress` is not a maturity promotion.

## Executive snapshot

| Productionization class | Status | Durable evidence |
|---|---|---|
| v0.1 Connect lower-network reference gate | **CLOSED** | `V01_CONNECT_GATE_2026-08-17.md` |
| Class B real multi-host | **ACCEPTED / PASS** | `NETWORK_PRODUCTIONIZATION_AZURE_4HOST_2026-08-17.md` |
| Class C heterogeneous WAN/reachability | **ACCEPTED / PASS** | `CLASS_C_HETEROGENEOUS_WAN_2026-08-18.md` |
| Class D-100 real-node scale/adversarial | **ACTIVE / NOT YET ACCEPTED** | only historical failed attempt is durable at snapshot |
| Class D-1000 real-node scale | **OPEN** | none |
| randomized long-duration heterogeneous adversarial campaign | **OPEN** | none |
| production operations/stability/mainnet | **OPEN** | none |

### Current Class D-100 acceptance run

Pinned V14 run: `32367799512`  
Tested immutable commit: `b835c8fa0283a004d616ce8d25d7aa78cee1a1c0`

At the documentation snapshot:

- immutable security/acceptance preflight — **PASS**;
- Azure login — **PASS**;
- real four-host / 100-node campaign — **in progress**;
- canonical post-cleanup evaluator — pending;
- strict terminal verifier — pending;
- durable accepted report — absent.

Therefore Class D-100 remains **open**. No other document may call it accepted until terminal PASS evidence is preserved.

## System status matrix

| Subsystem | Architecture | Implementation | Evidence | Current limitation / next gate |
|---|---|---|---|---|
| Node identity / signed envelopes | Defined | Implemented | CI-proven | protocol still draft |
| QUIC underlay | Defined | Implemented | CI + real-host proven | larger real-node scale/long-run SLOs open |
| Authenticated peer sessions | Defined | Implemented | CI + real-host proven | Internet/open-network longevity open |
| Signed peer-record lifecycle | Defined | Implemented | CI-proven renewal, persistence-before-dissemination, announce/PING repair, stale-client invalidation and durable expired recovery hints | large churn scale distributions open |
| Kademlia discovery/state RPC | Defined | Implemented | CI + real-host evidence | D-100/D-1000 scale acceptance open |
| Direct-first P2P + relay fallback | Defined | Implemented | CI + Class C real-WAN proof | larger heterogeneous scale/SLOs open |
| STUN / same-port hole punching | Defined | Implemented reference path | CI-proven bounded path | universal NAT traversal not claimed |
| Real cloud NAT / double-NAT reachability | Defined | Implemented/test harness | **Class C accepted** | carrier-operated field CGNAT not claimed |
| Packet-path partition/heal | Defined | Implemented/test harness | **Class C accepted** | randomized/asymmetric long-duration partitions open |
| Relay outage/fallback/recovery | Defined | Implemented | **Class C accepted** | production SLO distributions open |
| Durable routing/network state | Defined | Implemented reference slice | CI/real-host evidence | host/volume loss durability broader than process restart |
| DHT replication/quorum/repair | Defined | Implemented reference slice | CI/Class B evidence | larger scale and adversarial placement pressure open |
| Bounded admission/backpressure | Defined | Implemented | CI-proven | larger distributed overload/soak evidence open |
| Durable accepted-work inbox | Defined | Implemented process-restart slice | CI-proven | underlying host/volume loss replication not proven |
| Semantic index lifecycle | Defined | Implemented | benchmark/CI proven | broader operational SLOs open |
| Semantic retrieval v2/v3 | Defined | Implemented | extensive benchmark evidence | semantic block scale is not real-node scale |
| Distributed semantic retrieval | Defined | Implemented | benchmark/CI proven | larger decentralized holder networks open |
| Byzantine read-quorum placement | Defined | Implemented reference slice | benchmark/CI proven | large open-network adversarial scale open |
| Claim-centric Trustability | Defined | Implemented | CI/benchmark proven | calibration/authority operations continue |
| Active trust lifecycle | Defined | Implemented | CI/benchmark proven | production authority/revocation operations open |
| QUIC/Kademlia trust network | Defined | Implemented | bounded four-node real-testnet proven | D-100/D-1000 + randomized adversarial WAN open |
| Provider ownership | Defined | Implemented node-level reference boundary | negative-test proven | rich account/org tenant control plane open |
| Provider discovery authorization | Defined | Implemented | negative-test proven | richer grant policy/control plane open |
| Provider-host access control | Defined | Implemented | negative-test proven | stable commercial account binding open |
| BYOK | Defined | Implemented reference CLI/runtime flow | tests/live provider work | OS-native secure-store integration incomplete |
| Owner-funded billing safety | Defined | Implemented | fail-closed tests | production accounting/tenant attribution open |
| Sponsored billing | Defined | guard implementation exists | activation requires signed entitlement + durable atomic usage store | issuer/store deployment open |
| Prepaid/subscription billing | Defined | fail-closed placeholder | denies without resolver | entitlement resolver/accounting not implemented |
| Origin guard / edge proxy | Defined | Implemented reference controls | security tests/evaluation | deployment-specific direct-origin proof remains operational |
| Protected-provider M2M guard | Defined | Implemented | regression proven | live token issuance/rotation deployment-specific |
| Multi-cloud text/image/video adapters | Defined | Implemented reference paths | smoke/benchmark evidence for available deployments | cloud entitlement/quota may block individual models |
| MCP / HTTP / compatibility bridges | Defined | Implemented reference paths | tests/interoperability evidence | stable broad ecosystem certification open |
| General `COMPUTE` sandbox | Defined | Partial | bounded components only | resource isolation/compute-near-data productionization open |
| Operations documentation | Defined | baseline implemented | current docs layer | SRE/install/update/mainnet closure open |
| Compatibility documentation | Defined | baseline implemented | current docs layer | no stable TRUYN/1 promise yet |
| D-100 harness/evaluator | Defined | Implemented | preflight active; historical failures preserved | accepted terminal evidence pending |
| D-1000 harness/evaluator | Defined | Implemented scaffolding | no accepted real-node result | run accepted real 1,000-node gate |
| Mainnet | Defined conceptually | Not productionized | none | scale + adversarial + operational + stability gates |

## Accepted Class B

Permanent report: `docs/benchmarks/NETWORK_PRODUCTIONIZATION_AZURE_4HOST_2026-08-17.md`.

Accepted boundary includes four independent host runtimes/identities/endpoints, direct signed NEED over public UDP/QUIC with zero relay calls, DHT RF=3 replication, remote read, real holder-process failure, replacement repair, restart identity/sequence continuity, stale-client invalidation and cleanup.

Class B did not by itself prove WAN packet-path loss, NAT/CGNAT or scale.

## Accepted Class C

Permanent report: `docs/benchmarks/CLASS_C_HETEROGENEOUS_WAN_2026-08-18.md`.

Accepted boundary includes:

- two cloud providers / two cloud regions;
- direct cross-cloud QUIC before fallback, zero relay calls on direct path;
- real packet-path UDP partition with observed drop counters;
- heal and restored direct QUIC;
- real Azure NAT gateway and observed translated source;
- private NAT node with no public IP;
- two-layer double-NAT / CGNAT-like outbound path;
- authenticated signed relay fallback;
- relay outage fail-closed;
- relay recovery;
- cleanup PASS.

Explicit limitation: `carrierCgnatFieldValidated=false` in the accepted boundary.

## Active Class D-100 gate

The canonical evaluator in `benchmarks/scale/class-d.js` requires all of the following:

- 100 real nodes;
- 100 distinct identities;
- 100 distinct QUIC sockets;
- ≥4 host failure domains;
- baseline routing ≥99%;
- healed routing ≥99%;
- recovery p95 ≤120s;
- convergence p95 ≤120s;
- zero acknowledged write loss;
- zero invalid signed state accepted;
- zero stale revoked receipt accepted;
- churn exercised;
- packet partition exercised;
- Byzantine behavior exercised;
- Sybil pressure exercised;
- eclipse behavior exercised;
- collusion exercised;
- cleanup complete.

The evaluator thresholds are part of the acceptance contract. A run with weakened values does not count as Class D-100 acceptance.

## D-1000 implementation boundary

The repository contains real-cloud D-1000 provisioning/campaign/evidence scaffolding and a canonical evaluator. That is **implementation readiness**, not evidence maturity.

Default D-1000 evaluator requirements are 1,000 real nodes/identities/QUIC sockets, ≥10 hosts, ≥99% routing, recovery/convergence p95 ≤180s, zero acknowledged write loss and complete cleanup.

No accepted D-1000 report exists at this snapshot.

## Implemented security baseline

The current reference implementation enforces these core invariants:

1. provider access defaults to `owner-only` at low-level policy and provider runtime;
2. unauthorized private providers are filtered before dispatch and checked again before adapter execution;
3. provider ownership is derived from authenticated/signed provider identity, not requester-controlled owner metadata;
4. owner-funded and BYOK providers remain private by default;
5. public provider execution requires explicit opt-in and does not bypass billing policy;
6. public network registration/dispatch are independently gated;
7. local development hard-fails when combined with public/production relay markers;
8. oversized HTTP input closes the connection after 413;
9. origin proof is expiry-bound, rotation-capable and stripped before forwarding inward;
10. protected-provider M2M proof is transport-only and stripped before inner relay;
11. sponsored mode cannot activate without an actor-bound signed entitlement verifier and durable atomic usage store;
12. benchmark evidence follows redact-not-delete preservation rules.

Scale work must not weaken this boundary.

## Evidence discipline

A claim is promoted only when a durable public benchmark/security report exists or the repository CI contract is explicitly referenced. Temporary cloud workflows and Actions artifacts are mechanisms, not the durable evidence ledger.

`docs/benchmarks/` remains append-only evidence. Sensitive fields are redacted; measured reports are not deleted as a shortcut.

The first historical Class D-100 attempt remains preserved as a negative/unaccepted report. A future accepted D-100 run must create a **new durable report**, not overwrite that failure.

## Current priority

The primary engineering priority is **real-network productionization and scale**, not additional semantic sophistication:

```text
Class B — PASS
        ↓
Class C — PASS
        ↓
Class D-100 — active acceptance gate
        ↓
security-green evidence commit + Class C regression pin
        ↓
Class D-1000
        ↓
randomized adversarial heterogeneous campaigns
        ↓
operational/durability/SRE/distribution closure
        ↓
stable TRUYN/1 / production mainnet
```

Until those gates are passed, describe TRUYN as an advanced experimental/reference intelligence-network implementation with strong bounded evidence — **not** as a production mainnet or Internet-scale-proven network.