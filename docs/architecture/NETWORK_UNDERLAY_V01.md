# TRUYN v0.1 Connect — Network Underlay

Status: **IMPLEMENTED / CI-PROVEN REFERENCE UNDERLAY**  
Original gate date: **2026-08-17**  
Status synchronization: **2026-08-20**

This document is the implementation contract for the first real TRUYN network underlay. It closed the architectural gap where higher-level semantic, trust and provider layers existed above a relay-centric transport.

v0.1 Connect is deliberately narrower than a production mainnet claim. It established the network primitives required to run TRUYN as a decentralized peer network. Later productionization work has now additionally closed Class B real multi-host and Class C heterogeneous WAN/reachability; the active scale gate is Class D-100. Those later results do not retroactively change what the v0.1 gate itself proved.

## v0.1 invariant

A TRUYN node is identified by its cryptographic identity, not by an IP address or relay registration.

Preferred path:

```text
signed node identity
        ↓
signed peer/bootstrap record
        ↓
Kademlia XOR routing / FIND_NODE
        ↓
authenticated QUIC session
        ↓
direct signed TRUYN envelope
        ↓
peer RESULT / control response
```

A relay is fallback/coordination infrastructure when direct reachability is unavailable. It is not the authoritative database of peer identity, peer location or DHT values.

## Implemented components

### Real QUIC / UDP transport

`network/transport/quic.js` uses a real QUIC implementation (`@matrixai/quic`, backed by quiche) rather than emulating QUIC semantics over an unrelated UDP protocol.

The transport provides:

- one bound UDP socket able to accept and initiate QUIC connections;
- ALPN `truyn/1`;
- bounded bidirectional stream messages;
- application-level signed peer-session authentication;
- authenticated control RPC;
- signed TRUYN envelope transport;
- graceful client/server/socket shutdown.

TLS protects QUIC transport. TRUYN node identity remains a separate Ed25519 identity above TLS so identity is not coupled to a transient IP address or TLS endpoint certificate.

### Authenticated peer sessions

`network/sessions/authenticated-session.js` implements `truyn-peer-session-v1`:

1. initiator sends a signed `HELLO` containing node identity, nonce, timestamp, transport and advertised endpoints;
2. receiver verifies public-key-derived node identity, signature, freshness and replay state;
3. receiver returns a signed `ACCEPT` bound to the exact HELLO and live QUIC endpoint tuple;
4. both sides derive the same session ID;
5. subsequent control/envelope traffic is accepted only on that authenticated session.

A valid TRUYN envelope must also match the node identity authenticated for the QUIC session.

### Kademlia routing and signed DHT state

`network/dht/kademlia.js` implements the v0.1 reference Kademlia mechanics:

- 256-bit SHA-256 DHT identifiers;
- XOR distance;
- 256 routing buckets;
- configurable `k` (default 20);
- nearest-peer selection;
- signed DHT records;
- namespace/key hash binding;
- content digest binding;
- monotonic sequence numbers;
- TTL expiry;
- same-sequence equivocation rejection;
- expired-record sweeping.

`network/discovery/quic-rpc.js` exposes authenticated Kademlia control operations over QUIC:

- `dht.ping`;
- `dht.find-node`;
- `dht.store`;
- `dht.find-value`.

### Signed peer discovery and bootstrap

`network/discovery/peer-discovery.js` implements signed peer records and iterative lookup. A peer record binds node ID, public key/signature, DHT ID, QUIC endpoints, optional capability/NAT metadata, sequence number and issue/expiry time.

A node can begin with one or more signed bootstrap records, query those peers over authenticated QUIC, learn additional signed peers and connect directly to the discovered target.

Later productionization slices added automatic signed peer-record renewal, durability-before-dissemination, authenticated announcements, PING repair, stale-client invalidation and durable verified expired-record recovery hints. Those are documented in `NETWORK_PRODUCTIONIZATION_GATE.md`.

### Direct-first P2P routing

`network/transport/p2p.js` follows:

```text
known/discovered peer
        ↓
try authenticated direct QUIC
        ↓ success
send signed envelope directly

        ↓ failure
optional explicit relay fallback
```

Direct failure is observable. Relay fallback is explicit rather than silently making the relay authoritative again.

The path uses bounded admission/backpressure. If active + queued capacity is exhausted, callers receive `TRUYN_BACKPRESSURE` rather than silent loss.

### NAT traversal

`network/nat/stun.js` implements STUN binding discovery for MAPPED-ADDRESS / XOR-MAPPED-ADDRESS with transaction validation.

`network/nat/hole-punch.js` implements bounded UDP hole-punch probes. `punchQuicSocket()` sends probes from the same bound UDP socket/port used by QUIC, so a successful mapping applies to the subsequent QUIC path.

v0.1 strategy:

```text
publicly reachable QUIC
        or
STUN mapping + coordinated same-port UDP punch
        or
relay fallback
```

v0.1 never claimed universal NAT success. Class C later proved a bounded real cloud NAT + double-NAT/CGNAT-like path and authenticated relay fallback/recovery, but still does not claim universal or carrier-field CGNAT traversal.

### Composed runtime

`network/runtime.js` exposes `TruynNetworkNode`, composing:

- cryptographic identity;
- QUIC listener/client;
- authenticated sessions;
- signed local peer record;
- bootstrap ingestion;
- iterative discovery;
- Kademlia record store + network RPC;
- direct-first NEED/envelope routing;
- optional relay fallback;
- bounded backpressure.

## v0.1 acceptance gate

The v0.1 implementation remains valid while CI preserves:

1. cryptographically bound/replay-safe peer sessions;
2. Kademlia XOR routing and fail-closed signed DHT records;
3. iterative discovery of an initially unknown peer;
4. real QUIC carrying signed `NEED` directly between nodes;
5. relay-free A→B→discover C→direct C path in the gate topology;
6. networked `PING / STORE / FIND_VALUE` over authenticated QUIC;
7. composed `TruynNetworkNode` bootstrap/discovery/DHT/direct routing;
8. real UDP STUN exchange;
9. same-QUIC-port hole-punch probes;
10. explicit relay fallback after direct failure;
11. explicit backpressure instead of silent event loss;
12. repository regression/security suite green.

Permanent v0.1 evidence: `../benchmarks/V01_CONNECT_GATE_2026-08-17.md`.

## Historical v0.1 limitations vs later progress

At closure, v0.1 did **not** prove Internet-scale convergence, 100/1,000 running WAN nodes, quantified churn distributions, broad NAT/CGNAT behavior, durable production DHT repair, Byzantine/Sybil resistance, mainnet SLOs or installer/update lifecycle.

Since then:

- Class B real multi-host — **ACCEPTED**;
- DHT replication/repair/restart continuity — additional CI/real-host evidence exists;
- signed peer-record renewal/repair — CI-proven;
- Class C heterogeneous Azure/GCP WAN, packet-path partition/heal, real cloud NAT, double-NAT/CGNAT-like path and authenticated relay outage/recovery — **ACCEPTED**;
- Class D-100 — **active, not yet accepted** at the 2026-08-20 snapshot;
- Class D-1000 and production operational closure — open.

## Current next network gate

The old sequence `multi-host → WAN/NAT → 100 nodes` is no longer future-only: its first two productionization classes are closed.

Current sequence is:

```text
Class B real multi-host — PASS
        ↓
Class C heterogeneous WAN/NAT/relay — PASS
        ↓
Class D-100 real nodes — ACTIVE
        ↓
Class D-1000 real nodes
        ↓
randomized adversarial heterogeneous campaigns
        ↓
operational / durability / SRE / distribution closure
        ↓
stable TRUYN/1 / mainnet
```

See:

- `NETWORK_PRODUCTIONIZATION_GATE.md`;
- `../operations/PRODUCTIONIZATION_EXECUTION_PLAN.md`;
- `IMPLEMENTATION_STATUS.md`;
- `../../ROADMAP.md`.