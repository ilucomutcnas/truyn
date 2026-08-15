# TRUYN Content-Addressed Context Economic A/B — 2026-08-15

Status: **PASSED**.

This document records the first passing economic A/B benchmark for TRUYN content-addressed context references and signed delta transfer across the production-authorized Azure OpenAI → Vertex Gemini reference chain.

## Security and disclosure scope

The measured providers were project-authorized benchmark resources. This public result does not grant network users access to the underlying cloud/provider accounts.

The report preserves measured usage, public model versions, content CIDs and GitHub evidence while omitting unnecessary private deployment names, privileged cloud identities and exact live quota configuration.

## Fixed gate

The thresholds were fixed before the passing live run and were not relaxed:

| Metric | Required | Final measured | Result |
|---|---:|---:|---|
| Provider input-token reduction | >= 80% | **97.355%** | PASS |
| Estimated variable inference-cost reduction | >= 50% | **92.954%** | PASS |
| Amortized context-transfer reduction | >= 70% | **82.372%** | PASS |
| Quality pass | 100% | **100%** | PASS |

The explicit `Enforce economic gate` GitHub Actions step passed.

## Evidence

- Workflow: `Cloud PoC Context Efficiency A/B`
- Successful run: `31895840815` (run #4)
- Benchmark head: `aaa3958e0dc5dbee1ae0e50842e10c7b5f0642c2`
- Canonical relay: `https://relay.truyn.org`
- Artifact: `truyn-context-efficiency-31895840815`
- Artifact ID: `9249864071`
- Artifact SHA-256: `2012af8b02e7e33813cb637e91b9412d1fcf7210ab4e09b069b6e1e1d7b12e53`
- Artifact size: `1909 B`
- Artifact expiry: `2026-09-14T16:42:08Z`
- Measured paired queries: `4`
- Retry events in passing run: `0`

## Workload

The benchmark uses a reusable corpus of `48` blocks. The fully rendered updated context is `102,650 B`.

Four deterministic target sections are queried:

- `section-07`
- `section-19`
- `section-31`
- `section-43`

The base corpus contains a different authoritative `FACT_VALUE` in every section. A signed delta replaces the authoritative fact in the four measured target blocks with updated values. Both provider stages must return the exact updated target value. A missing or wrong updated value aborts the benchmark, so token/transfer savings cannot pass by silently dropping the required information.

Models are unchanged between arms:

- Azure OpenAI: GPT-4.1-mini
- Google Vertex AI: `gemini-2.5-flash`

The private Azure deployment resource name is intentionally not part of the public benchmark contract.

## Compared paths

### Direct control

For every measured query:

1. The complete updated 48-block corpus is sent to Azure OpenAI.
2. The complete updated 48-block corpus is sent again to Gemini for review.
3. No TRUYN context references or context store are used.

### TRUYN candidate

1. The base 48-block corpus is uploaded once and receives an immutable root content CID.
2. Changed blocks are sent as a signed `CONTEXT_DELTA`; this creates a new immutable root CID.
3. Each benchmark query carries a signed `$context` reference containing the new root CID and one selected block ID.
4. Each provider resolves only that selected block before inference.
5. The provider verifies the root manifest and the selected block CID before using the materialized context.
6. Requester CHAIN transport uses the persistent canonical WebSocket and provider stages use persistent authenticated relay backchannels.

## Content identity and delta evidence

- Base CID: `truyn:ctx:395ef54a771438709f22fbf4bea4b6e272fb53f2957526aecb77c91b000edcbd`
- Updated CID: `truyn:ctx:eeb880beb3003208b43e9b21da5b6d05ad0d7dffd796d7b3ac9b5b779f84500c`
- Full rendered context: `102,650 B`
- Initial context PUT exchange: `109,600 B`
- Signed delta exchange: `15,148 B`
- Delta payload itself: `8,701 B`
- Total one-time TRUYN setup transfer: `124,748 B`

The base and updated root CIDs differ, while the base object remains immutable.

## Economic result

| Metric | Direct | TRUYN | Reduction |
|---|---:|---:|---:|
| Mean provider input tokens / chain | 34,826 | **921** | **97.355%** |
| Mean estimated variable inference cost / chain | $0.013757645 | **$0.000969350** | **92.954%** |
| Context transfer over all four measured queries | 821,200 B | **144,764 B amortized** | **82.372%** |
| Mean provider request-body bytes / chain | 206,860 B | **5,282 B** | **97.446% lower** |
| Quality pass | 100% | **100%** | preserved |

The TRUYN amortized transfer figure includes the one-time full PUT, signed delta, manifest/select exchanges, and per-query context references. It is therefore not a query-only figure.

After setup, TRUYN context transfer for the four measured queries was only `20,016 B` in total. Mean selected content presented across the two provider stages was `4,260 B` per chain. Compact TRUYN signed control-plane overhead remained `375 B` mean per chain.

## Cost accounting

The monetary result is an **estimate using the benchmark's embedded 2026-08-15 price snapshot**:

- Azure GPT-4.1-mini input: `$0.44 / 1M tokens`
- Azure GPT-4.1-mini output: `$1.76 / 1M tokens`
- Gemini 2.5 Flash input: `$0.30 / 1M tokens`
- Gemini 2.5 Flash output: `$2.50 / 1M tokens`

Infrastructure fixed costs are not included. The comparison is variable model inference cost derived from measured provider usage metadata.

Private credits, negotiated billing terms and live account balances are not represented by these public list-price assumptions.

## Azure benchmark capacity note

The first full-context control attempt exposed a benchmark-capacity limitation: the initial Azure reference deployment did not have enough provisioned capacity for the 48-block direct prompt. Benchmark capacity was increased while retaining the same model family/version, deployment class and per-token pricing assumptions. The passing run had zero rate-limit retries.

The exact live capacity/quota allocation is operational data and is intentionally omitted from the current public document. The capacity adjustment removed an artificial request-rate ceiling; it is not part of the measured token or cost reduction.

## What this result proves

This benchmark demonstrates that, when a large corpus is reusable and the required context subset is already explicitly identified, TRUYN can replace repeated full-context transmission with content-addressed references and sparse verified materialization while preserving the benchmark's required answer quality.

For this workload, the result directly demonstrates:

- much smaller provider input contexts,
- much lower measured provider input-token usage,
- much lower estimated variable inference cost,
- much lower amortized context transfer,
- immutable content identity across updates,
- delta-only changes rather than full-corpus replacement,
- cryptographic verification of selected context before inference.

## What this result does NOT yet prove

This run does **not** prove automatic semantic retrieval, automatic relevance ranking, or general RAG quality. The benchmark explicitly supplies the target block ID in each `$context` reference. Therefore the measured gain is the economics of **content-addressed sparse context delivery**, not the accuracy of an automatic retrieval algorithm.

It also does **not** prove the provider-ownership security gate. The benchmark ran under authorized project-controlled providers. Public-user isolation from owner-funded provider quota requires the separate negative tests defined in `../architecture/THREAT_MODEL.md`.

A future retrieval benchmark must add an automatic selector/retriever, compare retrieval quality against full-context answers, and keep the same requirement that economic savings cannot be achieved by losing required information.

## Conclusion

The content-addressed/context-reference/delta economic gate is closed successfully for explicit sparse selection:

- **97.355% fewer provider input tokens**
- **92.954% lower estimated variable inference cost**
- **82.372% less amortized context transfer**
- **100% benchmark quality preserved**

The next research/engineering gate should focus on selecting the right context automatically while retaining these economic gains: semantic retrieval/routing quality, false-negative rate, citation/provenance correctness, end-to-end utility on realistic heterogeneous corpora, and the independent provider-authorization security gate.
