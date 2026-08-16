# Production Semantic Index Lifecycle

Status: **implemented reference lifecycle** for Semantic Retrieval Gate v2.

This document defines how TRUYN prepares, persists, reuses, invalidates and reloads semantic context indexes without rebuilding a corpus index inside a user retrieval request.

## Invariant

A production semantic retrieval request receives:

```text
natural-language question + root CID
```

and may compute a **query embedding**, but it must not lazily create missing **document/block embeddings** while servicing that request.

The production invariant is:

```text
publish / prepare root
        ↓
persist immutable block vectors
        ↓
mark root index ready
        ↓
question + root CID → retrieve
```

If the root is not prepared, retrieval fails closed with `semantic_index_not_ready`. It does not silently fall back to an on-demand corpus build.

## Content-addressed storage model

TRUYN separates two persistent records.

### Root snapshot

A root snapshot is keyed by its immutable root CID:

```text
truyn:ctx:<digest>
```

It contains the root manifest, ordered immutable blocks, metadata and index lifecycle state.

The root is immutable. Changing the block set produces a different root CID rather than mutating the old root in place.

### Immutable block vector

A semantic document vector is keyed by the immutable block CID:

```text
truyn:ctxb:<digest>
```

The vector is not keyed by the root that happened to reference the block. Therefore the same immutable block can be reused by many root snapshots without another document-embedding call.

For one configured semantic-index generation:

```text
same block CID
+ already persisted vector
= reuse, not re-embed
```

A future change of embedding model, dimensions or incompatible index format must be treated as a new index generation rather than interpreting incompatible vectors as equivalent. The current store format exposes an explicit store/lifecycle version; production model-generation migration is a separate controlled upgrade concern.

## Lifecycle

### 1. Publish

`publishContext(blocks, metadata)` builds the canonical content-addressed root and writes the root lifecycle state as `preparing`.

### 2. Prepare

`prepareContext(rootCid)`:

1. resolves the root snapshot;
2. loads all already persisted vectors for the referenced immutable block CIDs;
3. identifies only missing block vectors;
4. embeds only those missing immutable blocks;
5. persists the new vectors;
6. marks the root index `ready`;
7. evicts stale result-cache entries for that root.

Preparation is single-flight per root inside one process. Concurrent callers awaiting the same root preparation do not independently rebuild it.

### 3. Retrieve

In production mode, `retrieve(rootCid, question)` requires a `ready` root. It loads persisted vectors if necessary and refuses to embed missing document blocks.

Query embeddings remain request-specific and are allowed. Query/projection/result caches are process-local accelerators; durable correctness does not depend on them.

### 4. New root / incremental update

A context delta creates a new immutable root CID.

For example:

```text
root A = [block 1, block 2]
root B = [block 1, block 2, block 3]
```

After root A is ready, preparing root B reuses the vectors for block 1 and block 2 and embeds only block 3.

The old root remains valid and independently addressable.

This is TRUYN's incremental semantic-index rule: **root evolution does not imply re-embedding unchanged immutable content**.

### 5. Invalidate

`invalidateContext(rootCid)` evicts the process-local root/result state while preserving immutable block vectors. A later load can rehydrate the root and vectors without document re-embedding.

An explicit persistent-root purge may remove the root snapshot, but it still does not delete globally reusable block vectors by default.

### 6. Cold start

After a process restart, the router can load the root snapshot and immutable vectors from the persistent store. No corpus/document embedding is required.

`SemanticTruynNode` uses the router's asynchronous `loadManifest()` when available, so provenance verification can also start from durable state rather than requiring the root manifest to be preloaded in RAM.

### 7. Warm start

`warmContext(rootCid)` and `warmContexts(rootCids)` preload a ready root and its vectors into process memory. Warmup is an optimization, not a correctness prerequisite.

A ready durable root may also be loaded on first retrieval. That first request is a **storage cold read**, not an index build.

## Crash recovery

A crash may leave a root snapshot in `preparing` state.

The safe recovery path is explicit:

```text
operator/runtime startup
→ detect or know root to resume
→ prepareContext(rootCid)
→ load existing vectors
→ embed only missing vectors
→ mark ready
```

User retrieval does not perform that recovery implicitly.

This distinction prevents a single cold user request from unexpectedly generating hundreds or thousands of upstream embedding calls.

## Persistence implementations

### Memory store

`createMemorySemanticIndexStore()` is intended for tests and controlled ephemeral use. It implements the same async store contract but is not durable across process restart.

### File store

`createFileSemanticIndexStore({ directory })` is the durable single-node reference implementation. It uses:

- CID-derived hashed filenames;
- original CID verification on read;
- atomic temporary-file + rename writes;
- separate root and immutable-vector records.

`createProductionSemanticIndex()` composes this durable store with the Semantic Retrieval Gate v2 router in strict prepared-index mode.

### Multi-replica storage

The router depends on an async store contract rather than filesystem semantics. A multi-replica deployment can implement the same contract with a shared database/object store.

The current reference implementation **does not claim cross-process exactly-once vector creation**. The in-process single-flight guard prevents duplicate work within one runtime. A distributed store implementation should add lease/CAS/idempotency semantics if several replicas are allowed to prepare the same previously unseen block concurrently.

## Cache layers

| Cache/state | Key | Durable? | Purpose |
|---|---|---:|---|
| Root snapshot | root CID | yes with production store | manifest + block membership + lifecycle state |
| Document vector | immutable block CID | yes with production store | reusable semantic representation |
| Root in-memory cache | root CID | no | avoid storage reads |
| Block vector memory cache | block CID | no | avoid storage reads |
| Query-vector cache | query hash | no | avoid repeated query embeddings in one runtime |
| Query-projection cache | query hash | no | avoid repeated projection work |
| Retrieval-result cache | root CID + query/config | no | reuse identical retrieval results |

Changing the root naturally changes the result-cache key. Explicit root invalidation also evicts result-cache entries for that root.

## Security and billing boundary

The durable index lifecycle does **not** grant public users access to an operator-funded embedding/reranking account.

`createProductionSemanticIndex()` is deliberately provider-neutral. The owning runtime must inject an already-authorized embedder and optional reranker. Provider authorization/billing responsibility remains outside the public protocol envelope and must be resolved before chargeable execution.

Therefore:

```text
public TRUYN reachability
≠ permission to create semantic embeddings on an owner's account
```

The public relay must not automatically attach an owner-paid semantic provider merely because the lifecycle module exists.

## Operational metrics

The semantic router exposes lifecycle counters including:

- root memory hits;
- persistent root loads;
- persisted vector loads;
- document vectors embedded;
- document vectors reused;
- warmups;
- result-cache hits and evictions;
- active root/vector single-flight operations;
- store kind and durability.

These metrics make cold/warm behavior and accidental rebuild regressions testable.

## Implemented proof invariants

The regression suite verifies that:

1. production retrieval of an unprepared root fails closed and causes **zero document embeddings**;
2. explicit preparation makes the root ready;
3. a process-style restart reloads a durable root and vectors with **zero document re-embedding**;
4. adding one new immutable block to an existing root embeds **only that one new block**;
5. concurrent preparation of one root embeds each missing immutable block once within the process;
6. root invalidation preserves reusable immutable block vectors;
7. retrieval after preparation does not increase the document-embedding count.

These are lifecycle/infrastructure guarantees. Semantic accuracy, provenance, no-block-ID leakage and end-to-end token/cost economics remain measured separately by the Semantic Retrieval Gate v2 benchmark evidence.
