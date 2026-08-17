# TRUYN 100-Runtime Adversarial QUIC/Kademlia Scale Gate — 2026-08-17

Status: **PASS — 6/6 scenarios on one tested runtime SHA**

This report is append-only benchmark evidence. It records the successful gate together with material failed attempts and corrections that preceded it. Security cleanup may redact a sensitive operational value if one is ever discovered, but must not delete or replace this evidence report.

## Evidence identity

- Repository: `inn-media/truyn`
- Tested runtime commit: `45a2fe66927f777958059c3b76cb678c2f3c99fa`
- GitHub Actions run: `32042837024`
- Workflow: `.github/workflows/scale-gate.yml`
- Seed: `1414681945`
- Runtime nodes per scenario: **100**
- Host count per scenario: **1 GitHub-hosted runner**
- Failure-domain label: `github-hosted-runner-single-host`
- Runner OS: Ubuntu 24.04
- Node.js: 22
- Kademlia bucket size: 32
- Transport: real libp2p QUIC v1 listeners on loopback UDP ports
- Routing primitive: `libp2p Kademlia peerRouting.findPeer`
- Integrity primitive: signed TRUYN probe bound to request, TRUYN identity, value digest and resolved libp2p PeerId
- Relay in measured routing path: **none**
- Topology mode: sparse overlay + targeted Kademlia convergence; no all-node refresh storm

### Job IDs

| Scenario | Job ID | Result |
|---|---:|---:|
| baseline | `95425122744` | PASS |
| partition | `95425122682` | PASS |
| churn | `95425122576` | PASS |
| eclipse | `95425122600` | PASS |
| byzantine | `95425122709` | PASS |
| sybil-collusion | `95425122661` | PASS |

### Raw GitHub Actions artifacts

| Scenario | Artifact ID | GitHub artifact digest |
|---|---:|---|
| baseline | `9292275137` | `sha256:205ea2dc74cc2fa87934b1c72dfc5cb59ed0e48fd9dabaf8e46863d8de2a0f9d` |
| partition | `9292262165` | `sha256:8930369fbba31a3dd895c7af3d50adee450265efcf3d379e07a9c9721f9bb0f9` |
| churn | `9292331099` | `sha256:969e9bf505ae6f2d94fd02d32e42b7572fa185dcd7aed599cbde42d7620089c8` |
| eclipse | `9292278948` | `sha256:5a36402eeb5ffb29a898880fcc563e730593c9f6d673b2aba31c18fe6a4fdf6d` |
| byzantine | `9292283194` | `sha256:bfec45fdc619233af19603daacfa5d552ca25ef2c1b9e646ace01e9b8b330e76` |
| sybil-collusion | `9292288117` | `sha256:eaad7a605e74ec88ebf10bec861ffd628e725121c6360c8e9c0d68c27066b02e` |

The raw JSON artifacts contain per-sample routing/probe observations, node snapshots, topology distributions, telemetry and host-interface counters. The artifact digest above is the digest reported by GitHub Actions for the stored artifact.

## Acceptance summary

All six scenarios returned `passed: true` and every scenario-specific gate was true. Each final report explicitly records:

- `hundredNodeRuntimeGate: true`
- `thousandNodeRuntimeGate: false`
- `independentFailureDomains: false`
- `byzantineConsensus: false`
- `sybilResistance: false`

Those negative claims are intentional boundaries, not missing metadata.

## 1. Baseline — 100 live runtimes

Identity/topology gate:

- live runtimes: **100/100**
- unique libp2p PeerIds: **100/100**
- unique TRUYN application identities: **100/100**
- initial connected peers: p50 **14**, p95 **39**, max **45**, mean **19.70**
- initial routing-table size: p50 **13**, p95 **39**, max **45**, mean **17.99**
- final connected peers: p50 **73**, p95 **89**, max **91**, mean **67.98**
- final routing-table size: p50 **68**, p95 **84**, max **90**, mean **61.52**

Measured independent routing samples: **40**

| Metric | Acceptance | Measured |
|---|---:|---:|
| first-attempt routing success | >=95% | **97.5%** |
| final routing success | >=95% | **97.5%** |
| signed end-to-end integrity | >=95% | **97.5%** |

Routing latency distribution, ms:

- min 0.285
- p50 **209.927**
- p95 **990.030**
- p99/max **5518.805**
- mean **450.746**

Successful signed-probe latency distribution, ms:

- count 39
- min 25.762
- p50 **190.742**
- p95 **4184.194**
- max **4220.350**
- mean **788.592**

Warmup visibility was retained as diagnostic evidence rather than substituted for the acceptance measurement. The gate is calculated from the independent routing samples above.

Bandwidth observed during this scenario:

- aggregate host interface delta: **203,617,636 bytes**
- TRUYN probe application bytes per node: p50 0, p95 **3,494**, max **4,370**, mean **681.24**

The host counter includes same-host loopback/network-stack traffic and is not per-peer QUIC wire attribution.

## 2. Hard 50/50 partition and heal

The connection gater blocked both sides, cross-partition live connections were hung up, and cross-side routing peers were purged before the measurement.

- left side: **50 runtimes**
- right side: **50 runtimes**
- same-partition Kademlia route: **PASS**
- same-partition signed integrity: **PASS**
- cross-partition communication blocked: **PASS**
- healed after restoring connectivity: **PASS**
- measured recovery: **13.811 ms**, 1 recovery attempt

Final routing-table size after the scenario: p50 **10**, p95 **18**, max **20**.

Bandwidth:

- aggregate host interface delta: **16,352,760 bytes**
- probe application bytes/node: p95 0, max **2,145**, mean **38.55**

## 3. Randomized 20% churn and rejoin

Exactly **20/100** randomly selected non-bootstrap runtimes were stopped.

During degraded operation:

| Metric | Acceptance | Measured |
|---|---:|---:|
| first-attempt routing | diagnostic | **95.0%** |
| final routing success | >=90% | **97.5%** |
| signed integrity | >=90% | **90.0%** |

Recovery/restart identity semantics:

- stopped runtimes: **20**
- recovered runtimes: **20/20**
- libp2p transport identities rotated: **20/20**
- stable TRUYN application identities: **20/20**
- pre-churn peer visibility: **PASS**
- post-restart peer visibility: **PASS**

Runtime restart duration distribution, ms:

- min **1421.953**
- p50 **8135.130**
- p95 **15521.706**
- max **18289.258**
- mean **7449.400**

After rejoin:

| Metric | Acceptance | Measured |
|---|---:|---:|
| first-attempt routing | diagnostic | **100%** |
| final routing success | >=90% | **100%** |
| signed integrity | >=90% | **97.5%** |

Post-recovery routing latency, ms: p50 **154.581**, p95 **2248.292**, max **4302.557**, mean **431.306**.

Post-recovery signed-probe latency, ms: p50 **101.523**, p95 **2714.721**, max **4296.447**, mean **557.550**.

The successful correction used a restart-only Kademlia rejoin lifecycle: old transport PeerIds are removed from survivor routing state; a restarted node with a new PeerId rejoins through multiple stable survivor QUIC neighbors; the rejoin neighborhood is refreshed before an independent requester performs the measured `findPeer`. The measured requester is not handed the target address directly.

Bandwidth:

- aggregate host interface delta: **936,320,974 bytes**
- probe application bytes/node: p50 **862**, p95 **3,464**, max **6,178**, mean **1321.51**

## 4. Eclipse isolation and recovery

- attacker runtimes used against the victim: **8**
- attacker connections attempted/connected: **8/8**
- malicious responses actually observed: **6**
- malicious responses accepted: **0**
- attack exercised: **yes**
- forged integrity accepted: **no**
- honest-provider availability lost while the victim was eclipsed: **yes**
- service recovered after heal: **yes**
- measured recovery: **20.302 ms**, 1 attempt

Bandwidth:

- aggregate host interface delta: **15,142,816 bytes**
- probe application bytes/node: p95 **844**, max **6,459**, mean **123.79**

This proves the harness can create a concrete eclipse-style isolation event, reject the attacker payloads, observe expected temporary availability loss and recover. It does **not** prove generalized eclipse resistance.

## 5. Byzantine response pressure

- Byzantine attacker runtimes: **10**
- pressure connections attempted/connected: **80/80**
- malicious responses observed: **32**
- malicious responses accepted: **0**
- attack exercised: **yes**
- integrity preserved: **yes**

Honest routing under the same pressure, 30 samples:

- first-attempt routing: **100%**
- final routing: **100%**
- signed integrity: **100%**

Bandwidth:

- aggregate host interface delta: **25,309,174 bytes**
- probe application bytes/node: p95 **6,894**, max **29,434**, mean **1072.28**

This is signed-response Byzantine fault injection, not a Byzantine consensus proof.

## 6. Sybil pressure plus colluding forged responses

Sybil pressure:

- distinct attacker identities: **15**
- attacker connections attempted/connected: **120/120**
- malicious responses observed: **24**
- malicious responses accepted: **0**
- attack exercised: **yes**
- integrity preserved: **yes**
- honest route availability under pressure: **PASS**
- honest routing samples: **32**
- first-attempt routing: **100%**
- final routing: **100%**
- signed integrity: **100%**

Collusion pressure:

- colluding attacker runtimes: **6**
- malicious colluding responses observed: **24**
- accepted: **0**
- attack exercised: **yes**
- integrity preserved: **yes**

Bandwidth:

- aggregate host interface delta: **23,364,120 bytes**
- probe application bytes/node: p95 **8,404**, max **27,182**, mean **1351.66**

This proves rejection of the tested forged/colluding response patterns while honest routing remains available in this topology. It does **not** prove generalized Sybil resistance or collusion resistance.

## Failed and rejected approaches retained as evidence

The final green result was reached through failures that materially changed the harness. They remain part of the benchmark history and must not be erased.

- Run `32004558791`: early monolithic 100-node attempt terminated with mass Kademlia abort behavior.
- Runs `32004840203`, `32004951336`, `32005433483`: additional early monolithic attempts; not accepted as PASS.
- Run `32005895967`: first scenario-matrix form exposed sparse-topology/content-provider publication deadline issues.
- Run `32006495291`: baseline was only 62.5% first-attempt route, 72.5% final route and 72.5% integrity; partition isolation worked but heal/routing convergence remained incomplete.
- Run `32021771008`: earlier 1,000-runtime workflow used an older harness and is diagnostic only, not final scale evidence.
- Run `32027019967`: an intermediate peer-routing matrix still had multiple failed scenarios and was rejected.
- Commit/run series ending at `9ca7065c280b1f82a0daa635480b3800bb4ae730`: a broad requester-side routable-address cache improved some paths but regressed baseline and churn. The approach was rejected and removed.
- Final correction: restart-only rejoin logic, leaving normal baseline lookup behavior unchanged. Run `32042837024` then passed all six scenarios on one runtime SHA.

## What this benchmark proves

For the exact tested code and single-host execution environment, TRUYN successfully ran **100 simultaneous real libp2p QUIC/Kademlia runtime identities** and met the fixed acceptance gates for:

1. baseline Kademlia peer routing + signed end-to-end result integrity;
2. hard 50/50 partition isolation and heal;
3. randomized 20% runtime churn with stable TRUYN identity and rotated transport PeerId;
4. an exercised eclipse isolation/recovery case;
5. exercised Byzantine forged-result pressure with zero malicious acceptance;
6. exercised Sybil-identity/colluding-response pressure with zero forged-result acceptance in the tested topology.

## Explicit boundary of proof

This benchmark **does not** establish any of the following:

- 100 independent physical hosts;
- 100 independent cloud/availability-zone failure domains;
- internet/WAN NAT traversal at 100-host scale;
- BFT consensus;
- generalized Sybil resistance;
- generalized collusion resistance;
- global censorship resistance;
- permissionless-economic security.

All 100 runtimes in each scenario were hosted inside a single GitHub Actions runner. The failure events are real libp2p runtime/network-gater events inside that host, not independent-machine failures. A separate distributed multi-host gate is required before making host/failure-domain claims.

## Next scale gate

The next accepted step is 1,000 real libp2p runtime nodes on the same explicitly single-host test boundary, using the same peer-routing + signed-probe runtime and measuring baseline convergence plus randomized 20% churn, latency, routing success, bandwidth and recovery distributions. It remains a runtime-scale test, not a 1,000-machine claim.
