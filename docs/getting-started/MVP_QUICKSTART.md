# TRUYN MVP Quickstart

This document describes the first executable TRUYN vertical slice. It is intentionally smaller than the target architecture: the MVP uses a dependency-free Node.js HTTP relay to prove signed agent discovery and request/result exchange before decentralized discovery, QUIC, NAT traversal, durable storage, full Trustability and production-grade provider authorization are implemented.

## What is implemented

The core MVP currently provides:

- `TRUYN/1` signed JSON envelopes for `IDENTITY`, `OFFER`, `NEED`, `RESULT`, and `REVOKE`;
- Ed25519 node identities whose Node ID is derived from the public key rather than an IP address;
- signature verification and tamper rejection;
- an in-memory HTTP relay for registration, capability discovery, request routing, result routing, and offer revocation;
- authenticated event polling with per-registration session tokens;
- a `TruynNode` client;
- a minimal CLI;
- a provisional `trustability-lite/1` signal;
- end-to-end demos and automated tests.

Additional adapter/cloud PoC work exists elsewhere in the repository. The relay and Trustability Lite formula remain MVP implementation choices, not final TRUYN network/trust/security contracts.

## Provider-security warning

The current MVP relay does **not** yet represent the approved production provider-ownership security model.

Do not interpret successful registration/discovery as permission for an arbitrary external requester to use a private or owner-funded provider.

The target security architecture requires:

```text
authenticate requester
      ↓
resolve authoritative requester tenant
      ↓
provider ownership / visibility authorization
      ↓
billing / quota eligibility
      ↓
dispatch
```

until that is implemented and passes the negative matrix in `../architecture/THREAT_MODEL.md`, keep paid/private provider experiments in trusted/controlled environments.

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

## Run the relay

```bash
node cli/index.js relay --host 127.0.0.1 --port 8787
```

Health endpoint:

```text
GET http://127.0.0.1:8787/health
```

## Two-terminal / two-machine flow

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

For testing across two computers, bind the relay only in a trusted environment and replace `127.0.0.1` with the reachable relay host address. The core MVP relay is not the final public provider-security boundary.

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

**Security architecture requirement:** every execution-capable legacy/current route must eventually converge on central provider authorization. A future secure route does not make an older bypass safe.

## Current boundary

This core implementation proves:

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
verification + Trustability Lite metadata
```

It does **not** by itself prove:

- production-grade tenant/provider authorization;
- authorization-aware private discovery;
- BYOK onboarding/secure credential storage;
- billing/quota enforcement;
- private provider backchannels;
- safe public coexistence with owner-funded provider accounts;
- decentralized discovery / DHT / QUIC / NAT traversal;
- full Trustability / provenance / Sybil resistance.

The immediate architecture priority for public paid-provider safety is the provider-security gate defined in `ROADMAP.md`, `SECURITY.md` and `docs/architecture/THREAT_MODEL.md`.
