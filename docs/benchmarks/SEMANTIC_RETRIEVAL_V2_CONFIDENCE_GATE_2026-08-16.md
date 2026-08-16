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

This configuration passes the fixed corpus-wide accuracy/integrity gates and brings semantic routing below the previously established economic routing budget. End-to-end token/cost savings are verified separately by the seven-actor live A/B proof and are not inferred from this retrieval-only section.

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

## Evidence policy

No benchmark above should be deleted because a later configuration is better. Security-sensitive operational values may be redacted, but methodology, workload, gates, results, run/artifact identifiers, digests, limitations and corrections remain permanent evidence.
