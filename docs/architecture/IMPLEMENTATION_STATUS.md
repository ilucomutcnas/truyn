# TRUYN Implementation Status

**Status:** canonical factual status index.

**Snapshot date:** 2026-08-17  
**Software version:** `0.1.0-dev`  
**Protocol generation:** `TRUYN/1` draft

This document answers one question: **what is actually implemented and proven now, versus only designed or planned?**

Architecture documents define contracts. Benchmark reports prove bounded claims. This file connects the two and MUST be updated when implementation maturity materially changes.

## Status vocabulary

- **Defined** — architecture/spec exists.
- **Implemented** — executable reference code exists.
- **CI-proven** — bounded automated tests prove the contract.
- **Bounded real-testnet proven** — exercised across real network processes/hosts in a bounded topology.
- **Productionized** — operational lifecycle, recovery, durability, security and observability gates are satisfied for the intended deployment class.
- **Internet-scale proven** — large real-node/WAN/adversarial evidence exists.
- **Stable** — compatibility guarantees are declared.

## System status matrix

| Subsystem | Architecture | Implementation | Evidence | Current limitation / next gate |
|---|---|---|---|---|
| Node identity / signed envelopes | Defined | Implemented | CI-proven | protocol still draft |
| QUIC underlay | Defined | Implemented | CI-proven | multi-host/WAN productionization still open |
| Authenticated peer sessions | Defined | Implemented | CI-proven | Internet churn/reachability scale open |
| Kademlia discovery/state RPC | Defined | Implemented | CI-proven | durability/repair/large real-node scale open |
| Direct-first P2P + relay fallback | Defined | Implemented | CI-proven | heterogeneous NAT matrix open |
| STUN / same-port hole punching | Defined | Implemented reference path | CI-proven bounded path | universal NAT traversal is not claimed |
| Semantic index lifecycle | Defined | Implemented | benchmark/CI proven | broader operational SLOs open |
| Semantic retrieval v2/v3 | Defined | Implemented | extensive benchmark evidence | infrastructure-block scale is not real-node scale |
| Distributed semantic retrieval | Defined | Implemented | benchmark/CI proven | larger decentralized holder networks open |
| Byzantine read-quorum placement | Defined | Implemented reference slice | benchmark/CI proven | open-network adversarial scale open |
| Claim-centric Trustability | Defined | Implemented | CI/benchmark proven | policy calibration/domain operations continue |
| Active trust lifecycle | Defined | Implemented | CI/benchmark proven | production authority/revocation operations open |
| QUIC/Kademlia trust network | Defined | Implemented | bounded four-node real-testnet proven | 100/1,000 real nodes + adversarial WAN open |
| Provider ownership | Defined | Implemented node-level reference boundary | negative-test proven | rich account/org tenant control plane open |
| Provider discovery authorization | Defined | Implemented | negative-test proven | richer grant policy open |
| Provider-host access control | Defined | Implemented | negative-test proven | stable account binding open |
| BYOK | Defined | Implemented reference CLI/runtime flow | tests present | OS-native secure-store integration incomplete |
| Owner-funded billing safety | Defined | Implemented | fail-closed tests | production accounting/tenant attribution open |
| Sponsored billing | Defined | Guard implementation exists | activation requires signed entitlement + durable atomic usage store | production entitlement issuance/store deployment open |
| Prepaid/subscription billing | Defined | fail-closed placeholder | denies without resolver | entitlement resolver/accounting not implemented |
| Origin guard / edge proxy | Defined | Implemented reference controls | security tests/evaluation | deployment-specific direct-origin proof remains operational |
| Protected-provider M2M guard | Defined | Implemented | regression proven | live token issuance/rotation is deployment-specific |
| Multi-cloud text/image/video adapters | Defined | Implemented reference paths | smoke/benchmark evidence for available deployments | cloud entitlement/quota can block individual models |
| Operations documentation | Defined | baseline implemented | this docs layer | production runbooks evolve with testnet/mainnet |
| Compatibility documentation | Defined | baseline implemented | this docs layer | no stable `TRUYN/1` compatibility promise yet |
| Mainnet | Defined conceptually | Not productionized | none | requires productionization + stabilization gates |

## Implemented security baseline

The current reference implementation enforces these core invariants:

1. provider access defaults to `owner-only` at the low-level provider policy and provider runtime;
2. unauthorized private providers are filtered before dispatch and checked again before adapter execution;
3. provider ownership is derived from authenticated/signed provider identity, not requester-controlled ownership metadata;
4. owner-funded and BYOK provider execution remain private by default;
5. public provider execution requires explicit opt-in and does not bypass billing policy;
6. local development mode hard-fails when combined with public/production relay markers;
7. oversized HTTP input closes the connection after 413;
8. origin proof is expiry-bound, supports active/previous rotation and is removed before forwarding inward;
9. protected provider M2M proof is transport-only and stripped before the inner relay;
10. sponsored mode cannot activate without an actor-bound signed entitlement verifier and a durable atomic usage store.

See `SECURITY.md`, `docs/security/`, `AUTHORIZATION_MODEL.md`, `BILLING_BOUNDARY.md` and `RELAY_SECURITY.md`.

## Evidence discipline

A claim is only promoted to a proven maturity when a durable public benchmark/security report exists or the repository CI contract is explicitly referenced. Temporary cloud workflows and Actions logs are operational mechanisms, not the durable evidence ledger.

`docs/benchmarks/` remains append-only. Sensitive fields are redacted; measured reports are not deleted as a security shortcut.

## Current priority

The primary architecture/engineering priority is **network productionization**, not additional semantic sophistication:

```text
bounded working decentralized primitives
        ↓
repeatable real multi-host testnet
        ↓
churn / crash / restart / partition / heal
        ↓
real NAT and relay-failure matrix
        ↓
100 real nodes
        ↓
1,000 real nodes
        ↓
Byzantine / Sybil / eclipse / collusion exercises
        ↓
stable operational and compatibility contracts
```

Until those gates are passed, TRUYN should be described as an advanced experimental/reference intelligence-network implementation, not a production mainnet.
