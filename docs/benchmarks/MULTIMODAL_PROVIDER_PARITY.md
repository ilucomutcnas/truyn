# TRUYN Multimodal Provider Parity Benchmark

Status: **planned methodology; no multimodal benchmark result is claimed by this document**.

This document defines how the TRUYN reference testnet should compare providers across Google Cloud and Microsoft Azure without mixing incompatible modalities, presenting catalog availability as implementation status, or implying public entitlement to project-funded provider accounts.

## Principle

Benchmark equivalent capabilities against equivalent capabilities:

```text
reasoning ↔ reasoning
image generation ↔ image generation
video generation ↔ video generation
```

The benchmark is provider-neutral at the TRUYN protocol layer and provider-specific only in the constrained benchmark policy.

All benchmark providers must also be **authorized for the benchmark owner/workload**. A provider selector can choose among authorized candidates; it cannot override provider ownership/visibility policy.

## Planned provider groups

### Reasoning / text

Google Cloud:
- Gemini

Microsoft Azure:
- GPT
- Grok
- DeepSeek
- Llama
- Mistral
- Kimi

### Image generation

Google Cloud:
- current supported Google image-generation endpoint in Vertex AI; the architecture preserves the Imagen/Google-image capability line while concrete model IDs follow the current Vertex lifecycle

Microsoft Azure:
- Azure OpenAI `gpt-image` family as the primary cross-cloud image comparison
- Azure-direct Black Forest Labs FLUX as an optional second Azure image provider and independent-vendor comparison

### Video generation

Google Cloud:
- Veo

Microsoft Azure:
- Sora 2

## Provider ownership and billing scope

Reference benchmark providers are owner-private unless deliberately shared under an explicit policy. Public benchmark publication does not make their quota available to public TRUYN users.

A benchmark run should record enough public model/version information to reproduce the comparison, while private cloud deployment resource names, service-account/managed-identity identifiers, private origins, quota allocations, credit balances and billing-account details remain operational/private.

Public cost reporting uses disclosed list-price/equivalent assumptions where appropriate. Account-specific credits/discounts may be reported only in aggregate when useful and safe.

## Grok clarification

The Azure Foundry Grok models documented for the reference architecture are treated as reasoning/multimodal-understanding providers unless the concrete deployed catalog explicitly exposes media generation. A future direct-xAI media benchmark would be a separate provider and billing surface.

## Reasoning benchmark controls

Use the same:

- semantic task;
- input context;
- required output schema;
- maximum output policy where equivalent;
- retry policy;
- sampling count;
- evaluation rubric.

Measure at minimum:

- end-to-end latency;
- provider latency;
- input/output/total tokens where reported;
- provider request/response bytes;
- TRUYN envelope bytes;
- provider list-price equivalent;
- result quality under a disclosed evaluation method.

## Image benchmark controls

Use the same semantic prompt and normalize where providers expose different controls.

Record:

- requested aspect ratio;
- requested resolution or closest supported equivalent;
- output count;
- reference images when the benchmark includes image-conditioned generation;
- generation latency;
- output artifact bytes;
- provider list-price equivalent;
- safety/filter outcome;
- deterministic seed only where both compared providers support a meaningful equivalent.

Quality evaluation should include a reproducible rubric such as prompt adherence, visual coherence, text rendering when requested, subject/reference consistency when applicable, artifact defects, and independent blinded human scoring and/or a disclosed multimodal evaluator.

Do not report a single quality number without describing the evaluation method.

## Video benchmark controls

Use equivalent constraints where supported:

- same semantic prompt;
- same source image for image-to-video tests;
- closest common aspect ratio;
- closest common duration;
- closest common resolution;
- audio generation either enabled for both or evaluated as a separate feature;
- same number of samples.

Measure:

- job acceptance latency;
- generation completion latency;
- total end-to-end latency;
- output duration;
- resolution;
- artifact bytes;
- provider list-price equivalent;
- safety/filter outcome;
- temporal coherence;
- prompt adherence;
- motion consistency;
- audio quality/synchronization only where both outputs contain audio.

Because video generation is asynchronous, provider job polling is counted as provider execution behavior, while TRUYN orchestration overhead is reported separately.

## Artifact-transfer comparison

TRUYN should avoid embedding large image/video payloads into signed protocol envelopes. Benchmarks should report separately:

```text
provider artifact bytes
TRUYN control/envelope bytes
artifact-reference bytes
actual artifact download bytes
```

This prevents a small `ArtifactRef` from being incorrectly presented as if the underlying image or video required no transfer.

Private bucket/container names or long-lived credential-bearing URLs must not be published as benchmark evidence. Use logical artifact references/hashes or intentionally public evidence artifacts.

## Cost reporting

Public benchmark reports should distinguish:

```text
provider list-price equivalent
account-specific effective cash cost (only when safely reportable)
```

Credits, sponsorships, negotiated discounts and private billing arrangements can change independently of the protocol and should not be treated as a universal TRUYN cost claim.

## Model lifecycle and reproducibility

Concrete model IDs/versions are resolved immediately before a benchmark because provider catalogs change over time.

Benchmark reports SHOULD record the public model family/version actually tested and deployment class/region when needed for interpreting performance. They SHOULD NOT publish a private cloud deployment resource name merely for reproducibility; a logical benchmark label can represent that deployment while protected evidence retains the operational mapping.

## Provider-security gate

Multimodal benchmark success is separate from provider-access security. Before public users can safely coexist with owner-funded benchmark providers, the negative test matrix in `../architecture/THREAT_MODEL.md` must prove unauthorized requests cause zero upstream provider calls/jobs.

## References

Provider-specific public references may be updated at benchmark time because catalogs and model lifecycles change. Architecture semantics remain defined in `../architecture/MULTI_CLOUD_PROVIDER_ARCHITECTURE.md`.

## Implementation boundary

This file defines benchmark scope only. It does not create providers, resources, deployments, credentials, quotas, workflows, authorization policy or inference traffic.
