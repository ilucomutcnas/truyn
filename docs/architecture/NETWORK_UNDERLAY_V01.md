# TRUYN v0.1 Connect — Network Underlay

Status: **IMPLEMENTED / CI-PROVEN REFERENCE UNDERLAY**

Date: **2026-08-17**

This document is the implementation contract for the first real TRUYN network underlay. It closes the architectural gap where higher-level semantic, trust and provider layers existed above a relay-centric transport.

v0.1 Connect is deliberately narrower than a production mainnet claim. It establishes the network primitives required to run TRUYN as a decentralized peer network; the next engineering phase is failure/churn durability and multi-host testnet hardening.

## v0.1 invariant

A TRUYN node is identified by its cryptographic identity, not by an IP address or relay registration.

The preferred path is now:

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

A relay is a fallback/coordination mechanism when direct reachability is unavailable. It is not the authoritative database of peer identity, peer location or DHT values.

## Implemented components

### Real QUIC / UDP transport

`network/transport/quic.js` uses a real QUIC implementation (`@matrixai/quic`, backed by quiche) rather than emulating QUIC semantics over an unrelated UDP protocol.

The transport provides:

- one bound UDP socket that can accept QUIC connections and initiate outbound QUIC connections;
- ALPN `truyn/1`;
- bounded bidirectional stream messages;
- application-level signed peer-session authentication;
- authenticated control RPC;
- signed TRUYN envelope transport;
- graceful client/server/socket shutdown.

TLS protects the QUIC transport. TRUYN node identity remains an independent Ed25519 identity above TLS so node identity is not coupled to a transient IP address or TLS endpoint certificate.

### Authenticated peer sessions

`network/sessions/authenticated-session.js` implements `truyn-peer-session-v1`:

1. initiator sends a signed `HELLO` containing node identity, nonce, timestamp, transport and advertised endpoints;
2. receiver verifies public-key-derived node identity, signature, freshness and replay state;
3. receiver returns a signed `ACCEPT` bound to the exact HELLO and the live QUIC endpoint tuple;
4. both sides derive the same session ID;
5. subsequent control/envelope traffic is accepted only on the authenticated session.

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

The DHT therefore has a real network transport boundary; it is not only an in-memory data structure.

### Signed peer discovery and bootstrap

`network/discovery/peer-discovery.js` implements signed peer records and iterative lookup.

A peer record binds:

- node ID;
- public key/signature;
- DHT ID;
- QUIC endpoint(s);
- optional capabilities;
- optional NAT reachability metadata;
- sequence number;
- issue/expiry time.

A node can begin with one or more signed bootstrap peer records, query those peers over authenticated QUIC, learn additional signed peers and then connect directly to the discovered target.

### Direct-first P2P routing

`network/transport/p2p.js` implements the routing order:

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

The transport also replaces silent queue loss with bounded admission/backpressure. If both active and queued limits are exhausted, the caller receives `TRUYN_BACKPRESSURE`.

### NAT traversal

`network/nat/stun.js` implements STUN binding discovery for MAPPED-ADDRESS / XOR-MAPPED-ADDRESS with transaction validation.

`network/nat/hole-punch.js` implements bounded UDP hole-punch probes. Critically, `punchQuicSocket()` sends probes from the **same bound UDP socket/port used by QUIC**, so a successful NAT mapping applies to the subsequent QUIC path rather than to an unrelated temporary socket.

This is the correct v0.1 NAT strategy:

```text
publicly reachable QUIC
        or
STUN mapping + coordinated same-port UDP punch
        or
relay fallback
```

NAT traversal is inherently environment-dependent. v0.1 does **not** claim that every symmetric or restrictive NAT will permit direct P2P; relay fallback exists for those cases.

### Composed runtime

`network/runtime.js` exposes `TruynNetworkNode`, which composes the primitives into one runnable network object:

- cryptographic identity;
- QUIC listener/client;
- authenticated sessions;
- signed local peer record;
- bootstrap ingestion;
- iterative discovery;
- Kademlia record store and network RPC;
- direct-first NEED/envelope routing;
- optional relay fallback;
- bounded backpressure.

This removes the previous gap where the underlay primitives could exist independently without a single node lifecycle that used them together.

## v0.1 acceptance gate

The implementation is considered complete only while all of the following remain true in CI:

1. peer session identity is cryptographically bound and replay-safe;
2. Kademlia XOR routing works and DHT records fail closed on tampering;
3. iterative discovery can find an initially unknown peer;
4. real QUIC carries a signed `NEED` directly between nodes;
5. node A, knowing only node B, can discover node C through authenticated QUIC `FIND_NODE` and then send directly to C with zero relay calls;
6. Kademlia `PING / STORE / FIND_VALUE` operate across authenticated QUIC;
7. a composed `TruynNetworkNode` can bootstrap, discover, store DHT state and direct-route a NEED;
8. STUN performs a real UDP binding exchange;
9. hole-punch probes originate from the same bound UDP port used by QUIC;
10. direct failure can fall back to relay explicitly;
11. overload produces explicit backpressure rather than silent event loss;
12. the full repository regression/security suite remains green.

Permanent evidence: `../benchmarks/V01_CONNECT_GATE_2026-08-17.md`.

## What v0.1 does not claim

Closing v0.1 does **not** prove:

- Internet-scale Kademlia convergence;
- 100/1,000 simultaneously running WAN nodes;
- quantified convergence under churn or network partitions;
- NAT success across every carrier-grade/symmetric NAT topology;
- automatic UPnP/PCP port mapping;
- relay-free connectivity in every environment;
- durable DHT persistence across process restarts;
- Byzantine/Sybil-resistant DHT membership;
- production-grade DHT replication/repair under churn;
- mainnet availability/SLOs;
- signed installer/service lifecycle.

Those are intentionally the next network-productionization layers, not hidden requirements retroactively added to v0.1.

## Next network gate

With v0.1 Connect complete, the next engineering target is **failure/churn durability**:

```text
real multi-host testnet
  → node join/leave/crash/restart churn
  → Kademlia replication + repair
  → durable routing/DHT state
  → NAT/reachability matrix
  → relay degradation/failure tests
  → 100 real nodes
  → 1,000 real nodes
  → Byzantine/Sybil/collusion exercises
```

Higher-level semantic routing should not be expanded merely to avoid this lower-layer work. The immediate bottleneck is now network durability and scale, not semantic correctness.
