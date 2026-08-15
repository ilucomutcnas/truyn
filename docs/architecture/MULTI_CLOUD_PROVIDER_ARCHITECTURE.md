# TRUYN Multi-Cloud Provider Architecture

Status: **public architecture target; implementation not started by this document**.

This document defines the public provider architecture for the TRUYN reference testnet across Google Cloud and Microsoft Azure. It intentionally excludes operational identifiers, credentials, quota allocations, billing-account data, private resource names, service-account identities, production topology, and other deployment-sensitive information.

## Goal

TRUYN should compare and route **capabilities**, not brands. The reference architecture therefore maintains cross-cloud parity for three primary modalities:

```text
reasoning / text
image generation
video generation
```

The purpose is to support reproducible provider selection, failover and benchmarks where equivalent capabilities are compared against equivalent capabilities.

## Public reference matrix

| Capability | Google Cloud / Vertex AI | Microsoft Azure / Foundry |
|---|---|---|
| `reasoning.general` | Gemini | GPT, Grok, DeepSeek, Llama, Mistral, Kimi |
| `media.image.generate` | Google image-generation track (Imagen lineage / current supported Vertex image endpoint) | Azure OpenAI `gpt-image` family; Azure-direct FLUX may provide an additional independent image provider |
| `media.image.edit` | Current supported Google image editing endpoint where available | `gpt-image` image editing where supported; FLUX contextual/image editing where supported |
| `media.video.generate` | Veo | Sora 2 |
| `media.video.transform` | Veo capabilities where supported | Sora 2 remix / image-to-video / generated-video workflows where supported |

Model versions, regional availability, preview/GA status, quotas and concrete deployment IDs are runtime concerns and MUST NOT become protocol semantics.

## Current catalog notes

### Google image lifecycle

TRUYN treats `media.image.generate` as a stable capability even when Google changes the concrete model endpoint. Google Cloud release notes published in 2026 deprecated several Imagen generation endpoints and recommended migration to `gemini-2.5-flash-image`. Therefore the public architecture uses the logical **Google image-generation track** rather than binding TRUYN to one Imagen version string.

Reference:
- https://cloud.google.com/vertex-ai/docs/release-notes
- https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash-image

### Google video lifecycle

Veo is the Google video-generation track. Concrete Veo versions are selected at deployment/preflight time. Google release notes recommend current Veo 3.1 endpoints over retired Veo 2/3.0 generation endpoints.

Reference:
- https://cloud.google.com/vertex-ai/docs/release-notes
- https://cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos

### Azure image generation

Microsoft Foundry exposes Azure OpenAI image-generation models including the `gpt-image` family. Microsoft also lists Black Forest Labs FLUX image models as models sold directly by Azure, which gives TRUYN an optional second Azure-side image-generation vendor for diversity testing.

Reference:
- https://learn.microsoft.com/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure

### Azure video generation

Azure OpenAI exposes Sora video generation, including Sora 2 through the Azure OpenAI v1 API. Video generation is asynchronous and therefore maps naturally to TRUYN's long-running execution semantics while still returning a normal `RESULT` to the requester.

Reference:
- https://learn.microsoft.com/azure/foundry/openai/concepts/video-generation

### Grok media clarification

xAI provides **Grok Imagine** image and video generation through xAI's own API. However, the current Microsoft Foundry xAI catalog documents Azure-hosted Grok models primarily as chat/reasoning models. Some Grok 4.1 Fast variants accept image input, but their documented output is text.

Therefore:

- Grok in the Azure reference path is a `reasoning.general` / multimodal-understanding provider.
- Grok MUST NOT be advertised as an Azure `media.image.generate` or `media.video.generate` provider unless Microsoft Foundry explicitly exposes those generation models in the deployed catalog.
- A future direct-xAI Grok Imagine adapter would be a separate provider path and a separate billing/deployment surface, not an implicit capability of the Azure Grok node.

References:
- https://learn.microsoft.com/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure
- https://docs.x.ai/developers/model-capabilities/imagine

## Logical architecture

```text
                               TRUYN NETWORK
                                    │
                       NEED / OFFER / RESULT
                                    │
             ┌──────────────────────┴──────────────────────┐
             │                                             │
      GOOGLE CLOUD                                  MICROSOFT AZURE
        Vertex AI                                   Foundry / Azure OpenAI
             │                                             │
     ┌───────┼────────┐                 ┌──────────────────┼──────────────────┐
     │       │        │                 │        │         │        │         │
   Gemini  Google    Veo               GPT      Grok   DeepSeek   Llama   Mistral/Kimi
           Image                         │
                                         ├── gpt-image family  → image artifacts
                                         ├── FLUX (optional)   → image artifacts
                                         └── Sora 2            → video artifacts
```

The diagram describes capability ownership, not a promise that every provider is already deployed.

## Provider isolation

The reference runtime follows this rule:

> **one provider family/capability runtime = one TRUYN identity = independently observable health, latency, cost and failure domain**

A common container/runtime implementation may be reused, but a Grok node and a DeepSeek node, or an image node and a video node, should not become one indistinguishable provider identity.

This preserves:

- independent provider telemetry;
- capability-level failover;
- model-family provenance;
- provider-specific trust history;
- clear benchmark attribution;
- clean rollback and quota isolation.

## Capability semantics

Model names are metadata, not capabilities.

Correct:

```text
OFFER
capability: media.image.generate
metadata.cloud: azure
metadata.vendor: openai
metadata.family: gpt-image
```

Incorrect as the primary network abstraction:

```text
OFFER gpt-image-1.5
```

A requester can remain vendor-neutral:

```text
NEED media.video.generate
```

while a benchmark or policy can constrain the route:

```text
policy.providerSelector.cloud = "gcp"
policy.providerSelector.family = "veo"
```

## Result classes

Text/reasoning providers return structured text results.

Media providers return **artifact references**, not large binary payloads embedded in TRUYN envelopes.

Conceptual media result:

```json
{
  "type": "artifact",
  "artifacts": [
    {
      "id": "art_...",
      "mediaType": "image/png",
      "bytes": 123456,
      "sha256": "...",
      "ref": "...",
      "provenance": {
        "cloud": "azure",
        "vendor": "openai",
        "family": "gpt-image"
      }
    }
  ]
}
```

`ref` is a logical artifact reference. Public protocol documentation MUST NOT require a provider-specific bucket URL, storage-account URL, signed URL, or credential-bearing URI.

## Asynchronous video execution

Video generation is not assumed to be synchronous.

```text
NEED media.video.generate
          ↓
provider job / operation
          ↓
processing
          ↓
artifact persisted or referenced
          ↓
RESULT { ArtifactRef }
```

Provider-specific polling, job IDs and temporary download URLs remain adapter concerns. The TRUYN requester receives the same network-level result concept regardless of whether the underlying provider is Veo or Sora.

## Cross-cloud comparison principle

The reference benchmark MUST compare like with like:

```text
reasoning ↔ reasoning
image     ↔ image
video     ↔ video
```

Primary public parity pairs are:

- Google reasoning (Gemini) ↔ Azure reasoning providers (GPT, Grok, DeepSeek, Llama, Mistral, Kimi)
- Google image generation ↔ Azure OpenAI image generation
- Google image generation ↔ Azure-direct FLUX as an optional independent-vendor image comparison
- Google Veo ↔ Azure OpenAI Sora 2

Grok chat output MUST NOT be compared as though it were Grok Imagine image/video output.

See `docs/benchmarks/MULTIMODAL_PROVIDER_PARITY.md`.

## Telemetry contract

Equivalent providers should expose normalized telemetry where the source API makes it available:

```text
cloud
vendor
family
model
capability
providerLatencyMs
endToEndLatencyMs
inputTokens / outputTokens (when applicable)
requestBytes
responseBytes
artifactBytes
status
providerRequestId
```

Cost reporting should distinguish provider list-price equivalent from account-specific credits, discounts or sponsorship. Credit balances and private billing arrangements are operational data and do not belong in this public repository.

## Public/private boundary

Safe to publish:

- logical provider families;
- capability taxonomy;
- generic cloud architecture;
- generic adapter contracts;
- artifact/result schemas;
- benchmark methodology;
- measured benchmark results after validation;
- generic environment-variable names when they do not reveal identifiers.

Do not publish:

- credentials or private keys;
- subscription, billing-account or tenant-sensitive identifiers beyond already-intended public metadata;
- real service-account or managed-identity identifiers;
- private bucket/container names;
- production resource topology;
- quota allocations and internal cost ceilings;
- secret paths or access policies;
- private deployment names where they reveal operational topology;
- sensitive prompts, outputs or customer data.

## Implementation boundary

This document changes **architecture and public planning only**. It does not declare any new adapter, model deployment, quota allocation, cloud resource, or benchmark as implemented.

Before implementation, each provider/capability path requires a zero-spend preflight for current model availability, region, access requirements, quota and billing eligibility.