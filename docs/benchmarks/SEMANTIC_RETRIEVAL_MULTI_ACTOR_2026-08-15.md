# TRUYN Semantic Retrieval Gate — 7-Actor Production Evidence (2026-08-15)

Status: **PASSED**.

This report records the production multi-actor extension of the original Semantic Retrieval Gate. The retrieval workload and algorithm remained the same 48-block / 192-case gate, while the live TRUYN chain was expanded from two heterogeneous text actors to seven independently identified actors: GPT, Gemini, Grok, DeepSeek, Llama, Mistral and Kimi.

The benchmark was designed to test whether the semantic-context savings, provenance guarantees and answer correctness remain stable as the number of real AI actors in a TRUYN chain increases.

## Security and disclosure scope

The participating providers were project-authorized benchmark resources. Publication of this evidence does not grant public TRUYN users access to the underlying cloud/provider accounts or quota.

This report preserves public model-family identities, measured benchmark results, run/commit/artifact evidence and relevant engineering observations while omitting private deployment resource names, privileged cloud identities, private origins and exact live quota configuration.

## Evidence

- GitHub Actions run: `31907965656`
- Tested commit: `5d1499d0c17750297c33db8d127ede42f41779fc`
- Workflow: `Temporary Semantic Retrieval 7-Actor Kimi-Normalized Gate`
- Evidence artifact: `truyn-semantic-multiactor-kimi-normalized-31907965656`
- Artifact ID: `9252998036`
- Artifact size: `8,132 B`
- Artifact SHA-256: `af04d3d123c29ba16f083cfddc094a4654ef7c77c5f62be22a691d6266c93c4e`
- Artifact created: `2026-08-15T21:05:57Z`
- Artifact expiry: `2026-09-14T21:05:57Z`
- Text actors: `7`
- Distinct TRUYN identities: `7`
- Retrieval cases: `192`
- Live chains: `8`
- Live provider stages: `56`

The GitHub Actions run completed successfully and the evidence artifact digest is preserved here so the durable report does not depend on Actions artifact retention.

## Gate result

| Metric | Measured | Result |
|---|---:|---|
| Retrieval accuracy | **100% — 192/192** | PASS |
| Live multi-actor chains | **100% — 8/8** | PASS |
| TRUYN provider stages | **100% — 56/56** | PASS |
| TRUYN answer accuracy | **100%** | PASS |
| Direct-control accuracy | **100%** | PASS |
| Retrieval / live provenance | **100%** | PASS |
| Minimal-context correctness | **100%** | PASS |
| Block-ID leakage | **0%** | PASS |
| Mean direct input tokens / chain | **120,008** | measured |
| Mean TRUYN input tokens / chain | **3,224.5** | measured |
| Provider input-token reduction | **97.313%** | PASS |
| Provider request-body reduction | **97.284%** | PASS |
| Context-transfer reduction | **93.451%** | PASS |
| Comparable GPT+Gemini cost reduction | **96.854%** | PASS |
| Mean direct elapsed time | **12.03 s** | measured |
| Mean TRUYN elapsed time | **6.29 s** | measured |

The semantic gate passed as a whole.

## Per-actor stability

| Actor | Answer accuracy | Input-token reduction |
|---|---:|---:|
| GPT | 100% | **97.223%** |
| Gemini | 100% | **97.243%** |
| Grok | 100% | **97.418%** |
| DeepSeek | 100% | **97.373%** |
| Llama | 100% | **97.213%** |
| Mistral | 100% | **97.381%** |
| Kimi | 100% | **97.340%** |

The minimum actor reduction was **97.213%**, the median was **97.340%**, and the maximum was **97.418%**. The spread was roughly 0.2 percentage points.

This is important because the economic effect did not materially depend on the model family in this measured workload. Seven distinct actors received essentially the same ~97.3% context reduction while preserving 100% answers in the gate.

## Compared semantics

The benchmark retained the Semantic Retrieval Gate contract:

`question + root CID -> TRUYN retrieval -> provenance verification -> top-1 minimal context -> actor -> next actor`

The caller did not provide the target block ID or an `ids[]` list. Every actor stage received the minimal context selected by TRUYN rather than a repeated full corpus.

The direct-control arm supplied the full context required for comparison. The TRUYN arm used the same underlying retrieval gate while extending the live provider chain to seven independent actors.

## Scaling findings discovered by the run

The multi-actor run exposed two engineering constraints that were not visible in the earlier two-actor benchmark.

### Provider benchmark capacity

Several Azure-hosted benchmark deployments had been configured at minimal smoke-test capacity. That capacity was insufficient for the much larger direct-control full-context workload. Benchmark capacity was temporarily raised for the measured run and returned to the low-cost configuration afterward.

The exact live deployment capacity values are intentionally not part of the public evidence contract. The adjustment changed the ability to execute the benchmark workload; it did not change the retrieval algorithm, corpus, model family or token-reduction calculation.

### Provider WebSocket reconnect behavior

The longer seven-actor chain exposed a TRUYN runtime defect: a transient `fast_socket_closed` event could terminate the provider WebSocket consumer instead of reconnecting.

`TruynAdapterHost` was corrected so a transient socket close triggers reconnect rather than permanently ending the provider loop. A regression test was added, full CI passed, and the final real run completed all **56/56** provider stages.

This is evidence that the scaling test exercised the actual multi-provider network path rather than merely replaying an isolated model call.

## Kimi completion-budget note

Kimi required a larger completion budget than the other actors on the full-context direct-control arm. Smaller completion budgets could be consumed by internal reasoning before a visible answer was emitted. The benchmark therefore used a sufficient Kimi completion budget to obtain the required visible deterministic answer.

This adjustment affected output budget only; it did not change the retrieval input, selected context, corpus or acceptance target.

## What this result proves

For this measured 48-block semantic retrieval workload, TRUYN's semantic context architecture scaled functionally from two to seven heterogeneous AI actors without degradation in:

- retrieval accuracy;
- answer accuracy;
- provenance verification;
- minimal-context correctness;
- block-ID isolation;
- provider input-token savings.

The measured provider input-token reduction remained approximately **97.3%** even after the live chain expanded to seven independent actor identities.

## What this result does not prove

This is **not** an internet-scale throughput benchmark. It does not establish behavior for 50, 100 or 1,000 concurrent live nodes, massive fan-out, sustained high-QPS workloads, network partitions or globally distributed peer discovery.

It also does not extend the retrieval-quality claim beyond the corpus used by the gate. The 192-case benchmark remains the same entity-anchored heterogeneous retrieval workload; arbitrary open-domain semantics, synonym-only retrieval, multilingual equivalence and adversarial large-corpus retrieval require separate evidence.

## Conclusion

The multi-actor gate establishes a strong functional scaling result:

- **7 heterogeneous text actors**
- **7 distinct TRUYN identities**
- **192/192 retrieval cases correct**
- **8/8 live chains correct**
- **56/56 provider stages completed**
- **100% provenance and minimal-context correctness**
- **97.313% mean provider input-token reduction**

Within this benchmark boundary, increasing the live chain from two to seven actors did not erode the semantic-context savings or correctness guarantees.
