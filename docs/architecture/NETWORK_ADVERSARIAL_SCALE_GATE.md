# TRUYN adversarial scale gate

Status: implementation in progress. This document defines the next evidence gate after the completed four-node QUIC/Kademlia trust testnet. It does **not** claim that 100- or 1,000-node evidence already exists.

## Purpose

The scale gate answers a different question from the earlier bounded churn proof: whether the real QUIC/Kademlia network and its signed integrity layer remain measurable and recoverable under larger populations and deliberately hostile network conditions.

The sequence is mandatory:

1. 100 live network runtimes with distinct libp2p peer identities and distinct TRUYN Ed25519 identities.
2. Randomized churn, hard network partitions, eclipse isolation, Byzantine responses, Sybil provider pressure, and coordinated forged responses.
3. Evidence capture for routing success, integrity success, latency distributions, recovery distributions, and byte counters.
4. Multi-host/cloud execution with explicit failure-domain accounting.
5. Only after the 100-node gate is green may the same measurement contract be promoted to the 1,000-node gate.

## What counts as a node

A scale node is a live QUIC listener with its own libp2p identity, Kademlia server, TRUYN Ed25519 signing identity, connection gate, signed test protocol endpoint, and telemetry counters.

`100 processes` is therefore a valid statement about the number of live network runtimes only when all 100 identities/listeners are observed. It is **not** equivalent to `100 independent infrastructure failure domains`. Every report must separately record host count and failure-domain type. A 100-node run packed onto four VMs is reported as 100 network runtimes across four host failure domains, never as 100 independent hosts.

## Fault injection

Fault injection exists only in `network/testnet/**` and is not enabled by production routing code.

### Partition

The testnet connection gater denies both outbound dial and inbound/outbound post-encryption QUIC connections for blocked peers. Existing cross-partition connections are closed. A new content key is advertised only after isolation, so stale pre-partition provider records cannot make a partition test pass accidentally.

The gate records same-partition reachability, cross-partition isolation, and time-to-recovery after healing and Kademlia refresh.

### Churn

A deterministic seeded subset is stopped, survivors refresh Kademlia state, routing is sampled while peers are absent, and stopped logical TRUYN nodes rejoin with new libp2p transport identities. The report records the stopped fraction, routing during churn, transport identity rotation, and recovery-time distribution.

### Eclipse

A victim is denied all honest peers while attacker-controlled peers remain dialable. Attackers may publish the target provider key but return a coordinated forged value. The test records whether routing availability is lost, whether forged content is ever accepted, and recovery time after the victim is reconnected to honest routing.

An eclipse that makes the victim unavailable is an observed vulnerability/availability result, not hidden as a failed test. The integrity gate fails only if the forged value is accepted as the committed value.

### Byzantine and collusion

Malicious responders return signed but incorrect values; colluding responders return the same incorrect value. The requester validates response signature, request binding, responder identity, self-digest, and the expected immutable value digest. The report records malicious responses observed and malicious responses accepted.

This is application-integrity Byzantine testing. It is **not** a claim of Byzantine consensus.

### Sybil pressure

Many independent attacker peer identities advertise the same provider key. Reports record attacker share among DHT provider results and whether a committed valid response remains obtainable. This measures pressure and integrity behavior; it does **not** claim that Kademlia itself is Sybil-resistant.

## Measurements

Every run emits machine-readable JSON using schema `truyn-adversarial-scale-gate-v1` with:

- exact live node count;
- unique libp2p peer-ID count;
- unique TRUYN signing-identity count;
- connected-peer and routing-table distributions;
- provider-routing success ratio;
- end-to-end signed-integrity success ratio;
- routing latency p50/p95/p99/max/mean;
- signed probe latency p50/p95/p99/max/mean;
- partition and eclipse recovery duration;
- churn recovery distribution;
- application request/response byte counters;
- Byzantine/collusion acceptance results;
- Sybil provider-result share;
- execution host count and failure-domain classification.

Host/network-interface byte deltas belong to the cloud orchestration evidence layer. Application byte counters are never mislabeled as total QUIC/IP bandwidth.

## 100-node gate

Executable entry point:

```bash
npm run testnet:scale100
```

The runner defaults to exactly 100 nodes. `TRUYN_SCALE_NODE_COUNT` exists for deterministic CI/regression runs and must not be used to label a smaller run as 100-node evidence.

A 100-node benchmark report is added to `docs/benchmarks/` only after a successful factual run. Existing benchmark evidence remains append-only.

## 1,000-node gate

The 1,000-node stage is intentionally not promoted yet. It inherits the same report schema and adversarial scenarios only after the 100-node runtime and multi-host evidence are green. The 1,000-node report must additionally include resource saturation and host-density data so process packing cannot be mistaken for independent network failure domains.

## Scope boundary

Passing this gate can demonstrate scale behavior, fault isolation, recovery, signed-content integrity, and measured susceptibility under the exercised attacks. It cannot by itself prove global Byzantine consensus, general Sybil resistance, internet-wide eclipse resistance, or independence of operators. Those claims require separate protocols and evidence.
