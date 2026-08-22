# TRUYN Class D-1000 Scale Architecture

**Status:** architecture contract for the next real-node scale gate; implementation scaffolding already exists, accepted evidence does not.

**Snapshot:** 2026-08-20

This document defines the intended **Class D-1000** acceptance architecture without changing or depending on the currently running Class D-100 acceptance campaign.

Class D-100 proves bounded resilience at 100 real nodes. Class D-1000 has a different job:

> **prove that the same network mechanics remain operationally coherent at 1,000 simultaneously running real TRUYN processes without collapsing routing, convergence, durability, resource use or failure-domain independence.**

It is not a substitute for the randomized heterogeneous adversarial campaign that follows it.

---

## 1. Current implementation baseline

The repository already contains a D-1000 provisioning/campaign path under `benchmarks/scale/`.

The current Azure scale harness provisions:

```text
20 real hosts
× 50 TRUYN node processes per host
= 1,000 real node processes
```

Each node has an independent TRUYN identity, control endpoint and QUIC endpoint. The harness also performs sparse Kademlia bootstrap, convergence probing, baseline routing, replicated writes, process restart/recovery, post-restart routing, acknowledged-write retention, RSS measurement and QUIC byte metering.

The existing generic evaluator in `benchmarks/scale/class-d.js` already distinguishes D-1000 from D-100 and currently checks:

- exactly 1,000 real nodes;
- exactly 1,000 distinct identities;
- exactly 1,000 distinct QUIC sockets;
- a minimum host count;
- routing success;
- convergence p95;
- recovery p95;
- zero acknowledged write loss;
- cleanup.

That is useful scaffolding, but it is intentionally **not yet the final D-1000 acceptance contract**.

---

## 2. D-1000 design principles

### 2.1 Real means real

A D-1000 PASS must represent 1,000 simultaneously running operating-system processes or equivalently isolated runtime processes, each with:

```text
one independent TRUYN cryptographic identity
one independently bound QUIC endpoint/socket
one independently addressable node runtime
```

The following do not count as D-1000 real nodes:

- synthetic in-memory actors;
- one process pretending to be many nodes;
- semantic retrieval fanout identities that do not run a network node;
- duplicated identity records;
- mocked QUIC endpoints;
- replayed evidence from fewer live nodes.

### 2.2 Scale is not allowed to weaken safety

Increasing from 100 to 1,000 nodes must not relax safety invariants.

At minimum:

```text
acknowledged write loss = 0
invalid signed state accepted = 0
stale revoked receipt accepted = 0
unauthorized provider execution = 0
```

The D-1000 gate may use longer latency/recovery ceilings than D-100 because the topology is larger, but it must not weaken cryptographic, durability or provider-authorization safety.

### 2.3 Failure-domain diversity is part of scale

A thousand processes on one machine is not a thousand-node network proof.

The current harness already uses 20 hosts. The target D-1000 architecture therefore treats **20 independent host failure domains** as the preferred acceptance topology.

If a future implementation changes host density, the accepted report must still disclose:

```text
host count
processes per host
region/cloud placement
shared network boundaries
shared storage boundaries
```

and must not claim more independence than actually exists.

### 2.4 Sparse bootstrap, not global preloading

D-1000 must not require every node to receive the complete 1,000-node peer set as authoritative startup state.

The intended model remains:

```text
small trusted/signed bootstrap set
        ↓
local + sparse remote bridge records
        ↓
Kademlia discovery
        ↓
routing-table convergence
```

Bootstrap peers are hints, not a central registry.

---

## 3. Target D-1000 acceptance contract

The target evaluator should be stricter than the currently implemented minimal D-1000 evaluator.

### 3.1 Topology predicates

| Predicate | Target requirement |
|---|---:|
| real node processes | exactly 1,000 |
| distinct TRUYN identities | exactly 1,000 |
| distinct bound QUIC endpoints/sockets | exactly 1,000 |
| host failure domains | **>=20 preferred acceptance target** |
| synthetic nodes | 0 |
| duplicate identities | 0 |
| duplicate QUIC endpoints | 0 |

The current provisioning layout already satisfies the 20-host target by design; the generic evaluator still has a lower historical minimum and should be aligned before the accepted D-1000 run.

### 3.2 Routing predicates

Target scale acceptance should record both baseline and post-failure/healed routing.

| Predicate | Target requirement |
|---|---:|
| baseline routing success | >=99% |
| healed/post-recovery routing success | >=99% |
| per-host routing floor | >=95% |
| routing latency | report p50/p90/p95/p99 |

A global average must not hide a failed host cohort. Evidence should include host/failure-domain distributions.

### 3.3 Convergence and recovery

The current D-1000 evaluator uses 180-second p95 ceilings. Keep that as the initial scale ceiling unless measured evidence justifies a stricter target.

```text
convergence p95 <= 180 seconds
recovery p95    <= 180 seconds
```

Report at least:

```text
min
p50
p90
p95
p99
max
```

for convergence and recovery.

### 3.4 Durability predicates

D-1000 must perform acknowledged replicated writes and prove they remain retrievable after the recovery phase.

Required:

```text
acknowledged write loss = 0
successful writes have replication acknowledgements >= configured quorum
post-restart/post-heal retrieval succeeds for every accepted test write
```

Process restart is necessary but not sufficient for later production durability. Destruction of the underlying host/volume belongs to the separate durability/SRE closure gate.

### 3.5 Safety predicates

The target D-1000 evidence schema should carry the same safety counters used by D-100 even when the pure scale run does not intentionally maximize adversarial pressure:

```text
invalidSignedStateAcceptedCount = 0
staleRevokedReceiptAcceptedCount = 0
acknowledgedWriteLossCount = 0
unauthorizedProviderExecutionCount = 0
```

Missing safety counters should fail closed once the stronger D-1000 evaluator is activated.

### 3.6 Cleanup predicates

Ephemeral scale infrastructure must be cleaned after success **and failure**.

Required terminal evidence:

```text
cleanup.complete = true
cleanup.remainingResources = 0
```

A campaign that meets network metrics but leaves its declared ephemeral resources behind is not an accepted terminal PASS.

---

## 4. Resource and bandwidth architecture

D-1000 is the first gate where resource economics become part of network maturity rather than an incidental diagnostic.

The accepted report should include:

- total and per-node RSS/heap distribution;
- CPU utilization distribution where available;
- file-descriptor/socket pressure;
- bootstrap bytes;
- QUIC bytes during convergence;
- QUIC bytes per successful route;
- routing-table size distribution;
- persistent state size per node;
- provisioning/startup duration;
- campaign duration.

These metrics are initially **observability outputs**, not hidden pass/fail thresholds, unless a threshold is explicitly committed before the run.

This avoids retroactively declaring a run failed because an interesting optimization target was discovered after execution.

---

## 5. Failure phases required inside D-1000

D-1000 is primarily a scale gate, but it must not be a completely static happy-path benchmark.

The accepted scale run should include at least:

1. initial convergence;
2. baseline cross-host routing;
3. replicated acknowledged writes;
4. deterministic restart of a bounded node subset on every host;
5. recovery timing;
6. post-restart routing;
7. write retention verification;
8. resource/bandwidth measurement;
9. cleanup.

The following heavier exercises belong to the **next randomized adversarial campaign**, not to D-1000 itself:

- repeated randomized packet partitions;
- randomized host destruction;
- high attacker-budget Sybil pressure;
- sustained eclipse campaigns;
- multi-phase Byzantine equivocation;
- coordinated trust/provenance collusion;
- multi-cloud/region compound failure matrices.

Keeping these gates separate lets TRUYN answer two different questions:

```text
D-1000: does the real network scale?
Randomized adversarial: does it keep behaving safely when the environment becomes hostile and unpredictable?
```

---

## 6. Evidence schema

An accepted D-1000 evidence artifact should contain, at minimum:

```text
class = D-1000
testedCommit
workflowRunId
artifact identity/digest when safe
seed/config identity

topology
  realNodeCount
  distinctIdentityCount
  distinctQuicSocketCount
  hostCount
  processesPerHost
  syntheticNodeCount

routing
  baselineSuccessRatio
  healedSuccessRatio
  latency distribution
  per-host/per-domain summaries

convergence
  latency distribution

recovery
  latency distribution
  restartedNodeCount

writes
  attempted
  acknowledged
  retained

safety
  acknowledgedWriteLossCount
  invalidSignedStateAcceptedCount
  staleRevokedReceiptAcceptedCount
  unauthorizedProviderExecutionCount

resources
  memory distributions
  process/socket counts
  QUIC bytes

cleanup
  complete
  remainingResources
```

The canonical evaluator should consume the evidence artifact, not workflow log prose.

---

## 7. Immutable acceptance procedure

The eventual accepted D-1000 run should follow the same immutable discipline as D-100:

```text
pinned source SHA
      ↓
security/regression preflight
      ↓
real 1,000-node provisioning
      ↓
scale campaign
      ↓
cleanup
      ↓
canonical evaluator
      ↓
strict terminal verifier
      ↓
immutable artifact bundle
      ↓
sanitary durable report under docs/benchmarks/
```

Thresholds and evaluator semantics must be present in the tested commit before the run starts.

No post-run threshold editing is allowed to manufacture a PASS.

---

## 8. Separation from D-100

This architecture work is deliberately independent from the currently running D-100 acceptance series.

It must not:

- change D-100 thresholds;
- change the pinned D-100 source SHA;
- modify the active D-100 workflow/run;
- reinterpret a D-100 result;
- make D-1000 evidence a prerequisite for D-100 acceptance.

D-1000 implementation may be prepared on a separate branch while D-100 completes.

---

## 9. Implementation work unlocked by this document

The following work can proceed without waiting for D-100 acceptance:

1. strengthen `evaluateClassD1000()` to require healed routing and all safety counters;
2. align the host-failure-domain threshold with the intended 20-host acceptance topology;
3. add per-host/per-domain routing summaries;
4. add p50/p90/p95/p99 resource and latency distributions;
5. add a strict D-1000 terminal verifier analogous to D-100;
6. normalize D-1000 evidence field names with D-100 evidence;
7. add deterministic tests for missing/synthetic/duplicate topology evidence;
8. add fail-closed tests for missing safety fields;
9. make artifact/report rendering consume only canonical evidence;
10. prepare immutable D-1000 preflight without adding a permanent privileged public workflow.

None of these tasks requires the D-100 V14/V15 result itself.

---

## 10. Exit condition

Class D-1000 is accepted only when the implementation, evaluator, strict terminal verifier and immutable real-node evidence all agree.

A successful 1,000-process provision without terminal evidence is not a PASS.

A D-1000 PASS proves **real-node scale at the declared topology and failure profile**. It does not yet prove long-running production SLOs or broad Internet adversarial resistance; those are the next gates.
