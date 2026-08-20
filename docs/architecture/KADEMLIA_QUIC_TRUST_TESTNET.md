# Real Kademlia/QUIC Trust Testnet

**Status:** implemented and **bounded real-testnet proven** for the first relay-free trust-network slice.  
**Evidence:** `../benchmarks/KADEMLIA_QUIC_TRUST_TESTNET_2026-08-17.md`.  
**Status synchronization:** 2026-08-20.

## Objective

This slice moved TRUYN trust verification from local/relay-backed protocol simulation to a real peer-to-peer network substrate:

```text
TRUYN verifier / log replica
        │
        │ QUIC v1 (UDP, encrypted, multiplexed)
        ▼
     libp2p
        │
        ├── Kademlia peer/content routing
        ├── verifier-record protocol
        └── transparency replication protocol
```

No TRUYN relay participates in verifier discovery, lifecycle-log discovery, verifier-record retrieval or log replication in the accepted bounded trust-testnet proof.

## 1. QUIC-only transport

`network/transport/quic-kademlia.js` constructs libp2p nodes that listen on `/udp/.../quic-v1`. Kademlia runs in server mode with a TRUYN-specific DHT protocol ID. Bootstrap addresses are initial peer hints only; once peers have direct connections and DHT routing state, the original bootstrap process can disappear.

This slice intentionally has no TCP/WebSocket fallback so a passing test cannot silently prove the wrong transport.

## 2. Decentralized verifier discovery

A verifier derives a deterministic content key from the normalized trust domain and advertises itself as a provider of that key through Kademlia.

Discovery is two-phase:

1. DHT `findProviders(domain-key)` returns candidate libp2p peers.
2. The requester opens `/truyn/verifier-record/2.0.0` directly over QUIC and retrieves the candidate's signed verifier record.

The signed record binds:

- trust domain;
- verifier TRUYN identity;
- current libp2p peer ID and multiaddrs;
- methods;
- source-owner root certificate;
- source-owner delegation;
- authority-chain digest.

A transport identity may change during churn without changing the delegated TRUYN verifier identity. The new peer record must be signed again by the same delegated verifier key.

## 3. Source-owner PKI / delegation

A source owner has a root Ed25519 identity and a self-signed source-owner certificate. The root delegates `trust.verify` authority to verifier TRUYN identities with explicit scopes, namespaces and validity windows.

The DHT is not a CA. Verifier records are accepted only after local cryptographic verification of the source-owner certificate and delegation chain.

## 4. Durable transparency / revocation log

Each source owner has an append-only log identified by a content-derived log ID. Entries are signed and chained by:

```text
sequence
previousHash
entryHash
signerNodeId
signature
```

The current head commits the complete chain and a deterministic revocation-state digest.

Persistence is JSONL with explicit file sync after append. A restarted node reloads and revalidates the chain before serving it.

## 5. Replication

Log replicas advertise the source-owner log key through Kademlia and synchronize over `/truyn/transparency/2.0.0` using `HEAD`, `PULL` and `PUSH` operations.

The replication layer can require a minimum number of successful replica acknowledgements. Equal sequence numbers with different head hashes are treated as equivocation/fork evidence and rejected.

This is durability plus fork detection, **not Byzantine consensus**. No BFT-finality claim is made by this slice.

## 6. Churn semantics

The bounded real testnet exercised actual process/node lifecycle changes:

- original bootstrap/log-primary disappears;
- a new replica recovers lifecycle state from surviving peers;
- verifier QUIC/libp2p identity disappears and rejoins under a new peer ID while retaining the delegated TRUYN verifier key;
- the durable primary restarts from disk;
- a new revocation head is replicated to multiple surviving replicas;
- an old Trust Receipt v2 becomes stale;
- revoked verifier delegation disappears from valid decentralized discovery results.

## 7. Trust Receipt v2

A receipt v2 signs the claim/evidence assessment together with:

- source-owner authority-chain commitment;
- lifecycle log head;
- global revocation-state digest;
- explicit verifier-delegation and claim revocation states.

Any later lifecycle head causes a strict freshness failure until the claim is reevaluated and a new receipt is issued.

## 8. Security boundary

Kademlia is used for routing/discovery, not authorization. Candidate records, PKI objects, transparency entries and receipts are verified cryptographically after discovery. Stale DHT provider records are tolerated because direct QUIC fetch and signature/expiry/revocation checks fail closed.

## 9. Evidence status

The pre-scale trust-network evidence gate is **closed for its bounded scope**. The accepted report demonstrates:

- real QUIC sockets;
- Kademlia provider discovery without relay calls in the tested path;
- verifier identity/authority validation;
- durable restart recovery;
- replicated head convergence after churn;
- revocation propagation;
- stale-receipt rejection;
- fork/equivocation handling semantics.

This evidence is one prerequisite for larger Class D work. It does **not** prove:

- BFT consensus/finality;
- 100/1,000 real-node trust-network scale;
- Internet-scale Sybil/eclipse/collusion resistance;
- long-duration randomized adversarial operation;
- production authority/revocation operations.

## 10. Current next gate

The project has moved beyond the old “prove the four-node trust slice before scale-up” state.

Current network progression is:

```text
bounded trust-network slice — PASS
Class B real multi-host — PASS
Class C heterogeneous WAN/NAT/relay — PASS
        ↓
Class D-100 real-node/adversarial acceptance — ACTIVE
        ↓
Class D-1000
        ↓
randomized large real-network adversarial campaigns
```

The active Class D gates must preserve trust safety invariants such as zero invalid signed state accepted and zero stale revoked receipt accepted while exercising larger Byzantine/Sybil/eclipse/collusion pressure.

See `NETWORK_PRODUCTIONIZATION_GATE.md`, `IMPLEMENTATION_STATUS.md` and `../operations/PRODUCTIONIZATION_EXECUTION_PLAN.md`.