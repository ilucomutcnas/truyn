# TRUYN Network Productionization Gate

**Status:** IN PROGRESS — Class B **PASS**, Class C **PASS**, Class D-100 **active acceptance gate**.  
**Snapshot:** 2026-08-20.

This gate starts after v0.1 Connect. Its purpose is not to add semantic intelligence. Its purpose is to prove that the lower network remains useful and safe under real process, host, route, NAT, storage, scale and adversarial failures.

## Governing rule

A network feature is not productionized because a class, script or simulation exists. Every productionization slice requires executable failure injection, fixed acceptance criteria and preserved evidence. A later slice does not waive a failed earlier slice.

Accepted benchmark reports are durable evidence. Historical failures remain preserved. Security cleanup redacts sensitive values; it does not erase reports.

## Evidence classes

### Class A — real protocol/process evidence on one host

Independent cryptographic identities and real QUIC/UDP sockets may run on one CI host. This is valid for deterministic protocol, persistence, timeout, failure-controller and regression proof. It is **not WAN proof** and is **not real-node-scale proof**.

### Class B — real multi-host public/private testnet — **ACCEPTED**

Independent cloud hosts/processes with distinct externally routable endpoints. Packets leave the source host/process boundary.

Permanent evidence: `docs/benchmarks/NETWORK_PRODUCTIONIZATION_AZURE_4HOST_2026-08-17.md`.

Accepted Class B proved:

- four independent VM runtimes;
- four distinct signed TRUYN identities;
- four distinct externally routable QUIC endpoints;
- direct signed NEED over public UDP/QUIC with zero relay calls;
- measured direct NEED latency of 81 ms in the accepted run;
- injected peer partition fail-closed + heal;
- 3-of-3 DHT replication acknowledgement;
- remote replica read;
- real remote-holder process stop;
- replacement repair to three acknowledgements in 5,097 ms;
- restart identity continuity + advanced peer-record sequence;
- stale DHT client invalidation/reconnection;
- ephemeral cleanup PASS.

Class B did not claim packet-path WAN loss, NAT/CGNAT or 100/1,000-node scale.

### Class C — heterogeneous WAN and reachability — **ACCEPTED**

Independent cloud providers/regions plus real packet-path/NAT/fallback behavior.

Permanent evidence: `docs/benchmarks/CLASS_C_HETEROGENEOUS_WAN_2026-08-18.md`.

Accepted Class C proved:

- two cloud providers and two regions;
- four real node runtimes in the bounded proof;
- direct GCP Cloud Run → Azure QUIC before relay fallback;
- zero relay calls on the accepted direct cross-cloud path;
- real packet-path UDP drop rule with packet counters;
- 34 dropped packets observed during the accepted partition;
- direct-path heal in 513 ms;
- real Azure NAT gateway;
- private NAT node with no public IP;
- translated NAT source observed at destination;
- 20 NAT packets observed;
- reverse direct reachability unavailable for the NAT-hidden target, creating a real fallback condition;
- two-layer double-NAT / CGNAT-like outbound path;
- authenticated signed relay fallback;
- relay fallback latency 70.503 ms in the accepted run;
- relay outage fail-closed;
- relay recovery in 325 ms;
- cleanup PASS.

Explicit evidence boundary: the accepted run does **not** claim carrier-operated field CGNAT (`carrierCgnatFieldValidated=false`).

### Class D — real scale and adversarial operation — **ACTIVE**

Class D requires real concurrently running node processes/identities/QUIC sockets and explicit adversarial pressure. Synthetic rows, virtual node objects, simulations or semantic blocks do not substitute for these gates.

The first active acceptance threshold is **D-100**; then D-1000.

## Implemented productionization primitives

The reference implementation currently includes:

- atomic identity-bound network-state snapshots;
- durable verified peer records and DHT records;
- monotonic peer-record sequence across restart;
- automatic signed peer-record renewal before lease expiry;
- durability-before-dissemination for renewed peer sequences;
- authenticated QUIC `peer.announce` dissemination with bounded fanout;
- current self-record piggyback on PING/self `FIND_NODE` responses for later-contact repair;
- durable retention of cryptographically verified expired peer hints for recovery while live lookup remains fail-closed;
- routing restoration without mandatory re-bootstrap where durable verified state permits;
- configurable DHT replication factor and write quorum;
- fail-closed write quorum when required acknowledgements cannot be reached;
- read recovery from surviving replicas;
- failed-holder replacement repair;
- bounded dead-peer control-RPC failure detection and stale-client eviction;
- P2P and DHT-RPC QUIC client cache binding to signed peer sequence + endpoint;
- deterministic stale-client invalidation on newer signed peer state;
- deferred PING-response peer-record ingestion to avoid re-entrant native QUIC teardown;
- deterministic peer partition/heal fault injection;
- real packet-path partition tooling for Class C/D evidence;
- relay `healthy / degraded / down` fault modes;
- explicit bounded admission/backpressure before handler execution;
- durable accepted-work inbox for process-restart recovery with persisted completed-result replay;
- standalone testnet node process with persistent identity/state and QUIC endpoint;
- signed allowlisted `testnet.operator.*` operations transported over authenticated QUIC/signed envelopes;
- Class D deterministic adversarial scenario generation and canonical evaluators;
- real-cloud D-100 and D-1000 provisioning/campaign scaffolding.

The connection lifecycle intentionally does not blindly replay an application envelope after an ambiguous transport failure. Blind retry could duplicate non-idempotent external side effects. New signed peer state invalidates stale transport state before later sends instead.

The operator path is a testnet/failure-harness capability, not a public mainnet administration API. Authenticated but non-allowlisted nodes are denied.

## Process-restart durability boundary

Durable accepted-work proof currently covers **process restart + the same durable storage**. It does not prove:

- replicated queue survival after loss of the underlying host/volume;
- transactional exactly-once semantics for arbitrary external side effects.

Those remain operational closure gates.

## Class D-100 canonical acceptance contract

The canonical evaluator in `benchmarks/scale/class-d.js` requires:

| Check | Threshold |
|---|---:|
| real node count | exactly 100 |
| distinct identity count | exactly 100 |
| distinct QUIC socket count | exactly 100 |
| host count | ≥4 |
| baseline routing success | ≥0.99 |
| healed routing success | ≥0.99 |
| recovery p95 | ≤120,000 ms |
| convergence p95 | ≤120,000 ms |
| acknowledged write loss | 0 |
| invalid signed state accepted | 0 |
| stale revoked receipt accepted | 0 |
| churn | exercised |
| packet partition | exercised |
| Byzantine behavior | exercised |
| Sybil pressure | exercised |
| eclipse attempt | exercised |
| collusion | exercised |
| cleanup | complete |

No acceptance workflow may reduce these thresholds and still call the result the canonical Class D-100 gate.

The deterministic scenario builder currently selects bounded subsets using defaults of approximately 10% churn, 20% partition membership, 10% Byzantine nodes, 20% Sybil pressure, 5% eclipse victims and 20% colluding nodes. Selection alone is not evidence; the evaluator requires actual exercised observations and safety outcomes.

## Current D-100 V14 state

Pinned run: `32367799512`  
Tested immutable commit: `b835c8fa0283a004d616ce8d25d7aa78cee1a1c0`.

At the 2026-08-20 snapshot:

- immutable security/acceptance preflight — PASS;
- Azure login — PASS;
- real 4-host / 100-node campaign — in progress;
- post-cleanup canonical evaluation — pending;
- strict terminal verification — pending;
- durable accepted report — not yet present.

Therefore Class D-100 remains **open**.

The accepted result must require campaign success + canonical evaluator rc=0 + terminal verifier rc=0 after cleanup. A workflow being green before those terminal checks is insufficient.

## Class D-1000 contract

The repository already contains D-1000 provisioning/campaign/evidence tooling. The canonical evaluator defaults require:

- exactly 1,000 real nodes;
- exactly 1,000 identities;
- exactly 1,000 QUIC sockets;
- at least 10 host failure domains;
- routing success ≥99%;
- convergence p95 ≤180 seconds;
- recovery p95 ≤180 seconds;
- zero acknowledged write loss;
- complete cleanup.

This is an implemented acceptance harness, **not** an accepted scale claim.

## Required post-D-100 order

After an accepted D-100 result:

1. preserve a new durable D-100 PASS report; do not overwrite the historical failed attempt;
2. return the source/evidence tree to normal security-green CI;
3. regression-pin the already accepted Class C contract against the then-current network implementation;
4. run D-1000 with the same immutable/post-cleanup evidence discipline;
5. move into repeated randomized heterogeneous adversarial campaigns;
6. close host/volume durability, SRE, installer/update/rollback and compatibility/mainnet gates.

See `docs/operations/PRODUCTIONIZATION_EXECUTION_PLAN.md` for the detailed sequence.

## Randomized adversarial gate after real scale

After D-100 and D-1000, fixed deterministic acceptance scenarios are not enough. Repeated campaigns must exercise:

- random join/leave/crash/restart churn;
- asymmetric/partial packet partitions;
- stale signed peer-record floods;
- Byzantine state/provider behavior;
- Sybil pressure with declared attacker budgets;
- eclipse attempts;
- collusion/correlated attestations;
- relay degradation/outage/recovery;
- bootstrap loss;
- overload/backpressure;
- host/volume loss;
- invalid/revoked trust state propagation.

Preserve distributions for routing, convergence, recovery, direct-vs-relay, bytes/packets, repair, stale-state acceptance and acknowledged-work/data loss.

## Required measurements

Each preserved productionization report should include, when applicable:

- tested commit SHA;
- workflow/run identity;
- evidence class and topology size;
- real process/identity/socket counts;
- host/failure-domain count;
- direct vs relay transport outcome;
- failure injected;
- failure-detection latency;
- route/data repair latency;
- p50/p95/p99 distributions where the gate calls for distributions;
- successful / required replica acknowledgements;
- stale-read / invalid-state / acknowledged-loss counts;
- identity continuity after restart;
- peer-record sequence behavior;
- partition-healing latency;
- queue/admission/rejection behavior under overload;
- cleanup result;
- known limitations/corrections.

Credentials, private cloud identities, private origins, live resource identifiers and secret-bearing data remain outside public reports.

## Open gates after accepted Class C

Until separate durable evidence closes them, TRUYN does **not** claim completion of:

- accepted D-100;
- accepted D-1000;
- carrier-field CGNAT validation;
- large randomized Byzantine/Sybil/eclipse/collusion resistance on the real underlay;
- replicated accepted-work survival after underlying host/volume loss;
- transactional exactly-once semantics for arbitrary external side effects;
- production SLO/observability/on-call closure;
- verified installer/updater/rollback lifecycle;
- stable mainnet readiness.

Class C WAN/NAT/relay predicates are **closed**, not open. Future Class C runs after D-100 changes are regression pins, not first-time acceptance.