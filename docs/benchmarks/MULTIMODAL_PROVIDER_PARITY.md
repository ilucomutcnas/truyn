# TRUYN Multimodal Provider Parity Benchmark

**Status:** benchmark methodology is defined; reference provider adapter paths now exist, but this document still claims **no completed cross-provider multimodal parity/A-B result**.  
**Status synchronization:** 2026-08-20.

This document defines how the TRUYN reference environment should compare providers across Google Cloud and Microsoft Azure without mixing incompatible modalities, presenting catalog availability as live deployment status, or implying public entitlement to project-funded provider accounts.

Individual provider smoke/integration evidence is distinct from a parity benchmark. A parity claim requires a dedicated run under the controls below and a separate durable measured report.

## Principle

Benchmark equivalent capabilities against equivalent capabilities:

```text
reasoning ↔ reasoning
image generation ↔ image generation
video generation ↔ video generation
```

The benchmark is provider-neutral at the TRUYN protocol layer and provider-specific only in the constrained benchmark policy.

All benchmark providers must be authorized for the benchmark owner/workload. A provider selector can choose among authorized candidates; it cannot override provider ownership/visibility policy.

## Reference provider groups

These groups have corresponding reference adapter paths in the repository; concrete cloud deployment availability still depends on entitlement/region/quota.

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
- current supported Google image-generation endpoint in Vertex AI

Microsoft Azure:
- Azure OpenAI `gpt-image` family
- Azure-direct Black Forest Labs FLUX adapter as an optional independent-vendor image path

### Video generation

Google Cloud:
- Veo

Microsoft Azure:
- Sora-family adapter

## Provider ownership and billing scope

Reference benchmark providers are owner-private unless deliberately shared under explicit policy. Public benchmark publication does not make their quota available to public TRUYN users.

The provider-security prerequisite is no longer future-only architecture: the reference implementation now has owner-bound provider identity, default `owner-only` policy, authorization-aware discovery/dispatch and a provider-host second authorization/billing gate with negative tests. A parity run must preserve those controls.

A benchmark report should record enough public model/version information to reproduce the comparison while private deployment resource names, cloud identities, private origins, quota allocations, credit balances and billing-account details remain operational/private.

Public cost reporting uses disclosed list-price/equivalent assumptions where appropriate. Account-specific credits/discounts may be reported only in aggregate when useful and safe.

## Grok clarification

Azure Foundry Grok paths are treated according to the concrete capability exposed by the deployed model. A reasoning/multimodal-understanding deployment MUST NOT be counted as image/video generation unless the actual provider endpoint supports generation. A future direct-xAI media benchmark would be a separate provider/billing surface.

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
- reference images when image-conditioned generation is included;
- generation latency;
- output artifact bytes;
- provider list-price equivalent;
- safety/filter outcome;
- deterministic seed only where both compared providers support a meaningful equivalent.

Quality evaluation should use a reproducible rubric such as prompt adherence, visual coherence, text rendering when requested, subject/reference consistency when applicable, artifact defects, and independent blinded human scoring and/or a disclosed multimodal evaluator.

Do not report a single quality number without the evaluation method.

## Video benchmark controls

Use equivalent constraints where supported:

- same semantic prompt;
- same source image for image-to-video tests;
- closest common aspect ratio;
- closest common duration;
- closest common resolution;
- audio generation either enabled for both or evaluated separately;
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

Because video generation is asynchronous, provider job polling is provider execution behavior while TRUYN orchestration overhead is reported separately.

## Artifact-transfer comparison

TRUYN avoids embedding large image/video payloads into signed protocol envelopes when an artifact reference is sufficient. Benchmarks should report separately:

```text
provider artifact bytes
TRUYN control/envelope bytes
artifact-reference bytes
actual artifact download bytes
```

This prevents a small `ArtifactRef` from being presented as if the underlying media required no transfer.

Private bucket/container names or long-lived credential-bearing URLs must not be published. Use logical artifact references/hashes or intentionally public evidence artifacts.

## Cost reporting

Public reports should distinguish:

```text
provider list-price equivalent
account-specific effective cash cost (only when safely reportable)
```

Credits, sponsorships, negotiated discounts and private billing arrangements can change independently of the protocol and must not be treated as a universal TRUYN cost claim.

## Model lifecycle and reproducibility

Concrete model IDs/versions are resolved immediately before a benchmark because provider catalogs change.

Reports SHOULD record the public model family/version actually tested and deployment class/region where needed for performance interpretation. They SHOULD NOT publish private cloud deployment resource names merely for reproducibility; a logical benchmark label may represent protected operational mapping.

## Provider-security invariant

Benchmark infrastructure MUST NOT weaken the normal provider-security boundary.

Required negative invariant:

```text
unauthorized requester
        ↓
private benchmark provider
        ↓
DENY before upstream execution
        ↓
provider execution count = 0
```

A benchmark workflow may temporarily provision or address private providers for its owner, but it does not create public entitlement and should not leave privileged workflow/topology details in permanent public `main` when they are unnecessary.

## What implementation now exists

This methodology file does not create implementation, but the broader repository now contains:

- Google/Azure text adapter paths;
- Google/Azure image adapter paths;
- Google/Azure video adapter paths;
- normalized provider telemetry;
- media artifact reference/provenance handling;
- async video execution support;
- owner-private authorization/billing guards.

That implementation makes a future parity run possible without changing the protocol architecture. It does **not** mean a parity result has already been measured.

## References

- `../architecture/MULTI_CLOUD_PROVIDER_ARCHITECTURE.md`
- `../architecture/IMPLEMENTATION_STATUS.md`
- `../architecture/AUTHORIZATION_MODEL.md`
- `README.md` for the durable evidence ledger.

## Evidence rule

When a real multimodal parity benchmark is eventually run, publish its measured result as a separate dated report under `docs/benchmarks/`. Keep this methodology as the control contract rather than rewriting it into an evidence result.