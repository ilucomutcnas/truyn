# Semantic Retrieval Scale Gate v3

Status: **implemented and measured PASS through 100,000 immutable blocks**.

Permanent measured evidence: [`../benchmarks/SEMANTIC_SCALE_GATE_V3_2026-08-16.md`](../benchmarks/SEMANTIC_SCALE_GATE_V3_2026-08-16.md).

Scale Gate v3 extends the Semantic Retrieval Gate without changing the requester contract:

```text
agent input = natural-language question + root CID
```

The agent does not receive a block ID, candidate list, internal vector key or routing hint.

## Fixed hard gates

Every measured corpus size must satisfy the same fixed gates:

| Gate | Requirement |
|---|---:|
| Retrieval accuracy | **>= 99%** |
| Per-language retrieval accuracy | **>= 99%** |
| Per-category retrieval accuracy | **>= 99%** |
| Provenance verification | **100%** |
| Agent block-ID leakage | **0%** / no-block-ID **100%** |
| Minimal-context correctness | **100%** |
| Input-token saving | **>= 90%** |
| Comparable marginal cost saving | **>= 90%** |

Scale does not permit weakening any of these gates.

## Corpus ladder

The v3 benchmark ladder is:

```text
600 blocks
   ↓
10,000 blocks
   ↓
100,000 blocks
```

The same question + root CID contract is used at every level.

The measured run passed every fixed gate at every corpus size. At 100,000 blocks the measured workload produced 100% retrieval/provenance/no-block-ID/minimal-context and 99.997% normalized token/marginal-cost saving. Cold and warm latency plus the 100/1,000-node exercises are preserved in the permanent evidence report.

The scale harness uses deterministic heterogeneous synthetic records with three query classes retained from Semantic v2 methodology:

- synonym-only;
- cross-language;
- adversarial near-duplicate.

The deterministic local semantic encoder is intentionally used for **infrastructure-scale measurement** so a 100,000-block test is not dominated by external embedding quota, provider variance or 100,000 remote API calls. It verifies lifecycle, retrieval search, persistence, provenance, privacy, minimal-context behavior, token economics and latency at scale.

It does **not** replace the existing live-provider Semantic v2 quality/economic proof. Provider-model semantic quality remains a separate live gate.

## Production persistence change required by 100k

The earlier single-node durable reference store persisted one file per immutable block vector. That is correct at small scale but creates an avoidable filesystem/inode amplification at 100,000 blocks.

Scale Gate v3 therefore adds a sharded durable vector store:

```text
root CID → immutable root snapshot
block CID → deterministic hash shard → vector entry
```

Properties:

- root snapshots remain immutable and keyed by root CID;
- vectors remain content-addressed by immutable block CID;
- unchanged blocks remain reusable across roots;
- a bounded number of shard files replaces one-file-per-vector persistence;
- shard writes are serialized per shard inside one process;
- cold startup can bulk-load shards rather than issuing one filesystem read per block.

The sharded store is still a single-node durable reference implementation. Distributed exactly-once preparation requires a shared store with CAS/lease/idempotency semantics and is not claimed by this gate.

## Cold and warm definitions

### Cold retrieval

A cold sample creates a new production semantic-index instance against an already prepared durable root, then performs one `question + root CID` retrieval.

It includes:

- durable root load;
- durable vector-shard load;
- query embedding/encoding;
- dense retrieval;
- provenance verification.

It must create **zero document re-embeddings**.

### Warm retrieval

A warm run first calls `warmContext(rootCid)` to load the ready root and immutable vectors into process memory. It then executes unique questions so latency samples do not use the result cache.

Reported distributions include:

- p50;
- p95;
- p99;
- min/max/mean.

`warmupLoadMs` is reported separately from warm query latency.

## Economics definition

The deterministic scale run records actual context bytes and computes a provider-price-neutral marginal input-token ratio:

```text
direct = question + full root content
TRUYN  = question + one minimal selected block + bounded retrieval envelope
```

For the same downstream model and the same input-token price, the percentage marginal input-cost reduction is identical to the measured input-token reduction.

The one-time reusable index-construction work is reported separately and is not charged again on every query.

This normalized scale-economics measurement is deliberately distinguished from live provider invoices/routing cost measured by Semantic v2.

## Provenance and privacy

`SemanticTruynNode` verifies:

- root manifest CID;
- selected immutable block CID;
- root CID match;
- query hash;
- selected rank/proof consistency.

The Scale Gate harness also asserts that the agent-facing input object contains exactly:

```text
question
rootCid
```

and rejects a benchmark case if its expected internal block ID appears in that input.

## Minimal context

All Scale Gate v3 retrieval cases use `topK = 1`.

A case passes minimal-context correctness only when exactly one verified immutable block is materialized for the agent/provider path.

## 100 / 1,000-node exercises

The largest-root exercise creates independent `SemanticTruynNode` cryptographic identities at two fanout levels:

- **100 nodes**;
- **1,000 nodes**.

The nodes reuse one already prepared root and semantic index. The representative query set is warm/cached before fanout so this exercise measures root/index/cache reuse across many independent node identities rather than intentionally repeating a 100,000-block corpus scan 1,000 times.

Required node-exercise result:

```text
completed == requested nodes
failures == 0
provenance verified for every retrieval
selected record correct for every retrieval
```

The measured run completed both exercises with **zero failures**. Their elapsed time also exposed a next-stage optimization target: process-shared verification of an already verified immutable 100k root instead of repeating full manifest verification for every new node identity.

## Current 100k scale boundary

Scale Gate v3 passes its declared hard gates, but the evidence deliberately records two material engineering costs at 100k:

- warm retrieval p50 about **561 ms**, p99 about **798 ms**;
- warm process heap used about **1.85 GB**.

These are not retroactively converted into hidden failure gates. They define the next optimization work: bounded top-K candidate selection, compact in-memory representation, process-shared immutable-root verification, and then a shared multi-replica index store.

## Evidence policy

Every successful or failed Scale Gate run is evidence. A permanent sanitized report belongs under `docs/benchmarks/` with:

- tested commit SHA;
- workflow/run ID;
- artifact ID/name/digest when available;
- corpus sizes and query counts;
- hard gates;
- p50/p95/p99 cold and warm measurements;
- 100/1,000-node exercise results;
- limitations and benchmark-definition notes.

Security cleanup follows the repository-wide **redact, do not delete evidence** policy.
