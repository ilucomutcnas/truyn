# TRUYN v0.1 Connect Gate — QUIC / P2P / Kademlia / NAT

Status: **PASS**

Date: **2026-08-17**

This report is the durable public evidence record for the first TRUYN underlay gate that replaces relay-only network assumptions with real QUIC transport, authenticated peer sessions, Kademlia discovery/state RPC, direct P2P routing, STUN discovery, same-port UDP hole punching and explicit relay fallback.

The scope is intentionally precise: this is a **reference-underlay / local functional network proof**, not an Internet-scale churn or mainnet claim.

## Evidence identity

- Tested commit SHA: **`497627efd49d12212e72ee140c7f47b4c41844ee`**
- GitHub Actions workflow run: **`31969626971` — SUCCESS**
- Job: **`95219924902` — SUCCESS**
- Runtime: Node **20.20.2** in CI
- Full test command: `node --test tests/*.test.js`
- Full repository result: **184 / 184 passed; 0 failed**
- `git diff --check`: **PASS**
- Public repository leakage/credential-pattern guard: **PASS**
- External paid-provider inference: **none required by this gate**

This gate uses the permanent repository tests. No temporary privileged benchmark workflow or secret-bearing operational artifact is required to reproduce the local functional proof.

## Fixed v0.1 gates

| Gate | Required | Measured |
|---|---:|---:|
| Full repository regression suite | 100% | **184/184 — 100%** |
| Signed peer-session authentication | PASS | **PASS** |
| Replay rejection | PASS | **PASS** |
| Kademlia XOR routing | PASS | **PASS** |
| Signed/tamper-evident DHT records | PASS | **PASS** |
| Iterative peer lookup | PASS | **PASS** |
| Real QUIC signed NEED | PASS | **PASS** |
| Relay-free A→B discovery of C over QUIC | PASS | **PASS** |
| Direct A→C NEED after discovery | PASS | **PASS** |
| Relay calls in direct-success scenarios | 0 | **0** |
| Composed node runtime | PASS | **PASS** |
| STUN real UDP exchange | PASS | **PASS** |
| Hole-punch source port equals QUIC source port | PASS | **PASS** |
| Explicit overload backpressure | PASS | **PASS** |
| Public-repository leakage guard | PASS | **PASS** |

## Real QUIC proof

`tests/network-connect-v01.test.js` starts independent TRUYN QUIC node instances on independently bound UDP ports and executes a real QUIC connection/stream exchange.

The test proves:

1. each peer owns an independent cryptographic TRUYN identity;
2. the QUIC connection is established over real UDP sockets;
3. a signed `HELLO / ACCEPT` application session binds node identity to that QUIC connection;
4. the sender creates a normal signed TRUYN `NEED` envelope;
5. the receiver verifies that the envelope signer is the identity authenticated for the QUIC session;
6. the receiver returns a response over QUIC;
7. no relay fallback is invoked.

Measured test status: **PASS**.

This is not a mocked UDP packet protocol labeled as QUIC. The implementation uses `@matrixai/quic` / quiche and QUIC bidirectional streams.

## Relay-free three-node discovery proof

The stronger discovery test starts three independently bound QUIC nodes: A, B and C.

Initial state:

```text
A knows B
B knows C
A does not know C
```

Execution:

```text
A
  └─ authenticated QUIC → B
       └─ dht.find-node(C)
            └─ signed peer record for C

A verifies C record
  └─ direct authenticated QUIC → C
       └─ signed NEED
```

Result:

- A discovers C without relay lookup;
- C's peer record remains signature/TTL/identity verified;
- A opens a direct QUIC path to C;
- C receives the signed NEED;
- recorded relay fallback calls: **0**.

This closes the previous architecture gap where placement semantics could be decentralized while the underlying peer lookup/transport remained relay-centric.

## Networked Kademlia state

The v0.1 DHT implements signed records with:

- namespace/key binding;
- SHA-256 identifiers;
- value digest;
- publisher node identity;
- sequence;
- TTL;
- signature;
- same-sequence equivocation rejection.

Authenticated QUIC control RPC supports:

- `dht.ping`;
- `dht.find-node`;
- `dht.store`;
- `dht.find-value`.

The composed runtime test creates a signed capability record on one node, stores it on a different node over authenticated QUIC and retrieves the exact validated record through `FIND_VALUE`.

Result: **PASS**.

## Composed runtime proof

`network/runtime.js` exposes `TruynNetworkNode` so the underlay is not merely a set of unconnected helpers.

The runtime test starts three nodes and proves the sequence:

```text
start
→ signed local peer record
→ bootstrap
→ authenticated ping
→ iterative discovery
→ direct signed NEED
→ DHT STORE
→ DHT FIND_VALUE
→ clean shutdown
```

Relay fallback is installed in the test but is never invoked on the healthy direct path.

Result: **PASS**.

## NAT proof

### STUN

The regression suite starts a real UDP STUN test endpoint, sends a Binding Request using the production `discoverMappedAddress()` path and receives/parses a valid XOR-MAPPED-ADDRESS response.

Result: **PASS**.

### Same-port UDP hole punching

A live TRUYN QUIC runtime binds an actual UDP port. The NAT test sends a punch probe using the QUIC transport's own bound socket to a separate UDP receiver.

The receiver verifies:

- the punch token/protocol;
- intended peer identity;
- the observed source UDP port.

Measured invariant:

```text
punch probe source UDP port == live QUIC UDP port
```

Result: **PASS**.

This matters because a punch from an unrelated temporary socket would establish the wrong NAT mapping for subsequent QUIC traffic.

## Backpressure proof

Direct-first routing is protected by explicit bounded admission.

With one active slot and one queued slot occupied, the next request is rejected with:

```text
TRUYN_BACKPRESSURE
```

rather than being silently discarded.

This does not by itself replace the legacy relay's previously measured 256-event queue boundary. It establishes the correct underlay behavior for the new direct P2P path and provides the pattern that the next durability phase must extend to durable multi-node queues/admission.

## Security and identity boundaries

Transport reachability is not provider authorization.

v0.1 authenticates the remote network node and validates signed TRUYN envelopes. Existing provider policy/billing/authorization gates remain separate and must still execute before a chargeable provider is called.

The underlay therefore does not interpret `connected peer` as `authorized consumer of every capability`.

## What this result does not prove

This PASS must not be used to claim:

- an Internet-scale production Kademlia network;
- measured routing convergence under large churn;
- a durable DHT surviving process/storage loss;
- WAN partition-healing measurements;
- successful direct connectivity across every NAT type;
- automatic UPnP/PCP/TURN behavior;
- a 100-node or 1,000-node **real running network**;
- global Byzantine/Sybil-resistant DHT membership;
- DHT replication/repair under adversarial churn;
- production mainnet SLOs;
- production installers/updaters.

Those are the explicit next network-productionization gates.

## Conclusion

**TRUYN v0.1 Connect reference underlay passes.**

The project now has a real lower network layer matching the intended architecture:

```text
IP / UDP
   ↓
real QUIC
   ↓
authenticated TRUYN peer session
   ↓
Kademlia discovery/state
   ↓
direct signed TRUYN messages
   ↓
relay only as fallback when required
```

The next legitimate engineering problem is no longer “implement QUIC/P2P/Kademlia/NAT primitives.” It is to prove their durability under real multi-host churn, failures, partitions, NAT diversity and scale.
