# TRUYN Production Semantic Index Lifecycle — Regression Proof

Date: **2026-08-16**

Status: **PASS**

This report records the deterministic regression proof for the production Semantic Retrieval Gate v2 index lifecycle. It is an infrastructure/lifecycle proof, not a replacement for the semantic accuracy/economic benchmark.

## Tested commit

Git commit: **`f46c232ca9466df4474eccfe4016adc9586761fd`**

GitHub Actions CI run: **`31959144938`**

CI job: **`95194337373`**

The complete repository test suite finished:

- tests: **145**
- pass: **145**
- fail: **0**
- skipped: **0**
- cancelled: **0**

`git diff --check` also passed.

## Lifecycle under test

Production mode uses:

- `core/context/semantic-index-store.js`
- `core/context/semantic-router-v2.js`
- `core/context/production-semantic-index.js`
- `node/semantic-client.js`
- `tests/semantic-index-lifecycle.test.js`

The durable single-node reference store separates:

1. root snapshots keyed by immutable root CID;
2. semantic document vectors keyed by immutable block CID.

The production router requires explicit preparation before retrieval and does not build missing document vectors inside `retrieve()`.

## Fixed lifecycle gates

| Gate | Required | Result |
|---|---:|---:|
| Unprepared production retrieval creates document embeddings | **0** | **0 — PASS** |
| Explicit prepare marks root ready | yes | **PASS** |
| Restart + durable root/vector reload requires document re-embedding | **0** | **0 — PASS** |
| Production factory cold-loads a ready root | yes | **PASS** |
| Root `[A,B]` → `[A,B,C]` embeds unchanged A/B again | **0** | **0 — PASS** |
| Root `[A,B]` → `[A,B,C]` embeds new C | **1** | **1 — PASS** |
| Concurrent same-root prepare duplicates document embeddings | **0 duplicates** | **PASS** |
| Root invalidation deletes reusable immutable block vectors | **0** | **0 — PASS** |
| Retrieval after preparation increases document embedding count | **0** | **0 — PASS** |

## CI evidence

The lifecycle-specific checks appear as tests **119–124** in run `31959144938`:

1. `production mode never lazily embeds an unprepared root during retrieve` — **PASS**;
2. `durable root and block vectors survive process-style router restart without document re-embedding` — **PASS**;
3. `production factory cold-loads a ready root directly from durable storage` — **PASS**;
4. `new root embeds only new immutable block CIDs and reuses unchanged vectors` — **PASS**;
5. `concurrent preparation of one root is single-flight and embeds each immutable block once` — **PASS**;
6. `root cache invalidation never deletes reusable immutable block vectors` — **PASS**.

The same CI run also passed the existing Semantic Retrieval Gate router/reranker/provenance tests and the repository security/evidence guards.

## What this proves

### No request-time corpus build in production mode

When a semantic router has an index store, strict prepared-index mode is enabled. An unprepared root returns `semantic_index_not_ready`; the document embedder count remains zero.

This removes the previous failure mode where the first live semantic request could trigger a large sequential/lazy corpus-index build.

### Persistent cold startup

A second router instance pointing at the same durable store loads the root snapshot and block vectors after a process-style restart. Retrieval performs no document re-embedding.

Warmup remains available as an optimization, but a ready root does not require a manual RAM preload for correctness.

### Incremental immutable-block reuse

The proof publishes one root containing two immutable blocks, then a new root containing the same two blocks plus one new block. The second root reuses the two existing vectors and creates exactly one new document vector.

Thus root evolution is incremental with respect to content-addressed blocks.

### Local concurrency deduplication

Multiple concurrent calls preparing the same root share one in-process preparation flight. Each missing immutable block is embedded once within that runtime.

This report does **not** claim cross-process/distributed exactly-once preparation. A future shared multi-replica index store requires lease/CAS/idempotency semantics for that stronger guarantee.

### Invalidation preserves reusable content work

Invalidating a root removes process-local root/result cache state but preserves immutable block vectors. Reloading the root therefore does not repeat document embedding work.

## Security boundary

The production index factory is provider-neutral. It requires the owning runtime to inject an already-authorized embedder and optional reranker.

The lifecycle implementation does not attach an operator-funded provider to the public TRUYN relay and does not change provider ownership/billing policy.

The invariant remains:

```text
public TRUYN reachability != permission to spend an owner's AI quota
```

## Relationship to Semantic Retrieval Gate v2

This proof validates lifecycle behavior only.

Semantic correctness, provenance, minimal context, requester block-ID privacy, token reduction and inference-cost reduction remain governed by the permanent Semantic Retrieval Gate v2 evidence in:

- `docs/benchmarks/SEMANTIC_RETRIEVAL_V2_CONFIDENCE_GATE_2026-08-16.md`

The lifecycle work changes when document vectors are prepared/reused, not the validated semantic ranking policy.

## Limitations / next scale boundary

The current durable file store is a **single-node reference implementation**. It provides process-restart durability and immutable vector reuse but is not presented as a distributed index database.

The next scale milestone should replace or complement it with a shared store contract and prove:

- 10,000+ blocks;
- multiple root CIDs sharing immutable blocks;
- concurrent readers/writers across replicas;
- lease/CAS protection for first-time vector creation;
- p50/p95/p99 cold-storage and warm-memory retrieval latency;
- no document re-embedding across replica restart/failover.

This limitation is explicit and does not invalidate the lifecycle gates proved above.
