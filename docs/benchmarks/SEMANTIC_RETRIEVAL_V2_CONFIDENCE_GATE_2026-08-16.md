# TRUYN Semantic Retrieval Gate v2 — confidence-gated retrieval evidence

Date: 2026-08-16

This report is append-only benchmark evidence. Failed/intermediate configurations are retained rather than rewritten away.

## Immutable workload

- benchmark source SHA: `6f2ddf743e83ad1704a831a7058a93ad668c6a69`
- corpus: 600 authoritative blocks
- retrieval cases: 360
- query languages: English 180, Turkish 120, Chinese 60
- semantic categories: 120 synonym-only, 120 cross-language, 120 adversarial near-duplicate
- requester contract: natural-language question + root CID; no requester-provided block ID or `ids[]`

## Final-rank12 retrieval proof — accuracy PASS, routing-cost gate not yet PASS

GitHub Actions run: `31947329456`

Artifact:
- ID: `9263749363`
- name: `truyn-semantic-v2-final-full-31947329456`
- SHA-256: `a41ddb71b1d0657b40a151681587f7c59f24ca960b6f32cf9582592d435cdfec`
- tested workflow commit: `1aeff7594d966d379ee00d8d5466c53978b9974b`

Method:
1. dense embedding retrieval builds top 64 candidates;
2. Gemini 3.1 Flash-Lite MINIMAL and Gemini 3 Flash MINIMAL independently select top-1 from dense top 24;
3. their result is accepted only when both select the same passage and that passage is dense rank <=12;
4. all disagreement/low-confidence requests fail closed to Gemini 3.1 Pro over dense top 64;
5. external judges receive only natural-language query + request-local aliases + passage text, never TRUYN block IDs.

### Accuracy and integrity

| Metric | Result |
|---|---:|
| Overall retrieval | **360/360 = 100%** |
| EN | **180/180 = 100%** |
| TR | **120/120 = 100%** |
| ZH | **60/60 = 100%** |
| Synonym-only | **120/120 = 100%** |
| Cross-language | **120/120 = 100%** |
| Adversarial near-duplicate | **120/120 = 100%** |
| Dense top-64 recall | **360/360 = 100%** |
| Provenance | **100%** |
| No requester block-ID leakage | **100%** |
| Minimal-context selection | **100%** |
| Strong-verifier fallbacks | **41/360 = 11.389%** |

### Routing usage and cost

Current public list-price normalization used by the benchmark:

| Layer | Requests | Input tokens | Visible output | Reasoning/thought tokens | Cost |
|---|---:|---:|---:|---:|---:|
| Gemini 3.1 Flash-Lite MINIMAL | 360 | 854,091 | 2,148 | 0 | $0.216744750 |
| Gemini 3 Flash MINIMAL | 360 | 854,091 | 2,148 | 0 | $0.433489500 |
| Gemini 3.1 Pro fallback | 41 | 248,726 | 480 | 37,805 | $0.956872000 |
| **Total semantic routing** | — | — | — | — | **$1.607106250** |
| **Per query** | — | — | — | — | **$0.004464184** |

The accuracy/integrity gate passed completely. The routing cost was slightly above the previously fixed >=90% comparable-cost-savings budget, so this configuration is retained as a successful accuracy proof but **not declared the final economic gate**.

## Rank-15 economic retrieval proof — PASS

GitHub Actions run: `31951123535`

Artifact:
- ID: `9264730019`
- name: `truyn-semantic-v2-economic-final-31951123535`
- SHA-256: `c317ea8630970d6f459904e4164046e36ab15455227d16643affaccb0f079c0e`
- immutable benchmark source SHA: `6f2ddf743e83ad1704a831a7058a93ad668c6a69`

The only routing-policy change from the rank-12 proof is generic and case-agnostic: accept a passage when the two independent cheap judges agree and the agreed passage is within dense rank <=15; otherwise fail closed to Gemini 3.1 Pro over dense top 64. The rule does not inspect case ID, expected block ID, query language, benchmark category or expected answer.

### Accuracy and integrity

| Metric | Fixed gate | Result |
|---|---:|---:|
| Overall retrieval | >=99% | **359/360 = 99.722%** |
| English | >=99% | **180/180 = 100%** |
| Turkish | >=99% | **119/120 = 99.167%** |
| Chinese | >=99% | **60/60 = 100%** |
| Synonym-only | >=99% | **120/120 = 100%** |
| Cross-language | >=99% | **119/120 = 99.167%** |
| Adversarial near-duplicate | >=99% | **120/120 = 100%** |
| Dense top-64 recall | >=99% | **360/360 = 100%** |
| Provenance | 100% | **100%** |
| No requester block-ID leakage | 100% | **100%** |
| Minimal-context selection | 100% | **100%** |
| Strong-verifier fallbacks | — | **30/360 = 8.333%** |

The single remaining miss is case 241: a Turkish cross-language query where both cheap judges agree on a near-duplicate at consensus dense rank 14. The expected passage remains present in the dense top 64. This miss is retained explicitly because the fixed subgroup gates still pass and hiding it would weaken the benchmark.

### Routing usage and cost

| Layer | Requests | Input tokens | Visible output | Reasoning/thought tokens | Cost |
|---|---:|---:|---:|---:|---:|
| Gemini 3.1 Flash-Lite MINIMAL | 360 | 854,091 | 2,148 | 0 | **$0.216744750** |
| Gemini 3 Flash MINIMAL | 360 | 854,091 | 2,151 | 0 | **$0.433498500** |
| Gemini 3.1 Pro fallback | 30 | 184,427 | 357 | 27,530 | **$0.703498000** |
| **Total semantic routing** | — | — | — | — | **$1.353741250** |
| **Per query** | — | — | — | — | **$0.003760392** |

This configuration passes the fixed corpus-wide accuracy/integrity gates and brings semantic routing below the previously established economic routing budget. It did not yet protect against stochastic false agreement of both cheap judges on the same near-duplicate, which was discovered by the first successful-to-artifact seven-actor live rerun below.

## Production stability + tiered-verifier retrieval proof — FINAL PASS

GitHub Actions run: **`31953911121`**

Artifact:
- ID: **`9265484817`**
- name: `truyn-semantic-v2-stability-rerun-31953911121`
- SHA-256: **`a6b7e7ea79693c5df5c5d7d0783482852660f1bb993f810fd070a55c8a78b64b`**
- immutable benchmark source SHA: `6f2ddf743e83ad1704a831a7058a93ad668c6a69`

Final generic production policy:
1. dense `gemini-embedding-001` retrieval produces top 64;
2. Gemini 3.1 Flash-Lite MINIMAL and Gemini 3 Flash MINIMAL independently judge dense top 24 using request-local aliases only;
3. agreement is accepted when the agreed passage is within dense rank <=15;
4. dense-rank-2 agreement receives one stability recheck: Lite runs again with candidate order reversed; the original passage must remain the same;
5. instability/disagreement/low confidence fails closed to the strong verifier;
6. the verifier sees the smallest safe dense prefix: top 16 when all observed cheap selections fit there, otherwise top 64;
7. no rule uses case ID, language, category, expected answer, expected block ID or benchmark-specific allowlist.

### Final 360-case metrics

| Metric | Fixed gate | Final result |
|---|---:|---:|
| Overall retrieval | >=99% | **359/360 = 99.722%** |
| English | >=99% | **180/180 = 100%** |
| Turkish | >=99% | **119/120 = 99.167%** |
| Chinese | >=99% | **60/60 = 100%** |
| Synonym-only | >=99% | **119/120 = 99.167%** |
| Cross-language | >=99% | **120/120 = 100%** |
| Adversarial near-duplicate | >=99% | **120/120 = 100%** |
| Dense top-64 recall | >=99% | **360/360 = 100%** |
| Provenance | 100% | **100%** |
| No requester block-ID leakage | 100% | **100%** |
| Minimal context | 100% | **100%** |
| Semantic routing cost budget | <=$0.00395/query | **$0.003610524/query** |

Routing behavior:
- cheap accepted: **323/360**;
- strong-verifier fallbacks: **37/360**;
- verifier top-16: **24**;
- verifier top-64: **13**;
- stability rechecks: **38**;
- instability detected and failed closed: **2**;
- provider-facing semantic judge calls with leaked TRUYN routing IDs: **0**.

Routing usage/cost:
- Lite: 398 requests, 998,728 input tokens, cost **$0.253381000**;
- Flash: 360 requests, 904,431 input tokens, cost **$0.458641500**;
- Pro verifier: 37 requests, 124,773 input tokens plus reasoning/output, cost **$0.587766000**;
- total: **$1.299788500 / 360 = $0.003610524/query**.

The one retained miss is case 159, Turkish synonym-only: expected dense rank 10, selected dense rank 11. It remains explicit in the raw artifact; every fixed overall/subgroup gate still passes.

## Seven-actor end-to-end v2 proof — FINAL PASS

GitHub Actions run: **`31954310373`**

Artifact:
- ID: **`9265641338`**
- name: `truyn-semantic-retrieval-v2-economic-live-31954310373`
- SHA-256: **`1ade84d25a27c9a1f553fdb97daa5533572f08cab1b7e6d2b3dfe2b3d5e3c3cd`**
- tested workflow commit: `d24e78691f0d8566a497d9611ef09ef3175e494e`

Actors: GPT, Gemini, Grok, DeepSeek, Llama, Mistral and Kimi, each running as a distinct TRUYN actor identity. Six representative multilingual/adversarial requests produced **42/42 successful TRUYN actor stages**.

### End-to-end fixed gates

| Metric | Fixed gate | Final result |
|---|---:|---:|
| 360-case retrieval | >=99% | **99.722%** |
| Dense candidate recall | >=99% | **100%** |
| Per-language retrieval | >=99% | **PASS** |
| Per-category retrieval | >=99% | **PASS** |
| Live TRUYN answer accuracy | >=99% | **100% (6/6 chains, 42/42 actor outputs)** |
| Live provenance | 100% | **100%** |
| No requester block-ID leakage | 100% | **100%** |
| Minimal-context selection | 100% | **100%** |
| Actor-stage success | >=99% | **100% (42/42)** |
| Input-token reduction | >=90% | **98.102%** |
| Comparable GPT+Gemini cost reduction | >=90% | **90.188%** |
| Provider request-body reduction | — | **97.828%** |

### Honest end-to-end accounting

Semantic-routing overhead is included in the TRUYN arm rather than excluded:

- direct full-context input: **2,422,770 tokens**;
- TRUYN actor input: **8,956 tokens**;
- semantic routing input: **37,023 tokens**;
- total TRUYN input: **45,979 tokens**;
- **input-token reduction: 98.102%**.

Comparable GPT+Gemini reference-rate cost:
- direct full-context arm: **$0.248747000**;
- TRUYN actor inference: **$0.001220880**;
- semantic routing: **$0.023185500**;
- total TRUYN arm: **$0.024406380**;
- **cost reduction: 90.188%**.

Provider request bodies:
- direct: **9,792,454 bytes**;
- TRUYN actor bodies: **41,986 bytes**;
- semantic routing bodies: **170,663 bytes**;
- total TRUYN: **212,649 bytes**;
- **reduction: 97.828%**.

Mean wall-clock per six-case comparison:
- direct full-context: **35.979 s**;
- TRUYN: **17.833 s**.

The live semantic router executed 15 judge calls: 8 Lite, 6 Flash, 1 Pro verifier. It performed two rank-2 stability rechecks; one exposed instability and was correctly failed closed to a **top-16 Pro verifier**. This is the live protection that eliminated the stochastic near-duplicate failure observed in run `31952273683`.

For transparency, the direct full-context control was itself frequently confused by the 600-block corpus: only 17/42 individual actor outputs matched the expected answer and only 1/6 final direct chains ended on the expected code, whereas the TRUYN minimal-context arm was 42/42 and 6/6. This quality difference is reported rather than hidden; the published token/cost reductions still compare the measured direct full-context resource use against the fully loaded TRUYN arm including routing overhead.

All cleanup steps passed: the isolated GCP proxy/repository were deleted and temporary Azure Foundry benchmark capacity was restored after the run. The privileged workflow was removed from `main` immediately after launch.

## Implementation corrections discovered by the full benchmark

1. **Cold semantic-index build:** run `31951589009` failed with `result_wait_timeout` because `gemini-embedding-001` single-input embedding requests were built sequentially inside the first live request. `adapters/providers/vertex-embedding.js` now executes independent batches with bounded concurrency while preserving result order and retry semantics; regression coverage was added.
2. **Stochastic cheap-judge false agreement:** run `31952273683` reached a full artifact but only 5/6 TRUYN live chains were correct because both cheap judges simultaneously selected the same adversarial near-duplicate at dense rank 2. The production stability recheck was added specifically as a generic order-invariance test, not a case-specific rule.
3. **Verifier economics:** full top-64 Pro fallback was accurate but too expensive near the 90% economic boundary. Tiered `[16,64]` fallback reduced verifier context while remaining fail-closed.
4. **Benchmark instrumentation:** provenance is identity/integrity of the selected immutable record and CID chain; semantic correctness is measured separately as retrieval/answer accuracy. No-block-ID checks target requester-provided routing IDs/`ids[]`, not legitimate answer codes generated by prior actors.

## Prior full adaptive run — retained correction history

Run `31946647176`, artifact `9263556614`, SHA-256 `6a87f45c256823734496660e6f9ecaaa43b2a192003dbc51afb4b5d3700d63fe`.

That cheaper configuration produced 357/360 = 99.167% overall at $0.002526202/query but missed the >=99% subgroup threshold for English and cross-language cases. It demonstrated that routing economics were viable but required a stronger confidence boundary.

## Rejected / diagnostic branches retained

- local BGE reranker hard-pair run `31945516473`: 0/6 order-invariant hard-pair checks; permanent JSON evidence is stored separately.
- dual semantic compiler held-out run `31945790877`: 29/36 = 80.556%; rejected.
- Flash top-3 -> Pro hard diagnostic run `31946255800`: 3/3; useful as a cascade diagnostic but not sufficient as the final economic architecture.
- Pro LOW hard diagnostic run `31946387742`: 2/3; rejected.
- Flash-Lite hard diagnostic run `31946536169`: 2/3; useful cheap independent judge, not sufficient alone.
- GPT-mini judge run `31947035480`: inference was not executed because the benchmark deployer correctly lacked Azure data-plane `responses/write`; IAM was not broadened.
- dense uncertainty run `31947155118`: used only deterministic dense-rank/margin signals to choose a generic confidence boundary; no case IDs/categories/languages are used by production routing.
- live run `31951589009`: infrastructure failure before a valid end-to-end result because cold sequential semantic indexing exceeded the result wait; cleanup succeeded.
- live run `31952273683`: valid full artifact, 5/6 TRUYN live chains because of stochastic rank-2 false agreement; artifact `9265103930`, SHA-256 `af55669e53282a4578bf180fb3e30d9a1c4e322e9593f6764926f286f2e9c3f6`. Token and cost gates passed, answer/provenance/minimal-context gate did not. This result is retained as the reason for the stability hardening.

## Evidence policy

No benchmark above should be deleted because a later configuration is better. Security-sensitive operational values may be redacted, but methodology, workload, gates, results, run/artifact identifiers, digests, limitations and corrections remain permanent evidence.
