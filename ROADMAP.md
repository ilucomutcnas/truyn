# TRUYN Roadmap

This roadmap describes intended engineering milestones and **factual maturity**, not marketing sequencing. Normative protocol semantics live in `spec/`; canonical implementation status lives in `docs/architecture/IMPLEMENTATION_STATUS.md`; measured claims live in `docs/benchmarks/`; the current engineering execution order lives in `docs/operations/PRODUCTIONIZATION_EXECUTION_PLAN.md`.

**Snapshot:** 2026-08-20  
**Software:** `0.1.0-dev`  
**Protocol generation:** `TRUYN/1` draft

The implementation has not evolved strictly in version order. Semantic retrieval, provider interoperability/security, Trustability and benchmark layers advanced faster than the physical peer-network underlay. The lower network has now caught up substantially: v0.1 Connect is implemented, Class B is accepted, and Class C heterogeneous WAN/reachability is accepted. The active productionization gate is **Class D-100 real-node scale**.

## Maturity scale

Every substantial subsystem should be described with an explicit maturity state:

1. **Defined** — architecture/specification exists.
2. **Implemented** — executable reference code exists.
3. **CI-proven** — automated tests prove the bounded contract.
4. **Bounded real-testnet proven** — exercised across real network processes/hosts in a bounded topology.
5. **Productionized** — operational lifecycle, recovery, durability, security and observability gates are satisfied for the intended deployment class.
6. **Internet-scale proven** — large real-node/WAN/adversarial evidence exists.
7. **Stable** — compatibility and upgrade guarantees are declared.

A design document does not promote implementation maturity. A temporary workflow does not promote a gate. Once implementation/evidence exists, roadmap wording must stop describing that slice as future-only work.

## Current productionization position

```text
v0.1 Connect reference underlay — CLOSED
        ↓
Class B real multi-host — ACCEPTED / PASS
        ↓
Class C heterogeneous WAN / NAT / relay — ACCEPTED / PASS
        ↓
Class D-100 real nodes — ACTIVE ACCEPTANCE GATE
        ↓
Class D-1000 real nodes — OPEN
        ↓
randomized heterogeneous adversarial campaign — OPEN
        ↓
operational / durability / SRE / distribution closure — OPEN
        ↓
stable TRUYN/1 + production mainnet — NOT REACHED
```

### Current D-100 acceptance state

The pinned V14 acceptance workflow started as GitHub Actions run `32367799512`, testing immutable commit `b835c8fa0283a004d616ce8d25d7aa78cee1a1c0`. At this documentation snapshot, immutable security/acceptance preflight and Azure login had passed and the real four-host / 100-node campaign was still running.

This status is intentionally written as **active / not yet accepted**. D-100 is promoted only after campaign success, canonical evaluator rc=0, terminal verifier rc=0, cleanup proof and durable sanitized evidence under `docs/benchmarks/`.

## Current subsystem snapshot

| Area | Current maturity / factual boundary |
|---|---|
| TRUYN/1 logical protocol | Defined + substantial implementation; still draft |
| v0.1 Connect underlay | Implemented + CI-proven |
| Signed peer-record lifecycle | Implemented + CI-proven, including durable renewal/dissemination/repair and expired durable recovery hints |
| Kademlia/DHT durability and repair | Implemented reference slices + CI/real-testnet evidence |
| Class B real multi-host | **ACCEPTED / PASS** |
| Class C heterogeneous WAN/reachability | **ACCEPTED / PASS** |
| Class D-100 real-node scale | Harness/evaluator implemented; **acceptance run active, no durable PASS yet** |
| Class D-1000 real-node scale | Provisioning/campaign/evaluator scaffolding exists; no accepted evidence |
| Semantic retrieval/index/distributed retrieval | Implemented + extensive CI/benchmark evidence |
| Provider ownership/authorization/BYOK | Implemented reference baseline + negative tests |
| Billing safety | BYOK/owner-funded implemented; sponsored activation requires signed entitlement + durable atomic usage store; prepaid/subscription fail closed |
| Trustability v1/v2 | Implemented + CI/benchmark evidence; bounded real-network trust slice proven |
| Multi-cloud text/image/video providers | Implemented reference adapter paths; individual cloud entitlement/quota may block deployments |
| Operations / compatibility / separate security docs | Baseline implemented; production lifecycle still incomplete |
| Mainnet | Not productionized / not stable |

## Accepted Class C boundary

Permanent evidence: `docs/benchmarks/CLASS_C_HETEROGENEOUS_WAN_2026-08-18.md`.

Class C now proves, within the accepted bounded topology:

- two cloud providers and two regions;
- direct GCP → Azure QUIC with zero relay calls on the direct path;
- real packet-path UDP partition and heal;
- real Azure NAT gateway with a private node carrying no public IP and observed NAT source;
- two-layer double-NAT / CGNAT-like outbound path;
- authenticated relay fallback for a NAT-hidden target;
- relay outage fail-closed;
- relay recovery;
- successful ephemeral cleanup.

It does **not** claim carrier-operated field CGNAT, 100/1,000 real-node scale, randomized long-duration adversarial resilience, Internet-scale throughput or production SLO closure.

## Immediate critical path

The current critical path is intentionally narrow:

1. **finish and terminally evaluate Class D-100 V14**;
2. if PASS, preserve immutable/sanitized D-100 evidence and return the resulting source/evidence tree to normal security-green CI;
3. regression-pin the accepted Class C contract against the then-current network implementation after D-100 fixes;
4. run accepted Class D-1000 with real processes/identities/QUIC sockets and post-cleanup evidence;
5. run repeated randomized adversarial campaigns across heterogeneous failure domains;
6. close durability/operations/SRE/install/update/compatibility gaps;
7. stabilize TRUYN/1 and public mainnet semantics.

Do not substitute more semantic benchmark scale for real network scale.

## Network Productionization Gate — PRIMARY

### Closed prerequisites

- [x] cryptographic node identity independent of IP address;
- [x] real QUIC/UDP underlay;
- [x] authenticated signed peer sessions;
- [x] Kademlia discovery/state RPC;
- [x] direct-first signed TRUYN envelope path with explicit relay fallback;
- [x] STUN and same-port hole-punch reference path;
- [x] repeatable real multi-host testnet — Class B;
- [x] crash/restart identity and durable routing/DHT state reference slice;
- [x] DHT replication, quorum and repair reference slice;
- [x] automatic signed peer-record renewal before expiry;
- [x] renewed sequence persisted before dissemination;
- [x] authenticated peer-record announcement and later-contact PING repair;
- [x] stale P2P/DHT-RPC client invalidation on newer signed peer state;
- [x] durable bounded admission/backpressure process-restart reference slice;
- [x] heterogeneous Azure/GCP failure domains — Class C;
- [x] packet-path WAN partition/heal — Class C;
- [x] real cloud NAT observation — Class C;
- [x] double-NAT / CGNAT-like emulation — Class C;
- [x] authenticated relay outage/fallback/recovery — Class C.

### Open productionization gates

- [ ] accepted 100 simultaneously running real network nodes;
- [ ] accepted 1,000 simultaneously running real network nodes;
- [ ] randomized long-running churn/partition/Byzantine/Sybil/eclipse/collusion campaigns;
- [ ] carrier-field NAT/CGNAT validation where practical/required;
- [ ] replicated accepted-work survival after underlying host/volume loss;
- [ ] production SLO/observability/incident closure;
- [ ] production distribution/update/rollback lifecycle;
- [ ] stable mainnet compatibility and bootstrap policy.

### Class D-100 canonical contract

Current evaluator requires:

- exactly 100 real nodes;
- exactly 100 distinct identities;
- exactly 100 distinct QUIC sockets;
- at least 4 host failure domains;
- baseline routing ≥99%;
- healed routing ≥99%;
- recovery p95 ≤120 seconds;
- convergence p95 ≤120 seconds;
- zero acknowledged write loss;
- zero invalid signed state accepted;
- zero stale revoked receipt accepted;
- churn, packet partition, Byzantine, Sybil, eclipse and collusion phases exercised;
- cleanup complete.

No lowered-threshold PASS is acceptable.

### Class D-1000 canonical default contract

The implemented evaluator defaults require:

- exactly 1,000 real nodes / distinct identities / distinct QUIC sockets;
- at least 10 host failure domains;
- routing ≥99%;
- recovery p95 ≤180 seconds;
- convergence p95 ≤180 seconds;
- zero acknowledged write loss;
- cleanup complete.

The existence of D-1000 scripts does not mean the gate is closed.

## Provider/security baseline — MUST REMAIN INVARIANT

The current reference implementation already enforces the following core boundary and network-scale work must not weaken it:

1. provider ownership bound to signed/authenticated provider identity, not requester-controlled metadata;
2. low-level provider policy defaults to `owner-only`;
3. authorization-aware provider discovery and dispatch;
4. provider-host second authorization before adapter execution;
5. BYOK/private provider credentials remain local/provider-runtime concerns;
6. billing responsibility/entitlement checked before chargeable execution;
7. owner-funded public execution denied without explicit policy;
8. public network registration/dispatch require explicit master opt-in;
9. legacy/fast/WebSocket/MCP paths do not bypass the central policy;
10. sponsored mode cannot activate without actor-bound signed entitlement verification and durable atomic usage accounting;
11. local-development mode cannot coexist with public/production relay markers;
12. oversized HTTP body closes the connection after 413;
13. origin proof is expiry-bound/rotation-capable;
14. benchmark evidence is redact-not-delete.

These controls are reference/CI security boundaries, not a claim that rich commercial account/organization tenancy or production cloud perimeter operations are complete.

## v0.1 — Connect — **IMPLEMENTED / CI-PROVEN REFERENCE UNDERLAY**

Closed: **2026-08-17**.

- [x] cryptographic node identity;
- [x] real QUIC/UDP;
- [x] authenticated peer sessions;
- [x] signed bootstrap/peer records;
- [x] Kademlia routing and iterative discovery;
- [x] networked `PING`, `FIND_NODE`, `STORE`, `FIND_VALUE`;
- [x] direct signed envelope communication;
- [x] direct-first routing + relay fallback;
- [x] STUN and same-port hole-punch path;
- [x] bounded backpressure;
- [x] `OFFER`, `NEED`, `RESULT`, minimal `REVOKE`;
- [x] composed `TruynNetworkNode` lifecycle.

Later productionization work has strengthened persistence/renewal/repair but does not change the historical v0.1 acceptance meaning.

## v0.2 — Verify — **SUBSTANTIALLY IMPLEMENTED / LARGE REAL-NETWORK GATE OPEN**

Implemented/evidenced slices include:

- `CLAIM`, `ATTEST` reference semantics;
- challenge/verify/dispute behaviors;
- domain/claim-scoped Trustability;
- signed provenance/source-lineage independence;
- trust evidence aggregation and `TRUST_RECEIPT`;
- bounded decentralized verifier discovery and replicated trust lifecycle state.

Still open: larger real-node adversarial scale, stronger production authority/revocation operations and stable protocol guarantees.

## v0.3 — Synchronize — **PARTIAL / MIXED**

Implemented/evidenced:

- content-addressed context techniques;
- persistent semantic index lifecycle;
- immutable-vector reuse;
- incremental roots/invalidation;
- distributed immutable-root retrieval.

Still broader than implemented:

- generic network-wide `STATE`/`DELTA`/`SUBSCRIBE` runtime semantics and stable lifecycle guarantees.

## v0.4 — Execute & Route — **PARTIAL / MIXED**

Implemented/evidenced reference slices:

- multiple-provider capability routing;
- authorization-before-ranking/dispatch;
- provider-host security/billing gates;
- semantic routing;
- provider usage/latency metadata;
- cost/trust/privacy policy inputs in architecture.

Open:

- general `COMPUTE` sandbox/resource isolation;
- complete compute-near-data execution;
- production durable commercial attribution/control plane.

## v0.5 — Interoperate — **PARTIAL / ACTIVE**

Implemented reference surfaces include:

- MCP;
- HTTP/custom-provider paths;
- OpenAI/OpenAI-compatible;
- Anthropic;
- Azure OpenAI/Foundry model families;
- Vertex Gemini/image/Veo reference paths;
- BYOK CLI profiles for supported providers;
- multi-cloud text/image/video adapters;
- public adapter/SDK building blocks.

Open: broad ecosystem certification and stable public SDK compatibility promises.

## v0.6 — Resist & Scale Trust — **IMPLEMENTED SLICES / LARGE REAL-NETWORK GATE OPEN**

Implemented/evidenced slices include provenance/independence, active trust lifecycle, receipts, decentralized placement/read quorum, signed transparency/revocation state and bounded Byzantine/equivocation handling.

Open: large real-network Sybil/eclipse/collusion resistance under declared attacker budgets and long-duration operation.

## v0.7 — Measure — **ACTIVE / STRONG EVIDENCE LEDGER**

- [x] token/latency/request-body/context-efficiency benchmarks;
- [x] semantic accuracy/stability/scale/load evidence;
- [x] distributed retrieval and Trustability evidence;
- [x] provider-security negative evidence;
- [x] v0.1 underlay evidence;
- [x] Class B multi-host evidence;
- [x] Class C heterogeneous WAN/NAT/relay evidence;
- [ ] accepted Class D-100 real-node evidence;
- [ ] accepted Class D-1000 real-node evidence;
- [ ] repeated large real-WAN adversarial distributions.

Infrastructure-scale semantic blocks and simulated nodes must never be described as simultaneously running real network nodes.

## v0.8 — Operate — **PARTIAL**

Implemented/reference:

- executable node/relay/provider/testnet paths;
- persistent identity/network state slices;
- operations/security/compatibility documentation baseline;
- cloud testnet orchestration/evidence tooling;
- cleanup discipline for ephemeral gates.

Open:

- verified installers for Windows/macOS/Linux;
- stable `truynd` service lifecycle;
- signed updater channels;
- compatibility preflight/migrations/rollback;
- production SLO/monitoring/on-call/runbook closure;
- stable public mainnet operations.

## v1.0 — Stabilize — **NOT REACHED**

Required before v1.0/stable TRUYN/1:

- productionized network scale/recovery/security/operations gates;
- stable TRUYN/1 protocol contract;
- stable node identity/provider policy/object/state/execution/Trustability contracts;
- stable `local` / `testnet` / `mainnet` semantics;
- production-grade authorization/tenant/BYOK boundary for intended commercial modes;
- production-grade upgrade/rollback contract;
- public mainnet bootstrap;
- documented stable SDK/compatibility policy.

## Post-v1 research track — Capability Economy

- capability price discovery;
- provider quality/price/trust competition;
- optional settlement adapters;
- resource accounting/receipts;
- explicit provider-owner entitlements for cross-owner execution;
- no mandatory blockchain or single payment rail.

## Evidence discipline

`docs/benchmarks/` is the durable public evidence ledger. A gate is not promoted because a workflow exists or because an Actions artifact temporarily exists. A durable report should preserve, when safe:

- tested commit SHA;
- run/workflow identity;
- artifact identity/digest;
- topology/workload;
- fixed acceptance thresholds;
- measured results;
- limitations/corrections;
- cleanup result.

Security cleanup redacts sensitive values; it does not delete measured reports.

## Versioning rule

Software releases (`v0.1.0`, `v1.0.0`) and network protocol generations (`TRUYN/1`, `TRUYN/2`) remain separate. A newer node may support multiple protocol generations simultaneously. Current software remains `0.1.0-dev`; `TRUYN/1` remains draft until explicitly stabilized.