# TRUYN Class D 100 Real-Node V14 — Rejected Immutable Run — 2026-08-20

**Status:** **REJECTED / NOT AN ACCEPTED PASS CLAIM**  
**Disposition:** **FROZEN IMMUTABLE NEGATIVE EVIDENCE**

This report preserves the exact V14 Class D-100 execution that was intentionally run once against an immutable tested commit. The real 4-host/100-process campaign reached all adversarial stages and completed cleanup, but it failed the unchanged healed-routing/convergence acceptance gate. It must never be reinterpreted as an accepted Class D-100 result.

## Evidence identity

- GitHub Actions run: `32367799512`
- Tested commit: `b835c8fa0283a004d616ce8d25d7aa78cee1a1c0`
- Trigger/workflow commit: `9672500f0935847b639ee1bf317c672f0ce5d6e5`
- Temporary workflow was removed from `main` immediately after the run was pinned; cleanup commit: `276d96176d92e2186c27d0f13741222470f40407`
- Immutable artifact: `truyn-class-d100-v14-32367799512`
- Artifact ID: `9407078066`
- Artifact size: `2787` bytes
- Artifact digest: `sha256:80f20907bb9389b442aa6d68cb9fc29bb40d10d599162c85a2c1140dfe9f60bf`
- Artifact retention at creation: 90 days
- Canonical evaluator result: unavailable because the campaign aborted before `class-d-100-evidence.json` was emitted
- Wrapper evaluator code: `99` (`class_d_evidence_missing`)
- Wrapper terminal code: `99` (`class_d_terminal_evidence_missing`)
- Strict accepted gate: **FAIL**
- Cleanup: **PASS**, `confirmed=true`, `remaining=0`

## Immutable preflight

The pinned runner completed its immutable security and acceptance preflight successfully before Azure execution. The tested commit retained the canonical Class D predicates:

- baseline routing success `>= 0.99`;
- healed routing success `>= 0.99`;
- recovery p95 `<= 120000 ms`;
- convergence p95 `<= 120000 ms`;
- zero acknowledged durable-write loss;
- zero invalid signed-state acceptance;
- zero stale/revoked receipt acceptance;
- bounded packet partition, churn, Byzantine, Sybil, eclipse and collusion exercises;
- complete ephemeral cleanup.

No predicate was reduced for V14.

## Measured campaign path

### Real topology and bootstrap

- Azure hosts provisioned: **4**
- VM size: `Standard_B2s`
- Processes per host: **25**
- Intended/installed TRUYN processes: **100**
- Signed identities/endpoints per host: **25 / 25**
- Signed bootstrap records supplied: **100**
- Bootstrapped nodes per host: **25**
- Observed bounded Kademlia routing-table sizes after bootstrap: **61–66**

The bounded routing-table size is not a failure: Class D validates 100 accepted signed peer records and later traffic success rather than requiring Kademlia routing tables to contain a full-membership list.

### Baseline routing

- Successful requests: **200 / 200**
- Routing success: **1.0**
- p50: **55.796 ms**
- p90: **61.169 ms**
- p95: **64.104 ms**
- p99: **64.645 ms**

Result: **PASS**.

### Byzantine signed-state safety

- Invalid signed state accepted: **0**
- Durable acknowledgements: **3**

Result: **PASS**.

### Real packet-path partition / heal

- Packet partition exercised: **true**
- Successes while blocked: **0**
- Initial recovery observation: **34,073 ms**

Result: exercised successfully.

### Churn / restart

- Processes stopped: **8**
- Processes restarted: **8**
- Identity state preserved: **true**
- Recovery observation: **32,069 ms**

Result: exercised successfully.

### Sybil / eclipse pressure

- Attacker nodes: **33**
- Attacker budget fraction: **0.33**
- Eclipse exercised: **true**
- Escape after heal: **true**
- Observation duration: **98.533 ms**

Result: exercised successfully.

### Collusion observation

- Colluders: **3**
- Coordinated valid signed records observed: **3**
- Consensus claim: **false**

This remains an adversarial observation, not a claim of BFT consensus.

### Durability

- Durable valid records observed: **1**

Result: durability stage completed.

## Rejection reason — healed convergence

The accepted gate requires the complete source failure-domain set to recover to at least `0.99` routing success within `120000 ms` before the final healed measurement is accepted. V14 produced:

| Attempt | Success | Routing success | Elapsed convergence |
| --- | ---: | ---: | ---: |
| 1 | 89 / 100 | 0.89 | 32,917 ms |
| 2 | 94 / 100 | 0.94 | 67,461 ms |
| 3 | 95 / 100 | 0.95 | 102,128 ms |
| 4 | 96 / 100 | 0.96 | 137,003 ms |

The final readiness assertion failed with:

`healed readiness routingSuccess=0.96`

Therefore V14 failed both required dimensions: routing never reached `>=0.99`, and the bounded convergence window exceeded `120000 ms`. The campaign terminated before producing canonical accepted evidence.

## Cleanup

Despite the rejected network result, the failure trap completed infrastructure cleanup:

- `confirmed=true`
- `remaining=0`

Result: **PASS**.

## Engineering conclusion

V14 proved that durable expired signed peer hints alone were insufficient for bounded post-churn convergence at 100 real processes. The follow-up diagnosis found that proactive peer-record renewal selected `snapshot() -> nodeId lexical sort -> first K`, causing all nodes to concentrate fresh renewed leases into nearly the same recipient subset rather than distributing each record near its Kademlia key. V15 changes that placement behavior while preserving all V14 acceptance predicates.

## What this run proves

V14 is useful negative evidence: it proves successful immutable preflight, 100 real process bootstrap, perfect baseline routing, Byzantine signed-state rejection, packet partition, churn/restart, Sybil/eclipse pressure, collusion observation, durability execution and complete cleanup under the tested commit.

## What this run does NOT prove

It does **not** prove accepted Class D-100 resilience because healed routing/convergence failed the canonical gate. It also does not prove 1,000-node scale, randomized long-duration adversarial resilience, production SLO closure, or Internet-scale operation.

This report is append-only evidence and must not be promoted to PASS by later results.
