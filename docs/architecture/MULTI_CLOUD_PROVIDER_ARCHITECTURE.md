# TRUYN Multi-Cloud Provider Architecture

**Status:** public architecture **implemented as reference adapter/runtime paths**; individual cloud deployments remain subject to provider entitlement, region and quota.  
**Status synchronization:** 2026-08-20.

This document defines the public provider architecture for the TRUYN reference network across Google Cloud and Microsoft Azure. It intentionally excludes operational identifiers, credentials, quota allocations, billing-account data, private resource names, service-account identities, production topology, provider node IDs, privileged allowlists and other deployment-sensitive information.

## Goal

TRUYN compares and routes **capabilities**, not brands. The reference architecture maintains cross-cloud parity for three primary modalities:

```text
reasoning / text
image generation
video generation
```

The purpose is to support interoperable provider execution, future failover/selection and reproducible benchmarks where equivalent capabilities are compared against equivalent capabilities.

## Factual implementation boundary

The repository currently contains executable reference adapter paths for:

### Google Cloud / Vertex AI

- Gemini text/reasoning;
- Google/Vertex image generation;
- asynchronous Veo video generation.

### Microsoft Azure / Foundry

- Azure OpenAI text/reasoning;
- shared Foundry text transport used by Grok, DeepSeek, Llama, Mistral and Kimi model families;
- Azure OpenAI `gpt-image` image generation;
- Azure-direct FLUX image adapter;
- asynchronous Azure OpenAI/Sora video adapter.

Shared Azure/GCP authentication helpers, telemetry, artifact normalization/storage and asynchronous job handling exist in the reference implementation.

**Adapter implementation is not the same as live deployment availability.** A concrete provider path may be blocked by cloud entitlement/quota/region even when the adapter is implemented. Public documentation therefore distinguishes `implemented adapter path` from `live deployment available` and from `benchmark result`.

## Security premise

Reference cloud providers are not a public pool of free intelligence.

> **A provider being connected to TRUYN does not make its upstream cloud account available to every TRUYN participant.**

The provider ownership/security baseline is now implemented in reference form:

```text
signed/authenticated provider identity
        ↓
owner / provider-policy boundary
        ↓
authorization-aware discovery / dispatch
        ↓
billing responsibility / entitlement
        ↓
provider-host authorization
        ↓
adapter / upstream call
```

Project/operator-funded benchmark providers are owner-private by default. Their presence in discovery/benchmark documentation is not an entitlement to their quota.

Normal external users are BYOK by default and connect provider capacity they control.

See `PROVIDER_OWNERSHIP.md`, `AUTHORIZATION_MODEL.md`, `BILLING_BOUNDARY.md`, `BYOK_ARCHITECTURE.md` and `THREAT_MODEL.md`.

## Public reference matrix

| Capability | Google Cloud / Vertex AI | Microsoft Azure / Foundry |
|---|---|---|
| `reasoning.general` | Gemini | GPT, Grok, DeepSeek, Llama, Mistral, Kimi |
| `media.image.generate` | Google image-generation track | Azure OpenAI `gpt-image`; Azure-direct FLUX adapter |
| `media.image.edit` | supported Google image editing where available | `gpt-image`/FLUX editing where supported |
| `media.video.generate` | Veo | Sora family adapter |
| `media.video.transform` | Veo capabilities where supported | Sora-family transform/remix paths where supported |

Concrete model versions, regional availability, preview/GA status, quotas and deployment IDs are runtime concerns and MUST NOT become protocol semantics.

## Model lifecycle

TRUYN keeps stable logical capability names while concrete cloud model IDs change.

Examples:

```text
media.image.generate
        ↓
current authorized Google image endpoint
```

and:

```text
media.video.generate
        ↓
current authorized Veo / Sora deployment
```

The protocol does not need a new capability whenever a vendor changes a model version string.

A family available for reasoning/multimodal understanding MUST NOT be advertised as an image/video generation provider unless the concrete deployed provider explicitly supports generation. Direct-vendor and cloud-marketplace adapters remain separate provider/billing surfaces.

## Logical architecture

```text
                               TRUYN NETWORK
                                    │
                       NEED / OFFER / RESULT
                                    │
                          AUTHORIZATION GATE
                                    │
             ┌──────────────────────┴──────────────────────┐
             │                                             │
      GOOGLE CLOUD                                  MICROSOFT AZURE
      provider runtimes                             provider runtimes
             │                                             │
     ┌───────┼────────┐                 ┌──────────────────┼──────────────────┐
     │       │        │                 │        │         │        │         │
   Gemini  Google    Veo               GPT      Grok   DeepSeek   Llama   Mistral/Kimi
           Image                         │
                                         ├── image provider family → artifacts
                                         └── video provider family → artifacts
```

This describes capability/provider roles, not public access entitlement and not a guarantee that every cloud deployment is currently permitted.

## Provider isolation

Reference runtime rule:

> **one materially distinct provider family/capability runtime = one independently attributable TRUYN provider identity / telemetry stream**

A common container/transport implementation may be reused, but different provider families/modalities should remain independently observable for:

- health/failure;
- latency;
- capability-level routing/failover;
- provider/model provenance;
- trust history;
- benchmark attribution;
- quota/cost isolation;
- rollback.

Provider identity isolation is separate from authorization. A distinct provider identity still needs owner/visibility/billing policy.

## Capability semantics

Model names are metadata, not capabilities.

Correct:

```text
OFFER
capability: media.image.generate
metadata.cloud: <cloud>
metadata.vendor: <vendor>
metadata.family: <logical family>
```

Incorrect as the primary network abstraction:

```text
OFFER <specific-model-version>
```

A requester can remain vendor-neutral:

```text
NEED media.video.generate
```

while an authorized benchmark/policy can constrain cloud/vendor/family. A selector cannot force a requester onto an unauthorized provider.

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
        "cloud": "<cloud>",
        "vendor": "<vendor>",
        "family": "<family>"
      }
    }
  ]
}
```

`ref` is logical. Public protocol documentation MUST NOT require private bucket/storage URLs, credentials or long-lived secret-bearing signed URLs.

## Asynchronous video execution

Video generation is not assumed synchronous:

```text
NEED media.video.generate
          ↓
authorization + billing/quota
          ↓
provider job / operation
          ↓
processing / polling
          ↓
artifact persisted or referenced
          ↓
RESULT { ArtifactRef }
```

Provider job IDs/polling/temporary download URLs remain adapter concerns.

## Credentials and cloud identity

Prefer cloud-native workload identity/managed identity where available. Raw API keys, service-account JSON, client secrets and private provider credentials are not protocol payloads.

Generic public identity flow:

```text
CI/deployer identity
      ↓
cloud deployment
      ↓
runtime workload identity
      ↓
provider API
```

Live privileged identity strings do not need to be published to explain this architecture.

## Cross-cloud comparison principle

Compare like with like:

```text
reasoning ↔ reasoning
image     ↔ image
video     ↔ video
```

Only providers authorized for the benchmark owner/workload participate. Benchmark availability is not public network entitlement.

The benchmark methodology exists in `../benchmarks/MULTIMODAL_PROVIDER_PARITY.md`. The existence of individual smoke tests/reference adapters is **not** itself a completed cross-provider A/B/parity benchmark.

## Telemetry contract

Equivalent providers should normalize telemetry where the source API makes it available:

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

Security/accounting telemetry should support requester/provider owner/billing attribution without publishing private operational identities in public aggregate reports.

Cost reporting should distinguish provider list-price equivalent from account-specific credits/discounts/sponsorship. Private credit balances and billing arrangements remain operational data.

## Public/private boundary

Safe to publish:

- logical provider families/capabilities;
- generic cloud architecture;
- implemented adapter paths;
- ownership/authorization invariants;
- artifact/result schemas;
- benchmark methodology;
- validated aggregate results;
- generic non-secret environment-variable examples.

Do not intentionally publish:

- credentials/private keys;
- unnecessary subscription/billing/internal tenant identifiers;
- privileged service-account/managed-identity identifiers;
- private origins/backchannels/bucket/container names;
- production resource topology;
- exact quotas/internal cost ceilings;
- secret paths/privileged allowlists;
- sensitive prompts/outputs/customer data.

See `PUBLIC_PRIVATE_BOUNDARY.md`.

## Current completion boundary

Implemented reference architecture/code:

- provider ownership/default-private authorization baseline;
- BYOK provider setup/runtime patterns;
- Google/Azure text/image/video adapter paths;
- common auth/telemetry/artifact/async execution building blocks;
- normalized media artifact results.

Still separate/open:

- cloud entitlement/quota for every model in every region;
- a completed cross-provider multimodal A/B/parity benchmark;
- stable broad provider certification;
- production commercial account/tenant entitlement control plane;
- production mainnet/Internet-scale network closure.

The factual matrix lives in `IMPLEMENTATION_STATUS.md`; measured results live only in `../benchmarks/`.