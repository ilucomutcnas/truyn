# TRUYN v0.1 Testnet Bootstrap

Status: **bootstrap contract implemented; live endpoint set is operational configuration**.

A new testnet node needs only one or more valid signed peer records to enter discovery. Bootstrap peers are initial Kademlia contacts, not authoritative registries.

The v0.1 join path is:

```text
load one or more signed bootstrap peer records
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
```

Bootstrap peer records may be distributed through a trusted release artifact, operator configuration, DNS/HTTPS discovery adapter or another future mechanism. The v0.1 underlay deliberately does not hard-code live operational endpoints in the public repository.

A bootstrap record grants **reachability information only**. It does not grant provider entitlement, billing authority or trust in arbitrary claims.

When direct UDP/QUIC reachability fails, NAT traversal may use STUN + coordinated same-port hole punching; relay remains an explicit fallback.

See:

- `../../docs/architecture/NETWORK_UNDERLAY_V01.md`
- `../../docs/benchmarks/V01_CONNECT_GATE_2026-08-17.md`
- `../../config/testnet/truyn.toml`
