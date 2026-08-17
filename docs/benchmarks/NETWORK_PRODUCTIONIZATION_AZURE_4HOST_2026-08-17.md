# TRUYN Network Productionization — Azure Four-Host Class B Gate

Date: **2026-08-17**

Status: **PASS — Class B real multi-host gate**

This report is append-only benchmark evidence. It records what was actually exercised and does not upgrade untested properties into production claims.

## Executive result

TRUYN completed a four-host Azure testnet exercise using four independent VM runtimes with distinct externally routable endpoints and real UDP/QUIC traffic.

Final accepted run:

- tested TRUYN commit: `fd6f52e2e9ad1d08ba9cbe2f4a3b2d196b494afa`;
- code CI run: `32006370869` — `npm test` PASS and `git diff --check` PASS;
- Azure proof workflow run: `32007414979`;
- evidence class: **B — real multi-host public/private testnet**;
- topology: **4 independent Azure VM runtimes**;
- Azure region used for the ephemeral proof: `eastus2`;
- VM size: `Standard_B1ms`;
- node identities: 4 distinct signed TRUYN identities;
- advertised peer endpoints: 4 distinct endpoints;
- transport: real public UDP/QUIC;
- relay calls for the direct NEED proof: **0**;
- direct signed NEED latency: **81 ms**;
- injected logical peer partition: direct route failed closed;
- heal: direct QUIC route recovered;
- DHT replication: **3 acknowledgements / 3 required**;
- DHT read from another host: PASS;
- failed-holder repair latency: **5,097 ms**;
- repaired placement acknowledgements: **3 / 3 required**;
- failed holder excluded from repaired placement: PASS;
- restarted holder identity continuity: PASS;
- peer-record sequence advanced after restart: PASS;
- stale DHT QUIC client invalidated after newer signed peer record: PASS;
- ephemeral Azure cleanup: **PASS**.

The 81 ms direct-NEED and 5,097 ms repair measurements were measured inside the guest runtime around the local TRUYN control request. They intentionally exclude GitHub Actions → Azure VM RunCommand control-plane delay.

## What this closes

This run closes the minimum **real multi-host testnet / Class B** gate defined in `docs/architecture/NETWORK_PRODUCTIONIZATION_GATE.md`:

1. four independent node runtimes existed concurrently;
2. all four emitted distinct signed node identities;
3. all four advertised distinct externally routable QUIC endpoints;
4. bootstrap records were exchanged and accepted;
5. node A sent a signed NEED to node C over direct public QUIC with zero relay use;
6. an injected peer partition made the direct route fail closed;
7. healing restored direct QUIC;
8. a DHT write reached a 3-of-3 acknowledgement requirement;
9. the replicated value was read through another remote node;
10. one remote DHT holder process was stopped;
11. repair replaced the failed holder and restored three acknowledgements;
12. the stopped node restarted with the same cryptographic identity and a higher signed peer-record sequence;
13. a pre-existing DHT QUIC client was invalidated/reconnected against the newer signed peer record;
14. ephemeral infrastructure was removed after the proof.

## Important scope boundary

**Class B is not Class C or Class D.**

The partition in this run was TRUYN's deterministic peer-partition fault injection. It proves fail-closed routing and recovery logic across real remote hosts, but it is **not** a packet-path WAN partition. The run therefore does not claim:

- packet loss / route black-hole healing caused by an actual WAN link failure;
- NAT or CGNAT traversal coverage;
- heterogeneous multi-region or multi-provider failure-domain tolerance;
- relay outage production SLOs;
- 100 simultaneously running real network nodes;
- 1,000 simultaneously running real network nodes;
- Byzantine, Sybil or collusion resistance on the productionized underlay;
- mainnet readiness.

## Test-scoped peer-record lease

The production/reference default peer-record TTL remains five minutes. Azure VM RunCommand orchestration adds tens of seconds to each remote control operation; a full four-host orchestration can therefore take substantially longer than one default lease even when the network itself is healthy.

For this **test harness only**, nodes were started with:

- `TRUYN_PEER_RECORD_TTL_MS=1800000` (30 minutes).

This prevents the benchmark control plane from expiring otherwise valid peer records while GitHub Actions serially invokes Azure guest commands. It is **not** a protocol-default change and is not evidence that peer lease renewal is production-complete.

Automatic peer-record renewal/dissemination before expiry remains an explicit productionization item.

## Stale QUIC session defect found and fixed

The two-host diagnostic preceding the final gate discovered a real lifecycle defect: direct P2P and DHT RPC connection caches were keyed only by `nodeId`. After a peer restarted or published a newer signed peer record, a caller could continue holding a QUIC client bound to the older connection/endpoint.

The productionization fix binds cached clients to the signed peer-record sequence plus selected endpoint. A newer record invalidates the old client before the next send/control operation.

The implementation deliberately does **not** blindly replay an application envelope after an ambiguous transport failure, because doing so could duplicate an external side effect. Reconnection is driven by the newer signed peer record instead.

Regression coverage was added for:

- endpoint change with higher sequence;
- restart with higher sequence and the same endpoint;
- DHT RPC endpoint change with higher sequence;
- DHT RPC restart with higher sequence and the same endpoint.

Full CI for these changes passed in run `32006370869` on the final tested commit.

## Diagnostic evidence trail

The failed/diagnostic runs are retained here because negative evidence is part of the engineering record.

### Two-host public-vs-private diagnostic

Workflow run `32003826765` used two Azure VMs and compared the same signed NEED path through a public endpoint and then a newer signed private-VNet endpoint for the same node identity.

Observed result:

- public endpoint: `200`, `quic-direct`, PASS;
- Azure public UDP/4433 path therefore worked;
- after peer restart and newer signed endpoint publication, the follow-up route failed before the cache lifecycle fix;
- guest route/listener diagnostics showed the private VNet route and UDP listener were present.

This isolated the problem from Azure public-IP/SNAT and led to the stale-client fix.

### Two-host reconnect proof after fix

Workflow run `32005479720`, tested commit `1bc635ef981f579a2ff2b0d4a7cbc3351a7f3781`:

- public direct QUIC: PASS;
- peer restart: PASS;
- identity stable: PASS;
- signed peer-record sequence advanced: PASS;
- private endpoint after restart: `quic-direct`, PASS;
- stale P2P client invalidated: PASS;
- cleanup: PASS.

This was real two-host Azure evidence for the P2P cache fix before spending another four-host cycle.

### First four-host final-harness attempt

Workflow run `32006517899` created and started all four VMs but stopped at the first record assertion because the benchmark parser used `S=` for HTTP status while a newly added `MS=` latency marker also contained `S=`. The parser selected the latency value as the status.

This was a **benchmark harness defect**, not a TRUYN network failure. Cleanup executed after failure. The accepted run used unambiguous markers (`TRUYN_STATUS`, `TRUYN_MS`, `TRUYN_BODY`) and reused the same test scenario and tested TRUYN commit.

## Accepted run stage evidence

Accepted workflow run `32007414979` emitted the following safe stage results:

- `nsg=PASS udpPort=4433`;
- four VMs provisioned;
- four node services ready;
- `record=0..3 PASS`;
- `bootstrap=PASS identities=4 endpoints=4 peerTtlScope=test-30m`;
- `direct_quic=PASS latencyMs=81 relayCalls=0`;
- `partition_heal=PASS partitionBlocked=true healRecovered=true`;
- `replication=PASS acks=3 remoteRead=true`;
- `dht_client_warm=PASS`;
- `repair=PASS latencyMs=5097 deadHolderExcluded=true acks=3`;
- `restart=PASS identityStable=true sequenceAdvanced=true dhtStaleClientInvalidated=true`;
- `TRUYN_AZURE_4HOST_CLEANUP=PASS ephemeralResourcesRemoved=true`.

## What was not measured in this run

The run did not separately quantify:

- packet-path partition detection latency;
- packet loss rate under a real network impairment;
- stale-read count under a prolonged WAN partition;
- NAT traversal success ratio;
- relay availability/failover SLO;
- queue depth under overload;
- cost of the temporary Azure topology.

Unavailable-quorum rejection and durable admission/backpressure are covered by separate executable CI evidence; they are not re-counted as four-host measurements here.

## Evidence hygiene

This public report intentionally excludes:

- subscription, tenant and service-principal identifiers;
- resource-group and ephemeral resource names;
- public/private VM addresses;
- secret paths, credentials and tokens;
- raw Azure/GitHub logs that may contain operational identifiers.

The workflow/run IDs and tested commit SHAs are retained because they are safe, reviewable evidence identifiers.

## Verdict

**PASS for the TRUYN Class B real multi-host gate.**

TRUYN has now demonstrated that the productionization branch can run a four-node externally reachable QUIC testnet, exchange signed traffic without relay, replicate and remotely read DHT state, fail closed under an injected peer partition, repair after a real remote-holder process failure, and preserve identity while reconnecting against a newer signed peer record after restart.

This is a meaningful network-productionization milestone. It is not a claim of Class C heterogeneous WAN/NAT readiness, Class D real-node scale/adversarial readiness, or public mainnet readiness.
