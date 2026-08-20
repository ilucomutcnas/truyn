# Semantic Retrieval Scale Gate v3

Status: **implemented and measured PASS through 100,000 immutable blocks**.

Permanent measured evidence: [`../benchmarks/SEMANTIC_SCALE_GATE_V3_2026-08-16.md`](../benchmarks/SEMANTIC_SCALE_GATE_V3_2026-08-16.md).

**Scale terminology clarification — 2026-08-20:** the 100/1,000-node exercises in this semantic benchmark are semantic-root/index/cache fanout exercises across independent cryptographic identities. They are **not** the Class D acceptance gates for 100/1,000 simultaneously running real network processes/QUIC sockets/hosts. Real-node scale is tracked separately in `NETWORK_PRODUCTIONIZATION_GATE.md`.

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

```text
600 blocks
   ↓
10,000 blocks
   ↓
100,000 blocks
```

The same question + root CID contract is used at every level.

The measured run passed every fixed gate at every corpus size. At 100,000 blocks the workload produced 100% retrieval/provenance/no-block-ID/minimal-context and 99.997% normalized token/marginal-cost saving. Cold/warm latency and the semantic 100/1,000-identity fanout exercises are preserved in the permanent evidence report.

The scale harness uses deterministic heterogeneous synthetic records with three query classes retained from Semantic v2 methodology:

- synonym-only;
- cross-language;
- adversarial near-duplicate.

The deterministic local semantic encoder is intentionally used for **infrastructure-scale measurement** so a 100,000-block test is not dominated by external embedding quota/provider variance. It verifies lifecycle, search, persistence, provenance, privacy, minimal-context behavior, token economics and latency at scale.

It does **not** replace live-provider Semantic v2 quality/economic proof and it does **not** replace Class D real network-node proof.

## Production persistence change required by 100k

The earlier durable reference store persisted one file per immutable block vector. At 100,000 blocks that creates avoidable filesystem/inode amplification.

Scale Gate v3 therefore adds a sharded durable vector store:

```text
root CID → immutable root snapshot
block CID → deterministic hash shard → vector entry
```

Properties:

- root snapshots remain immutable and keyed by root CID;
- vectors remain content-addressed by immutable block CID;
- unchanged blocks remain reusable across roots;
- bounded shard files replace one-file-per-vector persistence;
- shard writes are serialized per shard inside one process;
- cold startup can bulk-load shards.

The sharded store remains a single-node durable reference implementation. Distributed exactly-once preparation requires a shared store with CAS/lease/idempotency semantics and is not claimed here.

## Cold and warm definitions

### Cold retrieval

A cold sample creates a new production semantic-index instance against an already prepared durable root, then performs one `question + root CID` retrieval.

It includes durable root/vector-shard load, query encoding, dense retrieval and provenance verification. It must create **zero document re-embeddings**.

### Warm retrieval

A warm run calls `warmContext(rootCid)` to load the ready root/vectors into process memory, then executes unique questions so latency samples do not use the result cache.

Reported distributions include p50/p95/p99/min/max/mean. `warmupLoadMs` is reported separately.

## Economics definition

The deterministic scale run records actual context bytes and computes a provider-price-neutral marginal input-token ratio:

```text
direct = question + full root content
TRUYN  = question + one minimal selected block + bounded retrieval envelope
```

For the same downstream model/input-token price, percentage marginal input-cost reduction equals measured input-token reduction. One-time reusable index-construction work is reported separately.

This normalized scale-economics measurement is distinct from live provider invoices/routing cost measured by Semantic v2.

## Provenance and privacy

`SemanticTruynNode` verifies root manifest CID, selected block CID, root CID match, query hash and selected rank/proof consistency.

The harness asserts the agent-facing input contains exactly:

```text
question
rootCid
```

and rejects a case if its expected internal block ID appears in that input.

## Minimal context

All Scale Gate v3 retrieval cases use `topK = 1`. A case passes minimal-context correctness only when exactly one verified immutable block is materialized for the agent/provider path.

## 100 / 1,000 semantic-identity fanout exercises

The largest-root exercise creates independent `SemanticTruynNode` cryptographic identities at two fanout levels:

- **100 semantic node identities**;
- **1,000 semantic node identities**.

They reuse one already prepared root and semantic index. Representative queries are warm/cached before fanout so this exercise measures root/index/cache reuse across identities rather than performing a 100,000-block scan per identity.

Required result:

```text
completed == requested identities
failures == 0
provenance verified for every retrieval
selected record correct for every retrieval
```

The measured run completed both with zero failures.

### This is not Class D real-node evidence

These exercises do **not** require 100/1,000 independent long-running network processes, 100/1,000 distinct live QUIC sockets, multiple real host failure domains, WAN reachability, packet partitions, churn or adversarial network behavior.

Therefore they MUST NOT be described as:

```text
100 real TRUYN network nodes — PASS
1,000 real TRUYN network nodes — PASS
```

The current Class D-100 gate separately requires exactly 100 real processes/identities/QUIC sockets across ≥4 hosts plus routing/recovery/adversarial/cleanup predicates. D-1000 similarly requires real network topology evidence.

## Current 100k semantic-scale boundary

Scale Gate v3 passes its declared semantic hard gates, but evidence records material 100k engineering costs including warm retrieval p50 around 561 ms, p99 around 798 ms and warm process heap around 1.85 GB.

These are optimization inputs, not hidden failures. Candidate next semantic optimizations include bounded top-K candidate selection, compact in-memory representation, process-shared immutable-root verification and shared multi-replica index storage.

## Evidence policy

Every successful/failed Scale Gate run is evidence. Permanent sanitized reports should retain tested commit/run/artifact identity where safe, corpus/query counts, hard gates, p50/p95/p99, identity-fanout results, limitations and benchmark-definition notes.

Security cleanup follows **redact, do not delete evidence**.

For real network scale, see:

- `NETWORK_PRODUCTIONIZATION_GATE.md`
- `IMPLEMENTATION_STATUS.md`
- `../operations/PRODUCTIONIZATION_EXECUTION_PLAN.md`.