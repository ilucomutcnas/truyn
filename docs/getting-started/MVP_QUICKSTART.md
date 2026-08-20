# TRUYN MVP Quickstart

**Current status:** the original relay-based MVP remains a useful local vertical-slice demo, but it is no longer the maturity boundary of the repository. As of 2026-08-20 TRUYN also contains a real QUIC/Kademlia decentralized underlay, provider ownership/default-deny security, BYOK flows, accepted Class B multi-host evidence and accepted Class C heterogeneous WAN/NAT/relay evidence.

This document therefore separates **the fastest local MVP proof** from the **current network implementation**.

## Fastest local proof

Requirements:

- Node.js 20 or newer for the original local MVP path; current acceptance infrastructure uses Node.js 22 where pinned by the gate.

From the repository root:

```bash
npm test
npm run demo
```

The local demo starts an ephemeral relay, creates independent Ed25519 identities, publishes a capability, discovers it, routes a signed `NEED`, returns a signed `RESULT`, verifies the result signature and prints the current demo trust metadata.

A successful run ends with output similar to:

```text
RESULT signature: VERIFIED
Trustability Lite: <score>
TRUYN MVP transaction complete.
```

The local relay demo is useful because it is small and reproducible. It must not be confused with the current decentralized-network maturity or with public mainnet readiness.

## What the original MVP slice provides

- signed `TRUYN/1` JSON-envelope path for `IDENTITY`, `OFFER`, `NEED`, `RESULT`, `REVOKE` and later reference primitives;
- Ed25519 node identities derived from public keys rather than IP addresses;
- signature verification and tamper rejection;
- local/in-memory relay registration, discovery and result routing;
- a `TruynNode` client;
- CLI and demos;
- provisional Trustability Lite behavior for the historical demo path.

## What exists beyond the original MVP now

The repository has since implemented materially broader network/security/provider functionality:

### Real decentralized underlay

- real QUIC/UDP transport;
- authenticated signed peer sessions;
- signed bootstrap/peer records;
- Kademlia routing/discovery and networked `PING`, `FIND_NODE`, `STORE`, `FIND_VALUE`;
- direct-first signed envelope routing with explicit relay fallback;
- STUN and same-QUIC-port hole-punch reference path;
- durable network-state/peer-record lifecycle slices;
- DHT replication/quorum/repair;
- bounded admission/backpressure.

### Provider security / BYOK

The previously planned provider-security gate is now an implemented reference baseline:

```text
authenticate signed requester/session
      ↓
resolve authoritative provider ownership / requester policy
      ↓
authorization-aware discovery and dispatch
      ↓
billing / entitlement eligibility
      ↓
provider-host second authorization
      ↓
adapter / upstream execution
```

Implemented invariants include:

- low-level provider access defaults to `owner-only`;
- signed provider identity, not requester-supplied `ownerId`, is authoritative;
- unauthorized private providers are filtered from discovery/dispatch;
- provider-host authorization occurs again before adapter execution;
- owner-funded public execution is denied without explicit policy;
- BYOK credentials remain at the local/provider runtime boundary;
- legacy/fast/WebSocket/MCP execution surfaces must preserve the same authorization decision;
- sponsored mode cannot activate without signed entitlement verification + durable atomic usage accounting.

This is still a reference security/control-plane baseline, not a claim that rich commercial account/org tenancy or every production edge deployment is finished.

### Real-network evidence

Permanent reports now include:

- v0.1 Connect lower-network gate;
- Class B four-host real multi-host acceptance;
- Class C heterogeneous Azure/GCP WAN/reachability acceptance.

Class C proves bounded direct cross-cloud QUIC, real packet-path partition/heal, real Azure NAT, double-NAT/CGNAT-like outbound behavior, authenticated relay outage/fallback/recovery and cleanup. It explicitly does not claim carrier-field CGNAT or Internet-scale production readiness.

At the 2026-08-20 snapshot, Class D-100 real-node acceptance is active and **not yet accepted**.

## Run the local relay demo

```bash
node cli/index.js relay --host 127.0.0.1 --port 8787
```

Health endpoint:

```text
GET http://127.0.0.1:8787/health
```

For normal development, keep the legacy/demo relay local unless you intentionally configure the public-network security gates. Local development cannot be combined with public/production relay markers.

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

Requester:

```bash
TRUYN_HOME=.truyn-requester node cli/index.js poll --relay http://127.0.0.1:8787
```

## Legacy/local HTTP surface

The original compatibility relay exposes surfaces such as:

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

These are compatibility surfaces, not separate authorization domains. Execution-capable routes must converge on the central provider policy. A known provider ID or reachable relay does not create entitlement.

## BYOK quick path

See [BYOK](BYOK.md) for the supported provider profiles and exact credential rules. Typical local setup:

```bash
truyn init
export OPENAI_API_KEY='...'
truyn setup --provider openai --model <your-model>
truyn setup --provider openai --model <your-model> --test
truyn setup-status
```

The persisted profile stores the credential environment-variable name rather than the secret value. Verified remote BYOK providers use a separate TRUYN identity and private owner-only requester policy.

## Current network maturity boundary

The current code/evidence proves substantially more than the original relay demo, but it still does **not** prove:

- accepted 100 real simultaneously running nodes (active gate at this snapshot);
- accepted 1,000 real simultaneously running nodes;
- repeated long-duration randomized Byzantine/Sybil/eclipse/collusion resilience;
- carrier-field CGNAT universality;
- replicated accepted-work survival after underlying host/volume loss;
- stable production SLO/on-call lifecycle;
- verified cross-platform installer/updater/rollback;
- stable `TRUYN/1` compatibility or production mainnet.

For the current truth, read:

- [Implementation Status](../architecture/IMPLEMENTATION_STATUS.md)
- [Network Productionization Gate](../architecture/NETWORK_PRODUCTIONIZATION_GATE.md)
- [Productionization Execution Plan](../operations/PRODUCTIONIZATION_EXECUTION_PLAN.md)
- [Roadmap](../../ROADMAP.md)
- [Benchmark Evidence](../benchmarks/README.md)

The MVP demo is the shortest proof of the core exchange. It is no longer the ceiling of TRUYN's implementation.