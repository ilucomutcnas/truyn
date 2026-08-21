# TRUYN Class D 100 Real-Node V15 — Rejected Immutable Run — 2026-08-20

**Status:** **REJECTED / NOT AN ACCEPTED PASS CLAIM**  
**Disposition:** **FROZEN IMMUTABLE NEGATIVE EVIDENCE**  
**Failure class:** **INFRASTRUCTURE / AZURE CONTROL-PLANE THROTTLING**

This report preserves the exact V15 Class D-100 execution that was intentionally run once against an immutable tested commit. V15 must not be rerun. The campaign reached baseline, Byzantine and packet-partition stages successfully, then aborted during churn because Azure returned HTTP/control-plane throttling (`Too Many Requests`) to `az vm run-command invoke`. This is not a TRUYN network-predicate failure and must never be reclassified as one.

## Evidence identity

- GitHub Actions run: `32371417351`
- Job: `96432625228`
- Tested commit: `7fbae618e2f9d61057502e92cbac55533917c911`
- Trigger/workflow commit: `defa54a5f570eac75ddfbf684f2d9ee25eb7db1b`
- Temporary workflow was removed from `main` immediately after the run was pinned; cleanup commit: `ef8f1b71260b29370b632dfbc7b2421d09c09d94`
- Immutable artifact: `truyn-class-d100-v15-32371417351`
- Artifact ID: `9408244594`
- Artifact size: `2545` bytes
- Artifact digest: `sha256:59b0d3f3ba819791ad5bceef08072f918c37ec2ae77492a9031db4d033453d03`
- Artifact retention at creation: 90 days
- Wrapper campaign outcome: `failure`
- Canonical evaluator result: unavailable because the campaign aborted before `class-d-100-evidence.json` was emitted
- Wrapper evaluator code: `99` (`class_d_evidence_missing`)
- Wrapper terminal code: `99` (`class_d_terminal_evidence_missing`)
- Strict accepted gate: **FAIL / NOT EVALUABLE TO ACCEPTED PASS**
- Cleanup: **PASS**, `confirmed=true`, `remaining=0`

## Immutable preflight

The pinned runner completed its immutable acceptance preflight before Azure execution. V15 retained the exact Class D acceptance thresholds:

- baseline routing success `>= 0.99`;
- healed routing success `>= 0.99`;
- recovery p95 `<= 120000 ms`;
- convergence p95 `<= 120000 ms`;
- zero acknowledged durable-write loss;
- zero invalid signed-state acceptance;
- zero stale/revoked receipt acceptance;
- Byzantine, packet partition, churn, Sybil, eclipse and collusion exercises;
- complete ephemeral cleanup.

No predicate was reduced for V15.

## Measured campaign path before infrastructure abort

### Real topology and bootstrap

- Azure hosts provisioned: **4**
- VM size: `Standard_B2s`
- Processes per host: **25**
- Installed TRUYN processes: **100**
- Signed identities/endpoints: **100 / 100**
- Signed bootstrap records supplied: **100**
- Host routing-table ranges after bootstrap:
  - host 0: **58–71**, bootstrap **38,419 ms**
  - host 1: **58–71**, bootstrap **37,748 ms**
  - host 2: **58–71**, bootstrap **38,448 ms**
  - host 3: **58–71**, bootstrap **45,903 ms**

### Baseline routing

- Successful requests: **200 / 200**
- Routing success: **1.0**
- p50: **48.354 ms**
- p90: **56.346 ms**
- p95: **58.057 ms**
- p99: **61.399 ms**

Result: **PASS**.

### Byzantine signed-state safety

- Invalid signed state accepted: **0**
- Durable acknowledgements: **3**

Result: **PASS**.

### Real packet-path partition / heal

- Packet partition exercised: **true**
- Successes while blocked: **0**
- Recovery observation: **31,604 ms**

Result: stage exercised successfully.

## Rejection reason — Azure control-plane HTTP 429 during churn

The next stage attempted churn through Azure VM RunCommand orchestration. The campaign then received:

`ERROR: Operation returned an invalid status 'Too Many Requests'`

and terminated with a Class D failure at the churn stage.

The V15 acceptance harness performed high-frequency recovery polling by repeatedly invoking `remote`, where `remote` maps to Azure `az vm run-command invoke`. A single recovery loop could therefore create dozens of separate Azure control-plane calls. The final-acceptance wrapper intentionally bypassed the generic Azure retry path to avoid replaying guest-side mutations and only handled the explicit Azure `RunCommand busy` case; it did not handle an explicit HTTP 429 admission failure.

Therefore the immutable classification is:

**INFRASTRUCTURE / CONTROL-PLANE THROTTLING — Azure HTTP 429 before completion of the churn stage.**

This is **not** evidence that a TRUYN network predicate failed.

## What V15 does and does not establish

V15 establishes that, on the tested Kademlia-renewal commit, the 100-real-process topology bootstrapped, baseline routing was 100%, invalid signed state remained zero, and the real packet partition/heal stage completed before the infrastructure abort.

V15 does **not** establish either PASS or FAIL for the final healed-routing/convergence predicates because those stages were never reached. In particular, the run neither validates nor invalidates the V15 Kademlia renewal-placement fix at the final accepted gate.

It also does not establish the churn, Sybil, eclipse, collusion, final durability, healed-routing, canonical evaluator, or strict terminal predicates because the Azure 429 prevented the campaign from reaching/completing them.

## Cleanup

The failure trap completed infrastructure cleanup despite the control-plane abort:

- `confirmed=true`
- `remaining=0`

Result: **PASS**.

## Required follow-up

The next version must be acceptance-harness hardening only, with no change to Class D network predicates or thresholds:

1. Move churn/heal recovery polling inside the guest-side script so a recovery stage uses one RunCommand rather than up to dozens of Azure API calls.
2. Add bounded exponential backoff only for an explicit Azure HTTP 429 that occurs before guest execution is admitted.
3. Preserve fail-closed semantics: an ordinary guest-script non-zero must not be replayed.
4. Add regression coverage for `429 -> bounded retry`, `RunCommand busy -> retry`, `guest non-zero -> immediate fail`, and retry exhaustion -> fail closed.

This report is append-only evidence and must not be promoted to PASS by later results.