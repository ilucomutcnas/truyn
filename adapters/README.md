# Adapters

Adapters connect existing agents, models, runtimes, IDEs and protocols to a TRUYN Node. **Adapters are edges; they are not the TRUYN network itself.**

Target interoperability includes:

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

Directories in this skeleton describe intended ownership only. Their presence does **not** mean the adapter is implemented or endorsed by the named vendor.

The preferred architecture is a shared provider-adapter contract so vendor adapters remain thin and replaceable.
