# TRUYN Claim-Centric Trustability v1 — Verification and Resistance Evidence

Date: **2026-08-16**

Status: **PASS for the implemented v1 mechanics and resistance gates described below.**

This report is permanent benchmark evidence. It does not claim that TRUYN can mathematically prove arbitrary statements true. It proves the implemented distinction between retrieval integrity and claim evidence, signed `CLAIM` / `ATTEST` / `TRUST_RECEIPT` mechanics, provenance lineage grouping, conservative source-independence policy, and resistance to the specific correlated/Sybil/tampering cases in this workload.

## Why this gate exists

Semantic and distributed retrieval answer:

> Did TRUYN find and return the correct immutable context committed by a root CID?

They do not answer:

> Is the proposition contained in that context actually well-supported or true?

Claim-centric Trustability adds a separate verification layer:

```text
root CID
  -> distributed retrieval
  -> verified retrieval provenance
  -> CLAIM
  -> authorized verifier discovery
  -> signed ATTEST evidence
  -> provenance graph
  -> source-lineage independence analysis
  -> signed TRUST_RECEIPT
```

A valid receipt therefore keeps two independent facts visible:

```text
retrievalIntegrity.verified
truthAssessment.status
```

A system may legitimately return `retrievalIntegrity.verified = true` and `truthAssessment.status = disputed`.

## Evidence identity

Resistance benchmark:

- tested commit: **`adf7ad9a69eb44ca9285634ff001e54b49688689`**
- GitHub Actions run: **`31963721584`** — **SUCCESS**
- job: **`95205530183`** — **SUCCESS**
- artifact: **`truyn-claim-trustability-v1-31963721584`**
- artifact ID: **`9267907224`**
- artifact ZIP digest: **`sha256:01f53c8aeac7dd62f7bb01686d04ae1df52c889371dd1475769c2fc25ed32a22`**
- `claim-trustability-v1.json` SHA-256: **`087c53d0741eed644a7ecde30bcbbb45c404d41cc7c2051edf45b79ff5e49c61`**

The one-shot workflow used to create this artifact was removed from `main` after the artifact was finalized. The report and benchmark source remain permanent; Actions artifacts are temporary and may expire.

## Implemented production primitives under test

### Signed CLAIM

`core/claims/index.js` implements a content-addressed, Ed25519-signed claim object.

For a claim derived from distributed retrieval, the claim basis commits to:

- root CID;
- query hash;
- digest of the exact retrieval provenance;
- selected content commitments;
- selected holder-receipt digests.

The claim is therefore not merely text. It is bound to the retrieval evidence from which it was asserted.

### Signed ATTEST

An attestation is signed by a verifier node and bound to:

- one claim ID;
- verdict: `support`, `contradict`, or `uncertain`;
- evidence references;
- source lineage declarations;
- method;
- attester identity.

Changing the claim, verdict, evidence, lineage or verifier identity invalidates the attestation content ID/signature.

### Provenance graph

`core/provenance/index.js` constructs a graph containing committed `CLAIM`, `ATTEST` and `SOURCE` nodes with relationships including:

- `SUPPORTS`;
- `CONTRADICTS`;
- `EVALUATES`;
- `EVIDENCED_BY`;
- `DERIVED_FROM`;
- `DERIVED_FROM_ATTESTATION`.

Raw evidence source labels are represented by commitments in the public graph representation.

### Independence gate

The implemented v1 rule is intentionally conservative:

> Signature count is not source independence.

Attestations are collapsed into one evidence family when they share a declared origin, publisher, or generator lineage. Unknown-lineage attestations are also collapsed conservatively and receive no independent-known-source credit.

This means eight different verifier identities repeating one syndicated origin do not become eight independent sources, and ten fresh node keys with unknown lineage do not manufacture verification.

### Signed TRUST_RECEIPT

A receipt commits to:

- claim ID and claim digest;
- retrieval-integrity assessment;
- claim evidence status;
- evidence-family counts;
- policy used;
- provenance-graph digest;
- attestation commitments;
- receipt verifier identity and signature.

The v1 receipt deliberately reports `calibratedTruthProbability = null`. The system does not invent a numeric probability that a proposition is true merely because an evidence threshold was crossed.

## Network proof

The Trustability layer is not only a local scoring function.

`core/trust/network.js` and `node/trust-verification.js` implement domain-scoped verifier discovery using existing TRUYN signed `OFFER` / authorized `NEED` / signed `RESULT` routing.

Functional network tests proved:

1. three independent verifier nodes can be discovered through the relay;
2. all three return independently signed `ATTEST` objects;
3. two genuinely independent origins plus one duplicated-origin verifier collapse to two evidence families and satisfy the default v1 support policy;
4. three verifier identities sharing one source origin remain one evidence family and return `insufficient_independence`;
5. the coordinator verifies each attestation against the expected provider identity before creating the receipt;
6. source/origin labels are not returned in the public coordinator receipt result.

The network test commit `f9e0f17a941c3432faea3fc0a6d07a37878637e2` ran in CI `31963559513`. Both new network Trustability tests passed. At that moment the overall repository suite reported **164 pass / 1 fail** because a concurrently added unrelated `.github/workflows/tmp-live-origin-proof.yml` was rejected by the repository's public-workflow leakage guard. The Trustability tests themselves were green; this unrelated repository state is retained here rather than hidden.

Earlier core semantics CI `31963442773` similarly proved all eight new claim-level tests while the same unrelated temporary workflow caused the sole repository-level failure.

## Resistance benchmark workload

Benchmark source:

`benchmarks/claim-trustability-v1.js`

The run executes **600 deterministic cases**:

- **100 independent_support** cases;
- **100 correlated_echo** cases;
- **100 unknown_sybil** cases;
- **100 independent_dispute** cases;
- **100 independent_contradiction** cases;
- **100 retrieval_tamper** cases.

No external LLM/provider inference is used in this benchmark. It is a mechanics/resistance benchmark, not a factual-verification-quality benchmark.

Every case constructs a signed claim, signed attestation set, provenance graph, evidence assessment and signed trust receipt. Every receipt is then modified adversarially to test tamper detection.

## Primary measured result

| Gate | Measured result |
|---|---:|
| Total cases | **600** |
| Correct expected evidence-state classifications | **600 / 600** |
| Status accuracy | **100%** |
| Signature failures on valid receipts | **0** |
| Modified receipts incorrectly accepted | **0** |
| Raw source/lineage labels leaked in public receipt | **0** |
| Correlated echo incorrectly marked verified | **0 / 100** |
| Unknown-lineage Sybil set incorrectly marked verified | **0 / 100** |
| Independent disputes missed | **0 / 100** |
| Retrieval provenance tampering falsely accepted | **0 / 100** |
| All fixed gates | **PASS** |

## Per-scenario result

### Independent support

Workload:

- three signed attestations per claim;
- two independent origins;
- one extra attester repeats the first origin.

Measured:

- **100 / 100** expected `verified`;
- mean raw attestations: **3**;
- mean independent known groups: **2**.

This proves that the duplicate lineage does not increase the evidence-family count from two to three.

### Correlated echo

Workload:

- eight different attester identities;
- all eight trace to one shared origin;
- separate mirror/publisher labels.

Measured:

- **100 / 100** expected `insufficient_independence`;
- mean raw attestations: **8**;
- mean independent known groups: **1**;
- false `verified`: **0**.

This is the primary syndicated-copy/echo-resistance gate.

### Unknown-lineage Sybil

Workload:

- ten different attester identities;
- all ten support the claim;
- no known source lineage supplied.

Measured:

- **100 / 100** expected `insufficient_independence`;
- mean raw attestations: **10**;
- mean independent known groups: **0**;
- false `verified`: **0**.

This proves that simply minting additional node keys is insufficient to meet the default v1 independent-source gate.

It does **not** prove full Sybil resistance against attackers able to forge convincing lineage. Certified lineage is a later roadmap boundary.

### Independent dispute

Workload:

- one independent support origin;
- one independent contradiction origin.

Measured:

- **100 / 100** expected `disputed`;
- mean independent known groups: **2**;
- missed dispute: **0**.

A valid retrieval is therefore not promoted to trusted truth when independent evidence conflicts.

### Independent contradiction

Workload:

- two independent contradiction origins;
- no supporting origin.

Measured:

- **100 / 100** expected `contradicted`;
- mean independent known groups: **2**.

### Retrieval provenance tamper

Workload:

- claim is originally bound to valid retrieval provenance;
- two independent supporting attestations are present;
- the retrieval provenance object is then modified after claim creation.

Measured:

- **100 / 100** expected `retrieval_unverified`;
- false acceptance: **0**.

This is important because otherwise a valid evidence set could be silently rebound to different retrieval telemetry/context provenance.

## Local processing latency

For the deterministic in-process assessment + receipt creation workload on the hosted runner:

- p50: **9.145 ms**
- p95: **23.856 ms**
- p99: **25.404 ms**
- mean: **12.496 ms**

These values measure local cryptographic/provenance/evidence-processing mechanics. They are not WAN verifier-discovery latency and they do not include external model inference.

## What this proves

Within the implemented v1 policy, the measured evidence proves:

1. TRUYN can represent a proposition as a signed, content-bound claim rather than treating retrieved text as truth.
2. Independent verifier nodes can issue signed, claim-bound attestations.
3. A deterministic provenance graph can connect claims, attestations and source commitments.
4. Multiple signatures from one declared lineage do not multiply independent evidence.
5. Unknown-lineage Sybil identities do not receive independent-known-source credit.
6. Independent contradictory evidence causes a dispute rather than silent consensus.
7. Retrieval integrity remains distinct from claim evidence state.
8. Trust receipts are tamper evident.
9. Public receipt output can preserve evidence commitments without exposing raw source labels.
10. Node operational Trustability remains separate from claim-specific evidence Trustability.

## What this does NOT prove

This benchmark must not be cited as proof that TRUYN currently determines the factual truth of arbitrary real-world claims with 100% accuracy.

Specifically, it does not yet prove:

- factual verification accuracy against a labeled real-world truth dataset;
- that attester-declared origin/publisher/generator lineage is itself truthful;
- full Sybil or collusion resistance;
- source-owner cryptographic lineage certificates;
- active `CHALLENGE`, `VERIFY`, `DISPUTE` state-machine behavior;
- temporal freshness or revocation propagation;
- recursive claim-on-claim verification;
- calibrated domain-specific truth probabilities;
- global provenance-graph persistence/pruning at network scale;
- Byzantine quorum behavior among malicious verifier nodes;
- cross-region/network verifier latency;
- economic/cost performance of external verification providers.

Those are subsequent roadmap gates, especially the transition from **v0.2 Verify** to **v0.6 Resist & Scale Trust**.

## Evidence preservation

This file is append-only benchmark evidence under the repository evidence policy. If a future security review finds a sensitive field, redact only that field and retain the benchmark methodology, measured results, tested commit, run identity, artifact identity/digest, limitations and correction history.
