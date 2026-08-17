# TRUYN Kademlia / QUIC Trust Testnet Evidence — 2026-08-17

## Status

**PASS** for the bounded small-testnet gate implemented in this change set.

This report records the first repository CI run in which TRUYN exercised a real libp2p QUIC + Kademlia network path for decentralized verifier discovery and replicated trust lifecycle state under churn. It is intentionally narrower than a Byzantine/Sybil/collusion or 100/1,000-node claim.

## Evidence identity

- Repository: `inn-media/truyn`
- Tested branch: `feat/kademlia-quic-trust-v2`
- Tested commit SHA: `99368ac4e8b92b241a5d260e4bae10f1ba29b766`
- GitHub Actions workflow: `CI`
- Workflow run ID: `31994666291`
- Workflow run number: `702`
- Job ID: `95284089769`
- Runner OS: Ubuntu 24.04.4 LTS
- Runtime: Node.js `v22.23.2`
- Test command: `node --test tests/*.test.js`
- Suite result: **179 passed / 0 failed / 0 skipped / 0 cancelled**
- Total test duration reported by Node test runner: `28801.35685 ms`

The Actions run and repository history are the primary evidence sources. This file is the durable public ledger entry.

## Gate under test

The bounded gate required all of the following in one real network test:

1. four libp2p nodes using QUIC transport;
2. Kademlia protocol visibility across live peer links;
3. source-owner root certificate and delegated verifier authority;
4. durable signed transparency log with hash-chain state;
5. Kademlia advertisement and relay-free discovery of a remote transparency replica;
6. signed-log replication over a dedicated QUIC protocol stream;
7. decentralized verifier discovery from a DHT provider record;
8. Trust Receipt v2 issuance committing the current lifecycle head and revocation state;
9. bootstrap-node loss without loss of the surviving direct QUIC mesh;
10. Kademlia routing-table cleanup/refresh after disconnect;
11. surviving replica re-advertisement after churn;
12. a newcomer recovering the durable signed lifecycle state through `Kademlia -> provider -> QUIC PULL`;
13. verifier transport identity rotation while preserving the delegated TRUYN verifier identity;
14. stale DHT provider tolerance so a dead transport peer cannot consume the full discovery budget;
15. durable primary restart from the same on-disk log;
16. replicated revocation convergence to two remote acknowledgements;
17. stale Trust Receipt v2 rejection after lifecycle/revocation advancement;
18. revoked verifier exclusion from discovery;
19. zero relay calls in the churn gate.

## Measured stage evidence

The successful CI log emitted the following stage markers:

| Stage | Observed result |
|---|---:|
| topology ready | `nodes=4`, `quic=true`, `kadLinks=12` |
| initial replication converged | `sequence=2`, `acknowledgements=1` |
| verifier discovery verified | `discovered=1` |
| Trust Receipt v2 issued | `lifecycleSequence=2` |
| bootstrap removed | completed |
| Kademlia refreshed after bootstrap loss | routing sizes `2 / 2 / 2` on surviving peers |
| surviving replica re-advertised | completed |
| newcomer replica recovered | `sequence=2` |
| verifier rejoined after transport-ID rotation | `peerRotated=true` |
| revocation converged | `sequence=3`, `acknowledgements=2` |
| final gate | `relayCalls=0`, `receiptStaleAfterRevocation=true`, `revokedVerifierDiscoverable=false` |

The real churn subtest completed successfully in `17063.983314 ms`.

A separate focused regression test also proved the basic remote replica path before direct sync:

- Kademlia remote provider count: `1`
- synchronization direction: `push`
- synchronized sequence: `1`
- focused test duration: `1275.770984 ms`

## What this proves

Within the bounded topology exercised by this test, TRUYN now has a real network substrate for the trust lifecycle rather than only local protocol simulation:

- Kademlia is used for decentralized provider/verifier discovery;
- QUIC carries the TRUYN replication and verifier-record protocols;
- relay is not used by the tested decentralized trust path;
- source-owner authority is cryptographically delegated to the verifier identity;
- transparency/revocation state survives process/network churn through durable storage and remote replication;
- a new replica can recover from a surviving replica after the original bootstrap/primary node is gone;
- a verifier can rotate its libp2p transport identity and remain discoverable under the same delegated TRUYN identity;
- stale provider entries do not serially block discovery of the live replacement;
- Trust Receipt v2 is lifecycle-aware: advancing the log with a revocation makes the earlier receipt stale;
- revoked verifier authority is no longer accepted as discoverable trusted verifier state.

## Important non-claims

This report does **not** prove any of the following:

- Byzantine consensus for the transparency log;
- globally consistent total ordering across adversarial writers;
- Sybil resistance at network scale;
- collusion resistance among verifier/provider majorities;
- eclipse resistance;
- NAT traversal or public-internet reachability across heterogeneous networks;
- 100-node or 1,000-node real Kademlia/QUIC operation;
- production SLOs for latency, availability or recovery time;
- economic/token savings from this trust-network layer.

The replicated log in this gate provides durable signed history, replication, fork/equivocation detection semantics present in the implementation, and churn recovery. It must not be described as BFT consensus.

## Next gate

The next credible step is no longer another local protocol simulation. It is a larger real-node testnet with explicit adversarial exercises, including:

- 100 real network nodes, then 1,000;
- randomized join/leave churn and partial partitions;
- malicious provider records and stale-record floods;
- Byzantine log replicas and conflicting heads;
- Sybil identity pressure and eclipse attempts;
- verifier collusion scenarios;
- revocation storms and delegated-key rotation;
- measured convergence, routing success, bandwidth, latency and recovery distributions.

Only after those exercises should TRUYN make claims about large-scale Byzantine/Sybil/collusion resistance.
