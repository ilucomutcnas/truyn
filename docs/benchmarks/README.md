# TRUYN Benchmark Evidence

`docs/benchmarks/` is the public, reviewable evidence ledger for TRUYN benchmark claims.

## Evidence preservation rule

Published benchmark reports are **append-only evidence**. Security cleanup must not delete a report merely because it contains a field that should not be public.

If a report contains sensitive operational information:

1. redact only the sensitive field or value;
2. preserve the report filename and benchmark date;
3. preserve measured results, methodology, limitations and acceptance gates;
4. preserve tested commit SHA, workflow/run identity, artifact identity and artifact digest when those identifiers are not themselves sensitive;
5. add a clear redaction note when a material evidence field was removed or generalized;
6. keep the correction/redaction in Git history.

Credentials, private keys, privileged cloud identities, private origins, secret-bearing URLs, customer data, private deployment/resource names, live allowlists, exact live quota/cost ceilings and other operational secrets remain forbidden. Raw logs/artifacts containing such data belong outside the public repository. Their safe identifiers and cryptographic digests may be retained here so the public report remains auditable.

Deleting or replacing a measured report with a summary/stub is not an acceptable security response. If a published report is proven invalid or duplicated, retain an explicit tombstone/correction that points to the superseding evidence rather than silently removing the record.

The repository regression suite treats the evidence files below as protected and fails if they disappear or are replaced by trivial stubs.

## Current evidence ledger

### Measured results

- [`CROSS_CLOUD_AB_2026-08-15.md`](CROSS_CLOUD_AB_2026-08-15.md) — first paired Azure OpenAI → Vertex Gemini direct-vs-TRUYN baseline; includes the negative baseline result and per-sample evidence.
- [`CROSS_CLOUD_8X_OPTIMIZATION_2026-08-15.md`](CROSS_CLOUD_8X_OPTIMIZATION_2026-08-15.md) — fixed 8× hot-path optimization gate; measured protocol and orchestration overhead.
- [`CONTEXT_EFFICIENCY_2026-08-15.md`](CONTEXT_EFFICIENCY_2026-08-15.md) — content-addressed context and signed-delta economic A/B gate.
- [`SEMANTIC_RETRIEVAL_GATE_2026-08-15.md`](SEMANTIC_RETRIEVAL_GATE_2026-08-15.md) — question + root CID semantic retrieval, provenance, token and cost gate.
- [`SEMANTIC_RETRIEVAL_MULTI_ACTOR_2026-08-15.md`](SEMANTIC_RETRIEVAL_MULTI_ACTOR_2026-08-15.md) — seven heterogeneous actor extension: 192/192 retrieval, 56/56 provider stages and 97.313% mean input-token reduction.
- [`SEMANTIC_RETRIEVAL_V2_CONFIDENCE_GATE_2026-08-16.md`](SEMANTIC_RETRIEVAL_V2_CONFIDENCE_GATE_2026-08-16.md) — final production Semantic Retrieval Gate v2 proof: stochastic cheap-judge disagreement hardening, 359/360 immutable retrieval cases, 100% six-chain / 42-stage live actor success, 98.102% input-token reduction and 90.188% comparable cost reduction with routing overhead included.

### Methodology / planned parity

- [`MULTIMODAL_PROVIDER_PARITY.md`](MULTIMODAL_PROVIDER_PARITY.md) — apples-to-apples methodology for text, image and video provider comparisons; it does not claim a completed multimodal benchmark result.

## Reproducibility note

GitHub Actions artifacts can expire. Therefore a report should retain, whenever safe and available:

- workflow/run ID;
- tested commit SHA;
- artifact name and ID;
- artifact SHA-256/digest;
- model/version identifiers relevant to the measurement;
- corpus/workload description;
- fixed gates and measured values;
- known limitations and corrections.

The report, not the temporary Actions artifact, is the durable public evidence record.
