# TRUYN Semantic Retrieval Scale Gate v3 — 600 → 10,000 → 100,000 Blocks

Date: **2026-08-16**

Status: **PASS**

Scale Gate v3 verifies that TRUYN preserves the requester contract and fixed semantic/context gates while scaling one immutable root from hundreds to one hundred thousand content-addressed blocks.

The agent receives only:

```text
natural-language question + root CID
```

No expected block ID, candidate list, vector identifier or internal routing hint is provided to the agent.

## Evidence identity

- Tested commit: **`f58c201f867e79ada7521a34706b16fcfacade0b`**
- GitHub Actions workflow run: **`31960599944`** — **SUCCESS**
- Job: **`95197877917`** — **SUCCESS**
- Artifact: **`truyn-semantic-scale-v3-31960599944`**
- Artifact ID: **`9267215478`**
- Artifact ZIP digest: **`sha256:f96a97291453a6b2bdd2629a885fcaa67d465e9ca21ba7296ac19e007649e1b3`**
- `semantic-scale-v3.json` SHA-256: **`e4870edfcf2d5af6dd014618e358abf2305c45a787338db2ce7030775ba4781b`**

The temporary benchmark workflow was removed from `main` immediately after the run started. The permanent harness remains in `benchmarks/semantic-scale-v3.js` and this report is the durable public evidence record.

## Fixed hard gates

| Gate | Required |
|---|---:|
| Retrieval accuracy | **>= 99%** |
| Per-language retrieval accuracy | **>= 99%** |
| Per-category retrieval accuracy | **>= 99%** |
| Provenance verification | **100%** |
| No block-ID leakage | **100%** |
| Minimal-context correctness | **100%** |
| Input-token saving | **>= 90%** |
| Comparable marginal cost saving | **>= 90%** |
| Cold document re-embedding | **0** |
| Warm document re-embedding | **0** |

No gate was relaxed for a larger corpus.

## Methodology

The measured corpus ladder was:

```text
600 blocks → 10,000 blocks → 100,000 blocks
```

Each size used **60 unique retrieval cases**:

- 20 synonym-only;
- 20 cross-language;
- 20 adversarial near-duplicate.

Language split:

- EN: 40 cases;
- TR: 10 cases;
- ZH: 10 cases.

The benchmark uses a deterministic heterogeneous synthetic scale corpus and a deterministic local semantic encoder. This isolates **retrieval/index lifecycle scaling** from remote provider quota, model stochasticity and the cost of creating 100,000 external embedding requests.

This v3 proof therefore does **not** replace the live-provider Semantic Retrieval Gate v2 quality/economic proof. Semantic v2 remains the evidence for live provider reasoning/reranking quality. Scale Gate v3 proves that the TRUYN content-addressed retrieval/index path can carry the same contract and hard invariants at 100,000 blocks.

The production-scale benchmark uses the durable **sharded-file** semantic store introduced for this gate. Root snapshots remain keyed by immutable root CID; block vectors remain keyed by immutable block CID but are physically grouped into deterministic hash shards. With a two-hex-character shard prefix, the 10,000- and 100,000-block roots each used 256 vector shards rather than one file per block.

## Result summary

| Blocks | Retrieval | Provenance | No block-ID | Minimal context | Token saving | Cost saving | Gate |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 600 | **100%** | **100%** | **100%** | **100%** | **99.445%** | **99.445%** | **PASS** |
| 10,000 | **100%** | **100%** | **100%** | **100%** | **99.966%** | **99.966%** | **PASS** |
| 100,000 | **100%** | **100%** | **100%** | **100%** | **99.997%** | **99.997%** | **PASS** |

All language and semantic-category subgroups were **100%** at every scale. There were **zero retrieval misses** in the measured workload.

## Accuracy by query class

At each of 600, 10,000 and 100,000 blocks:

| Query class | Correct | Total | Accuracy |
|---|---:|---:|---:|
| synonym-only | 20 | 20 | **100%** |
| cross-language | 20 | 20 | **100%** |
| adversarial near-duplicate | 20 | 20 | **100%** |

At each scale:

| Language | Correct | Total | Accuracy |
|---|---:|---:|---:|
| EN | 40 | 40 | **100%** |
| TR | 10 | 10 | **100%** |
| ZH | 10 | 10 | **100%** |

## Cold / warm latency

`coldRetrieve` means a fresh production semantic-index instance reading an already prepared root and immutable vectors from durable storage. It includes durable root/vector-shard load, query encoding, dense retrieval and provenance verification. It performs **zero document re-embeddings**.

`warmRetrieve` means the root/vectors were first loaded with `warmContext(rootCid)`. The 60 measured warm questions are unique so these latency samples do not use retrieval-result cache hits.

### 600 blocks

| Mode | p50 | p95 | p99 | Mean |
|---|---:|---:|---:|---:|
| Cold | **42.486 ms** | **47.909 ms** | **47.909 ms** | 40.696 ms |
| Warm | **1.949 ms** | **2.821 ms** | **5.409 ms** | 2.154 ms |

- publish + prepare: **123.742 ms**
- warmup load: **29.599 ms**
- cold document re-embeddings: **0**
- warm document re-embeddings: **0**

### 10,000 blocks

| Mode | p50 | p95 | p99 | Mean |
|---|---:|---:|---:|---:|
| Cold | **163.866 ms** | **168.202 ms** | **168.202 ms** | 163.978 ms |
| Warm | **38.557 ms** | **40.766 ms** | **60.544 ms** | 39.177 ms |

- publish + prepare: **532.303 ms**
- warmup load: **111.201 ms**
- cold document re-embeddings: **0**
- warm document re-embeddings: **0**

### 100,000 blocks

| Mode | p50 | p95 | p99 | Mean |
|---|---:|---:|---:|---:|
| Cold | **1,511.904 ms** | **1,566.229 ms** | **1,566.229 ms** | 1,517.792 ms |
| Warm | **561.008 ms** | **680.387 ms** | **798.076 ms** | 575.260 ms |

- publish + prepare: **4,654.529 ms**
- warmup load: **1,057.960 ms**
- cold document re-embeddings: **0**
- warm document re-embeddings: **0**

Latency was recorded, not used as an unstated pass/fail gate. The fixed v3 hard gates concern correctness, provenance/privacy, minimal context and economics. The measured 100k latency exposes a clear optimization target for the next hot-path iteration.

## Token and normalized marginal cost economics

The scale benchmark compares the same downstream-model input boundary:

```text
DIRECT = question + full root content
TRUYN  = question + one selected block + bounded retrieval envelope
```

Approximate input tokens are derived from measured serialized bytes using the benchmark's fixed bytes/token approximation. For the **same downstream model and same input-token price**, the percentage marginal input-cost reduction equals the measured input-token reduction. One-time reusable index construction is reported separately and is not charged again on every retrieval.

This is intentionally a provider-price-neutral scale metric; it is not represented as a cloud invoice. Live provider routing/inference economics remain documented by Semantic v2.

Measured values:

| Blocks | Direct input tokens | TRUYN input tokens | Token saving | Normalized cost saving |
|---:|---:|---:|---:|---:|
| 600 | 39,065 | 217 | **99.445%** | **99.445%** |
| 10,000 | 650,703 | 218 | **99.966%** | **99.966%** |
| 100,000 | 6,506,810 | 218 | **99.997%** | **99.997%** |

At 100,000 blocks the full root content measured **26,027,141 bytes**, while the mean selected context was about **259.833 bytes**.

## Persistent-index scale behavior

### 600 blocks

- initial immutable document vectors: 600;
- vector writes: 600;
- warm vector hits: 600/600;
- warm shard reads: 237.

### 10,000 blocks

- initial immutable document vectors: 10,000;
- vector writes: 10,000;
- vector shards written: 256;
- warm vector hits: 10,000/10,000;
- warm shard reads: 256.

### 100,000 blocks

- initial immutable document vectors: 100,000;
- vector writes: 100,000;
- vector shards written: 256;
- warm vector hits: 100,000/100,000;
- warm shard reads: 256;
- document re-embeddings after restart/warm load: **0**.

This validates that persistence no longer scales as one filesystem file/read operation per immutable block vector.

## 100 / 1,000-node exercises

The largest 100,000-block root was reused by independent `SemanticTruynNode` identities. The representative query set was already warm/cached before fanout so this exercise measures many independent cryptographic node identities sharing the same prepared root/index rather than deliberately executing 1,000 complete 100k scans.

| Independent nodes | Completed | Failures | Correct/provenance success | Elapsed | Mean/node |
|---:|---:|---:|---:|---:|---:|
| 100 | 100 | **0** | **100%** | 30,563.862 ms | 305.639 ms |
| 1,000 | 1,000 | **0** | **100%** | 310,787.366 ms | 310.787 ms |

Both exercises **PASS** the functional node-scale gate.

## Provenance and privacy proof

Every measured retrieval is passed through `SemanticTruynNode`, which verifies the immutable root/selection proof before exposing context to the agent path.

The benchmark validates:

- root CID match;
- manifest CID match;
- query hash match;
- selected immutable block CID consistency;
- selected rank/proof consistency;
- exactly one materialized block (`topK=1`).

The benchmark also asserts that the agent-facing input object contains exactly two fields — `question` and `rootCid` — and rejects a case if the expected internal block ID appears in that input.

Result: **100% provenance, 100% no-block-ID, 100% minimal context at all three scales.**

## Memory / next bottleneck discovered

Measured process memory after the warm workload was approximately:

- 600 blocks: RSS **85.5 MB**, heap used **9.1 MB**;
- 10,000 blocks: RSS **189.8 MB**, heap used **87.5 MB**;
- 100,000 blocks: RSS **2.11 GB**, heap used **1.85 GB**.

This is not hidden by the PASS result. The 100k corpus crosses a material in-memory scaling boundary in the current JavaScript reference router.

The 100/1,000-node timings also show that per-node provenance verification is still expensive for a 100k manifest. The current verifier recomputes/validates a large immutable manifest on each fresh node path rather than using a process-shared verified-root proof/cache.

Likewise, the current default dense retrieval path scores and sorts the corpus in process. At 100k the measured warm p50 is ~561 ms and p99 ~798 ms.

These observations define the next optimization targets:

1. process-shared immutable root/provenance verification cache;
2. bounded top-K selection instead of full-corpus sort when only a small candidate set is required;
3. more compact in-memory vector/block representation;
4. shared multi-replica index store with CAS/lease semantics;
5. a subsequent million-block / distributed-replica benchmark only after these 100k memory/latency costs are reduced.

They do not invalidate the v3 hard-gate PASS because no latency or memory threshold was silently added after measurement.

## Security boundary

Scale Gate v3 adds no public access to owner-funded AI providers. The scale encoder is local/deterministic, and the durable index/store remains provider-neutral.

The invariant remains:

```text
public TRUYN reachability != permission to spend an owner's AI quota
```

No credentials, privileged cloud identities, private deployment names or live provider endpoints are published in this report.

## Conclusion

**Semantic Retrieval Scale Gate v3 passes at 600, 10,000 and 100,000 immutable blocks.**

The measured proof establishes:

- agent input remains only question + root CID;
- retrieval accuracy: **100%** across all measured sizes/classes/languages;
- provenance: **100%**;
- no block-ID leakage: **100%**;
- minimal context: **100%**;
- token and normalized marginal cost savings remain far above **90%**;
- cold and warm p50/p95/p99 are now recorded;
- restart/cold/warm paths produce **zero document re-embedding**;
- 100- and 1,000-node functional exercises complete with **zero failures**.

The next engineering problem is no longer correctness at 100k. It is **memory and hot-path latency efficiency at 100k+**, plus distributed shared-index coordination.
