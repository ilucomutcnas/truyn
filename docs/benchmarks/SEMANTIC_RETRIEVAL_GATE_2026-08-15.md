# TRUYN Semantic Retrieval Gate — production evidence (2026-08-15)

Status: **PASSED**

This document records the first passing production A/B gate in which the requesting agent supplies **only a natural-language question plus a root context CID**. No context block ID and no `ids` array are supplied in the TRUYN chain. TRUYN performs retrieval from the root CID, verifies provenance, materializes the minimum selected context, and then invokes the providers.

## Security and disclosure scope

The passing gate used project-authorized Azure OpenAI and Vertex Gemini reference providers. Publication of this evidence does **not** make their upstream accounts/quota available to public TRUYN users and does not prove the separate provider-ownership authorization gate.

The report preserves the public model versions, relay hostname, benchmark measurements, run/artifact evidence and content/provenance identifiers. Private deployment resource names, privileged cloud identities, private origins and live quota/cost ceilings are not part of the public benchmark contract.

## Evidence

- GitHub Actions run: `31901141858`
- Run URL: `https://github.com/inn-media/truyn/actions/runs/31901141858`
- Tested commit: `752d88a3b58303adfedf5ff19fdf0246927761db`
- Evidence artifact: `truyn-semantic-retrieval-31901141858`
- Artifact ID: `9251221434`
- Artifact SHA-256: `a704df066dde15f8d99b175f3a3dcc37ab0ed37a2bc712b32fd04fa707a2ec3d`
- Relay: `https://relay.truyn.org`
- Retrieval algorithm: `truyn-hybrid-bm25-chargram-v1`
- Azure model: GPT-4.1-mini
- Gemini model: `gemini-2.5-flash`

The workflow completed successfully, uploaded the JSON evidence artifact, and emitted `TRUYN_SEMANTIC_RETRIEVAL_GATE=passed`.

## Gate contract

The fixed thresholds were:

| Gate | Required | Measured | Result |
|---|---:|---:|---|
| Retrieval accuracy | >= 99% | **100%** (192/192) | PASS |
| TRUYN answer accuracy | >= 99% | **100%** (8/8 live paired chains) | PASS |
| Direct-control answer accuracy | >= 99% | **100%** | PASS |
| Provider input-token reduction | >= 90% | **97.301%** | PASS |
| Estimated inference-cost reduction | >= 90% | **96.928%** | PASS |
| Retrieval provenance | 100% | **100%** | PASS |
| Live provider provenance | 100% | **100%** | PASS |
| No block ID / no `ids` array | 100% | **100%** | PASS |
| Minimal selected context | 100% | **100%** | PASS |

## Economic result

Mean provider input tokens per paired Azure + Gemini task:

- Direct full-context control: **34,420.375 tokens**
- TRUYN semantic retrieval: **928.875 tokens**
- Reduction: **97.301%**

Mean variable inference cost under the benchmark pricing snapshot:

- Direct full-context control: **$0.012716025**
- TRUYN semantic retrieval: **$0.000390690**
- Reduction: **96.928%**

Mean provider request-body reduction: **97.276%**.

The full 48-block context was `87,556` bytes. TRUYN selected a mean of `3,632.25` content bytes for the two provider stages combined. Mean TRUYN protocol overhead was `375` bytes.

Across the eight live pairs, the direct arm repeatedly transferred `1,400,896` context bytes. TRUYN used `115,744` setup bytes plus `58,452` query-time context bytes, for `174,196` amortized context bytes: **87.565% less context transfer** in this finite eight-pair run. Unlike the token/cost gates, context-transfer reduction was not a >=90% gate because one-time context publication is amortized over repeated use.

## Retrieval and provenance proof

The benchmark corpus contained 48 heterogeneous records. A signed delta changed the authoritative values for the eight live targets before the measured queries.

For each retrieval-only case, TRUYN was given a question and the updated root CID. It had to return top-1 without receiving the expected block ID. The requester verified:

1. returned root CID;
2. manifest CID;
3. normalized question hash;
4. selected block ID against the signed manifest;
5. selected block CID against the signed manifest;
6. rank and selected-set proof.

The retrieval-only suite covered 192 question variants and achieved **192/192 correct top-1 selections**.

For every live TRUYN provider stage, the chain contained a context reference of the form `{$context: {cid, query, topK: 1}}`. The benchmark explicitly rejected a request containing the target block ID or an `ids` array. Azure and Gemini each independently resolved one block, verified the provenance reference, and materialized only that selected block before inference.

## A/B methodology

**Direct control:** the natural-language question plus the complete updated corpus was sent to Azure. The complete updated corpus was sent again to Gemini review.

**TRUYN:** the signed chain contained only the natural-language question plus root CID. Each provider independently invoked TRUYN semantic retrieval with `topK=1`, verified manifest/block/query provenance, and received only the selected block.

Requester-to-relay chain submission used HTTP for this long-running production gate. Both provider stages were still required by the benchmark trace to use the TRUYN WebSocket fast path (`['socket', 'socket']`). This isolates semantic-retrieval correctness/economics from requester WebSocket lifetime behavior without weakening provider transport requirements.

Gemini thinking was disabled symmetrically in both A/B arms (`thinkingBudget=0`) because the task was deterministic extraction/verification and the retrieval algorithm itself is model-free.

No provider rate-limit retries occurred in the passing run.

## What this proves

For this measured entity-anchored heterogeneous corpus, TRUYN can now demonstrably execute:

`question + root CID -> semantic retrieval -> provenance verification -> minimum context -> Azure/Gemini inference`

without the caller knowing the block ID, while exceeding the project's >=99% retrieval/answer accuracy and >=90% token/cost reduction gates.

## What this does not prove

This is not a claim of general open-domain RAG accuracy. The current gate measures TRUYN's hybrid lexical/fuzzy retriever on entity-anchored heterogeneous records, including paraphrases and typo variants. It does not yet prove embedding-level synonym-only retrieval, multilingual semantic equivalence, adversarial retrieval robustness, or broad-domain retrieval quality.

It also does **not** prove safe public coexistence with owner-funded AI providers. That requires the independent negative security matrix in `../architecture/THREAT_MODEL.md` to demonstrate that anonymous/foreign requesters, known private provider IDs, forged owner/tenant fields and legacy routes produce zero unauthorized upstream provider calls.
