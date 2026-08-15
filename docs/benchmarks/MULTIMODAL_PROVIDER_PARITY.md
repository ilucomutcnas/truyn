# TRUYN Multimodal Provider Parity Benchmark

Status: **planned methodology; no multimodal benchmark result is claimed by this document**.

This document defines how the TRUYN reference testnet should compare providers across Google Cloud and Microsoft Azure without mixing incompatible modalities or presenting catalog availability as implementation status.

## Principle

Benchmark equivalent capabilities against equivalent capabilities:

```text
reasoning ↔ reasoning
image generation ↔ image generation
video generation ↔ video generation
```

The benchmark is provider-neutral at the TRUYN protocol layer and provider-specific only in the constrained benchmark policy.

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

## Grok clarification

The Azure Foundry Grok models currently documented by Microsoft are chat/reasoning models. Some Grok 4.1 Fast variants can accept image input, but the documented response format remains text.

xAI separately exposes Grok Imagine image and video generation through the xAI API. That is not treated as an Azure media capability unless Microsoft Foundry exposes the corresponding generation model in its catalog.

A future direct-xAI benchmark may compare Grok Imagine against Google/Azure media providers, but it must be identified as a third provider surface with its own access and billing path.

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

Quality evaluation should include a reproducible rubric such as:

- prompt adherence;
- visual coherence;
- text rendering when requested;
- subject/reference consistency when applicable;
- artifact defects;
- independent blinded human scoring and/or a disclosed multimodal evaluator.

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

TRUYN should avoid embedding large image/video payloads into signed protocol envelopes. Benchmarks should therefore report separately:

```text
provider artifact bytes
TRUYN control/envelope bytes
artifact-reference bytes
actual artifact download bytes
```

This prevents a small `ArtifactRef` from being incorrectly presented as if the underlying image or video required no transfer.

## Cost reporting

Public benchmark reports should distinguish:

```text
provider list-price equivalent
account-specific effective cash cost
```

Credits, sponsorships, negotiated discounts and private billing arrangements can change independently of the protocol and should not be treated as a universal TRUYN cost claim.

## Model lifecycle

Concrete model IDs are resolved immediately before a benchmark. Provider catalogs change over time.

As of the architecture update on 2026-08-15:

- Google Cloud release notes recommend migration from listed Imagen generation endpoints to `gemini-2.5-flash-image` and from older Veo generation endpoints to Veo 3.1 equivalents.
- Microsoft Foundry documents Azure OpenAI `gpt-image` image-generation models and Sora/Sora 2 video-generation models.
- Microsoft Foundry also documents Azure-direct FLUX image-generation models.

Benchmark reports MUST record the exact model/deployment version actually tested rather than relying only on family names.

## References

- Google Vertex AI release notes: https://cloud.google.com/vertex-ai/docs/release-notes
- Google image generation: https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash-image
- Google Veo: https://cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos
- Microsoft Foundry models sold by Azure: https://learn.microsoft.com/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure
- Microsoft Sora video generation: https://learn.microsoft.com/azure/foundry/openai/concepts/video-generation
- xAI Grok Imagine: https://docs.x.ai/developers/model-capabilities/imagine

## Implementation boundary

This file defines benchmark scope only. It does not create providers, resources, deployments, credentials, quotas, workflows or inference traffic.