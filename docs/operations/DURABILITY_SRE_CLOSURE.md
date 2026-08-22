# TRUYN Durability and SRE Production Closure

**Status:** target operational architecture; not a current production/mainnet claim.

**Snapshot:** 2026-08-20

This document defines the operational gate that follows accepted real-node scale and randomized adversarial network evidence.

Class D-100 and D-1000 answer whether the network can run and scale. The randomized campaign answers whether safety/recovery survive hostile conditions. Production closure must additionally prove that TRUYN can be **operated repeatedly, upgraded, observed, recovered and rolled back without losing acknowledged state or weakening security**.

---

## 1. Production closure is a separate maturity state

A network is not productionized merely because a large benchmark passes once.

Production closure requires repeatable evidence for:

```text
durability
observability
incident response
capacity control
release/rollback
security operations
long-running stability
recovery from infrastructure loss
```

The intended progression is:

```text
D-100 accepted
    ↓
D-1000 accepted
    ↓
randomized adversarial accepted
    ↓
Durability/SRE closure
    ↓
stable compatibility + installer/updater + mainnet readiness
```

Architecture/harness work for this gate can proceed before the current D-100 run completes.

---

## 2. Durability classes

TRUYN should distinguish failure classes explicitly.

### Class R1 — process restart

Already exercised in bounded reference/scale work:

```text
process dies
persistent state survives
same host/storage remains
process restarts
identity/state recover
```

This is necessary but not sufficient.

### Class R2 — host loss

The entire compute host disappears while its persistent storage may or may not survive.

Required proof:

- surviving replicas preserve acknowledged replicated state;
- replacement nodes can join from surviving network state;
- lost local routing/cache state is reconstructable;
- no deleted host is required as an authoritative registry;
- recovery does not require restoring a central global database.

### Class R3 — host + local volume loss

The host and its local persistent disk/state are destroyed.

Required invariant:

> an acknowledged replicated write must survive if the configured durability contract said it was durably accepted before the loss.

This is the important boundary that process-restart tests cannot prove.

### Class R4 — failure-domain loss

Lose an entire declared failure domain such as a host group, availability zone/region cohort or cloud cohort within the supported topology.

The accepted claim must state the failure budget it actually tolerates; it must not imply universal regional survivability from a smaller test.

---

## 3. Acknowledgement semantics

The system must define what an acknowledgement means.

For replicated state, a successful acknowledgement should imply that the configured write/durability policy has been satisfied before success is returned.

Conceptually:

```text
client write
    ↓
validate/sign
    ↓
replicate to target holders
    ↓
receive required durable acknowledgements
    ↓
only then return accepted/success
```

If the system cannot satisfy the configured durability quorum, it should fail explicitly rather than acknowledge work that can disappear on the next host loss.

The production gate should therefore preserve the absolute metric:

```text
acknowledged write loss = 0
```

under every supported failure class.

---

## 4. Identity durability

TRUYN identity is logical identity, not IP address or host identity.

Production recovery must define when identity continuity is expected.

### Expected continuity

For a normal node replacement/restart using its authorized durable identity material:

```text
same TRUYN node identity
new process/host/IP possible
new peer record sequence
new reachable endpoint(s)
```

### Expected rotation

When key material is intentionally rotated or revoked, the lifecycle must be explicit and verifiable.

The operator must not silently regenerate identities merely because a machine was recreated.

Private keys should use appropriate OS/cloud secure secret storage. Public repository evidence should never publish private identity material.

---

## 5. State ownership and rebuildability

Every local state class should have one of three durability semantics:

### Authoritative durable

Loss is unacceptable after acknowledgement unless the declared replica/failure budget is exceeded.

Examples may include security-critical signed lifecycle state and accepted replicated records.

### Reconstructable durable/cache

May be lost locally because it can be rebuilt from independently authoritative objects/peers.

Examples include routing-table/cache/index material where the protocol defines safe reconstruction.

### Ephemeral

Can disappear without correctness impact.

Examples include transient connections, in-flight diagnostics and bounded caches.

No state should accidentally become authoritative merely because one implementation stores it on disk.

---

## 6. Crash consistency

Durable files/stores must be safe against interruption during writes.

The production gate should exercise:

- process kill during persistence;
- partial temporary-file creation;
- restart during peer-record sequence advancement;
- restart during replicated write acknowledgement flow;
- restart during revocation/transparency head advancement;
- repeated restart loops.

The expected behavior is either:

```text
previous valid state
```

or

```text
new complete valid state
```

—not a partially written authoritative state accepted as valid.

---

## 7. Rolling upgrade architecture

A production network must support deploying a compatible release without stopping the entire network.

Target sequence:

```text
preflight new binary/config
      ↓
upgrade bounded cohort
      ↓
health + compatibility + routing checks
      ↓
continue cohort-by-cohort
      ↓
full-network verification
```

Required properties:

- no identity reset during ordinary upgrade;
- no silent storage/schema corruption;
- explicit protocol/wire compatibility checks;
- bounded mixed-version period;
- rollback remains available until the migration crosses an explicitly irreversible boundary;
- provider authorization defaults remain fail-closed throughout upgrade.

Stable automatic update is not required before architecture exists, but its invariants must be defined before mainnet.

---

## 8. Rollback architecture

Rollback is a first-class production requirement.

A release must identify:

```text
previous compatible binary
previous compatible config/schema
migration version
rollback-safe boundary
operator trigger
verification procedure
```

If a migration is one-way, the release must say so before deployment and require explicit handling rather than pretending generic rollback is possible.

A failed release must not require deleting evidence or resetting cryptographic identity.

---

## 9. Observability contract

TRUYN production observability should expose enough information to determine network health without publishing secrets or private topology.

### Node health

At minimum:

- process readiness;
- identity loaded/valid state;
- current peer-record sequence/expiry health;
- QUIC listener readiness;
- routing-table size;
- connected peer count;
- DHT RPC success/error rates;
- replication acknowledgement latency;
- queue/backpressure state;
- durable-store health;
- provider authorization/billing denial counters where applicable.

### Network health

At minimum aggregate:

- routing success distribution;
- routing latency p50/p90/p95/p99;
- convergence/recovery distributions;
- peer-record freshness distribution;
- replication/quorum success;
- acknowledged-write-loss counter;
- invalid-state rejection/acceptance counters;
- stale-receipt rejection/acceptance counters;
- relay fallback rate;
- NAT/reachability class distribution where known;
- resource saturation/backpressure distribution.

### Security health

At minimum aggregate:

- signature/replay rejection counts;
- provider access denials;
- entitlement/billing fail-closed events;
- invalid/stale state rejection;
- edge/origin/M2M proof failures for deployments using those controls.

Diagnostics must avoid logging secret proof values, raw credentials or unnecessary private topology.

---

## 10. SLO architecture

TRUYN should not invent production SLO numbers from one benchmark run.

The correct sequence is:

1. collect stable testnet/scale distributions;
2. define candidate SLOs before the soak acceptance run;
3. execute long-running operation against those precommitted SLOs;
4. publish the bounded result and limitations.

Candidate SLO dimensions include:

```text
routing availability
routing latency
convergence time
recovery time
replication acknowledgement success
peer-record freshness
backpressure/error budget
```

Safety metrics are not error-budget metrics:

```text
acknowledged write loss = 0
invalid authoritative state accepted = 0
unauthorized provider execution = 0
```

These remain hard invariants.

---

## 11. Soak testing

A short benchmark can miss leaks, timer bugs, expiry bugs and cumulative routing degradation.

Production closure therefore needs long-running testnet operation.

Recommended progression:

```text
6-hour engineering soak
24-hour acceptance soak
72-hour extended stability soak
```

The exact accepted duration should be committed before the run and may evolve by release class.

Soak phases should include normal background churn rather than a perfectly static network.

Measure:

- memory growth;
- file-descriptor/socket growth;
- routing-table health;
- peer-record renewal continuity;
- error-rate drift;
- replication state growth;
- disk growth;
- latency distribution drift;
- relay fallback drift;
- repeated cleanup/rejoin cycles.

---

## 12. Capacity and overload

Production behavior under overload must be explicit.

The current underlay already has bounded admission/backpressure semantics. Production closure should prove the system does not replace overload with silent loss.

Required behavior:

```text
capacity available → accept
capacity exhausted → explicit backpressure/retryable failure
never silently drop acknowledged work
```

Capacity testing should cover:

- connection pressure;
- concurrent DHT RPC;
- routing request bursts;
- replicated writes;
- provider dispatch queues;
- artifact/reference traffic where relevant.

---

## 13. Incident response architecture

A production deployment needs documented operator actions for at least:

- bad release;
- peer-record expiry/freshness incident;
- widespread routing degradation;
- relay degradation/outage;
- replicated-state divergence;
- compromised/revoked identity;
- provider authorization incident;
- edge/origin proof compromise where deployed;
- cloud/region outage;
- disk/state corruption;
- runaway resource consumption.

Each runbook should define:

```text
detection signal
safe containment action
security invariant to preserve
recovery action
verification
post-incident evidence
```

Emergency controls must fail closed for private/chargeable provider execution.

---

## 14. Release evidence

A production candidate release should have an evidence bundle linking:

```text
source commit/tag
CI/security result
D-100 / D-1000 evidence relevant to the implementation
randomized adversarial campaign version/result
soak result
upgrade result
rollback result
host/volume-loss durability result
compatibility/migration version
known limitations
```

Historical benchmark reports remain append-only. New releases link to them; they do not rewrite them.

---

## 15. Mainnet readiness boundary

Even after durability/SRE closure, stable public mainnet additionally requires:

- declared stable `TRUYN/1` compatibility policy;
- signed/verifiable distribution artifacts;
- installer/service lifecycle for supported platforms;
- authenticated updater and migration policy;
- stable bootstrap publication/discovery mechanism;
- production account/tenant/entitlement systems for any commercial non-BYOK mode being offered;
- public operational/security documentation appropriate to the released network.

A technically stable BYOK testnet can mature before every optional commercial billing mode exists. Commercial claims should remain scoped to what is actually deployed.

---

## 16. Work that can start now

This architecture allows independent implementation work while D-100 is still running:

1. define durable-state ownership inventory;
2. build host+volume-loss test harnesses;
3. add acknowledged-write survival probes after destructive host replacement;
4. define node/network observability schema;
5. add leak/drift measurements for soak tests;
6. build rolling-upgrade test harness;
7. build rollback/migration compatibility tests;
8. define candidate SLO metric names without committing final numerical SLOs yet;
9. add incident/runbook documentation skeletons;
10. add release-evidence manifest schema;
11. ensure provider authorization/security counters remain part of operational health;
12. add automated cleanup verification to every destructive infrastructure test.

None of these tasks requires the result of the current D-100 acceptance run.

---

## 17. Exit condition

TRUYN reaches operational production closure only when destructive durability, upgrade/rollback, observability, long-running soak and incident-response gates are executable and evidenced—not merely documented.

The network should be able to lose processes, hosts and supported failure domains, recover, upgrade and roll back while preserving the invariants it previously proved at smaller gates.
