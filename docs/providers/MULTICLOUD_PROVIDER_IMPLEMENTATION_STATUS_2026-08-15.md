# TRUYN Multi-Cloud Provider Implementation Status — 2026-08-15

Status: **implemented with isolated live smoke verification; no A/B comparison is claimed by this document**.

This document records the first implementation pass for the public TRUYN multi-cloud provider architecture. Text, image, and video verification are intentionally separated. The smoke tests are connectivity/contract checks, not model-quality benchmarks.

Operational identifiers, credentials, subscription data, private resource names, quota allocations, and credit balances are intentionally excluded.

## Safety boundary

TRUYN provider runtimes now support a fail-closed `owner-only` access mode. The runtime service defaults to `owner-only`; without an explicit requester allowlist a routed request is rejected before provider execution. Public providers require an explicit opt-in configuration.

This is important because a public TRUYN relay does not imply public access to owner-funded AI providers.

## Text lane

Live smoke workflow: **TRUYN Text Providers Smoke**, run `31902899610`.

The smoke task was deliberately tiny: return a fixed marker in a single turn. No cross-provider comparison was performed.

| Cloud | Provider family | Adapter path | Live status |
|---|---|---|---|
| Google Cloud | Gemini | `vertex-gemini` | **PASS** |
| Microsoft Azure | GPT | `azure-openai` | **PASS** |
| Microsoft Azure | xAI Grok | `azure-foundry` | **PASS** |
| Microsoft Azure | DeepSeek | `azure-foundry` | **PASS** |
| Microsoft Azure | Meta Llama | `azure-foundry` | **PASS** |
| Microsoft Azure | Mistral AI | `azure-foundry` | **PASS** |
| Microsoft Azure | Moonshot Kimi | `azure-foundry` | **PASS** |

The shared `azure-foundry` adapter deliberately treats Grok, DeepSeek, Llama, Mistral, and Kimi as model-family configuration over one Foundry transport rather than duplicating transport code per vendor.

Observed smoke latencies are retained as diagnostic evidence only and MUST NOT be treated as a benchmark. One Llama smoke call, for example, was a large latency outlier while still returning a correct result.

## Image lane

Live smoke workflow: **TRUYN Image Providers Smoke**, run `31902479120`.

The image task was deliberately simple: one blue circle on a white background. Each provider generated exactly one image. No image-quality comparison was performed.

| Cloud | Provider family | Adapter path | Live status |
|---|---|---|---|
| Google Cloud | Google image generation track (`gemini-2.5-flash-image` in this proof) | `vertex-image` | **PASS** |
| Microsoft Azure | OpenAI `gpt-image` family (`gpt-image-1-mini` in this proof) | `azure-openai-image` | **PASS** |
| Microsoft Azure | Black Forest Labs FLUX | `azure-flux` | **IMPLEMENTED / DEPLOYMENT BLOCKED** |

Measured artifact evidence from the successful smoke run:

- Google image artifact: PNG, `70,032` bytes, SHA-256 `9393b106f4f0d0045bd78c7b937b7f72fac9adffe68b53b12951bc357002b6ae`.
- Azure `gpt-image` artifact: PNG, `8,332` bytes, SHA-256 `ea0251b5f6cbcf082074563ed2d8be590dce4fbb600ba7cb09b8d34c76c91189`.

These byte counts are evidence of successful output, not evidence that one model is better or cheaper.

FLUX adapter and registry support are implemented. A dedicated image-only smoke run (`31903194517`) found `FLUX-1.1-pro` in the Azure catalog but the live deployment was denied for the current Azure environment. No FLUX inference call was made after the deployment gate failed.

## Video lane

Live Google video workflow evidence: **TRUYN Video Providers Smoke**, run `31902941755`.

The video task was deliberately minimal. Video tests do not run as part of text or image smoke workflows.

| Cloud | Provider family | Adapter path | Smoke parameters | Live status |
|---|---|---|---|---|
| Google Cloud | Veo | `vertex-veo` | 4 seconds, 720p, 1 sample | **PASS** |
| Microsoft Azure | OpenAI Sora | `azure-openai-video` | target: 1 second, 480×480, 1 generation | **IMPLEMENTED / DEPLOYMENT BLOCKED** |

Veo proof result:

- model: `veo-3.1-fast-generate-001`;
- generated duration: `4` seconds;
- resolution: `720p`;
- sample count: `1`;
- provider smoke latency: `28,602 ms`;
- operation polls: `6`;
- MP4 artifact size: `377,898` bytes;
- SHA-256: `5139cdb5e93289b194b03c573bac573afe25a0406c5725c985a14886402024ba`.

Azure Sora preflight found `sora-2` in the Azure model catalog but deployment was denied in both tested supported-region candidates. Because deployment failed, the workflow correctly skipped Sora inference and consumed no video-generation call. A separate Azure-only fallback probe also tests the older `sora` generation without re-running Veo; its outcome should be treated independently from the successful Veo evidence.

## Normalized provider result contracts

Text providers return model output plus normalized telemetry.

Media providers return `ArtifactRef` metadata rather than embedding large generated binary payloads in TRUYN `RESULT` envelopes. The normalized artifact includes MIME type, byte count, SHA-256 digest, logical reference, and provider provenance.

Video providers use asynchronous provider jobs internally while preserving the same TRUYN-level result concept.

## Implemented provider modules

```text
adapters/providers/
  azure-openai.js
  azure-foundry.js
  azure-openai-image.js
  azure-flux.js
  azure-openai-video.js
  vertex-gemini.js
  vertex-image.js
  vertex-veo.js

adapters/providers/common/
  azure-auth.js
  google-auth.js
  artifacts.js
  azure-blob-artifact-store.js
  gcs-artifact-store.js
```

The runtime registry recognizes these provider families and the generic provider runtime can instantiate them from environment configuration.

## Verification discipline

The implementation follows these rules:

1. text, image, and video live tests remain separate;
2. smoke tests use tiny deterministic tasks;
3. video tests use the minimum supported practical parameters;
4. access/catalog/quota failures are recorded as `blocked_access`, not falsely reported as provider failures;
5. no A/B or model-quality conclusion is drawn from smoke data;
6. generated binaries are preserved as test evidence while TRUYN protocol results carry artifact references;
7. owner-funded runtime access is denied before inference unless the requester is explicitly authorized.

## Current boundary

The implemented adapters are ready for future benchmark orchestration. Live connectivity is proven for all seven target text families, both primary Google/Azure image tracks, and Google Veo. Azure Sora and optional Azure FLUX currently remain blocked at Azure deployment/entitlement rather than adapter implementation.
