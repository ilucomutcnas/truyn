# TRUYN Trust Network v2 — Decentralized Placement, Byzantine Read Quorum and Active Trustability

Status: **MEASURED PASS**

Date: 2026-08-16

This report is the permanent public evidence record for the first TRUYN slice that combines relay-independent placement discovery, Byzantine replica read quorum, Trustability-aware holder selection, and active `CHALLENGE → VERIFY → DISPUTE` evidence lifecycle with certified lineage, freshness and revocation.

The result is deliberately narrower than a claim of a production global DHT or mathematically proven truth. The benchmark proves protocol mechanics and resistance properties under the stated deterministic workload; separate functional tests exercise independent HTTP directory processes and networked verifier nodes.

## Evidence identity

- Tested commit SHA: `98405c5938c7d9c5dc6b98e328242d3e72a94158`
- Workflow run: `31965884312` — **SUCCESS**
- Job: `95210876511` — **SUCCESS**
- Artifact name: `truyn-trust-network-v2-31965884312`
- Artifact ID: `9268469980`
- Artifact ZIP digest: `sha256:b6a453ceb28baaf98d022318253fcd1eb81b417ff9c84727bc60f4dbf3f6c268`
- Raw benchmark JSON SHA-256: `c037a29e70345140764b8bf95bee74060add95f9acbcf33442edd1b3ad8017a5`
- Benchmark program: `benchmarks/trust-network-v2.js`
- Workload: 10 resistance scenarios × 100 cases = **1,000 cases**
- External paid-provider inference: **none**

GitHub Actions artifacts expire; this report is the durable evidence record. The raw artifact identifiers and cryptographic digests are retained so a surviving artifact or independently preserved copy can be matched to this result.

## Measured result

**1,000 / 1,000 cases passed — 100%.**

All fixed hard gates passed:

| Gate | Required | Measured |
|---|---:|---:|
| Protocol/resistance status accuracy | 100% | **100%** |
| Byzantine wrong candidate falsely accepted | 0 | **0** |
| Expired placement returned | 0 | **0** |
| Revoked placement returned | 0 | **0** |
| Fabricated/uncertified lineage falsely verified | 0 | **0** |
| Stale ATTEST remained active | 0 | **0** |
| Unauthorized revocation applied | 0 | **0** |
| Authorized revocation missed | 0 | **0** |
| Authorized DISPUTE missed | 0 | **0** |
| Tampered signed object accepted | 0 | **0** |
| Raw source identifiers leaked into benchmark result | 0 | **0** |

Overall protocol-mechanics latency across the 1,000 deterministic cases:

- p50: **9.476 ms**
- p95: **23.422 ms**
- p99: **24.689 ms**
- mean: **8.843 ms**

These numbers measure local protocol/signature/evidence mechanics. They are **not WAN latency** and are not model-inference latency.

## Scenario results

Every scenario passed 100/100.

| Scenario | Result | p50 | p95 | p99 |
|---|---:|---:|---:|---:|
| Federated signed placement agreement | 100/100 | 7.609 ms | 8.806 ms | 9.476 ms |
| Expired placement exclusion | 100/100 | 1.365 ms | 1.480 ms | 1.658 ms |
| Revoked placement exclusion | 100/100 | 7.276 ms | 8.181 ms | 9.085 ms |
| Highest-trust Byzantine replica rejection | 100/100 | 0.009 ms | 0.027 ms | 0.372 ms |
| Trustability-aware holder selection | 100/100 | 0.017 ms | 0.031 ms | 0.146 ms |
| Certified independent support | 100/100 | 12.469 ms | 13.601 ms | 16.440 ms |
| Fabricated lineage rejection | 100/100 | 9.598 ms | 10.901 ms | 12.006 ms |
| Stale ATTEST rejection | 100/100 | 10.091 ms | 11.374 ms | 13.046 ms |
| Issuer-authoritative revocation | 100/100 | 23.422 ms | 27.170 ms | 29.990 ms |
| Authorized DISPUTE + tamper resistance | 100/100 | 14.635 ms | 16.223 ms | 17.432 ms |

## Relay-independent placement discovery proof

The new placement path is separate from relay OFFER discovery.

A holder signs a `truyn-placement-v1` record containing the immutable root CID, holder identity, deterministic partition, expected block count, sequence, TTL and request capability. Records are assigned to multiple directory peers using deterministic rendezvous hashing. Directory peers gossip signed placement records and signed holder revocations; `FederatedPlacementResolver` accepts a placement only after configurable exact-record agreement across directory peers.

A separate functional CI test creates **four independent HTTP placement-directory servers** on different listening sockets, publishes a holder record to three responsible directories, resolves it through federation with minimum directory agreement two, then publishes a signed holder revocation and proves the placement disappears after anti-entropy convergence.

This demonstrates a real process/network service boundary for placement lookup rather than a single in-memory relay registry.

## Byzantine replica / quorum proof

The read path separates two gates:

1. a response quorum for every required deterministic partition;
2. a content quorum over the same immutable candidate CID from **distinct holder identities**.

Every candidate must first pass the existing root/partition/content/receipt/signature verification. Only cryptographically valid candidates are eligible to contribute to the CID quorum.

The functional Byzantine test uses:

- 2 deterministic root partitions;
- 3 replicas per partition;
- read quorum **2-of-3**;
- one malicious replica in the target partition;
- the malicious replica is deliberately assigned the **highest node trust score** and returns a different but correctly signed candidate;
- two honest replicas return the correct target CID.

Result: the malicious high-trust holder cannot override the immutable CID quorum. The two agreeing honest replicas form the accepted candidate quorum and the correct context is returned. The test also preserves the requester contract as exactly `question + root CID` and verifies no internal block ID is returned.

This is an **application-level Byzantine read quorum**. It is not Byzantine write consensus, PBFT, Raft or a proof that any arbitrary fraction of the Internet can be Byzantine.

## Trustability-aware holder selection

Holder routing preference currently combines:

- 65% node execution Trustability;
- 20% signed placement freshness;
- 15% directory agreement.

Replica selection first prefers distinct signed failure-domain commitments and then fills the bounded replica set by operational score.

This signal chooses where to ask first. It does **not** bypass content quorum and it is not treated as a probability that a holder is honest. The measured malicious-high-trust case is specifically designed to prove that ranking cannot substitute for quorum.

The current failure-domain commitment is holder-signed. It is not yet independently certified as a physical cloud/region/failure domain.

## Active `CHALLENGE → VERIFY → DISPUTE` network proof

The active Trustability layer adds signed objects:

- `CHALLENGE` — claim-bound request for active verification;
- `VERIFY` — verifier-signed binding between a challenge and the verifier's signed ATTEST;
- `DISPUTE` — signed lifecycle action that can reopen/contest evidence state when the disputer is authorized by policy;
- lineage certificates — source-key-signed commitments binding cited evidence sources to origin/publisher/generator lineage;
- revocations — issuer-authoritative revocation for claims, attestations and lineage certificates.

A functional network CI test starts **two independent verifier nodes** behind the existing TRUYN capability-routing transport. The coordinator discovers the authorized verifiers, sends one signed challenge to each, receives two independently signed ATTEST + VERIFY proofs, validates both signer identities and challenge bindings, then admits them through two distinct fresh lineage certificates. The resulting active assessment is `verified` with two independent known evidence groups.

The verifier execution test still uses the existing TRUYN relay as a message transport. **Placement discovery does not.** This distinction matters: the current slice removes the relay as the authoritative holder-placement directory; it does not yet remove every relay transport dependency from every TRUYN protocol operation.

## Certified lineage, freshness and revocation

Trustability v1 already collapsed correlated evidence into independence families. v2 strengthens admission: attester-declared lineage is no longer sufficient when certified-lineage policy is used.

For an ATTEST to be active:

- its signature must verify;
- the cited source must have a fresh valid lineage certificate;
- the declared origin/publisher/generator IDs used for independence must match commitments certified for that source;
- the ATTEST must be within the configured freshness window;
- neither the ATTEST nor its lineage certificate may be validly issuer-revoked.

The resistance workload proves that an attester cannot manufacture independence by inventing lineage strings, and that a stranger cannot deactivate another signer's evidence merely by producing a validly signed revocation object.

Raw source identifiers are not written into lineage certificates: equality/linkage uses SHA-256 commitments.

## DISPUTE authorization boundary

A valid cryptographic signature proves who signed a dispute; it does not automatically give that key authority to change claim state.

`assessActiveTrust()` applies active dispute state only for policy-authorized disputer identities. This avoids turning `DISPUTE` into a denial-of-trust primitive where arbitrary fresh keys can indefinitely force every claim into a disputed state.

The benchmark proves both authorized dispute application and tamper rejection.

## Relationship to Trustability v1

This result does not replace `CLAIM_TRUSTABILITY_V1_2026-08-16.md`.

Trustability v1 proved static claim-centric evidence aggregation, correlated-lineage collapse, unknown-lineage Sybil resistance, retrieval/provenance separation and signed `TRUST_RECEIPT` mechanics.

Trust Network v2 adds the missing lifecycle/network mechanics:

```text
root CID
  -> federated signed placement discovery
  -> Trustability-aware bounded replica set
  -> Byzantine CID read quorum
  -> minimal verified context
  -> CLAIM
  -> CHALLENGE
  -> independent ATTEST + VERIFY
  -> certified lineage + freshness
  -> active evidence assessment
  -> DISPUTE / revocation
  -> refreshed trust state
```

Retrieval integrity, claim trust and node trust remain three distinct axes.

## What this result does NOT prove

This benchmark must not be used to claim any of the following:

- a complete Internet-scale Kademlia implementation;
- million-node DHT routing or measured WAN churn convergence;
- global Sybil-resistant directory membership;
- Byzantine write consensus;
- tolerance of an arbitrary Byzantine majority;
- certified physical/cloud failure domains;
- globally authoritative source ownership PKI;
- transparency-log consistency for lineage certificates/revocations;
- revocation convergence time under real WAN partitions;
- QUIC/NAT traversal for the directory mesh;
- relay-free transport for every protocol operation;
- calibrated probability that a factual claim is true;
- mathematical proof of absolute truth;
- full v0.6 collusion/Sybil resistance.

A lineage certificate proves that a particular accepted key signed a source-lineage binding. Which keys are authoritative source owners/delegates is still a policy/PKI/governance problem for a later layer.

## Conclusion

The measured slice closes two architectural gaps left after Distributed Semantic Retrieval v1 and Claim-Centric Trustability v1:

1. holder placement can now be discovered through multiple independently reachable signed directory peers rather than one relay-owned registry;
2. retrieved context can participate in an active, challengeable evidence lifecycle whose independence claims require fresh certified lineage and whose state can be revoked or disputed under explicit authority rules.

The key safety property is that **Trustability ranking never replaces cryptographic quorum**. A malicious holder with the highest routing score still loses when it cannot obtain the configured distinct-holder immutable-CID quorum.
