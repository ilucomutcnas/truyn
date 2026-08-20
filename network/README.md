# Network

Owns underlay-facing peer mechanics: QUIC/UDP transport, authenticated sessions, discovery, DHT/rendezvous, relay, NAT traversal, reachability, admission/backpressure and network-aware caching/state.

IP remains the transport underlay. Long-lived TRUYN identity, capability, object and trust semantics live above it.

Bootstrap/relay infrastructure MUST NOT become an authoritative global state service. Direct P2P is preferred when reachable; relay is fallback/coordination infrastructure.

**Status snapshot:** 2026-08-20 — v0.1 Connect implemented/CI-proven; Class B real multi-host **PASS**; Class C heterogeneous WAN/reachability **PASS**; Class D-100 real-node acceptance **active / not yet accepted**.

## Implemented underlay path

```text
cryptographic node identity
        ↓
signed bootstrap / peer record
        ↓
Kademlia XOR routing
        ↓
authenticated QUIC control session
        ↓
PING / FIND_NODE / STORE / FIND_VALUE
        ↓
direct signed TRUYN NEED / RESULT traffic
        ↓
relay fallback only when direct reachability fails
```

Core files include:

- `runtime.js` — composed `TruynNetworkNode` lifecycle;
- `transport/quic.js` — real QUIC/UDP transport and authenticated control/envelope path;
- `transport/p2p.js` — direct-first routing, connection reuse, explicit relay fallback and bounded backpressure;
- `sessions/authenticated-session.js` — signed HELLO/ACCEPT identity binding and replay protection;
- `dht/kademlia.js` — XOR routing and signed TTL/sequence DHT records;
- `discovery/peer-discovery.js` — signed peer records, bootstrap and iterative lookup;
- `discovery/quic-rpc.js` — authenticated QUIC `PING / FIND_NODE / STORE / FIND_VALUE`;
- `nat/stun.js` — STUN binding discovery;
- `nat/hole-punch.js` — bounded same-QUIC-socket UDP hole punching;
- `relay/` — fallback/coordination path;
- productionization state/repair/admission components — restart continuity, renewal, replication/quorum/repair and bounded accepted-work recovery.

## Peer-record lifecycle / durable recovery

Later productionization work beyond the original v0.1 gate includes:

- automatic signed peer-record renewal before expiry;
- persistence of renewed sequence before dissemination;
- authenticated peer announcement;
- later-contact PING repair;
- stale P2P/DHT-RPC client invalidation after newer signed peer state;
- durable retention of cryptographically verified expired peer records as recovery hints while normal live lookup remains fail-closed.

The recovery hint mechanism does not make expired records live/authoritative; it allows restart recovery to bootstrap revalidation/repair from previously verified durable state.

## NAT and reachability

Reference reachability order remains:

```text
1. directly reachable QUIC
2. STUN + coordinated same-port UDP hole punch → QUIC
3. explicit relay fallback
```

Universal NAT traversal is not claimed.

Accepted Class C evidence has now additionally proven, in a bounded Azure/GCP topology:

- direct cross-cloud QUIC;
- real packet-path partition/heal;
- real Azure NAT gateway/source observation;
- private NAT node without public IP;
- two-layer double-NAT / CGNAT-like outbound behavior;
- authenticated relay fallback/outage/recovery.

Carrier-operated field CGNAT remains outside that accepted evidence boundary.

## Backpressure and durable accepted work

The direct P2P path does not silently discard work when bounded admission capacity is exhausted; it returns `TRUYN_BACKPRESSURE`.

A durable accepted-work reference slice survives process restart on the same durable storage and can replay persisted completed results without re-executing the accepted handler. It does **not** yet prove survival after loss of the underlying host/volume or exactly-once arbitrary external side effects.

## Provider execution boundary

Network reachability and provider authorization are separate concerns.

```text
network/session authentication
        ↓
discovery candidate
        ↓
central provider authorization
        ↓
billing / entitlement eligibility
        ↓
provider-host authorization
        ↓
dispatch
```

A public relay, reachable QUIC peer or DHT record does not authorize consumption of every provider reachable through the network. Transport code must never implement `capability matched => execute` as an authorization shortcut.

## Discovery privacy

Owner-private providers are filtered from unauthorized provider discovery/routing. This is defense in depth; execution is still denied even if a private provider ID is learned by another means.

Peer discovery and capability authorization are distinct layers. A signed peer record says how to reach a cryptographic node; it does not grant entitlement to a capability hosted by that node.

## Provider backchannel

Private/owner-funded provider runtimes may use authenticated M2M connectivity for task delivery. Exact production cloud/edge topology is operational and intentionally excluded from the public network contract.

## Legacy / compatibility paths

HTTP relay endpoints, WebSocket fast paths, MCP gateways, SDKs and native QUIC transports must converge on equivalent authorization before provider execution.

## Real-network evidence progression

```text
v0.1 Connect — CLOSED
        ↓
Class B real multi-host — ACCEPTED / PASS
        ↓
Class C heterogeneous WAN/NAT/relay — ACCEPTED / PASS
        ↓
Class D-100 real nodes — ACTIVE / acceptance pending
        ↓
Class D-1000 real nodes
        ↓
randomized Byzantine/Sybil/eclipse/collusion + churn/partition campaigns
        ↓
operational/stability/mainnet closure
```

The active D-100 canonical evaluator requires 100 real nodes/identities/QUIC sockets, ≥4 hosts, ≥99% baseline/healed routing, recovery/convergence p95 ≤120s, all declared adversarial phases, zero listed safety violations and complete cleanup.

See:

- `../docs/architecture/NETWORK_UNDERLAY_V01.md`
- `../docs/architecture/NETWORK_PRODUCTIONIZATION_GATE.md`
- `../docs/operations/PRODUCTIONIZATION_EXECUTION_PLAN.md`
- `../docs/benchmarks/V01_CONNECT_GATE_2026-08-17.md`
- `../docs/benchmarks/NETWORK_PRODUCTIONIZATION_AZURE_4HOST_2026-08-17.md`
- `../docs/benchmarks/CLASS_C_HETEROGENEOUS_WAN_2026-08-18.md`
- `../docs/architecture/RELAY_SECURITY.md`
- `../docs/architecture/AUTHORIZATION_MODEL.md`
- `../spec/protocol/v1/provider-policy.md`.