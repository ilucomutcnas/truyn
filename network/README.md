# Network

Owns underlay-facing peer mechanics: QUIC/UDP transport, authenticated sessions, discovery, DHT/rendezvous, pub/sub, relay, NAT traversal and network-aware caching.

IP remains the transport underlay. Long-lived TRUYN identity, capability, object and trust semantics live above it.

Bootstrap/relay infrastructure MUST NOT become an authoritative global state service. Direct P2P is preferred when reachable; relays are fallback/coordination infrastructure.

## v0.1 Connect status

**Implemented and CI-proven as a reference underlay on 2026-08-17.**

The current v0.1 path is:

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

Implemented files:

- `runtime.js` — composed `TruynNetworkNode` lifecycle;
- `transport/quic.js` — real QUIC/UDP transport, authenticated control streams and signed-envelope path;
- `transport/p2p.js` — direct-first routing, connection reuse, explicit relay fallback and bounded backpressure;
- `sessions/authenticated-session.js` — signed HELLO/ACCEPT identity binding and replay protection;
- `dht/kademlia.js` — 256-bit XOR routing and signed TTL/sequence DHT records;
- `discovery/peer-discovery.js` — signed peer records, bootstrap and iterative Kademlia lookup;
- `discovery/quic-rpc.js` — authenticated QUIC `PING / FIND_NODE / STORE / FIND_VALUE` RPC;
- `nat/stun.js` — STUN binding discovery;
- `nat/hole-punch.js` — bounded UDP hole punching from the same socket/port used by QUIC;
- `relay/` — fallback/coordination path, not authoritative global state.

See:

- `../docs/architecture/NETWORK_UNDERLAY_V01.md`
- `../docs/benchmarks/V01_CONNECT_GATE_2026-08-17.md`

## NAT and reachability

v0.1 supports the three intended reachability outcomes:

```text
1. directly reachable QUIC
2. STUN + coordinated same-port UDP hole punch → QUIC
3. explicit relay fallback
```

This does not mean every NAT can be punched. Symmetric/restrictive NATs may still require relay transport. Universal NAT success is not a v0.1 claim.

## Backpressure

The new direct P2P path does not silently discard work when its bounded admission capacity is exhausted. It returns `TRUYN_BACKPRESSURE` so callers can retry, shed load, queue durably at a higher layer or choose another route.

The previously measured legacy relay 256-event burst boundary remains evidence for the next durability phase; v0.1 does not rewrite that history.

## Provider execution boundary

Network reachability and provider authorization are separate concerns.

A public relay, discovered DHT peer or reachable QUIC session does not authorize a requester to consume every provider reachable through the network. Execution-capable network paths must call the central provider-policy/authorization layer before dispatch.

Conceptually:

```text
network/session authentication
        ↓
discovery candidate
        ↓
central provider authorization
        ↓
billing/quota eligibility
        ↓
provider dispatch
```

Transport code must not contain a shortcut equivalent to `capability matched => execute`.

## Discovery privacy

Owner-private providers should be filtered from unauthorized discovery responses. This is defense in depth; authorization must still deny execution if a private provider ID is known through another source.

Peer discovery and provider/capability authorization are separate layers. A signed peer record says how to reach a cryptographic node; it does not grant entitlement to a private capability hosted by that node.

## Provider backchannel

Private/owner-funded provider runtimes should use authenticated machine-to-machine connectivity for task delivery. The exact cloud/edge topology is operational and is intentionally not documented in the public network contract.

## Legacy paths

HTTP relay endpoints, WebSocket fast paths, MCP gateways, SDKs and native QUIC transports must converge on equivalent authorization before provider execution.

## Next network phase

v0.1 closes the missing transport/discovery foundation. The next work is deliberately lower-layer productionization rather than more semantic sophistication:

```text
real multi-host testnet
→ churn / crash / restart
→ Kademlia replication + repair
→ durable DHT/routing state
→ WAN/NAT matrix
→ network partitions + healing
→ relay degradation/failure
→ 100 real nodes
→ 1,000 real nodes
→ Byzantine/Sybil/collusion exercises
```

See also:

- `../docs/architecture/RELAY_SECURITY.md`
- `../docs/architecture/AUTHORIZATION_MODEL.md`
- `../spec/protocol/v1/provider-policy.md`
