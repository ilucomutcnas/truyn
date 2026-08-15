# Adapters

Adapters connect existing agents, models, runtimes, IDEs and protocols to a TRUYN Node. **Adapters are edges; they are not the TRUYN network itself.**

## Implemented in the MVP

The repository now contains executable interoperability surfaces:

- `adapters/sdk/` — shared provider-adapter contract and `TruynAdapterHost` execution loop;
- `adapters/http/` — universal local HTTP bridge for identity, offers, needs, events and results;
- `adapters/mcp/` — MCP stdio plus Streamable HTTP support, including modern `2026-07-28` discovery/tool calls and legacy initialize compatibility;
- `adapters/providers/openai.js` — OpenAI Responses API provider adapter;
- `adapters/providers/anthropic.js` — Anthropic Messages API provider adapter.

The provider adapters are executable code, but live calls require the user's own provider API credentials and model IDs. Automated tests do not call paid external APIs.

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

Directories not listed under **Implemented in the MVP** still describe intended ownership only. Their presence does **not** mean the adapter is implemented or endorsed by the named vendor.

The architecture uses a shared provider-adapter contract so vendor adapters remain thin and replaceable.
