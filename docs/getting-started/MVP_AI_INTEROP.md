# TRUYN MVP — AI Interoperability

**Implementation status:** working local MVP.

This document describes executable code in the repository. It does not claim that the provisional relay, Trustability Lite formula, provider adapters, or MCP compatibility layer are the final TRUYN architecture.

## What this MVP proves

The implemented path is:

```text
agent / MCP client / HTTP client
            ↓
        TRUYN Node
            ↓
 signed OFFER / NEED / RESULT
            ↓
        MVP relay
            ↓
        TRUYN Node
            ↓
      provider adapter
            ↓
        AI provider
```

A requester does not need the provider's API contract. It asks TRUYN for a capability. TRUYN matches an `OFFER`, routes a signed `NEED`, and returns a signed `RESULT` with Trustability Lite metadata.

## Verify without paid AI APIs

Requirements: Node.js 20 or newer.

```bash
npm test
npm run demo:ai
npm run benchmark
```

`npm test` covers the original protocol/identity/relay path plus AdapterHost, HTTP adapter, MCP modern/legacy behavior, and MCP HTTP routing headers.

`npm run demo:ai` runs three independent TRUYN identities: an MCP-facing orchestrator, a research provider, and a review provider. The providers are deterministic local function adapters so the demo is reproducible without external credentials.

`npm run benchmark` measures serialized payload bytes exactly. Its `approximateTokens` field is explicitly a `chars/4` estimate and is **not** a provider billing-token measurement.

## MCP adapter

TRUYN exposes these tools:

- `truyn_identity`
- `truyn_find`
- `truyn_offer`
- `truyn_need`
- `truyn_poll`
- `truyn_result`

Start the stdio server:

```bash
truyn init
truyn mcp --relay http://127.0.0.1:8787
```

Start the HTTP MCP endpoint:

```bash
truyn mcp-http --relay http://127.0.0.1:8787 --port 8791
```

The endpoint is `/mcp`. The MVP supports MCP `2026-07-28` `server/discover`, `tools/list`, and `tools/call`, and also accepts legacy initialize-based clients for `2025-11-25` and `2025-06-18`.

The HTTP implementation binds to localhost by default and validates `Origin` when supplied. Do not expose the MVP HTTP endpoint publicly without a production authentication/authorization layer.

## Universal HTTP adapter

For software that does not speak MCP:

```bash
truyn bridge --relay http://127.0.0.1:8787 --port 8790
```

Endpoints:

```text
GET  /health
GET  /v1/identity
GET  /v1/offers?capability=...
POST /v1/offer
POST /v1/need
GET  /v1/events
POST /v1/result
```

## Live OpenAI + Anthropic proof

The repository includes two executable provider adapters:

- OpenAI Responses API
- Anthropic Messages API

No provider model is hard-coded because model availability changes. Supply explicit model IDs.

```bash
export OPENAI_API_KEY='...'
export OPENAI_MODEL='...'
export ANTHROPIC_API_KEY='...'
export ANTHROPIC_MODEL='...'

npm run demo:live -- "Analyze the TRUYN MVP and return the key risk."
```

The live demo performs:

```text
requester
  ↓ NEED research
OpenAI provider node
  ↓ signed RESULT + usage metadata
requester
  ↓ NEED review
Anthropic provider node
  ↓ signed RESULT + usage metadata
requester
```

Each provider result records provider name, model, provider request ID when available, provider latency, and provider-reported usage metadata when returned by the API.

**Repository tests do not execute these paid external calls.** A live run requires valid user-supplied credentials and network access.

## Run providers as independent nodes

Each independent node needs its own TRUYN identity. On one machine, use different `TRUYN_HOME` directories.

OpenAI provider:

```bash
TRUYN_HOME=$HOME/.truyn-openai truyn init
TRUYN_HOME=$HOME/.truyn-openai \
OPENAI_API_KEY='...' OPENAI_MODEL='...' \
truyn provider --provider openai --capability research \
  --relay http://127.0.0.1:8787
```

Anthropic provider:

```bash
TRUYN_HOME=$HOME/.truyn-anthropic truyn init
TRUYN_HOME=$HOME/.truyn-anthropic \
ANTHROPIC_API_KEY='...' ANTHROPIC_MODEL='...' \
truyn provider --provider anthropic --capability review \
  --relay http://127.0.0.1:8787
```

A separate requester can then use the CLI, HTTP bridge, or MCP tools to discover and call those capabilities.

## Two-machine proof

For a LAN/internet experiment, run the relay on a reachable host:

```bash
truyn relay --host 0.0.0.0 --port 8787
```

Point each independent node at:

```text
http://RELAY_HOST:8787
```

This demonstrates cross-machine capability discovery and signed request/result routing. The current relay is an in-memory MVP transport with no production authentication, persistence, NAT traversal, DHT, QUIC, rate limiting, or multi-relay consensus. Use it only in a trusted test environment.

## MVP completion boundary

Implemented now:

- signed TRUYN/1 MVP envelopes;
- independent Ed25519 node identities;
- capability `OFFER` / discovery;
- `NEED` routing;
- signed `RESULT` routing;
- provisional Trustability Lite;
- CLI;
- universal Adapter SDK;
- HTTP adapter;
- MCP stdio + HTTP adapter;
- OpenAI provider adapter;
- Anthropic provider adapter;
- reproducible local AI-interoperability demo;
- live two-provider demo path;
- structural payload benchmark.

Not claimed as complete:

- decentralized discovery / DHT;
- QUIC/NAT traversal;
- durable distributed relay state;
- production authentication/authorization;
- full Trustability / provenance graph / Sybil defense;
- measured cross-provider token-cost reduction until a live benchmark is run with real provider usage counters;
- public mainnet/testnet operations.
