# TRUYN MVP — AI Interoperability

**Implementation status:** working MVP/interoperability code with an implemented reference provider-ownership/authorization/BYOK baseline. Rich production account/organization tenancy, commercial entitlement administration, stable SDKs and stable mainnet remain broader work.

This document describes executable interoperability paths in the repository and their current boundary. It does not claim that the MVP relay, provider adapters, cloud PoC paths, MCP compatibility layer or current security/control plane are the final stable TRUYN architecture.

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
        AI provider
```

A requester does not need the provider's native API contract. TRUYN can match a capability and route signed request/result envelopes while preserving provider authorization/billing policy.

Capability interoperability and provider authorization remain separate questions. A technically compatible provider can still be hidden/denied to a requester.

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

Provider credentials used by an adapter belong to the user/provider runtime and remain local or in an appropriate secure runtime secret store. They are not TRUYN protocol payloads and must not be distributed through relay discovery, Agent Descriptors, `OFFER`, `NEED` or `RESULT` messages.

The current CLI provides a first setup/verification flow for supported provider profiles. See `BYOK.md`.

## Verify without paid AI APIs

Requirements: Node.js 20 or newer.

```bash
npm test
npm run demo:ai
```

Where benchmark scripts are present, their methodology/result documents define whether token counts are provider-reported measurements, estimates or serialized-byte proxies. Do not interpret estimated tokens as provider billing counters.

Deterministic/local adapters should remain the default path for reproducible no-credential tests.

## MCP adapter

TRUYN exposes tools for identity, discovery, offers, needs, polling and results through its MCP compatibility surface.

Typical local start:

```bash
truyn init
truyn mcp --relay http://127.0.0.1:8787
```

HTTP MCP/local bridge surfaces should bind locally by default unless a production authentication/authorization layer is deliberately configured.

**MCP authorization rule:** MCP is a connection surface, not a provider-policy bypass. Provider execution reached through MCP must pass the same central provider authorization as HTTP/WebSocket/SDK paths.

## Universal HTTP adapter

The local HTTP bridge exposes identity/discovery/request/result operations for software that does not speak MCP.

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

Runtime serving/discovery/signature validation for the Descriptor is future DX implementation work; defining the spec does not claim it exists in the executable node today.

## Live provider adapters

The repository contains executable provider-adapter work for multiple provider/cloud paths. Live calls require credentials/identity and provider access controlled by the person or runtime making the call.

A live adapter demonstration proves technical interoperability with that provider API. It does **not** publish the upstream account as a public TRUYN capability.

When running a provider locally, use a separate TRUYN identity/home for independently attributable provider nodes and only credentials you control.

## Public relay rule

A public relay and private providers can coexist.

```text
public network reachability ≠ provider authorization
```

A public TRUYN endpoint never means "use the operator's AI account".

Knowing a private provider ID, using a custom client, calling MCP/HTTP/WebSocket/SDK paths or seeing public participant metadata does not create an entitlement.

## Security acceptance invariants for every interoperability surface

All current and future SDK/MCP/HTTP/native paths must preserve:

- foreign requester → owner-private provider = denied before upstream call;
- known private provider ID = still denied;
- forged owner/tenant field = ignored/denied;
- private providers/capabilities hidden from unauthorized discovery/descriptor views;
- execution paths = equivalent provider authorization decision;
- user → own valid BYOK provider = allowed;
- explicitly shared provider = allowed only within explicit policy/quota;
- credentials never travel through TRUYN discovery/descriptor/network payloads.

See `../architecture/THREAT_MODEL.md`, `../architecture/AUTHORIZATION_MODEL.md` and `../architecture/SDK_DEVELOPER_EXPERIENCE.md`.

## Current completion boundary

Implemented/reference-proven areas include signed identities, capability discovery/routing, real QUIC/Kademlia underlay slices, adapters, MCP/HTTP interoperability, provider execution, BYOK setup, provider authorization/billing safety baselines, semantic/trust layers and benchmark work.

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
