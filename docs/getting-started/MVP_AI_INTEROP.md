# TRUYN MVP — AI Interoperability

**Implementation status:** working MVP interoperability code with implemented provider-ownership/authorization baseline; MCP has bounded executable reference paths; A2A and the general bidirectional A2A↔TRUYN↔MCP bridge remain planned implementation work.

This document describes executable code in the repository and the exact boundary around what is not yet implemented. It does not claim that provider adapters, cloud PoC paths or external-protocol compatibility are already stable v1 interfaces.

## What this MVP proves

The implemented conceptual path is:

```text
agent / MCP client / HTTP client
            ↓
        TRUYN Node
            ↓
 signed OFFER / NEED / RESULT
            ↓
    relay or network path
            ↓
        TRUYN Node
            ↓
      provider adapter
            ↓
        AI/provider/tool
```

A requester does not need the provider's native API contract. TRUYN can match an authorized capability and route signed request/result envelopes.

Provider ownership and billing authorization are separate from capability interoperability. The current reference implementation already enforces owner-only/default-private provider behavior and authorization-aware discovery/dispatch; an interoperability adapter does not weaken that boundary.

## BYOK rule

Normal user operation is BYOK — Bring Your Own Intelligence / Bring Your Own Provider.

Provider credentials used by an adapter belong to the user/provider runtime and should remain local or in an appropriate secure runtime secret store. They are not TRUYN protocol payloads and must not be distributed through relay discovery, `OFFER`, `NEED` or `RESULT` messages.

The same rule applies to remote A2A/MCP credentials: they remain inside the adapter/runtime secret boundary.

See `BYOK.md`.

## Verify without paid AI APIs

Requirements: Node.js 20 or newer.

```bash
npm test
npm run demo:ai
```

Where benchmark scripts are present, their methodology/result documents define whether token counts are provider-reported measurements, estimates or serialized-byte proxies. Do not interpret estimated tokens as provider billing counters.

Deterministic/local adapters should remain the default path for reproducible no-credential tests.

## MCP adapter — implemented bounded reference

TRUYN exposes tools for identity, discovery, offers, needs, polling and results through its MCP compatibility surface.

Typical local start:

```bash
truyn init
truyn mcp --relay http://127.0.0.1:8787
```

Current server tools:

```text
truyn_identity
truyn_find
truyn_offer
truyn_need
truyn_poll
truyn_result
```

The repository also contains a configured remote MCP HTTP tool provider path. This means MCP is not merely a roadmap aspiration.

However, the current state is still **bounded reference interoperability**, not complete ecosystem certification:

- general remote MCP tool/resource discovery/import remains open;
- current MCP conformance/version/security closure remains an explicit roadmap gate;
- arbitrary MCP resources are not assumed to be TRUYN `OBJECT`s without explicit mutability/integrity policy.

HTTP MCP/local bridge surfaces bind locally by default unless a production authentication/authorization layer is deliberately configured.

**MCP authorization rule:** MCP is a connection surface, not a provider-policy bypass. Provider execution reached through MCP passes the same central provider authorization as HTTP/WebSocket/SDK paths.

## A2A adapter — defined, not implemented yet

A2A is now an explicit v0.5 implementation gate rather than a vague future adapter.

The target has two directions:

```text
TRUYN → A2A facade
  authorized TRUYN capabilities
  → Agent Card skills
  A2A Message / Task
  → TRUYN NEED
  TRUYN RESULT
  → A2A Artifact / terminal task state
```

and:

```text
remote A2A agent
  Agent Card + selected skills
  → A2A client/provider adapter
  → TRUYN OFFER(s)
  authorized TRUYN NEED
  → A2A Task
  A2A Artifact
  → TRUYN RESULT
```

The adapter must preserve private-provider discovery rules: a public Agent Card must never become an unauthenticated dump of owner-only/BYOK providers.

See `../architecture/A2A_MCP_INTEROPERABILITY.md`.

## Required A2A ↔ TRUYN ↔ MCP proof

Separate adapters are not enough. The implementation gate requires real cross-protocol round trips:

```text
A2A client → TRUYN → MCP tool → TRUYN → A2A Artifact
```

and:

```text
MCP client → TRUYN → A2A agent → TRUYN → MCP result
```

The proof must preserve identity/correlation, authorization, structured/text output, referenced artifacts, errors and at least one asynchronous A2A task lifecycle.

The compatibility matrix is `../compatibility/A2A_MCP_COMPATIBILITY.md`.

## Universal HTTP adapter

The local HTTP bridge exposes identity/discovery/request/result operations for software that does not speak MCP or A2A.

It is a compatibility bridge, not a separate security domain. Execution-capable routes converge on the same provider ownership/authorization decision as every other transport.

## Live provider adapters

The repository contains executable provider-adapter work for multiple provider/cloud paths. Live calls require credentials/identity and provider access controlled by the person or runtime making the call.

A live adapter demonstration proves technical interoperability with that provider API. It does **not** publish the upstream account as a public TRUYN capability.

When running a provider locally, use a separate TRUYN identity/home for independently attributable provider nodes and only credentials you control.

## Public relay and external-protocol warning

A public relay can coexist with private providers because provider discovery/dispatch and provider-host execution are authorization-gated.

The canonical provider path remains:

```text
authenticate requester
      ↓
resolve authoritative requester identity/tenant where available
      ↓
authorize provider owner/visibility
      ↓
resolve billing / entitlement / quota
      ↓
dispatch
      ↓
provider-host recheck
      ↓
execute
```

A2A/MCP transport authentication occurs **before/around** adapter translation and does not replace this path.

A public TRUYN, A2A or MCP endpoint never means "use the operator's AI account".

## Security acceptance target for A2A/MCP

The cross-protocol bridge is not complete until tests prove:

- foreign requester → owner-private provider = denied before upstream call;
- known private provider ID = still denied;
- forged owner/tenant/billing fields = ignored/denied;
- Agent Card/public MCP discovery cannot enumerate unauthorized private providers;
- legacy HTTP/WebSocket/MCP/future A2A paths = same authorization decision;
- user → own BYOK provider = allowed when valid;
- explicitly shared provider = allowed only within explicit policy/quota;
- unsupported/mismatched A2A/MCP versions fail explicitly;
- protocol translation errors do not become apparent success.

See `../architecture/THREAT_MODEL.md` and `../architecture/A2A_MCP_INTEROPERABILITY.md`.

## Current completion boundary

Implemented and evidenced in bounded form:

- signed identities and envelopes;
- capability discovery/routing;
- provider ownership/default-private authorization baseline;
- BYOK setup/reference providers;
- HTTP interoperability;
- MCP TRUYN-server reference path;
- configured remote MCP HTTP tool provider reference path;
- provider execution and benchmark work.

Not yet complete:

- generalized/current MCP interoperability and conformance closure;
- A2A Agent Card/server task bridge;
- A2A client/provider adapter;
- bidirectional A2A↔TRUYN↔MCP proof;
- cross-protocol negative security evidence;
- stable external-adapter compatibility guarantees;
- rich account/tenant commercial control plane;
- stable production mainnet.

The roadmap tracks this work under the explicit **v0.5 A2A / MCP Interoperability Bridge Gate**.
