# Adapters

Adapters connect existing agents, models, runtimes, IDEs and protocols to a TRUYN Node. **Adapters are edges; they are not the TRUYN network itself.**

## Implemented in the MVP

The repository contains executable interoperability surfaces including:

- `adapters/sdk/` — shared provider-adapter contract and `TruynAdapterHost` execution loop;
- `adapters/http/` — universal local HTTP bridge for identity, offers, needs, events and results;
- `adapters/mcp/` — MCP stdio plus Streamable HTTP support;
- provider adapters such as OpenAI/Anthropic/Azure/Vertex paths present in the current codebase.

Provider adapter presence is not a claim that a public user is entitled to a TRUYN-operated upstream account.

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

Current MVP/live-demo commands may accept provider credentials through local environment variables. That is an interoperability proof, not the final credential-storage/onboarding contract.

Automated tests should not require paid external provider calls unless a benchmark/proof explicitly opts into them under an authorized private environment.

## Provider visibility

A provider connected through an adapter is private/self-scoped by default in the target architecture. Publishing it for use by other network participants requires explicit owner policy.

Adapters MUST NOT infer network/public visibility merely because they successfully register an `OFFER` with a public relay.

## Authorization responsibility

Adapters execute only work that has already passed the authoritative provider-authorization path. Adapter code must not implement a transport-specific bypass around owner/tenant/visibility/billing policy.

Provider credentials are not authorization tokens for the TRUYN requester. A requester is authorized by TRUYN provider policy; the adapter uses the provider credential only to call the upstream service after authorization succeeds.

## Target interoperability

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
- MCP, HTTP, gRPC and WebSocket bridges

The names above describe intended interoperability, not endorsement, partnership or a claim that every adapter is implemented/deployed.

The architecture uses a shared provider-adapter contract so vendor adapters remain thin and replaceable.

See:

- `../docs/getting-started/BYOK.md`
- `../docs/architecture/BYOK_ARCHITECTURE.md`
- `../docs/architecture/PROVIDER_OWNERSHIP.md`
- `../docs/architecture/AUTHORIZATION_MODEL.md`
