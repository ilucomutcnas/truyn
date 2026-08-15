# TRUYN BYOK Architecture

**Status:** official CLI BYOK onboarding, private-provider isolation, local OpenAI-compatible runtime profiles and generic custom HTTP provider profiles implemented; custom MCP provider onboarding and secure-secret integrations remain future work.

## Definition

TRUYN uses **BYOK — Bring Your Own Intelligence / Bring Your Own Provider** as the default user model.

The network connects intelligence. It does not provide a shared pool of operator-owned AI credentials to arbitrary public users.

## Implemented user model

The current CLI can configure these BYOK profile classes:

```text
OpenAI
Anthropic / Claude
Azure OpenAI
Vertex Gemini
OpenAI-compatible endpoint
local OpenAI-compatible runtime
custom HTTP JSON provider
```

The profile records non-secret provider configuration and, when authentication is required, the **name** of the environment variable that supplies a credential. `truyn setup --test` performs a minimal real provider call and only then marks the profile verified.

A generic custom MCP provider profile is not yet implemented in `truyn setup`. MCP remains an existing TRUYN interoperability/requester surface and a separate future provider-onboarding slice.

## Separate requester and provider identities

The official BYOK flow intentionally creates two cryptographic identities:

```text
requester node identity
provider node identity
```

They must not be the same identity.

The private provider's signed OFFER authorizes the requester node through `allowedRequesterIds`. The relay binds provider ownership to the cryptographic sender of the OFFER rather than trusting requester-controlled owner/tenant fields.

This provides the current node-level self/private relationship without requiring the requester to become a globally trusted relay actor.

## Credential locality

Provider credentials stay with the provider runtime that needs them.

```text
user device / private runtime
  ├── requester TRUYN identity
  ├── private provider TRUYN identity
  ├── provider adapter
  └── optional provider credential from local environment/runtime identity
          ↓
      upstream/local provider
```

The relay receives signed TRUYN protocol data and policy/usage metadata. It does not require raw provider API keys for ordinary BYOK routing.

## Current persisted profile

The current local profile contains data such as:

```text
provider type
model
endpoint/base URL where applicable
auth mode
credential environment-variable name where applicable
capabilities
requester node ID
provider node ID
verified timestamp
accessMode = owner-only
billingMode = byok
```

It does not store the resolved credential value.

The separate provider identity is private key material and is written into the user's TRUYN home with private-file permissions, just like the requester identity.

## Secret-storage boundary

The current implementation resolves credential material from environment variables or the provider's cloud runtime identity. It does **not** yet integrate with an operating-system credential/key store.

OS credential/key-store integration remains a future hardening path. Documentation must not claim that capability until it is implemented.

No-auth provider profiles contain no credential reference at all.

## Official-client gate

For non-loopback relays, the official CLI now requires a verified private BYOK profile before AI-workload entry points such as requester NEED, MCP, MCP HTTP and HTTP bridge usage.

The remote provider command also requires a verified profile and starts the provider with:

```text
accessMode = owner-only
allowedRequesterIds = [requester node ID]
billingMode = byok
```

Direct ad-hoc `truyn provider --provider ...` remains available only for loopback local development.

This is a product/UX guardrail, not the primary security boundary. A malicious custom client can bypass local UX, so relay/provider authorization and billing policy independently enforce ownership.

## Provider privacy default

A configured BYOK provider is private by default. Another registered requester that is not in its provider-signed allowlist cannot discover or dispatch to it.

The provider host independently checks access and BYOK billing responsibility before adapter execution.

## Public network independence

BYOK readiness and public-network reachability are separate decisions.

The production-style relay remains closed by default. Public network registration and dispatch require a dedicated runtime master switch plus separate registration/dispatch opt-ins. Implementing BYOK in the CLI does not automatically enable those production settings.

## Sharing later

A provider owner may later choose to publish a capability under explicit terms, price, quota or access policy. That is a provider-owner decision and does not change the BYOK default.

Owner-funded providers remain separate: default owner-funded billing refuses public execution even if public provider access is separately enabled.

## OpenAI-compatible and local paths

The generic OpenAI-compatible BYOK path supports:

```text
base URL
model
capabilities
optional API key via named environment variable
explicit --no-auth mode
```

The `local` profile is the no-auth local-runtime form of this transport. It requires a base URL and model and calls the OpenAI Responses-compatible `/v1/responses` endpoint without an Authorization header.

Normal `openai` profiles still require authentication. No-auth behavior is explicit and is not silently applied to OpenAI cloud profiles.

## Custom HTTP provider path

The `custom-http` profile sends a normalized POST to a user-supplied `http` or `https` endpoint:

```json
{
  "capability": "...",
  "input": "...",
  "policy": {}
}
```

The provider may return text, a JSON value, or `{ "output": ..., "metadata": { "usage": ... } }`.

Authentication is `none` by default. Optional bearer authentication is enabled only when the user explicitly names a credential environment variable; the resolved token is not persisted and is not returned in normalized provider metadata.

Because this endpoint executes from the user's private provider runtime rather than from the central relay, endpoint reachability remains part of the user's own runtime trust boundary.

## Future custom-provider paths

Future profile types may add:

```text
custom MCP provider
OS credential/key-store integration
universal desktop Google ADC/login flow
```

These are not claimed as implemented today.

## Public statement

The public project promise is:

> **TRUYN does not give public users access to another party's paid AI credentials or provider quota. Bring your own provider unless an explicit shared/sponsored entitlement says otherwise.**
