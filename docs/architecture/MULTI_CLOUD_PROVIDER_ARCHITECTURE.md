# TRUYN Multi-Cloud Provider Architecture

Status: **public architecture target; implementation not started by this document**.

This document defines the public provider architecture for the TRUYN reference testnet across Google Cloud and Microsoft Azure. It intentionally excludes operational identifiers, credentials, quota allocations, billing-account data, private resource names, service-account identities, production topology, provider node IDs, privileged allowlists and other deployment-sensitive information.

## Goal

TRUYN should compare and route **capabilities**, not brands. The reference architecture therefore maintains cross-cloud parity for three primary modalities:

```text
reasoning / text
image generation
video generation
```

The purpose is to support reproducible provider selection, failover and benchmarks where equivalent capabilities are compared against equivalent capabilities.

## Security premise

Reference cloud providers are not a public pool of free intelligence.

> **A provider being connected to TRUYN does not make its upstream cloud account available to every TRUYN participant.**

Every reference provider is subject to the provider ownership and authorization architecture:

```text
provider identity
owner / tenant boundary
visibility policy
billing mode
authorization / entitlement
```

Project/operator-funded benchmark providers are owner-private by default. Their presence in discovery/benchmark documentation is not an entitlement to their quota.

Normal external users are BYOK by default and connect provider capacity they control.

See `PROVIDER_OWNERSHIP.md`, `AUTHORIZATION_MODEL.md`, `BILLING_BOUNDARY.md` and `BYOK_ARCHITECTURE.md`.

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

TRUYN treats `media.image.generate` as a stable capability even when Google changes the concrete model endpoint. Public architecture uses the logical **Google image-generation track** rather than binding TRUYN to one permanent model version string.

### Google video lifecycle

Veo is the Google video-generation track. Concrete versions are selected at deployment/preflight time and are not protocol semantics.

### Azure image generation

Microsoft/Azure image-generation families can back `media.image.generate`. Multiple vendors can be tested independently without changing the TRUYN capability namespace.

### Azure video generation

Azure-hosted video-generation families can back `media.video.generate`. Video generation is asynchronous and therefore maps naturally to TRUYN's long-running execution semantics while still returning a normal `RESULT` to the requester.

### Grok media clarification

A model family available for reasoning/multimodal understanding MUST NOT be advertised as an image/video generation provider unless that concrete deployed provider explicitly supports generation. Direct vendor adapters and cloud-marketplace adapters are separate provider/billing surfaces.

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

The diagram describes capability/provider roles, not public access entitlement and not a promise that every provider is already deployed.

## Provider isolation

The reference runtime follows this rule:

> **one provider family/capability runtime = one TRUYN identity = independently observable health, latency, cost and failure domain**

A common container/runtime implementation may be reused, but materially different provider families or modalities should not become one indistinguishable provider identity.

This preserves:

- independent provider telemetry;
- capability-level failover;
- model-family provenance;
- provider-specific trust history;
- clear benchmark attribution;
- clean rollback and quota isolation.

Provider identity isolation is not the same as authorization. A distinct provider identity still needs an owner/tenant/visibility policy.

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

while a benchmark or policy can constrain the route by cloud/vendor/family.

Authorization still runs before ranking/dispatch. A selector cannot force a requester onto a provider it is not allowed to use.

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

`ref` is a logical artifact reference. Public protocol documentation MUST NOT require a provider-specific private bucket URL, storage-account URL, credential-bearing URI or long-lived signed URL.

## Asynchronous video execution

Video generation is not assumed to be synchronous.

```text
NEED media.video.generate
          ↓
authorization + quota
          ↓
provider job / operation
          ↓
processing
          ↓
artifact persisted or referenced
          ↓
RESULT { ArtifactRef }
```

Provider-specific polling, job IDs and temporary download URLs remain adapter concerns.

## Credentials and cloud identity

Prefer cloud-native workload identity/managed identity where available. Raw API keys, service-account JSON, client secrets and private provider credentials are not protocol payloads.

Public architecture may describe the generic identity flow:

```text
CI/deployer identity
      ↓
cloud deployment
      ↓
runtime workload identity
      ↓
provider API
```

but MUST NOT publish live privileged identity strings merely to document the architecture.

## Cross-cloud comparison principle

The reference benchmark MUST compare like with like:

```text
reasoning ↔ reasoning
image     ↔ image
video     ↔ video
```

Only providers authorized for the benchmark owner/workload participate. Benchmark availability is not public network entitlement.

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

Provider-security/accounting telemetry should additionally support attribution such as requester/provider owner/billing mode without publishing private operational identities in aggregate public benchmark output.

Cost reporting should distinguish provider list-price equivalent from account-specific credits, discounts or sponsorship. Credit balances and private billing arrangements are operational data and do not belong in this public repository.

## Public/private boundary

Safe to publish:

- logical provider families;
- capability taxonomy;
- generic cloud architecture;
- provider ownership/authorization invariants;
- generic adapter contracts;
- artifact/result schemas;
- benchmark methodology;
- validated aggregate benchmark results;
- generic placeholders and non-sensitive environment-variable examples.

Do not intentionally publish:

- credentials or private keys;
- unnecessary subscription/billing/internal tenant identifiers;
- real privileged service-account/managed-identity identifiers;
- private origins/backchannels or bucket/container names;
- production resource topology;
- quota allocations and internal cost ceilings;
- secret paths or privileged allowlists;
- private provider node IDs/deployment names where they reveal operations;
- sensitive prompts, outputs or customer data.

See `PUBLIC_PRIVATE_BOUNDARY.md`.

## Implementation boundary

This document changes **architecture and public planning only**. It does not declare any new adapter, model deployment, ownership ACL, quota system, cloud resource, BYOK onboarding flow or benchmark as implemented.

Before public users can safely coexist with owner-funded reference providers, the provider-security gate in `THREAT_MODEL.md` and `ROADMAP.md` must be implemented and pass negative tests.
