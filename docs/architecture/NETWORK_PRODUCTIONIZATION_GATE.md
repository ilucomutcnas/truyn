# TRUYN Network Productionization Gate

Status: **IN PROGRESS**

This gate starts after v0.1 Connect. Its purpose is not to add semantic intelligence. Its purpose is to prove that the lower network remains useful under real process, host, route, storage and adversarial failures.

## Governing rule

A network feature is not productionized because a class, protocol or local simulation exists. Every slice requires executable failure injection and preserved evidence. A later slice does not waive a failed earlier slice.

Mandatory sequence:

1. real multi-host testnet;
2. churn / crash / restart;
3. Kademlia replication + repair;
4. durable DHT / routing state;
5. WAN partitions + healing;
6. real NAT / CGNAT matrix;
7. relay outage / degradation;
8. durable backpressure / admission;
9. 100 simultaneously running real network nodes;
10. 1,000 simultaneously running real network nodes;
11. Byzantine / Sybil / collusion exercises.

## Evidence classes

### Class A — real protocol/process evidence on one host

Independent cryptographic identities and real QUIC/UDP sockets may run on one CI host. This is valid for deterministic protocol, persistence, timeout, failure-controller and regression proof. It is **not WAN proof** and is **not real-node-scale proof**.

### Class B — real multi-host public/private testnet

Independent cloud hosts/container groups/processes with distinct externally routable endpoints. Packets leave the source host/process boundary. This is the minimum evidence class for the `real multi-host testnet` gate.

A public endpoint is not evidence of NAT traversal. Public-IP hosts do not close the NAT/CGNAT gate.

### Class C — heterogeneous WAN and reachability

Independent failure domains/regions/providers plus actual NAT and CGNAT topologies. This class must measure route loss, traversal success/failure, fallback and healing. Logical partition injection alone does not replace packet-path partition evidence.

### Class D — real scale and adversarial operation

100 and 1,000 simultaneously running network nodes plus explicit Byzantine/Sybil/collusion fault injection with a declared attacker budget. Synthetic rows, records, loops or virtual node objects do not count as real nodes for these gates.

## Implemented productionization primitives

The productionization branch extends the generic `TruynNetworkNode` underlay with:

- atomic identity-bound network-state snapshots;
- durable valid peer records and DHT records;
- monotonic peer-record sequence across restart;
- routing restoration without mandatory re-bootstrap;
- configurable DHT replication factor and write quorum;
- fail-closed `TRUYN_DHT_WRITE_QUORUM` when required acknowledgements cannot be reached;
- read recovery from surviving replicas;
- repair that replaces a failed holder with another live routing candidate;
- bounded DHT control-RPC failure detection and stale-client eviction;
- deterministic peer partition/heal fault injection;
- deterministic relay `healthy / degraded / down` fault modes;
- standalone testnet node process with persistent identity/state and QUIC endpoint;
- signed, allowlisted `testnet.operator.*` operations transported over the same authenticated QUIC/signed-envelope path as normal network traffic.

The operator path is a testnet/failure-harness capability. It is not a public mainnet administration API. An authenticated but non-allowlisted node is denied.

## Currently proved — Class A

CI has executable proof for:

- crash-style restart with identity continuity;
- peer-record sequence monotonicity after restart;
- restored routing and DHT state;
- replicated DHT write and read recovery;
- failed-holder replacement repair;
- explicit unavailable-quorum rejection;
- bounded dead-peer DHT RPC timeout rather than waiting for the QUIC idle timeout;
- direct path failure during an injected peer partition and restoration after heal;
- relay outage not affecting healthy direct QUIC;
- explicit degraded relay fallback latency;
- signed QUIC-only operator orchestration and fail-closed operator authorization.

These results are not relabeled as WAN, NAT, real 100-node or mainnet evidence.

## Real multi-host gate

The next acceptable proof requires at least four independent externally reachable node runtimes and must demonstrate, at minimum:

1. four distinct TRUYN node identities;
2. four distinct peer endpoints;
3. signed operator bootstrap over QUIC;
4. remote node A → remote node C signed `NEED` over direct QUIC with zero relay use;
5. a 3-ack DHT replication write;
6. a replica read initiated through another remote node;
7. an injected partition causing fail-closed direct routing;
8. healing restoring direct routing;
9. ephemeral infrastructure cleanup.

A cloud IAM/provider-registration failure before nodes are created is recorded as an infrastructure blocker, not a TRUYN network failure and not a passing network result.

## Required measurements

Each preserved report should include, when applicable:

- tested commit SHA;
- workflow/run identity;
- evidence class and topology size;
- direct vs relay transport outcome;
- failure injected;
- failure-detection latency;
- route/data repair latency;
- successful / required replica acknowledgements;
- stale-read or data-loss count;
- rejected writes caused by unavailable quorum;
- identity continuity after restart;
- peer-record sequence monotonicity;
- partition-healing latency;
- queue depth / admission / rejection behavior under overload;
- infrastructure cleanup result.

Credentials, private cloud identities, private origins, live account/resource identifiers and secret-bearing data remain outside public reports.

## Open gates

Until separate evidence closes them, TRUYN does **not** claim completion of:

- packet-path WAN partition/healing;
- real NAT/CGNAT traversal coverage;
- relay outage production SLOs;
- durable queue recovery across host/process loss;
- 100 real simultaneously running nodes;
- 1,000 real simultaneously running nodes;
- Byzantine/Sybil/collusion resistance on the productionized underlay;
- mainnet readiness.
