# TRUYN Testnet Bootstrap

**Status:** bootstrap contract implemented; signed peer-record lifecycle implemented; live endpoint set remains operational configuration.  
**Snapshot:** 2026-08-20.

A new testnet node needs one or more valid signed peer records to enter discovery. Bootstrap peers are initial Kademlia contacts, not authoritative registries.

## Join path

```text
load signed bootstrap peer record(s)
        ↓
verify node ID / public key / signature / TTL / sequence
        ↓
authenticated QUIC session
        ↓
Kademlia PING / FIND_NODE
        ↓
learn additional signed peer records
        ↓
direct peer communication when reachable
        ↓
explicit relay fallback only when required
```

A bootstrap record grants **reachability information only**. It does not grant provider entitlement, billing authority or truth/trust in arbitrary claims.

## Current signed peer-record lifecycle

The reference network now supports more than the original one-shot bootstrap path:

- automatic signed peer-record renewal before expiry;
- persistence of the renewed sequence before dissemination;
- authenticated peer-record announcements;
- later-contact PING repair if a proactive announcement was missed;
- stale P2P/DHT-RPC client invalidation when newer signed peer state is accepted;
- durable retention of previously cryptographically verified expired peer state as restart recovery hints while live lookup remains fail-closed.

Expired durable hints are not treated as currently valid routing authority. They exist to support bounded recovery/revalidation after restart.

## NAT / relay behavior

When direct UDP/QUIC reachability fails, the reference path can use STUN + coordinated same-port hole punching; relay remains explicit fallback.

Accepted Class C evidence has additionally proven a bounded real cloud NAT, double-NAT/CGNAT-like outbound path, authenticated relay fallback, relay outage fail-closed and recovery. Carrier-operated field CGNAT is not claimed.

## Distribution of bootstrap records

Bootstrap peer records may be distributed through a trusted release artifact, operator configuration, DNS/HTTPS discovery adapter or another future mechanism. Public source deliberately does not hard-code privileged live production bootstrap topology.

For stable mainnet, bootstrap distribution, rotation, compatibility and incident/revocation policy remain v1.0 operational work.

## Current productionization state

```text
Class B real multi-host — PASS
        ↓
Class C heterogeneous WAN/NAT/relay — PASS
        ↓
Class D-100 real nodes — active / not yet accepted
        ↓
Class D-1000
        ↓
randomized adversarial operation
        ↓
stable mainnet bootstrap/operations
```

See:

- `../../docs/architecture/NETWORK_UNDERLAY_V01.md`
- `../../docs/architecture/NETWORK_PRODUCTIONIZATION_GATE.md`
- `../../docs/operations/PRODUCTIONIZATION_EXECUTION_PLAN.md`
- `../../docs/benchmarks/V01_CONNECT_GATE_2026-08-17.md`
- `../../docs/benchmarks/CLASS_C_HETEROGENEOUS_WAN_2026-08-18.md`
- `../../config/testnet/truyn.toml`.