# Bring Your Own Intelligence (BYOK)

**Status:** official CLI BYOK flow implemented for OpenAI, OpenAI-compatible, local OpenAI-compatible runtimes, Anthropic, Azure OpenAI, Vertex Gemini and generic custom HTTP providers.

TRUYN is designed around **BYOK — Bring Your Own Intelligence / Bring Your Own Provider**.

A public TRUYN network does not provide arbitrary users with another party's paid AI credentials or provider quota.

## Implemented CLI flow

Create the requester identity first:

```bash
truyn init
```

Configure a private provider profile. Example for OpenAI:

```bash
export OPENAI_API_KEY='...'
truyn setup \
  --provider openai \
  --model <your-model> \
  --capability reasoning.general
```

TRUYN stores the **name of the credential environment variable**, not its secret value. The profile remains unverified until a real connection test succeeds:

```bash
truyn setup \
  --provider openai \
  --model <your-model> \
  --capability reasoning.general \
  --test
```

`--test` performs a minimal call to **your configured provider**. That call may consume a small amount of your own provider quota. It does not use a TRUYN operator's provider credentials.

Check the local profile without revealing the secret:

```bash
truyn setup-status
```

After verification, start the private provider node against a relay:

```bash
truyn provider --relay <relay-url>
```

The official CLI uses a separate cryptographic identity for the provider node and publishes an `owner-only` OFFER that authorizes the requester's node ID. Billing mode is `byok`.

## Supported profile classes

The current setup implementation supports:

```text
openai
openai-compatible
local
anthropic
azure-openai
vertex-gemini
custom-http
```

### OpenAI-compatible endpoint

```bash
truyn setup \
  --provider openai-compatible \
  --base-url https://example.invalid \
  --model <model> \
  --credential-env MY_PROVIDER_KEY \
  --test
```

If an OpenAI-compatible endpoint intentionally requires no authentication, add `--no-auth`. Authentication is never silently disabled for normal OpenAI profiles.

### Local model runtime

`local` is an OpenAI Responses-compatible local endpoint with no authentication by default:

```bash
truyn setup \
  --provider local \
  --base-url http://127.0.0.1:11434 \
  --model <local-model> \
  --test
```

TRUYN sends the request to `<base-url>/v1/responses` and does not add an `Authorization` header for the `local` profile.

### Generic custom HTTP provider

`custom-http` sends a normalized JSON POST to the endpoint supplied by the user:

```json
{
  "capability": "reasoning.general",
  "input": "...",
  "policy": {}
}
```

The endpoint may return plain text, any JSON value, or a JSON object containing `output` and optional `metadata.usage`.

No-auth example:

```bash
truyn setup \
  --provider custom-http \
  --endpoint http://127.0.0.1:9000/agent \
  --capability reasoning.general \
  --test
```

Optional bearer authentication is enabled only when the user explicitly provides a credential environment-variable name:

```bash
export MY_AGENT_TOKEN='...'
truyn setup \
  --provider custom-http \
  --endpoint https://agent.example.test/v1/execute \
  --credential-env MY_AGENT_TOKEN \
  --test
```

The token value is resolved only by the provider runtime and is not persisted in the BYOK profile or returned in provider metadata.

### Anthropic

```bash
export ANTHROPIC_API_KEY='...'
truyn setup --provider anthropic --model <model> --test
```

### Azure OpenAI

```bash
export AZURE_OPENAI_API_KEY='...'
truyn setup \
  --provider azure-openai \
  --endpoint https://<your-endpoint> \
  --model <deployment-or-model> \
  --test
```

Azure OpenAI may also use the existing runtime managed-identity path when it is available.

### Vertex Gemini

The current Vertex Gemini adapter obtains its token from the Google metadata-service runtime path. Therefore `vertex-gemini` setup is suitable in that configured Google runtime environment; this implementation does **not** yet claim a universal desktop Google ADC/login flow.

## What is not yet a setup profile

A generic custom MCP **provider profile** is not yet implemented in `truyn setup`. MCP is already a TRUYN interoperability/requester surface, but custom MCP provider onboarding remains a separate future slice.

## Credential rule

Raw upstream credentials remain outside TRUYN protocol messages and outside the persisted BYOK profile.

The persisted profile contains non-secret configuration such as:

```text
provider type
model
base URL / endpoint where applicable
auth mode
credential environment-variable name where applicable
capabilities
requester node ID
provider node ID
verified timestamp
accessMode = owner-only
billingMode = byok
```

It does **not** contain the resolved API-key/bearer-token value.

The current implementation relies on the user's environment or cloud runtime identity for secret material. OS credential/key-store integration is not yet implemented, so this document does not claim it.

## Remote-workload gate

For a non-loopback relay, the official CLI requires a verified private BYOK profile before AI-workload entry points such as:

```text
truyn need
truyn mcp
truyn mcp-http
truyn bridge
truyn provider
```

The local loopback development relay remains usable without this remote BYOK gate.

This CLI gate is defense in depth, not the security boundary by itself. A modified client can bypass CLI behavior, so the relay and provider runtime independently enforce provider authorization and billing policy.

## Provider isolation

A configured BYOK provider uses a separate provider identity from the requester identity:

```text
requester node
      ↑ provider-signed allowedRequesterIds
private BYOK provider node
      ↓ signed OFFER
TRUYN relay
```

The relay binds provider ownership to the cryptographic sender of the signed OFFER. A different registered requester that is not in the provider-signed allowlist cannot discover or dispatch to that private provider.

The provider host then performs its own access check and BYOK billing check before `adapter.execute()`.

## Public network remains separately controlled

Implementing BYOK does not automatically open the production relay. Runtime public-network registration and dispatch remain closed unless separately enabled through the relay's explicit public-network configuration.

Likewise, owner-funded provider runtimes remain private by default. Public provider execution requires separate explicit opt-ins, and default owner-funded billing still refuses public execution.

## Security invariant

Even with the official BYOK flow, the invariant remains:

```text
foreign requester
+ public relay
+ knowledge of a private provider
+ custom/malicious client
= zero unauthorized provider execution
```

See:

- `../architecture/BYOK_ARCHITECTURE.md`
- `../architecture/PROVIDER_OWNERSHIP.md`
- `../architecture/AUTHORIZATION_MODEL.md`
- `../architecture/BILLING_BOUNDARY.md`
- `../../SECURITY.md`
