# TRUYN Network Productionization Gate

Status: **IN PROGRESS — Class B real multi-host milestone closed**

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

The sequence is evidence-driven. Closing the Class B multi-host milestone does not close later Class C/D gates.

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
- automatic signed peer-record renewal before lease expiry;
- durability-before-dissemination for each renewed peer-record sequence;
- authenticated QUIC `peer.announce` dissemination with bounded fanout;
- current self-record piggyback on PING and self `FIND_NODE` responses so missed proactive announcements can repair on later contact;
- routing restoration without mandatory re-bootstrap;
- configurable DHT replication factor and write quorum;
- fail-closed `TRUYN_DHT_WRITE_QUORUM` when required acknowledgements cannot be reached;
- read recovery from surviving replicas;
- repair that replaces a failed holder with another live routing candidate;
- bounded DHT control-RPC failure detection and stale-client eviction;
- P2P QUIC client cache binding to signed peer-record sequence + endpoint;
- DHT RPC QUIC client cache binding to signed peer-record sequence + endpoint;
- deterministic stale-client invalidation when a newer signed peer record is accepted;
- deferred PING-response peer-record ingestion so stale-client eviction cannot tear down the active native QUIC response stack re-entrantly;
- deterministic peer partition/heal fault injection;
- deterministic relay `healthy / degraded / down` fault modes;
- explicit bounded admission/backpressure before handler execution;
- durable accepted-work inbox for process-restart recovery with persisted completed-result replay;
- standalone testnet node process with persistent identity/state and QUIC endpoint;
- signed, allowlisted `testnet.operator.*` operations transported over the same authenticated QUIC/signed-envelope path as normal network traffic.

The connection lifecycle intentionally does not blindly replay an application envelope after an ambiguous transport failure. A blind retry could duplicate a non-idempotent external side effect. New signed peer state invalidates the stale connection before a later send instead.

The operator path is a testnet/failure-harness capability. It is not a public mainnet administration API. An authenticated but non-allowlisted node is denied.

## Currently proved — Class A

CI has executable proof for:

- crash-style restart with identity continuity;
- peer-record sequence monotonicity after restart;
- automatic signed peer-record renewal before expiry;
- persistence of the renewed sequence before any peer announcement;
- authenticated peer-record dissemination to known peers;
- stale P2P and DHT-RPC client invalidation after a newer signed record is accepted;
- recovery of a missed proactive renewal announcement from a later PING response;
- restored routing and DHT state;
- replicated DHT write and read recovery;
- failed-holder replacement repair;
- explicit unavailable-quorum rejection;
- bounded dead-peer DHT RPC timeout rather than waiting for the QUIC idle timeout;
- direct path failure during an injected peer partition and restoration after heal;
- relay outage not affecting healthy direct QUIC;
- explicit degraded relay fallback latency;
- explicit admission/backpressure with no silent acceptance beyond capacity;
- durable pending-work recovery after process restart;
- persisted completed-result replay without re-executing the accepted handler;
- P2P stale-client invalidation on a newer signed peer record;
- DHT RPC stale-client invalidation on a newer signed peer record;
- signed QUIC-only operator orchestration and fail-closed operator authorization.

These results are not relabeled as WAN, NAT, real 100-node or mainnet evidence.

Durable accepted-work proof is currently a **process-restart + same durable storage** guarantee. It does not prove replicated queue survival after loss of the underlying host/volume, and it does not claim transactional exactly-once external side effects.

## Currently proved — Class B real multi-host

The four-host Azure proof on 2026-08-17 closes the minimum real multi-host testnet gate.

Accepted evidence:

- benchmark: `docs/benchmarks/NETWORK_PRODUCTIONIZATION_AZURE_4HOST_2026-08-17.md`;
- tested commit: `fd6f52e2e9ad1d08ba9cbe2f4a3b2d196b494afa`;
- code CI run: `32006370869`;
- accepted Azure workflow run: `32007414979`;
- four independent VM runtimes;
- four distinct signed TRUYN identities;
- four distinct externally routable QUIC endpoints;
- direct signed NEED over public UDP/QUIC with zero relay calls;
- measured direct NEED latency: 81 ms;
- injected peer partition failed closed and heal restored the direct path;
- 3-of-3 DHT replication acknowledgement;
- remote replica read through another host;
- real remote-holder process stop;
- replacement repair to three acknowledgements in 5,097 ms;
- failed holder excluded from repaired placement;
- restart with identity continuity and increased peer-record sequence;
- pre-existing DHT client invalidated/reconnected after the newer signed record;
- ephemeral cloud cleanup PASS.

The measured direct and repair latencies are guest-side TRUYN control-request measurements. GitHub Actions → Azure VM RunCommand latency is excluded.

### Test-only peer lease

The accepted Azure harness used `TRUYN_PEER_RECORD_TTL_MS=1800000` (30 minutes) because serial Azure VM RunCommand orchestration is much slower than normal peer-to-peer operation and can exceed the five-minute reference/default peer lease before assertions execute.

This remains historical Class B benchmark truth. The later reference runtime now has automatic signed lease renewal/dissemination and CI proof for that lifecycle, but the accepted four-host Class B run itself did **not** exercise automatic renewal. No WAN/NAT claim is inferred from the later CI slice.

## Class B acceptance criteria — closed

The Class B proof demonstrated all required minimums:

1. four distinct TRUYN node identities — PASS;
2. four distinct peer endpoints — PASS;
3. signed peer-record bootstrap — PASS;
4. remote node A → remote node C signed `NEED` over direct QUIC with zero relay use — PASS;
5. a 3-ack DHT replication write — PASS;
6. a replica read initiated through another remote node — PASS;
7. an injected partition causing fail-closed direct routing — PASS;
8. healing restoring direct routing — PASS;
9. ephemeral infrastructure cleanup — PASS.

The accepted run additionally proved a real remote-holder process failure, repair, restart identity continuity, peer-record sequence advancement and DHT stale-client invalidation/reconnection.

A cloud IAM/provider-registration or cloud-control-plane failure before nodes are created remains an infrastructure blocker rather than a TRUYN network result.

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

- packet-path WAN partition/healing; the Class B partition was deterministic TRUYN peer fault injection, not physical/route-level WAN loss;
- heterogeneous multi-region / multi-provider failure-domain proof;
- real NAT/CGNAT traversal coverage;
- relay outage production SLOs;
- replicated accepted-work queue survival after underlying host/volume loss;
- transactional exactly-once semantics for arbitrary external side effects;
- 100 real simultaneously running nodes;
- 1,000 real simultaneously running nodes;
- Byzantine/Sybil/collusion resistance on the productionized underlay;
- mainnet readiness.
