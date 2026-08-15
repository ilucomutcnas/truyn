# TRUYN MVP Quickstart

This document describes the first executable TRUYN vertical slice. It is intentionally smaller than the target architecture: the MVP uses a dependency-free Node.js HTTP relay to prove signed agent discovery and request/result exchange before decentralized discovery, QUIC, NAT traversal, durable storage, and full Trustability are implemented.

## What is implemented

The MVP currently provides:

- `TRUYN/1` signed JSON envelopes for `IDENTITY`, `OFFER`, `NEED`, `RESULT`, and `REVOKE`;
- Ed25519 node identities whose Node ID is derived from the public key rather than an IP address;
- signature verification and tamper rejection;
- an in-memory HTTP relay for registration, capability discovery, request routing, result routing, and offer revocation;
- authenticated event polling with per-registration session tokens;
- a `TruynNode` client;
- a minimal CLI;
- a provisional `trustability-lite/1` signal based on verified identity, task history, recency, and placeholder attestation input;
- an end-to-end two-node demo and automated tests.

The relay and Trustability Lite formula are MVP implementation choices, not final TRUYN network or trust contracts.

## Requirements

- Node.js 20 or newer
- no external npm dependencies

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
Trustability Lite: 0.7833
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

For testing across two computers, bind the relay to an interface reachable by both machines and replace `127.0.0.1` with the relay host address. Do not expose this MVP relay directly to the public Internet; production authentication, rate limiting, persistence, TLS, abuse controls, replay protection, and decentralized networking are not implemented yet.

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

## Current boundary

This implementation proves the shortest useful TRUYN path:

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

Next implementation work should add the adapter contract, MCP/HTTP agent bridges, persistence/replay protection, and reproducible token/latency/cost benchmarks before expanding into decentralized discovery and the broader TRUYN/1 object/state/compute surface.
