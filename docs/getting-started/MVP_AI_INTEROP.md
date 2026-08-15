# TRUYN MVP — AI Interoperability

**Implementation status:** working local interoperability code plus a fail-closed production-style relay baseline. Full multi-tenant BYOK ownership/billing authorization remains a later gate.

## What the local MVP proves

```text
agent / MCP client / HTTP client
            ↓
        TRUYN Node
            ↓
 signed OFFER / NEED / RESULT
            ↓
 loopback development relay
            ↓
        TRUYN Node
            ↓
      provider adapter
            ↓
        AI provider
```

A requester does not need the provider's native API contract. TRUYN can route by capability while preserving signed identity/result semantics.

## BYOK rule

Normal user operation is BYOK — Bring Your Own Intelligence / Bring Your Own Provider.

Provider credentials belong only to the user/provider runtime or an appropriate private secret store. They are not TRUYN protocol payloads and must not be placed in relay state, `OFFER`, `NEED`, `RESULT`, examples, benchmark artifacts, or public documentation.

The included `live-ai-demo.js` uses only environment variables supplied by the person running the local example. It starts a loopback-only relay and does not use TRUYN-operated cloud accounts.

## Verify without paid AI APIs

```bash
npm ci
npm test
npm run demo:ai
```

Deterministic local adapters are the default reproducible test path.

## MCP and HTTP adapters

MCP and HTTP are compatibility surfaces, not alternate authorization domains. A production request that arrives through MCP, HTTP, WebSocket, SDK or a legacy compatibility route must still reach the same server-side provider authorization decision before execution.

Local bridge/MCP endpoints bind locally by default. Do not publish a local bridge merely because its underlying TRUYN messages are signed.

## Current production-style relay baseline

The reference relay is fail closed by default:

```text
explicit node enrollment
      ↓
authenticated expiring session
      ↓
trusted-requester execution gate
      ↓
authorization-aware discovery
      ↓
provider selection / dispatch
```

An untrusted enrolled node cannot discover foreign provider offers or create provider work. Legacy `OFFER`, `NEED`, `RESULT`, and `REVOKE` routes require a bearer session bound to the signed node identity. Registration freshness/replay controls and request-size limits are also enforced.

This is a protective baseline, not the final marketplace model. The final design must additionally resolve authoritative owner/tenant/visibility/billing/quota policy and prove the full negative matrix in `../architecture/THREAT_MODEL.md`.

## Public repository boundary

Operational cloud deployment/provisioning workflows, raw production benchmark evidence, private provider bootstrap tooling, cloud identity topology and internal resource names are not part of this public interoperability documentation. Public examples are either deterministic/local or user-BYOK.

A public TRUYN relay never implies access to a TRUYN-operated or third-party paid AI account.

See:

- `BYOK.md`
- `../../SECURITY.md`
- `../architecture/AUTHORIZATION_MODEL.md`
- `../architecture/PROVIDER_OWNERSHIP.md`
- `../architecture/THREAT_MODEL.md`
