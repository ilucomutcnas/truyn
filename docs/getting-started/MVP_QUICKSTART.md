# TRUYN MVP Quickstart

This document describes the **smallest local executable TRUYN vertical slice**, not the full current repository maturity. The minimal path uses a dependency-free Node.js HTTP relay to make identity → capability → signed request/result behavior easy to inspect locally.

Since that original MVP slice, the repository has added real QUIC/Kademlia networking slices, authorization-aware provider discovery/dispatch, provider-host security, BYOK setup, semantic retrieval, Trustability work and multi-cloud provider adapters. See `../architecture/IMPLEMENTATION_STATUS.md` for the canonical current status.

## What the minimal local path provides

- `TRUYN/1` signed JSON envelopes for `IDENTITY`, `OFFER`, `NEED`, `RESULT`, and `REVOKE`;
- Ed25519 node identities whose Node ID is derived from the public key rather than an IP address;
- signature verification and tamper rejection;
- an in-memory HTTP relay for registration, capability discovery, request routing, result routing, and offer revocation;
- authenticated event polling with per-registration session tokens;
- a `TruynNode` client;
- a minimal CLI;
- a provisional `trustability-lite/1` signal for this simple demo path;
- end-to-end demos and automated tests.

The minimal relay and Trustability Lite formula remain MVP/demo implementation choices, not the final network/trust contracts.

## Provider-security rule

The broader reference implementation now has an implemented fail-closed provider-ownership/authorization/BYOK baseline. The simple local demo must not be read as permission to bypass it.

The security invariant is:

```text
authenticate requester
      ↓
authorization-aware discovery
      ↓
provider ownership / visibility authorization
      ↓
billing / entitlement eligibility
      ↓
dispatch
      ↓
provider-host recheck
      ↓
upstream execution
```

Public reachability, a capability match, a future Agent Descriptor entry or an SDK call never creates provider authorization.

See `../architecture/AUTHORIZATION_MODEL.md`, `../architecture/IMPLEMENTATION_STATUS.md` and `../../SECURITY.md`.

## Requirements

- Node.js 20 or newer
- no external npm dependencies for the core MVP path

## Fastest proof

From the repository root:

```bash
npm test
npm run demo
```

The demo starts an ephemeral relay, creates two independent Ed25519 node identities, publishes a `research` capability, discovers it from the second node, routes a signed `NEED`, returns a signed `RESULT`, verifies the result signature, and prints the current Trustability Lite score.

A successful run ends with output similar to:

```text
RESULT signature: VERIFIED
Trustability Lite: <score>
TRUYN MVP transaction complete.
```

## Run the local relay

```bash
node cli/index.js relay --host 127.0.0.1 --port 8787
```

Health endpoint:

```text
GET http://127.0.0.1:8787/health
```

The permissive local-development path belongs on loopback/trusted development environments. Production-style public relay/provider access uses the stricter runtime/security configuration described elsewhere in the repository.

## Two-terminal local flow

Use separate `TRUYN_HOME` directories when testing multiple identities on one computer.

Provider:

```bash
TRUYN_HOME=.truyn-provider node cli/index.js init
TRUYN_HOME=.truyn-provider node cli/index.js offer research --relay http://127.0.0.1:8787
TRUYN_HOME=.truyn-provider node cli/index.js poll --relay http://127.0.0.1:8787
```

Requester:

```bash
TRUYN_HOME=.truyn-requester node cli/index.js init
TRUYN_HOME=.truyn-requester node cli/index.js find research --relay http://127.0.0.1:8787
TRUYN_HOME=.truyn-requester node cli/index.js need research "Analyze TRUYN" --relay http://127.0.0.1:8787
```

The provider's next `poll` returns the signed `NEED`. Use its envelope `id` as the request ID:

```bash
TRUYN_HOME=.truyn-provider node cli/index.js result <request-id> "Structured answer" --relay http://127.0.0.1:8787
```

The requester then receives the signed result:

```bash
TRUYN_HOME=.truyn-requester node cli/index.js poll --relay http://127.0.0.1:8787
```

For real multi-host networking evidence and current network maturity, do not extrapolate from this local demo; use the current architecture/status/benchmark documents.

## MVP HTTP surface

```text
POST /v1/register
POST /v1/offers
GET  /v1/offers?capability=<name>
POST /v1/needs
POST /v1/results
POST /v1/revoke
GET  /v1/events?nodeId=<node-id>
GET  /health
```

All TRUYN exchange messages are signed envelopes. Event polling additionally requires the relay session token returned during registration.

Execution-capable compatibility paths must converge on the same provider authorization semantics as newer HTTP/WebSocket/MCP/SDK/native paths. An older route is not allowed to become a policy bypass.

## Developer SDK path

The next developer-experience layer is now explicitly defined for:

- JavaScript / TypeScript;
- Python;
- Go;
- Java;
- C# / .NET.

Those first-party SDKs are currently architecture/scaffolding, **not published packages**.

The target onboarding flow is:

```text
install SDK
   ↓
connect to TRUYN node
   ↓
fetch/verify TRUYN Agent Descriptor
   ↓
discover authorized capability
   ↓
send NEED
   ↓
receive RESULT
```

For intentionally public HTTP-facing participants, the draft Agent Descriptor target is:

```text
https://<domain>/.well-known/truyn-agent.json
```

The Descriptor is bootstrap/self-description metadata and does not replace dynamic `OFFER` or provider-policy authorization.

See `SDK_QUICKSTART.md`, `../architecture/SDK_DEVELOPER_EXPERIENCE.md` and `../../spec/protocol/v1/agent-descriptor.md`.

## What this minimal demo proves

```text
independent identity
      ↓
capability OFFER
      ↓
capability discovery
      ↓
signed NEED
      ↓
routing
      ↓
signed RESULT
      ↓
verification + demo Trustability metadata
```

It should not be used as proof of the broader system's production readiness, Internet-scale behavior or stable compatibility.

For the actual implemented/proven/open matrix, use `../architecture/IMPLEMENTATION_STATUS.md`. For the current primary engineering sequence, use `../../ROADMAP.md`.
