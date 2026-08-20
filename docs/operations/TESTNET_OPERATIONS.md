# TRUYN Testnet Operations

**Status:** implemented reference testnet mechanics with accepted Class B and Class C real-network evidence; Class D real-node scale is the active productionization gate.  
**Snapshot:** 2026-08-20.

## Join model

A new testnet node starts from one or more valid signed peer/bootstrap records. Bootstrap peers are initial contacts, not authoritative registries.

```text
trusted signed bootstrap record
        ↓
record signature / identity / TTL / sequence validation
        ↓
authenticated QUIC session
        ↓
Kademlia PING / FIND_NODE
        ↓
learn additional signed peers
        ↓
direct-first TRUYN communication
```

Relay is explicit fallback/coordination infrastructure, not the authoritative database of peer identity or DHT values.

## Current implemented network mechanics

The current reference underlay includes:

- real QUIC/UDP;
- authenticated signed peer sessions;
- signed peer/bootstrap records;
- Kademlia routing and authenticated `PING`, `FIND_NODE`, `STORE`, `FIND_VALUE` RPC;
- direct signed envelope transport;
- STUN and same-QUIC-socket hole-punch reference path;
- explicit relay fallback;
- bounded admission/backpressure;
- durable identity/network-state snapshots;
- automatic signed peer-record renewal;
- persistence-before-dissemination for renewed peer sequences;
- authenticated peer-record announcement and later-contact PING repair;
- stale P2P/DHT-RPC client invalidation on newer signed state;
- durable verified expired peer hints for recovery while live lookup remains fail-closed;
- DHT replication, quorum and replacement repair reference slices;
- durable accepted-work process-restart recovery/replay;
- signed allowlisted testnet operator operations;
- deterministic and packet-path failure injection used by productionization gates.

The trust-network slice additionally exercises relay-free QUIC/Kademlia verifier discovery and replicated signed transparency/revocation state.

## Accepted network evidence

### Class B — accepted

`docs/benchmarks/NETWORK_PRODUCTIONIZATION_AZURE_4HOST_2026-08-17.md` proves the bounded four-host Azure gate: direct QUIC, replication/read, real holder failure/repair, restart continuity, stale-client invalidation and cleanup.

### Class C — accepted

`docs/benchmarks/CLASS_C_HETEROGENEOUS_WAN_2026-08-18.md` proves the bounded heterogeneous Azure/GCP gate:

- direct cross-cloud QUIC with zero relay calls on the direct path;
- real packet-path partition + heal;
- real Azure NAT gateway/source observation;
- private NAT node with no public IP;
- two-layer double-NAT / CGNAT-like outbound path;
- authenticated relay fallback for a NAT-hidden target;
- relay outage fail-closed and recovery;
- cleanup PASS.

Class C does not claim carrier-operated field CGNAT.

## Churn / durability operations

A productionization testnet run should explicitly exercise, as applicable to its gate:

1. peer join/bootstrap;
2. direct QUIC request path;
3. replicated DHT/state writes with acknowledgement threshold;
4. remote reads from another node;
5. holder/process failures;
6. repair/re-replication;
7. restart with intended durable identity/state preserved;
8. signed peer-record renewal and missed-announcement repair;
9. network packet partition followed by healing;
10. stale peer/provider records;
11. bootstrap loss after surviving peers have been learned;
12. relay degradation/outage/recovery when fallback is required;
13. bounded overload/admission behavior;
14. cleanup and terminal evidence generation.

A retry or cleanup workflow must not erase the failed boundary that was observed.

## Cloud multi-host exercises

TRUYN uses ephemeral cloud resources for bounded real-network productionization exercises. These are test infrastructure, not permanent bootstrap/mainnet infrastructure.

Operational rules:

- pin the exact tested source commit;
- run security/regression preflight against that immutable commit;
- create isolated ephemeral resources for the gate;
- do not embed live credentials or private topology in source/evidence;
- collect only the measurements required by the declared contract;
- clean up ephemeral resources after both success and failure paths;
- run canonical post-cleanup evaluator/terminal verification where defined;
- retain safe run identity, tested commit, artifact digest and measured results in the durable evidence ledger;
- remove temporary privileged workflow surfaces from permanent `main`;
- return the final source/evidence tree to normal security-green CI.

## Current Class D-100 run

Pinned V14 acceptance run: `32367799512`.  
Immutable tested commit: `b835c8fa0283a004d616ce8d25d7aa78cee1a1c0`.

At the 2026-08-20 documentation snapshot:

- immutable preflight — PASS;
- Azure login — PASS;
- real 4-host / 100-node campaign — active;
- canonical evaluation/terminal verification — pending;
- accepted durable report — absent.

Therefore the operational state is **D-100 acceptance in progress**, not PASS.

## D-100 operational acceptance

The canonical gate requires:

- 100 real simultaneously running nodes;
- 100 distinct identities and QUIC sockets;
- at least 4 host failure domains;
- baseline and healed routing ≥99%;
- recovery/convergence p95 ≤120 seconds;
- zero acknowledged write loss;
- zero invalid signed-state acceptance;
- zero stale revoked-receipt acceptance;
- churn, packet partition, Byzantine, Sybil, eclipse and collusion phases exercised;
- cleanup complete.

The fixed threshold contract is more important than a generic workflow conclusion.

## Next scale gates

After accepted D-100 and a security-green evidence commit:

1. regression-pin Class C against the then-current network implementation;
2. accepted D-1000 real-node gate;
3. repeated randomized heterogeneous adversarial campaigns;
4. operational/durability/SRE/distribution closure;
5. stable mainnet.

Default D-1000 evaluator expectations are 1,000 real nodes/identities/sockets, ≥10 hosts, routing ≥99%, convergence/recovery p95 ≤180 seconds, zero acknowledged write loss and cleanup complete.

Simulated nodes or semantic-block scale do not substitute for real running network nodes.

## Randomized campaign after D-1000

The post-scale campaign should collect distributions across:

- randomized churn;
- partial/asymmetric packet partitions;
- NAT/reachability diversity;
- stale-record floods;
- Byzantine/conflicting state providers;
- Sybil pressure;
- eclipse attempts;
- collusion;
- relay degradation/outage;
- bootstrap loss;
- overload/backpressure;
- host/volume loss;
- convergence, bandwidth/packet overhead, latency and recovery p50/p95/p99.

See `PRODUCTIONIZATION_EXECUTION_PLAN.md` for the canonical execution order.