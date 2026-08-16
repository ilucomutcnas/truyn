# TRUYN Semantic Concurrent Load / Multi-Agent Deduplication — 2026-08-16

Status: **PASS within the current relay queue capacity; one larger burst is retained as a relay-capacity FAIL.**

This report is permanent benchmark evidence. It records both the successful semantic concurrency proof and the earlier failed 350-NEED experiment that exposed the current relay queue boundary.

## Scope

The benchmark tests concurrent Semantic Retrieval Gate behavior when independent signed TRUYN requester identities representing the current actor families compete for one or several immutable root CIDs:

- GPT
- Gemini
- Grok
- DeepSeek
- Llama
- Mistral
- Kimi

Every requester sends a normal signed `NEED`. The agent-facing input is exactly:

```text
question + rootCid
```

No block ID, candidate list, internal vector key or `ids[]` is supplied.

The benchmark uses deterministic delayed semantic embedder/reranker instrumentation so duplicate paid-work multiplicity is observable exactly. It is a **concurrency/deduplication mechanics proof**, not a claim that 280 external model-inference API calls were made. Live provider quality/economic evidence remains the separate Semantic Retrieval v2 proof.

## Production change proved

Before this work, the semantic result cache deduplicated only after the first retrieval completed. Concurrent cache misses for the same `root CID + question + retrieval configuration` could therefore race and repeat query embedding and reranking work.

Production now wraps the semantic router in a process-local single-flight coordinator.

The coordinator provides:

1. one root warm/load flight per root CID;
2. one complete retrieval flight per `rootCid + queryHash + topK`;
3. one query-key execution lane across roots, so the underlying query projection/embedding cache is populated once for the same question;
4. one rerank per distinct root candidate set; candidate sets from different roots are never incorrectly reused;
5. follower requests receive cloned results from the leader flight;
6. invalidation clears the corresponding warm/root retrieval state.

Production factory default:

```text
singleFlight = true
```

An explicit `singleFlight:false` remains available for diagnostic comparison.

Relevant implementation:

- `core/context/singleflight-semantic-router.js`
- `core/context/production-semantic-index.js`
- `tests/semantic-concurrency-singleflight.test.js`
- `benchmarks/semantic-concurrent-load.js`

## Regression proof before relay-level load

Commit: **`fc415b82de21b5c7ba9b803666a73711022cab45`**

CI run: **`31961669961` — SUCCESS**

The regression suite creates deliberate embedder/reranker delays so concurrent calls overlap rather than accidentally executing sequentially.

Measured assertions:

| Workload | Query embeddings | Reranks | Document re-embedding | Retrieval leaders/followers |
|---|---:|---:|---:|---:|
| 100 simultaneous identical retrievals, one root/query | **1** | **1** | **0** | **1 / 99** |
| 70 retrievals, same question across two roots | **1** | **2** | **0** | **2 / 68** |
| 60 retrievals, three distinct questions on one root | **3** | **3** | **0** | **3 / 57** |

This proves that identical work is coalesced while genuinely different semantic work is not.

## First relay-level attempt — retained FAIL

Run: **`31961823518` — FAILURE**

Job: **`95200826026`**

Tested workflow commit: **`efd3f1d8b61fbd5f57af15ebabdf23c145d79425`**

Requested second burst:

```text
350 simultaneous signed NEEDs
7 actor families
5 root CIDs
10 NEEDs per actor per root
```

Observed failure before the semantic gate processed the full burst:

```text
provider received 256/350 NEEDs
```

The current relay defaults to:

```text
maxQueuedEventsPerNode = 256
```

and the legacy queued-event path bounds the per-node queue to that size. Therefore this run is classified as a **relay queue-capacity/backpressure failure**, not a semantic retrieval accuracy or deduplication failure.

No successful artifact was produced because the benchmark process failed before the artifact step. The workflow/job identity and failure are retained here as the permanent negative evidence record.

This finding must not be hidden: the current default legacy queue cannot be presented as a lossless 350-event burst queue.

## Final immutable relay-level proof — PASS

Run: **`31962078703` — SUCCESS**

Tested workflow commit: **`f86766f77a818a1769b0a50fd4463723861901bc`**

Artifact:

- name: `truyn-semantic-concurrent-load-31962078703`
- artifact ID: **`9267495278`**
- artifact digest: **`sha256:6290c3fcc50dd76bd72933f54635ef7b21ede89038ba34d7ed6b0f7bc42ae90c`**
- benchmark JSON SHA-256: **`803d6d4fd106a62ebe9642424f5d04e381235fd83920c1f964f85dc61275d5d5`**

The ephemeral workflow was removed from `main` after the immutable run started.

### Corpus / root construction

- **10,000 blocks per root**
- **3 root CIDs**
- roots share the same **9,999 immutable noise blocks**
- each root differs by one target block
- initial producer document embeddings across all three roots: **10,002**, demonstrating immutable-vector reuse across roots
- consumer document embeddings during concurrent retrieval: **0**

### Scenario A — 70 simultaneous NEEDs, one root

```text
7 actor families × 10 NEEDs = 70 simultaneous NEEDs
1 root CID
1 shared question
```

Delivery:

- NEED assigned: **70/70**
- RESULT delivered: **70/70**
- each actor family: **10/10**

Semantic work performed:

- logical retrieval requests: **70**
- unique retrieval leaders: **1**
- followers: **69**
- query embedding calls: **1**
- query inputs: **1**
- reranker calls: **1**
- reranker candidate inputs: **64**
- document re-embedding: **0**
- duplicate paid semantic work: **0**

Integrity:

- provenance verified: **100%**
- minimal context (`topK=1`): **100%**
- block-ID leakage: **0%**

Latency measured per waiting NEED:

| Metric | Value |
|---|---:|
| min | 1,267.507 ms |
| p50 | **1,851.096 ms** |
| p95 | **2,425.614 ms** |
| p99 | **2,476.574 ms** |
| max | 2,476.574 ms |
| mean | 1,873.116 ms |

Total burst wall time: **2,836.613 ms**.

Scenario result: **PASS**.

### Scenario B — 210 simultaneous NEEDs, three roots

```text
7 actor families × 3 roots × 10 NEEDs = 210 simultaneous NEEDs
3 root CIDs
1 shared question
```

Delivery:

- NEED assigned: **210/210**
- RESULT delivered: **210/210**
- each actor family: **30/30**

Semantic work performed:

- logical retrieval requests: **210**
- unique retrieval leaders: **3** — exactly one per distinct root candidate set
- followers: **207**
- query embedding calls: **1** — shared across all three roots
- query inputs: **1**
- reranker calls: **3** — exactly one per distinct root candidate set
- reranker candidate inputs: **192 = 3 × 64**
- document re-embedding: **0**
- duplicate paid semantic work: **0**

Root lifecycle:

- two previously cold roots became warm leaders;
- the root already used by Scenario A was a warm-cache hit;
- no active retrieval/query flights remained after completion.

Integrity:

- provenance verified: **100%**
- minimal context (`topK=1`): **100%**
- block-ID leakage: **0%**

Latency measured per waiting NEED:

| Metric | Value |
|---|---:|
| min | 3,014.975 ms |
| p50 | **4,727.342 ms** |
| p95 | **6,075.355 ms** |
| p99 | **6,407.825 ms** |
| max | 6,446.116 ms |
| mean | 4,710.387 ms |

Total burst wall time: **7,540.102 ms**.

Scenario result: **PASS**.

## Aggregate result

Across the two successful bursts:

| Metric | Result |
|---|---:|
| Signed NEEDs | **280** |
| Actor families | **7** |
| Root CIDs exercised | **3** |
| Semantic retrieval requests | **280** |
| Unique retrieval leaders | **4** |
| Shared followers | **276** |
| Query embedding calls | **2** |
| Reranker calls | **4** |
| Consumer document embeddings | **0** |
| Duplicate paid semantic work | **0** |
| NEED/RESULT delivery | **280/280 — 100%** |
| Provenance | **100%** |
| Minimal context | **100%** |
| Block-ID leakage | **0%** |
| Final active retrieval flights | **0** |
| Final active query lanes | **0** |

**Concurrent Semantic Retrieval / deduplication gate: PASS within the current 256-event legacy relay queue capacity.**

## What is and is not proved

This benchmark proves that, inside one semantic-gate runtime:

- concurrent identical retrieval misses are coalesced;
- a prepared root is not rebuilt under load;
- the same question is embedded once per burst even when several roots compete;
- reranker work is paid once per genuinely distinct root candidate set;
- follower requests do not duplicate semantic paid work;
- provenance/minimal-context/no-block-ID invariants survive concurrent signed NEED traffic from seven independent actor identities.

This benchmark does **not** prove:

- cross-process or cross-replica exactly-once semantic work;
- a lossless legacy relay burst above 256 queued events per provider;
- 280 simultaneous external GPT/Gemini/Grok/DeepSeek/Llama/Mistral/Kimi inference calls;
- distributed lease/CAS semantics.

The actor names in this load test identify seven independent signed TRUYN requester identities. The deterministic delayed embedder/reranker is deliberately instrumented to count duplicated semantic work exactly. Live model semantic quality and provider economics are already measured separately by Semantic Retrieval v2.

## Next bottlenecks exposed

### Relay backpressure / queue capacity

The 350-NEED failure proves that silently truncating accepted queued work at 256 is not acceptable for the next load tier. The relay should move to explicit backpressure/admission semantics or a durable queue before claiming larger lossless bursts.

### Provenance verification CPU

Even with semantic work reduced from 210 logical retrievals to 3 leaders, p50 waiting latency is ~4.73 s in the three-root burst. A large part of follower latency remains outside paid semantic work, including repeated verification/materialization work. A process-shared verified-root/proof cache is a justified next optimization.

### Cross-replica deduplication

Current single-flight is deliberately process-local. Multi-replica production requires a shared idempotency/lease/CAS contract keyed by semantic work identity so two replicas cannot independently pay for the same cold miss.

## Evidence preservation

This report retains both the successful proof and the failed 350-NEED experiment. Future security cleanup must redact sensitive material if necessary, not delete this benchmark record.
