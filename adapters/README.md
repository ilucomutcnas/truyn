# Adapters

Adapters connect existing agents, models, runtimes, IDEs and protocols to a TRUYN Node. **Adapters are edges; they are not the TRUYN network itself.**

## Implemented in the MVP

The repository contains executable interoperability surfaces including:

- `adapters/sdk/` — shared provider-adapter contract and `TruynAdapterHost` execution loop;
- `adapters/http/` — universal local HTTP bridge for identity, offers, needs, events and results;
- `adapters/mcp/` — MCP stdio plus loopback HTTP support exposing TRUYN tools;
- `adapters/providers/mcp-http-tool.js` — configured remote MCP HTTP tool as a TRUYN provider path;
- `adapters/providers/azure-openai.js` — Azure OpenAI text/reasoning;
- `adapters/providers/azure-foundry.js` — shared Microsoft Foundry text transport used by Grok, DeepSeek, Llama, Mistral and Kimi model families;
- `adapters/providers/vertex-gemini.js` — Vertex AI Gemini text/reasoning;
- `adapters/providers/vertex-image.js` — Google/Vertex image generation;
- `adapters/providers/vertex-veo.js` — Google/Vertex asynchronous Veo video generation;
- `adapters/providers/azure-openai-image.js` — Azure OpenAI `gpt-image` image generation;
- `adapters/providers/azure-openai-video.js` — Azure OpenAI asynchronous Sora video generation;
- `adapters/providers/azure-flux.js` — Azure-direct Black Forest Labs FLUX image generation.

Adapter implementation is deliberately distinguished from cloud deployment entitlement: an adapter can be complete even when a particular account, subscription, project or region does not permit model deployment. Live deployment identifiers, private cloud topology and raw operational smoke evidence are not part of this public adapter catalog.

Provider adapter presence is not a claim that a public user is entitled to a TRUYN-operated upstream account.

## A2A and MCP interoperability

A2A and MCP are first-class target interoperability edges, but their current maturity is different.

### MCP — bounded reference implementation exists

TRUYN currently has two bounded MCP directions:

```text
MCP client
   ↓
TRUYN MCP server
   ↓
TRUYN Node / network
```

and:

```text
TRUYN provider host
   ↓
configured MCP HTTP tool
   ↓
remote MCP server
```

The TRUYN MCP server exposes:

```text
truyn_identity
truyn_find
truyn_offer
truyn_need
truyn_poll
truyn_result
```

This is real executable reference code with bounded tests. It is **not** a claim that every current MCP feature is implemented or that the project has completed external conformance/certification.

General MCP discovery/import of arbitrary remote tool/resource catalogs remains an implementation gate.

### A2A — architecture defined, bridge not implemented yet

The target A2A edge will provide both:

1. **TRUYN-as-A2A server facade** — authorized TRUYN capabilities projected as Agent Card skills; A2A Message/Task execution normalized into TRUYN `NEED`/`RESULT`;
2. **A2A-as-TRUYN provider** — selected remote A2A Agent Card skills imported as provider capabilities and executed through normal TRUYN authorization.

The end-to-end requirement is a real bidirectional bridge:

```text
A2A → TRUYN → MCP
MCP → TRUYN → A2A
```

with identity, authorization, provenance, artifacts, errors and long-running task semantics preserved.

Architecture: `../docs/architecture/A2A_MCP_INTEROPERABILITY.md`.  
Compatibility matrix: `../docs/compatibility/A2A_MCP_COMPATIBILITY.md`.

## BYOK credential boundary

TRUYN is BYOK by default: Bring Your Own Intelligence / Bring Your Own Provider.

A provider credential belongs to the provider runtime that uses it. Raw credentials MUST NOT be copied into normal TRUYN envelopes or relay discovery/routing metadata.

Preferred target:

```text
user/private runtime
  ├── TRUYN node
  ├── adapter
  └── provider credential in secure storage
          ↓
      upstream provider
```

The same rule applies to A2A/MCP remote credentials: bearer tokens, API keys or other remote-protocol secrets remain inside the adapter/runtime secret boundary.

Current MVP/live-demo commands may accept provider credentials through local environment variables. That is an interoperability proof, not the final credential-storage/onboarding contract.

Automated tests should not require paid external provider calls unless a benchmark/proof explicitly opts into them under an authorized private environment.

## Provider visibility

A provider connected through an adapter is private/self-scoped by default in the target architecture. Publishing it for use by other network participants requires explicit owner policy.

The generic provider runtime now defaults to `owner-only` access; without an explicit requester allowlist it denies execution before the upstream adapter is called. An intentionally public provider requires explicit opt-in configuration.

Adapters MUST NOT infer network/public visibility merely because they successfully register an `OFFER` with a public relay.

Likewise, an A2A Agent Card, MCP tool list or resource list MUST NOT become a way to enumerate private TRUYN providers without authorization.

## Authorization responsibility

Adapters execute only work that has already passed the authoritative provider-authorization path. Adapter code must not implement a transport-specific bypass around owner/tenant/visibility/billing policy.

Provider credentials are not authorization tokens for the TRUYN requester. A requester is authorized by TRUYN provider policy; the adapter uses the provider credential only to call the upstream service after authorization succeeds.

External-protocol authentication is also distinct from Trustability and settlement.

## Target interoperability

### Protocols and agent interaction

- A2A
- MCP
- HTTP, gRPC and WebSocket gateways
- native TRUYN SDK/client surfaces

### AI/model/agent ecosystems

- OpenAI / ChatGPT / Codex
- Anthropic / Claude / Claude Code
- Google Gemini
- xAI Grok
- Perplexity
- Microsoft Copilot
- GitHub Copilot
- Amazon Q
- Cursor
- Windsurf
- Meta Llama
- Mistral
- DeepSeek
- Qwen
- Cohere
- NVIDIA
- Ollama
- vLLM
- llama.cpp
- LangGraph/LangChain
- AutoGen
- CrewAI
- Semantic Kernel
- custom/private agents

The names above describe intended interoperability, not endorsement, partnership or a claim that every target ecosystem adapter is implemented/deployed.

The architecture uses shared adapter contracts so vendor and protocol adapters remain thin and replaceable.

See:

- `../docs/architecture/A2A_MCP_INTEROPERABILITY.md`
- `../docs/compatibility/A2A_MCP_COMPATIBILITY.md`
- `../docs/getting-started/BYOK.md`
- `../docs/architecture/BYOK_ARCHITECTURE.md`
- `../docs/architecture/PROVIDER_OWNERSHIP.md`
- `../docs/architecture/AUTHORIZATION_MODEL.md`
- `../docs/architecture/PUBLIC_PRIVATE_BOUNDARY.md`
