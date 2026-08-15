# TRUYN MVP — AI Interoperability

**Implementation status:** working MVP/interoperability code; provider-ownership security hardening remains an approved target, not a completed production claim.

This document describes executable code in the repository. It does not claim that the provisional relay, Trustability Lite formula, provider adapters, cloud PoC paths or MCP compatibility layer are the final TRUYN architecture.

## What this MVP proves

The implemented conceptual path is:

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

A requester does not need the provider's native API contract. TRUYN can match a capability and route signed request/result envelopes.

**What this path does not prove by itself:** that every requester is authorized to use every discovered provider. Provider ownership and billing authorization are separate from capability interoperability.

## BYOK rule

Normal user operation is BYOK — Bring Your Own Intelligence / Bring Your Own Provider.

Provider credentials used by an adapter belong to the user/provider runtime and should remain local or in an appropriate secure runtime secret store. They are not TRUYN protocol payloads and must not be distributed through relay discovery, `OFFER`, `NEED` or `RESULT` messages.

Current live demos may use local environment variables for credentials. This is a development/interoperability mechanism, not the final onboarding/credential-storage UX.

See `BYOK.md`.

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

**MCP authorization rule:** MCP is a connection surface, not a provider-policy bypass. Provider execution reached through MCP must ultimately pass the same central provider authorization as HTTP/WebSocket/SDK paths.

## Universal HTTP adapter

The local HTTP bridge exposes identity/discovery/request/result operations for software that does not speak MCP.

It is a compatibility bridge, not a separate security domain. Execution-capable routes must converge on the same provider ownership/authorization decision as every other transport.

## Live provider adapters

The repository contains executable provider-adapter work for multiple provider/cloud paths. Live calls require credentials/identity and provider access controlled by the person or runtime making the call.

A live adapter demonstration proves technical interoperability with that provider API. It does **not** publish the upstream account as a public TRUYN capability.

When running a provider locally, use a separate TRUYN identity/home for independently attributable provider nodes and only credentials you control.

## Public relay warning

The approved architecture allows a public relay and private providers to coexist, but that safety requires the provider-security gate to be implemented:

```text
authenticate requester
      ↓
resolve requester tenant
      ↓
authorize provider owner/visibility
      ↓
resolve billing / quota
      ↓
dispatch
```

Until the central ownership/default-deny/security-test gate is implemented, do not treat the current MVP/PoC relay as a general public paid-provider service.

A public TRUYN endpoint never means "use the operator's AI account".

## Security acceptance target

The interoperability layer is ready for public paid-provider coexistence only when tests prove:

- foreign requester → owner-private provider = denied before upstream call;
- known private provider ID = still denied;
- forged owner/tenant field = ignored/denied;
- legacy HTTP/WebSocket/MCP paths = same authorization decision;
- user → own BYOK provider = allowed when valid;
- explicitly shared provider = allowed only within explicit policy/quota.

See `../architecture/THREAT_MODEL.md`.

## Current completion boundary

Implemented/experimented paths in the repository demonstrate signed identities, capability discovery/routing, adapters, MCP/HTTP interoperability, provider execution and benchmark work.

Not claimed as complete by this documentation update:

- production provider ownership/tenant ACL;
- authorization-aware private discovery;
- BYOK setup UX and final secure credential storage;
- billing/quota enforcement;
- private provider backchannel/control-plane separation;
- complete legacy-route convergence on central authorization;
- safe public coexistence with owner-funded providers;
- decentralized discovery / DHT / QUIC / NAT traversal;
- full Trustability / provenance graph / Sybil defense.
