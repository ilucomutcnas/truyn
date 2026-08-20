# TRUYN Productionization Execution Plan

**Canonical execution snapshot:** 2026-08-20  
**Software:** `0.1.0-dev`  
**Protocol:** `TRUYN/1` draft  
**Current productionization position:** Class B **PASS** → Class C **PASS** → Class D-100 **active acceptance gate**.

This document is the operational engineering plan for moving the current reference/testnet implementation toward a productionized and eventually stable TRUYN network. It is subordinate to the normative protocol in `spec/`, but authoritative for the **current execution order** together with `ROADMAP.md` and `docs/architecture/IMPLEMENTATION_STATUS.md`.

## Governing rule

A stage is closed only when all three exist:

1. executable implementation;
2. the canonical evaluator/acceptance contract passes without weakened thresholds;
3. durable sanitized evidence is committed to `docs/benchmarks/` with tested commit/run/artifact identity where safe.

A script, simulation, successful provisioning step, partial workflow or temporary Actions artifact does **not** close a gate.

Historical failed attempts are preserved. Security cleanup follows **redact-not-delete** for benchmark evidence.

## Current factual baseline

Closed and durable:

- v0.1 real QUIC/UDP + authenticated sessions + Kademlia underlay;
- signed peer-record lifecycle, restart durability, replication/quorum/repair and bounded admission slices;
- Class B four-host real multi-host testnet;
- Class C heterogeneous Azure/GCP WAN/reachability acceptance;
- provider ownership/default-private authorization/BYOK reference boundary;
- semantic retrieval/distributed retrieval and Trustability evidence lines;
- multi-cloud text/image/video provider adapter reference paths.

Open at this snapshot:

- accepted Class D-100 evidence;
- accepted Class D-1000 evidence;
- larger randomized adversarial/WAN campaign;
- replicated accepted-work survival after underlying host/volume loss;
- long-running production SLO/observability/incident closure;
- production installers/updater/rollback and stable compatibility contracts;
- stable public mainnet.

## Gate 1 — close Class D-100

**Status:** ACTIVE. The pinned V14 acceptance run started as GitHub Actions run `32367799512`, testing immutable commit `b835c8fa0283a004d616ce8d25d7aa78cee1a1c0`. At the 2026-08-20 documentation snapshot, immutable preflight and Azure login had passed and the real 4-host/100-node campaign was still running. This is **not yet a PASS claim**.

Canonical D-100 thresholds in `benchmarks/scale/class-d.js`:

| Predicate | Required |
|---|---:|
| real running nodes | exactly 100 |
| distinct TRUYN identities | exactly 100 |
| distinct QUIC sockets | exactly 100 |
| host failure domains | ≥4 |
| baseline routing success | ≥99% |
| healed routing success | ≥99% |
| recovery p95 | ≤120,000 ms |
| convergence p95 | ≤120,000 ms |
| acknowledged write loss | 0 |
| invalid signed state accepted | 0 |
| stale revoked receipt accepted | 0 |
| churn exercised | required |
| packet partition exercised | required |
| Byzantine behavior exercised | required |
| Sybil pressure exercised | required |
| eclipse behavior exercised | required |
| collusion exercised | required |
| cleanup complete | required |

The current deterministic campaign selector uses explicit churn/partition/Byzantine/Sybil/eclipse/collusion subsets; acceptance depends on measured evidence, not merely selecting those actors.

### D-100 terminal acceptance procedure

1. run against a pinned immutable tested commit;
2. run full security/regression preflight on that commit;
3. provision the real 100-node topology;
4. execute baseline routing and all required adversarial phases;
5. execute heal/recovery/convergence measurements;
6. clean up ephemeral infrastructure;
7. run `evaluate-class-d-evidence.js`;
8. run `verify-class-d-terminal.js`;
9. require campaign success + evaluator rc=0 + terminal rc=0;
10. preserve sanitized evidence and artifact digest in `docs/benchmarks/`;
11. run normal repository CI again on the documentation/evidence commit.

If any predicate fails, preserve the failure, fix the root cause and start a fresh immutable acceptance run. Do not lower thresholds to obtain a PASS.

## Gate 2 — return current main to security-green with D-100 evidence

After an accepted D-100 run:

- commit the durable benchmark report and safe identifiers;
- keep temporary privileged benchmark workflows out of permanent `main`;
- require the normal public CI/security suite green on the resulting source + evidence tree;
- verify benchmark evidence protection tests still pass;
- verify provider access remains owner-private/default-deny and no benchmark change opens paid providers.

This gate prevents a valid benchmark against an older pinned SHA from being mistaken for proof that the later documentation/evidence tree is also security-green.

## Gate 3 — regression-pin Class C on the then-current network implementation

Class C is already accepted and remains durable evidence. After D-100 fixes, rerun the same Class C acceptance contract against the then-current implementation to prove no regression in:

- heterogeneous Azure/GCP failure domains;
- direct cross-cloud QUIC with zero relay use on the direct path;
- real packet-path partition + healing;
- real cloud NAT source observation;
- double-NAT / CGNAT-like outbound path;
- authenticated relay fallback;
- relay outage fail-closed;
- relay recovery;
- cleanup.

This is a regression proof, **not** a redefinition of Class C. Carrier-operated field CGNAT remains a separate limitation unless independently tested.

## Gate 4 — Class D-1000 real-node scale

The repository already contains D-1000 provisioning/campaign/evidence scaffolding, but the gate remains open until accepted evidence exists.

Canonical evaluator defaults:

| Predicate | Required |
|---|---:|
| real running nodes | exactly 1,000 |
| distinct TRUYN identities | exactly 1,000 |
| distinct QUIC sockets | exactly 1,000 |
| host failure domains | ≥10 |
| baseline routing success | ≥99% |
| recovery p95 | ≤180,000 ms |
| convergence p95 | ≤180,000 ms |
| acknowledged write loss | 0 |
| cleanup complete | required |

A 1,000-row simulation, virtual-node object graph or semantic-block benchmark does not count.

Before paid cloud execution:

- estimate bounded resource/cost envelope;
- verify quota/capacity and cleanup paths;
- pin the exact tested commit;
- preserve the same post-cleanup terminal evidence discipline used for D-100.

## Gate 5 — randomized adversarial campaign

After accepted D-100 and D-1000 scale proofs, move from a bounded fixed acceptance scenario to randomized repeated campaigns across heterogeneous failure domains.

Required pressure classes:

- randomized join/leave/crash/restart churn;
- partial and asymmetric packet partitions;
- stale signed peer-record floods;
- Byzantine DHT/state/provider responses;
- Sybil identity pressure with declared attacker budget;
- eclipse attempts against selected victims;
- collusion/correlated attestation behavior;
- relay degradation/outage/recovery;
- bootstrap loss;
- host/volume loss;
- overload/backpressure and queue recovery;
- invalid/revoked trust state propagation.

Collect distributions rather than single values:

- routing success;
- convergence and recovery p50/p95/p99;
- direct-vs-relay share;
- packet/byte overhead;
- retransmission/failure rates;
- DHT repair and quorum behavior;
- stale/invalid state acceptance count;
- acknowledged-work/data loss;
- CPU/memory/file-descriptor pressure where meaningful.

## Gate 6 — operational and stability closure

Scale alone is not production readiness. Before `mainnet` can be called productionized, close:

### Runtime durability

- replicated accepted-work survival after underlying host/volume loss;
- documented idempotency/replay boundary for external side effects;
- bounded recovery from partial durable-state corruption;
- durable peer/DHT migration and rollback behavior.

### Observability / SRE

- stable health/readiness semantics;
- metrics and logs sufficient to diagnose routing, reachability, quorum, queue and provider failures without leaking secrets;
- declared testnet/mainnet SLOs;
- alerting and incident runbooks;
- capacity planning and resource ceilings;
- long-duration soak evidence.

### Distribution / upgrades

- verified Windows/macOS/Linux installers;
- service registration lifecycle for `truynd`;
- signed update channels;
- compatibility preflight;
- storage/config migrations;
- rollback and recovery path;
- uninstall/data-retention contract.

### Security / control plane

- production account/org/tenant authority where commercial sharing is used;
- deployed durable atomic accounting for any sponsored/prepaid/subscription mode before activation;
- production edge/origin/provider-backchannel proof and rotation operations;
- incident/revocation procedures;
- no implicit cross-owner provider entitlement.

## Gate 7 — stabilize TRUYN/1 / v1.0

Only after the productionization gates above:

- freeze stable TRUYN/1 compatibility guarantees;
- declare supported node/protocol/wire/storage compatibility matrix;
- publish stable SDK/adapter contract;
- publish production mainnet bootstrap and upgrade policy;
- cut a stable software release.

Software versioning and protocol generation remain separate.

## Explicit non-goals before these gates close

Do not divert the critical path into:

- expanding semantic benchmark scale merely to substitute for real-node scale;
- adding more AI model families without a concrete interoperability need;
- declaring a capability marketplace before entitlement/accounting is productionized;
- optimizing benchmark thresholds downward;
- calling a public relay a public AI provider;
- treating temporary cloud workflows as permanent operations.

## Canonical execution order

```text
Class B real multi-host — PASS
        ↓
Class C heterogeneous WAN/NAT/relay — PASS
        ↓
Class D-100 real nodes — ACTIVE / acceptance pending
        ↓
security-green source + durable D-100 evidence
        ↓
Class C regression pin on current implementation
        ↓
Class D-1000 real nodes
        ↓
randomized heterogeneous adversarial campaign
        ↓
operational / durability / SRE / distribution closure
        ↓
stable TRUYN/1 + production mainnet
```

## Status synchronization rule

When a gate materially changes, update together in the same documentation synchronization:

- `README.md` current status;
- `ROADMAP.md`;
- `docs/architecture/IMPLEMENTATION_STATUS.md`;
- `docs/architecture/NETWORK_PRODUCTIONIZATION_GATE.md`;
- this execution plan;
- `docs/operations/TESTNET_OPERATIONS.md` where operational sequencing changes;
- `docs/benchmarks/README.md` when durable evidence is added;
- `CHANGELOG.md`.

Historical benchmark reports remain historical; correct them only through explicit append-only correction/redaction semantics.