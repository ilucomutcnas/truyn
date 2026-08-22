# TRUYN MVP — AI Interoperability

**Implementation status:** working MVP interoperability code with implemented provider-ownership/authorization/BYOK baseline; MCP has bounded executable reference paths; A2A and the general bidirectional A2A↔TRUYN↔MCP bridge remain planned implementation work. Rich production account/organization tenancy, commercial entitlement administration, stable SDKs and stable mainnet remain broader work.

This document describes executable interoperability paths in the repository and the exact boundary around what is not yet implemented. It does not claim that provider adapters, cloud PoC paths or external-protocol compatibility are already stable v1 interfaces.

## What this MVP proves

The implemented conceptual path is:

```text
agent / MCP client / HTTP client
            ↓
        TRUYN Node
            ↓
 signed OFFER / NEED / RESULT
            ↓
 relay or direct network path
            ↓
        TRUYN Node
            ↓
      provider adapter
            ↓
      AI/provider/tool
```

A requester does not need the provider's native API contract. TRUYN can match an authorized capability and route signed request/result envelopes while preserving provider authorization/billing policy.

Capability interoperability and provider authorization remain separate questions. A technically compatible provider can still be hidden/denied to a requester. Interoperability adapters do not weaken that boundary.

## Current provider-security baseline

The reference implementation now includes a fail-closed provider boundary:

```text
authenticate requester
      ↓
authorization-aware discovery
      ↓
provider ownership / visibility policy
      ↓
billing responsibility / entitlement gate
      ↓
dispatch
      ↓
provider-host access/billing recheck
      ↓
upstream provider execution
```

Implemented reference behavior includes:

- low-level/provider-runtime default `owner-only` posture;
- private-provider discovery filtering;
- signed/requester-bound provider access policy;
- BYOK provider setup/runtime support for supported profiles;
- provider-host authorization before adapter execution;
- fail-closed billing modes;
- security tests proving foreign requesters do not trigger private provider execution.

This is not the same as a finished production commercial identity/tenant/account control plane. See `../architecture/IMPLEMENTATION_STATUS.md` for the exact maturity boundary.

## BYOK rule

Normal user operation is BYOK — Bring Your Own Intelligence / Bring Your Own Provider.

Provider credentials used by an adapter belong to the user/provider runtime and remain local or in an appropriate secure runtime secret store. They are not TRUYN protocol payloads and must not be distributed through relay discovery, Agent Descriptors, A2A Agent Cards, MCP metadata, `OFFER`, `NEED` or `RESULT` messages.

The same rule applies to remote A2A/MCP credentials: bearer tokens, API keys and privileged remote-protocol credentials remain inside the adapter/runtime secret boundary.

The current CLI provides a first setup/verification flow for supported provider profiles. See `BYOK.md`.

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

## First-party SDK path — planned implementation program

The repository now defines a first-party SDK/developer-experience track for:

- JavaScript / TypeScript;
- Python;
- Go;
- Java;
- C# / .NET.

The SDK directories are currently **scaffolding/documentation**, not published client packages.

The intended SDK onboarding flow is:

```text
install SDK
    ↓
connect to local/remote TRUYN node
    ↓
fetch/verify TRUYN Agent Descriptor
    ↓
discover authorized capability
    ↓
send NEED
    ↓
receive RESULT + identity/provenance/trust metadata
```

Until the packages exist, use the current CLI, MCP, HTTP bridge and direct repository integration surfaces.

See:

- `SDK_QUICKSTART.md`;
- `../architecture/SDK_DEVELOPER_EXPERIENCE.md`;
- `../../sdk/README.md`;
- `../../spec/protocol/v1/agent-descriptor.md`.

## TRUYN Agent Descriptor — defined, runtime implementation open

The draft **TRUYN Agent Descriptor** is the low-friction self-description/onboarding contract for a TRUYN-facing participant.

For intentionally public HTTP-facing participants, the target well-known path is:

```text
https://<domain>/.well-known/truyn-agent.json
```

It can describe:

- TRUYN identity;
- supported TRUYN protocol versions;
- supported interaction interfaces;
- intentionally visible capability classes;
- interaction features such as streaming/artifacts/trust receipts;
- signature/issue/expiry metadata.

It does **not** replace dynamic `OFFER` state and never grants provider authorization.

A public descriptor must not reveal private capabilities/providers, credentials, private topology or privileged allowlists. Authenticated/scoped descriptor views may exist later, but must preserve the same provider-visibility rules as ordinary discovery.

The TRUYN Agent Descriptor is not the A2A Agent Card. They belong to different interfaces and may only be projected across adapters with explicit identity/visibility semantics.

Runtime serving/discovery/signature validation for the Descriptor is future DX implementation work; defining the spec does not claim it exists in the executable node today.

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

Knowing a private provider ID, using a custom client, calling MCP/HTTP/WebSocket/SDK paths or seeing public participant metadata does not create an entitlement.

## Security acceptance target for A2A/MCP

The cross-protocol bridge is not complete until tests prove:

- foreign requester → owner-private provider = denied before upstream call;
- known private provider ID = still denied;
- forged owner/tenant/billing fields = ignored/denied;
- Agent Card/public MCP discovery cannot enumerate unauthorized private providers;
- legacy HTTP/WebSocket/MCP/future A2A paths = same authorization decision;
- user → own valid BYOK provider = allowed;
- explicitly shared provider = allowed only within explicit policy/quota;
- unsupported/mismatched A2A/MCP versions fail explicitly;
- protocol translation errors do not become apparent success;
- credentials never travel through TRUYN discovery/descriptor/network payloads.

See `../architecture/THREAT_MODEL.md`, `../architecture/AUTHORIZATION_MODEL.md`, `../architecture/SDK_DEVELOPER_EXPERIENCE.md` and `../architecture/A2A_MCP_INTEROPERABILITY.md`.

## Current completion boundary

Implemented/reference-proven areas include signed identities, capability discovery/routing, real QUIC/Kademlia underlay slices, adapters, MCP/HTTP interoperability, provider execution, BYOK setup, provider authorization/billing safety baselines, semantic/trust layers and benchmark work.

A2A/MCP-specific implemented bounded areas:

- MCP TRUYN-server reference path;
- configured remote MCP HTTP tool provider reference path.

Still open for A2A/MCP interoperability:

- generalized/current MCP interoperability and conformance closure;
- A2A Agent Card/server task bridge;
- A2A client/provider adapter;
- bidirectional A2A↔TRUYN↔MCP proof;
- cross-protocol negative security evidence;
- stable external-adapter compatibility guarantees.

Still open for developer experience:

- executable TypeScript/JavaScript SDK;
- executable Python SDK;
- executable Go SDK;
- executable Java SDK;
- executable C#/.NET SDK;
- Agent Descriptor serving/discovery and signature/expiry validation;
- shared cross-language conformance fixtures;
- SDK package publication and release provenance;
- stable SDK/API/descriptor compatibility.

Still open more broadly for production/mainnet includes heterogeneous WAN/NAT/relay-failure evidence, 100/1,000 simultaneously running real nodes, larger adversarial scale, production account/tenant/accounting operations, installers/updater/rollback and stable protocol compatibility.

The roadmap tracks A2A/MCP work under the explicit **v0.5 A2A / MCP Interoperability Bridge Gate**.
