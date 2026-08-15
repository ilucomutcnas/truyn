# TRUYN Cross-Cloud 8× Hot-Path Optimization — 2026-08-15

Status: **PASSED**.

Fixed gate: baseline `4143.4 B / 1491.2 ms`, required improvement `8×`, limits `<=517.925 B / <=186.4 ms`. The criteria were not relaxed.

## Security scope

This benchmark used project-authorized reference providers. It measures TRUYN transport/orchestration performance; it does **not** establish public entitlement to those providers or prove the separate provider-ownership/tenant security gate.

The intentionally public relay hostname and benchmark evidence remain public. Private provider backchannel/origin details and cloud identities are not part of the public benchmark contract.

## Final evidence

- workflow run `31893179457` (run #19), head `6efd1519b07efe700cccec57283d4497fe3a6ea1`
- canonical relay `https://relay.truyn.org`
- requester hot path: persistent `wss://relay.truyn.org`
- provider hot paths: persistent authenticated relay backchannels
- 1 warm-up pair; 5 measured pairs
- artifact `truyn-cross-cloud-ab-31893179457`, ID `9249215054`
- artifact SHA-256 `13467bcf92c7999513b670d55f6ccc419ec1d8818d026f1b85f93753f655d4ac`, 7347 B, expires 2026-09-14
- 8 provider rate-limit retries; waits excluded from successful-arm latency; 0 relay bootstrap network retries

## Fixed-gate result

| Metric | Baseline | Fixed max | Final mean | Improvement | Result |
|---|---:|---:|---:|---:|---|
| Protocol overhead | 4143.4 B | 517.925 B | **375 B** | **11.049×** | PASS |
| Orchestration overhead | 1491.2 ms | 186.4 ms | **58.8 ms** | **25.361×** | PASS |

The orchestration result is 127.6 ms below the unchanged limit. The explicit `Enforce 8x optimization gate` workflow step passed.

## Final relay trace

| Timestamp segment | Mean |
|---|---:|
| public request received -> stage1 socket dispatch | **0.805 ms** |
| stage1 socket dispatch -> stage1 result received | **977.488 ms** |
| stage1 result received -> stage2 socket dispatch | **0.879 ms** |
| stage2 socket dispatch -> stage2 result received | **1906.162 ms** |
| stage2 result received -> response flushed | **0.889 ms** |

The two long segments contain provider inference. Non-provider orchestration means were: requester public-edge residual `37.376 ms`; stage2 socket `13.162 ms`; stage1 socket `5.688 ms`; final flush `0.889 ms`; stage transition `0.879 ms`; ingress-to-stage1 `0.805 ms`.

The trace-guided requester WebSocket change reduced the public-edge residual from approximately `307.147 ms` in the diagnostic HTTP-chain run to `37.376 ms`, approximately **87.8% lower**.

## Passing-run A/B context

Direct mean E2E: `2891.2 ms`; TRUYN: `2923.6 ms`. Direct provider latency: `2891.2 ms`; TRUYN: `2864.8 ms`. Therefore the TRUYN transport/orchestration gate passed, but this five-pair run does not establish a total E2E speed advantage over direct.

Provider input tokens were equal at `228.4` mean. Provider total tokens were `554.2` direct vs `588.6` TRUYN; estimated variable inference cost was `$0.000868684` direct vs `$0.000954536` TRUYN. This gate was transport/orchestration, not semantic token compression.

Measured application bytes were `4289.2 B` direct vs `6781.6 B` TRUYN because detached semantic payload bytes remain in addition to the now-compact 375 B signed control plane.

## Implemented changes measured by this historical benchmark

1. Session-bound compact Ed25519-signed control frames replaced repeated multi-kilobyte hot-path envelopes.
2. The two-provider public workflow became one signed CHAIN request.
3. Provider dispatch/results moved to persistent authenticated relay backchannels.
4. Relay monotonic timestamps were added around both stage transitions and response flush.
5. The trace identified the requester-facing public edge as the remaining bottleneck.
6. Requester CHAIN/result transport moved to a pre-established persistent WebSocket over canonical `wss://relay.truyn.org`; HTTP remains fallback.
7. Benchmark assertions require requester=`websocket` and provider stages=`socket,socket`.
8. The benchmark harness closes the requester socket after report generation.

These historical implementation facts do not imply that the newer provider-ownership/authorization architecture is already implemented.

## Conclusion

> TRUYN reduced its own measured cross-cloud protocol overhead from 4143.4 B to 375 B and orchestration overhead from 1491.2 ms to 58.8 ms, passing the pre-declared 8× optimization gate without lowering the acceptance criteria.

Token, cost, total application-byte reduction and provider-authorization security remain separate objectives. The provider-security claim requires the negative matrix in `../architecture/THREAT_MODEL.md`.
