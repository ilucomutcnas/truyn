# TRUYN Testnet Operations

**Status:** implemented reference testnet mechanics with bounded real-network evidence; network productionization is the current primary gate.

## Join model

A new testnet node starts from one or more valid signed peer/bootstrap records. Bootstrap peers are initial contacts, not authoritative registries.

```text
trusted signed bootstrap record
        ↓
record signature / identity / TTL validation
        ↓
authenticated QUIC session
        ↓
Kademlia PING / FIND_NODE
        ↓
learn additional signed peers
        ↓
direct-first TRUYN communication
```

Relay is an explicit fallback/coordination path, not the authoritative database of peer identity or DHT values.

## Current implemented network mechanics

The v0.1 reference underlay includes:

- real QUIC/UDP;
- authenticated signed peer sessions;
- signed peer records;
- Kademlia routing and authenticated `PING`, `FIND_NODE`, `STORE`, `FIND_VALUE` RPC;
- direct signed envelope transport;
- STUN and same-QUIC-socket hole-punch path;
- explicit relay fallback;
- bounded admission/backpressure.

The trust-network slice additionally exercises libp2p QUIC/Kademlia verifier discovery and replicated signed transparency/revocation state.

## Churn / durability operations

A productionization testnet run should explicitly exercise:

1. peer join/bootstrap;
2. direct QUIC request path;
3. replicated DHT/state writes with an acknowledgement threshold;
4. remote reads from a different node;
5. one or more holder failures;
6. repair/re-replication to surviving holders;
7. process restart with intended durable identity/state preserved;
8. network partition followed by healing;
9. stale peer/provider records;
10. bootstrap loss after the network has learned surviving peers.

A pass must record what actually happened; a retry or cleanup workflow must not erase the failed boundary that was observed.

## Cloud multi-host exercises

TRUYN uses ephemeral cloud hosts for bounded real-network productionization exercises. These are test infrastructure, not permanent bootstrap/mainnet infrastructure.

Operational rules:

- create isolated ephemeral resources for a run;
- do not embed live credentials or private topology in source/evidence;
- clean up ephemeral resources after the run, including failure paths;
- retain safe run identity, tested commit and measured stage results in a durable report when the gate is complete;
- do not promote a temporary workflow result to `Productionized` until the gate is repeatable and documented.

As of this status synchronization, multi-host cloud network productionization is **active work**. The canonical maturity remains below productionized until a completed durable evidence report closes the gate.

## Next scale gates

After repeatable four-host/multi-host durability passes:

- 100 simultaneously running real nodes;
- 1,000 simultaneously running real nodes;
- randomized churn and partial partitions;
- NAT/reachability diversity;
- stale/malicious record floods;
- Byzantine/conflicting state providers;
- Sybil/eclipse/collusion pressure;
- convergence, bandwidth, latency and recovery distributions.

Simulated node scale or 100k semantic blocks do not substitute for real running network nodes.
