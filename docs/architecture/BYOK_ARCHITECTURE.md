# TRUYN BYOK Architecture

**Status:** approved target architecture; onboarding and credential-storage implementation are not started by this documentation-only change.

## Definition

TRUYN uses **BYOK — Bring Your Own Intelligence / Bring Your Own Provider** as the default user model.

The network connects intelligence. It does not provide a shared pool of operator-owned AI credentials to arbitrary public users.

## User model

A normal user configures at least one provider they control, for example:

```text
OpenAI
Anthropic / Claude
Google / Gemini
Azure OpenAI
OpenAI-compatible endpoint
local model
custom HTTP/MCP agent
```

The official client should guide the user through provider setup, connection testing and capability publication without requiring GitHub Secrets, cloud deployment knowledge or manual configuration files for common cases.

## Credential locality

Provider credentials stay with the provider runtime that needs them.

```text
user device / private runtime
  ├── TRUYN node
  ├── provider adapter
  └── provider credential
          ↓
      upstream provider
```

The relay receives signed TRUYN protocol data and policy/usage metadata. It MUST NOT require raw provider API keys to perform ordinary BYOK routing.

## Storage target

Preferred credential storage is the operating-system credential/key store or equivalent secure provider/runtime secret facility. A fallback local store, if one is implemented, must have explicit security properties and must not silently store secrets in world-readable plaintext.

## Official-client gate

The official client may require a successfully configured own provider before enabling requester workflows that depend on AI execution. This is a product/UX guardrail.

It is **not** the primary security boundary. A malicious custom client can bypass local UX, so relay/provider authorization still enforces ownership independently.

## Provider privacy default

A newly configured BYOK provider is private/self-scoped by default. The user must explicitly opt in before advertising the provider for use by other network participants.

## Sharing later

A provider owner may later choose to publish a capability under explicit terms, price, quota or access policy. That is a provider-owner decision and does not change the BYOK default.

## Custom-provider UX target

Two generic paths cover most non-native integrations:

### OpenAI-compatible

```text
base URL
API key (optional where local/no-auth)
model
capabilities
```

### Custom agent

```text
HTTP endpoint or MCP connection
authentication method
capabilities
policy
```

The final UX should validate connectivity and make credential scope clear before enabling the provider.

## Public statement

The public project promise is:

> **TRUYN does not give public users access to another party's paid AI credentials or provider quota. Bring your own provider unless an explicit shared/sponsored entitlement says otherwise.**
