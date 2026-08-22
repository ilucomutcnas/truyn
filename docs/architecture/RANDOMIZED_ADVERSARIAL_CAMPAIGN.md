# TRUYN Randomized Adversarial Campaign Architecture

**Status:** architecture contract for the post-D-1000 resilience campaign; deterministic scenario-generation code already exists, accepted real-network campaign evidence does not.

**Snapshot:** 2026-08-20

This document defines the next network-confidence layer after the deterministic real-node scale gates.

The purpose is not to replay one known failure script until it passes. The purpose is to prove that TRUYN remains safe and recovers across **multiple reproducible but varied hostile network conditions**.

> Deterministic gates prove known invariants. Randomized adversarial operation tests whether those invariants survive combinations the implementation was not hand-tuned around.

---

## 1. Current code baseline

`benchmarks/scale/randomized-adversarial.js` already provides a deterministic seeded campaign planner.

The current planner:

- requires at least 100 node IDs;
- uses multiple explicit seeds;
- varies attacker budget between approximately 10% and 33%;
- varies churn between approximately 5% and 20%;
- varies partition size between approximately 10% and 35%;
- derives Byzantine, Sybil, eclipse-victim and collusion subsets;
- reuses `buildClassDScenario()` so every selected campaign can be reproduced from its seed;
- summarizes routing, recovery, convergence, latency, bytes/successful-route and safety counters;
- contains an initial evaluator requiring complete runs, routing floors, p95 recovery/convergence and zero listed safety violations.

This is a useful planning/evaluation library. It is **not yet evidence that the campaign has run against a real heterogeneous network**.

---

## 2. Campaign objective

The campaign must answer:

```text
Given a real multi-host TRUYN network,
when topology, reachability and trust participants change unpredictably,
do safety invariants remain absolute
and does useful routing recover within bounded time?
```

The campaign is therefore evaluated on two separate dimensions:

### Safety — hard, zero-tolerance

```text
acknowledged write loss = 0
invalid signed state accepted = 0
stale revoked receipt accepted = 0
unauthorized provider execution = 0
forged/invalid identity accepted as authoritative = 0
```

### Availability/recovery — bounded degradation allowed

During an intentional partition or destructive churn phase, some routes may legitimately fail. What matters is that:

- failure is explicit rather than corrupted success;
- safety remains intact;
- post-heal routing recovers;
- convergence/recovery remain within committed ceilings;
- tails are reported rather than hidden in averages.

---

## 3. Reproducibility model

“Randomized” does not mean irreproducible.

Every run must record:

```text
campaign version
seed
source commit
node population
failure-domain topology
selected attacker/churn/partition subsets
phase order
phase timing parameters
threshold set
```

A failing run must be replayable exactly from its evidence.

Seeds must be committed/pinned before an accepted campaign starts. Operators may add fresh seeds for future campaigns, but may not discard a failed seed merely because it exposes a regression.

---

## 4. Campaign structure

A campaign is a sequence of independently evidenced runs.

Recommended first acceptance campaign:

```text
4 committed seeds minimum
+ 1 holdout seed chosen before execution but not used during implementation tuning
= 5 real-network runs
```

The existing evaluator defaults to four runs. Architecture should evolve toward including a holdout run so implementation work cannot overfit every accepted seed.

Each run follows:

1. topology validation;
2. baseline convergence;
3. baseline routing/write/trust probes;
4. randomized churn;
5. randomized packet partition;
6. Byzantine state attack;
7. Sybil pressure;
8. eclipse pressure;
9. collusion/trust-lineage attack;
10. one compound failure phase;
11. heal/rejoin;
12. convergence/recovery measurement;
13. safety verification;
14. final routing/write/trust probes;
15. cleanup/evidence sealing.

The phase order may itself be seed-derived after the first campaign version, as long as reproducibility is preserved.

---

## 5. Churn attack

Churn tests routing-table repair, peer-record freshness and DHT replication under changing membership.

Examples:

- graceful leave;
- abrupt process death;
- restart with durable identity preserved;
- restart with transport endpoint change;
- staggered cohort loss/rejoin;
- bootstrap loss after peers have converged.

Required observations:

```text
nodes stopped
nodes restarted
identity continuity
peer-record sequence advancement
stale-client invalidation
routing success during/after churn
recovery latency distribution
```

A restart that silently creates a new identity when continuity was expected is not equivalent recovery.

---

## 6. Packet partition attack

Partition means real packet-path isolation, not merely marking peers unavailable in memory.

The campaign should create bounded network cuts using the actual host/network packet path and verify:

- routes across the cut fail explicitly;
- local-side operation remains coherent where quorum permits;
- no acknowledged state is corrupted;
- after heal, peer records/routing state converge;
- stale paths are invalidated;
- routing returns to the committed post-heal threshold.

Partition evidence must record the affected failure domains and the actual enforcement mechanism class without publishing sensitive private topology.

---

## 7. Byzantine state attack

The Byzantine phase tests malicious or defective peers that participate in the protocol but return bad state.

Attack classes should include:

- invalid signatures;
- valid signature over content that does not match the requested key/CID;
- stale sequence/value replay;
- same-sequence equivocation;
- conflicting replica responses;
- fabricated provenance references;
- revoked lifecycle state presented as current.

Acceptance invariant:

```text
invalid or stale authoritative state accepted = 0
```

Availability may degrade when too many replicas are malicious; corruption must not be converted into success.

---

## 8. Sybil pressure

The Sybil phase creates many cryptographic identities controlled by a smaller attacker failure domain.

TRUYN does **not** currently claim a globally solved permissionless Sybil-membership problem. The campaign therefore must not overstate what it proves.

The first real-network Sybil gate should prove bounded properties such as:

- signatures/identity derivation remain valid;
- duplicate identities are rejected as duplicates rather than counted as independent nodes;
- trust evidence does not treat shared lineage as independent confirmation where lineage is known;
- routing does not bypass provider authorization because many attacker identities advertise a capability;
- attacker population does not cause invalid state acceptance;
- eclipse recovery/diversity policy behaves as designed under the tested attacker budget.

A PASS here means **safety under the declared attacker budget/topology**, not universal Sybil resistance.

---

## 9. Eclipse pressure

Eclipse testing attempts to dominate a victim's useful peer neighborhood/candidate set.

The campaign should select victim nodes and manipulate reachable/advertised peer populations so attacker-controlled peers become disproportionately represented.

Required measurements:

- attacker share of candidate/routing neighborhood before attack;
- attacker share during attack;
- honest-path discovery success;
- victim routing success;
- victim recovery time after honest connectivity returns;
- whether invalid state was accepted;
- whether private-provider authorization was bypassed.

The architecture should prefer diversity inputs that are difficult for one process to fake, such as independently observed failure-domain/network information, while keeping cryptographic identity as the logical node identity.

---

## 10. Collusion / trust-lineage attack

Collusion targets Trustability rather than only packet routing.

Multiple attacker nodes may repeat or mutually attest the same false claim.

The required invariant is:

> many copies of one source lineage must not be counted as many independent confirmations.

Campaign cases should include:

- many attestations sharing one provenance root;
- multiple delegated verifier identities under one source owner;
- conflicting attestations from nominally different nodes with shared lineage;
- stale receipt reuse after revocation-state advancement;
- coordinated support for a claim with insufficient independent evidence.

Required outcome:

```text
source-independence accounting remains correct
stale revoked receipt accepted = 0
invalid trust receipt accepted = 0
```

---

## 11. Compound failure phase

Production incidents rarely occur one at a time.

Each campaign run should include at least one seeded compound phase, for example:

```text
15% churn
+ 25% packet partition
+ Byzantine replicas inside one partition
+ Sybil advertisements targeting selected victims
```

The attacker budget must remain bounded and recorded.

The compound phase is important because individually correct recovery mechanisms can interfere with one another under simultaneous pressure.

---

## 12. Heterogeneous topology requirement

The mature campaign should not be Azure-only.

Recommended target topology after the pure D-1000 scale gate:

```text
>=2 cloud/network providers
>=3 regions/failure locations
>=3 reachability classes
  - directly reachable
  - NATed private outbound
  - relay-required/restrictive path
```

Class C already proves a bounded heterogeneous Azure/GCP path. The randomized campaign should reuse that architectural principle at larger scale.

Carrier-operated field CGNAT should remain an explicit separate claim unless actually tested with a carrier-controlled path.

---

## 13. Provider-security invariant under network attack

Network adversarial testing must not ignore provider economics/security.

During every relevant phase, include negative execution probes proving:

```text
foreign requester
+ malicious routing/discovery pressure
+ known private provider ID
= zero unauthorized provider execution
```

Sybil or eclipse pressure must not turn discovery dominance into entitlement.

Provider-host authorization/billing remains authoritative even if an attacker influences routing candidates.

---

## 14. Acceptance metrics

The current campaign evaluator already models useful initial thresholds:

```text
minimum runs >= 4
completion ratio = 100%
routing success p50 >= 99%
routing success minimum >= 95%
recovery p95 <= 180s
convergence p95 <= 180s
acknowledged write loss = 0
invalid signed state accepted = 0
stale revoked receipt accepted = 0
```

The stronger real-network campaign should add:

```text
unauthorized provider execution = 0
invalid trust receipt accepted = 0
post-heal routing p50 >= 99%
per-failure-domain routing floor reported
all required attack classes have measured event evidence
cleanup complete = true
remaining ephemeral resources = 0
```

“Attack exercised” must eventually be derived from recorded actions/observations rather than a manually asserted boolean.

---

## 15. Evidence model

Each run should produce an immutable structured record containing:

```text
seed
scenario fractions
selected node IDs/failure domains
phase event log
before/during/after routing metrics
convergence/recovery distributions
write acknowledgements/retention
trust safety counters
provider-security counters
resource/bandwidth metrics
cleanup status
```

The campaign summary should aggregate distributions while preserving per-run evidence.

A summary must not erase a bad run by averaging it with good runs.

---

## 16. Failure policy

A failed seed is evidence.

Correct response:

```text
preserve failing seed/evidence
identify root cause
fix implementation
rerun same seed
then run fresh holdout seeds
```

Incorrect response:

```text
discard seed
lower attacker budget
remove attack class
raise thresholds after seeing result
```

Threshold changes require a new documented campaign version and cannot retroactively convert historical failures to PASS.

---

## 17. Implementation work that can start now

Without depending on the current D-100 acceptance result, TRUYN can implement:

1. a versioned campaign schema;
2. explicit holdout-seed support;
3. phase event recording with timestamps and affected node/failure-domain IDs;
4. evidence-derived `exercised` predicates;
5. unauthorized-provider-execution and invalid-trust-receipt safety counters;
6. per-run post-heal routing metrics;
7. compound-failure scenario generation;
8. per-failure-domain distributions;
9. strict campaign terminal verification;
10. deterministic unit tests for every attack selector and evaluator predicate;
11. real-host attack adapters for process death, packet partition and endpoint change;
12. a public sanitized report renderer that cannot hide failed seeds.

This is architecture/harness work only; it need not mutate or weaken the active D-100 V14/V15 path.

---

## 18. Exit condition

The randomized adversarial campaign is closed only when multiple committed seeds, including at least one holdout run, pass the same precommitted safety and recovery contract on a real heterogeneous topology.

A single deterministic D-100 or D-1000 PASS is necessary evidence, but not enough to claim adversarial operational resilience.
