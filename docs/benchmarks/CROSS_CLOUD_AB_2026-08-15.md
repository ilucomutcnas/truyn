# TRUYN Cross-Cloud A/B Benchmark — 2026-08-15

Status: **completed, measured, evidence captured**.

This document records the first successful paired A/B benchmark of the current TRUYN PoC against a direct Azure OpenAI → Vertex Gemini control path.

## Evidence

- GitHub Actions workflow: `Cloud PoC Cross-Cloud A/B Benchmark`
- Successful run: `31883757227` (run #9)
- Benchmark commit: `64b547d6497b8e67603c9fda76078e572aabe18d`
- Canonical relay: `https://relay.truyn.org`
- Artifact: `truyn-cross-cloud-ab-31883757227`
- Artifact ID: `9246821845`
- Artifact SHA-256: `5413712ab49e4babf653bad7747551da449798c70116a4748f37cf43cbce8073`
- Artifact payload: `cross-cloud-ab.json`
- Measured pairs: `5`
- Warm-up pairs: `1`
- Alternating A/B order: yes
- Successful-run relay network retries: `0`
- Provider rate-limit retries: `8`; retry waits were excluded from successful-arm latency samples.

## Compared paths

### Direct control

1. GitHub Actions runner → Azure OpenAI `truyn-gpt-4-1-mini`.
2. The resulting candidate is sent through an ephemeral Cloud Run raw-semantics proxy to Vertex AI Gemini `gemini-2.5-flash`.
3. The proxy exists only to use the same GCP runtime service-account identity as the production `truyn-gemini` provider. It preserves the raw Vertex `generateContent` request/response and does not use TRUYN relay/envelopes.
4. The ephemeral proxy is deleted after the run.

### TRUYN

1. GitHub requester → `relay.truyn.org`.
2. Signed NEED → Azure provider → signed RESULT.
3. Signed NEED → Gemini provider → signed RESULT.
4. Discovery, provider selection, signatures, trust metadata and relay orchestration are active.

Both arms used the same models, semantic task, and provider adapter prompt framing.

## Primary measured result

| Metric | Direct mean | TRUYN mean | TRUYN change vs direct |
|---|---:|---:|---:|
| Provider input tokens | 219.4 | 218.0 | **0.638% lower** |
| Billable output tokens | 323.6 | 346.6 | **7.108% higher** |
| Provider total tokens | 543.0 | 564.6 | **3.978% higher** |
| Estimated inference cost / chain | $0.000859916 | $0.000918180 | **6.776% higher** |
| End-to-end latency | 3,321.8 ms | 4,535.2 ms | **36.528% slower** |
| Provider-only latency | 3,321.4 ms | 3,044.0 ms | **8.352% lower** |
| Orchestration overhead | 0.4 ms | 1,491.2 ms | +1,490.8 ms |
| Provider JSON body bytes | 4,272.4 | 4,229.4 | **1.006% lower** |
| TRUYN protocol envelope bytes | 0 | 4,143.4 | additional |
| Measured application-body bytes | 4,272.4 | 8,372.8 | **95.974% higher** |

Positive product benefit is not inferred where the measurements do not support it. On this benchmark, the current TRUYN PoC does **not** reduce total provider tokens, variable inference cost, end-to-end latency, or application-body bytes compared with the direct control.

## Per-sample evidence

### Direct

| Sample | E2E ms | Total tokens | Billable output | Provider bytes | Estimated USD |
|---:|---:|---:|---:|---:|---:|
| 1 | 2,709 | 533 | 316 | 4,241 | 0.00084138 |
| 2 | 3,198 | 480 | 261 | 4,266 | 0.00070374 |
| 3 | 2,611 | 489 | 270 | 4,289 | 0.00072624 |
| 4 | 5,177 | 697 | 475 | 4,270 | 0.00123742 |
| 5 | 2,914 | 516 | 296 | 4,296 | 0.00079080 |

### TRUYN

| Sample | E2E ms | Total tokens | Billable output | Provider bytes | Envelope bytes | App bytes | Estimated USD |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 4,290 | 650 | 437 | 4,109 | 4,022 | 8,131 | 0.00114564 |
| 2 | 4,505 | 535 | 316 | 4,248 | 4,162 | 8,410 | 0.00084198 |
| 3 | 3,842 | 483 | 264 | 4,266 | 4,180 | 8,446 | 0.00071124 |
| 4 | 5,020 | 681 | 462 | 4,207 | 4,121 | 8,328 | 0.00120624 |
| 5 | 5,019 | 474 | 254 | 4,317 | 4,232 | 8,549 | 0.00068580 |

## Cost correction

The raw benchmark artifact contains the correct per-sample costs. Its summary field `claims.costReductionPercent` printed `0` because the first implementation rounded each aggregate cost mean to three decimal places (`0.001`) before calculating the percentage.

Using the raw artifact values:

- Direct mean = `(0.00084138 + 0.00070374 + 0.00072624 + 0.00123742 + 0.00079080) / 5 = 0.000859916 USD`.
- TRUYN mean = `(0.00114564 + 0.00084198 + 0.00071124 + 0.00120624 + 0.00068580) / 5 = 0.000918180 USD`.
- Correct change = `(0.000859916 - 0.000918180) / 0.000859916 × 100 = -6.776%`.

Therefore the observed variable inference cost was **6.776% higher through TRUYN**, not equal. The raw artifact remains immutable evidence; this document records the correction transparently.

## Interpretation

### What is already working

The benchmark proves that the current cross-cloud network path can repeatedly execute one semantic chain across Azure OpenAI and Vertex Gemini while preserving TRUYN discovery, distinct provider identities, signed NEED/RESULT messages, provider selection, and trust metadata.

The successful run also completed without any relay network retry. A previous transient Front Door read timeout led to a benchmark hardening change: safe discovery/poll reads now retry without replaying NEED/provider work.

### What is not yet optimized

The current protocol carries approximately 4.14 KB of signed envelope data for a provider-body workload of approximately 4.23 KB. That is the dominant byte overhead in this small-task benchmark.

The current E2E penalty is dominated by approximately 1.49 seconds of TRUYN orchestration rather than provider inference. Provider-only latency was lower in this run, but that difference must not be presented as a general TRUYN speed advantage because the direct and TRUYN arms have different network placement/topology.

The token difference is mainly output-side model variability. Azure input tokens were exactly 87 in every sample of both arms, while Gemini input depended slightly on the generated Azure candidate. This benchmark therefore does not demonstrate a TRUYN token-compression benefit.

## Engineering conclusion

This result establishes the **baseline**, not the target outcome.

The next optimization work should focus on:

1. Reducing protocol-envelope serialization size while preserving cryptographic verification and trust semantics.
2. Reducing relay orchestration round trips and polling overhead.
3. Introducing actual context/payload compaction before claiming token savings.
4. Running larger-context workloads where TRUYN's intended semantic/context compression can be measured separately from stochastic model-output variance.
5. Increasing Azure quota or using a benchmark-dedicated deployment so rate-limit pacing does not dominate wall-clock benchmark duration.
6. Re-running the paired benchmark after each optimization and comparing against this immutable baseline.

No token-reduction, cost-reduction, or E2E speedup claim should be made from this first baseline run.
