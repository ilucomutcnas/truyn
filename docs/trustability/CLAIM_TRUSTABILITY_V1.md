# TRUYN Claim-Centric Trustability v1

Status: **implemented MVP primitive**

TRUYN retrieval provenance answers one question:

> Did the network return the exact immutable context that the root CID commits to?

Claim-centric Trustability answers a different question:

> What independent signed evidence supports or contradicts a proposition derived from that context?

These questions are deliberately not merged. A context block can be retrieved perfectly and still contain a false, stale, copied, disputed or malicious statement.

## Flow

```text
question + root CID
      |
      v
Distributed Semantic Retrieval
      |
      | verified immutable context + provenance
      v
CLAIM
      |
      v
verifier discovery -> authorized verifier nodes
      |
      v
signed ATTEST(s)
      |
      v
provenance graph + lineage/independence analysis
      |
      v
signed TRUST_RECEIPT
```

The implemented v1 path therefore becomes:

```text
root CID
  -> discovery
  -> authorized block holders
  -> minimal retrieval
  -> retrieval provenance
  -> CLAIM
  -> authorized verifier discovery
  -> independent ATTEST evidence
  -> provenance graph
  -> independence gate
  -> TRUST_RECEIPT
```

## CLAIM

`core/claims/index.js` implements a content-bound, Ed25519-signed `CLAIM` object.

A claim contains:

- domain;
- normalized proposition/statement;
- optional subject;
- optional qualifiers;
- optional evidence basis;
- issuer node identity and signature.

A claim derived from distributed retrieval is bound to:

- root CID;
- query hash;
- digest of the exact retrieval provenance;
- selected content commitments;
- selected holder-receipt digests.

The raw internal block IDs are not needed in the claim.

`claimId` is content-addressed. Signature verification also proves which TRUYN identity issued that claim instance.

## ATTEST

An `ATTEST` object is a signed evaluation of one claim by one verifier identity.

Verdicts in v1:

- `support`;
- `contradict`;
- `uncertain`.

An attestation may contain evidence references and signed lineage declarations:

- origin IDs;
- publisher IDs;
- generator IDs;
- parent attestation IDs;
- evidence source relationships.

The attestation ID is content-bound to both the evidence body and attester identity. Modifying the verdict, claim, evidence, lineage or identity invalidates verification.

## Provenance graph

`core/provenance/index.js` constructs a deterministic graph with:

- `CLAIM` nodes;
- `ATTEST` nodes;
- committed `SOURCE` nodes;
- `SUPPORTS` edges;
- `CONTRADICTS` edges;
- `EVALUATES` edges;
- `EVIDENCED_BY` edges;
- `DERIVED_FROM` and `DERIVED_FROM_ATTESTATION` lineage edges.

Raw source IDs are converted to commitments in the graph output. This allows the graph to preserve evidence relationships without requiring public disclosure of source labels.

## Independence is not signature count

The central rule is:

> multiple signed attestations are not multiple independent sources unless their provenance lineages are independent.

The v1 independence analyzer joins attestations into one evidence family whenever they share any declared:

- origin;
- publisher;
- generator.

This intentionally handles syndicated or copied evidence conservatively. Ten nodes repeating one wire story remain one evidence family.

Unknown-lineage attestations are also conservative: all unknown-lineage attestations collapse into one non-independent group and receive **zero independent-known-source credit**. Creating many new node keys therefore cannot by itself satisfy the default verification gate.

This is an MVP Sybil-resistance property, not a claim that lineage declarations are globally proven. Cryptographic lineage registries, challenge behavior and collusion resistance remain later Trustability work.

## Evidence policy

The default policy requires:

```text
minimum independent supporting groups = 2
maximum contradictory groups for VERIFIED = 0
known lineage required = true
```

The claim assessment can return:

- `verified` — independent support satisfies policy and there is no conflicting independent evidence above policy;
- `contradicted` — independent contradiction satisfies policy with no supporting group;
- `disputed` — independent support and contradiction conflict, or one lineage family is internally mixed;
- `insufficient_independence` — signatures exist but do not provide enough independent known evidence;
- `unsupported` — no attestations;
- `retrieval_unverified` — the claim's retrieval binding does not verify.

A `verified` status means **the evidence policy is satisfied**. It is not a mathematical proof that a proposition is absolutely true.

For that reason v1 deliberately reports:

```text
calibratedTruthProbability = null
```

It does not fabricate a probability of truth from a small number of attestations.

## Retrieval integrity and truth are separate fields

Every assessment and receipt keeps these separate:

```text
retrievalIntegrity.verified
truthAssessment.status
```

Example:

```text
retrievalIntegrity.verified = true
truthAssessment.status = disputed
```

is valid and expected. It means TRUYN found and cryptographically proved the requested immutable context, but independent evidence disagrees with the proposition derived from it.

## TRUST_RECEIPT

`core/trust/claim-verification.js` implements the signed `TRUST_RECEIPT`.

A receipt commits to:

- claim ID and claim digest;
- retrieval-integrity result;
- evidence-policy result;
- independent support/contradiction counts;
- provenance-graph digest;
- attestation commitments;
- policy used to make the assessment;
- verifier/coordinator identity;
- Ed25519 signature.

Any modification of the receipt payload invalidates the receipt ID/signature.

The public receipt contains commitments rather than raw evidence source identifiers.

## Network verification

`core/trust/network.js` and `node/trust-verification.js` implement network verifier discovery and execution on top of the existing TRUYN authorization boundary.

A claim verifier node publishes:

- a domain-specific discovery capability;
- a verifier-specific request capability;
- signed provider ownership/access metadata.

The coordinator:

1. discovers only verifier offers authorized for the requester;
2. sends the signed claim to selected verifier-specific capabilities;
3. receives signed `ATTEST` objects;
4. verifies each attestation cryptographically and binds it to the expected verifier node;
5. builds the provenance graph;
6. calculates evidence-family independence;
7. signs one `TRUST_RECEIPT`.

Authorization-aware discovery and provider routing therefore remain in front of verification execution.

## Relationship to node Trustability

Existing `trustabilityLite()` is retained unchanged as a node-level runtime/routing signal based on identity, execution history, recency and coarse attestation count.

It does **not** determine whether a specific proposition is true.

Claim-centric Trustability and node-level Trustability are orthogonal:

```text
node trust       = how much should I rely on this machine/provider operationally?
claim trust      = what independent evidence supports this proposition?
retrieval trust  = did I receive the exact committed context?
```

Later routing may use all three, but they must remain distinguishable in receipts and telemetry.

## Security properties implemented in v1

- claim and attestation tampering is detectable;
- verifier identity is cryptographically bound to each attestation;
- trust receipts are verifier-signed and tamper evident;
- retrieval provenance cannot be silently swapped after claim creation;
- multiple node identities sharing one declared lineage do not multiply independent evidence;
- unknown lineage cannot satisfy the default independent-source requirement;
- public provenance graph / trust receipt do not need raw source IDs;
- network verifier discovery remains subject to existing TRUYN authorization filtering.

## Explicit limitations / next Trustability boundary

This implementation does **not** yet claim full v0.6 trust resistance.

Still required:

1. `CHALLENGE`, active `VERIFY`, and `DISPUTE` lifecycle/state transitions;
2. independently verifiable lineage claims rather than attester-declared lineage alone;
3. source-owner signatures and source/object lineage certificates;
4. domain-scoped verifier history and calibration;
5. temporal freshness/revocation of claims and attestations;
6. recursive claim-on-claim verification;
7. Sybil/collusion resistance beyond conservative lineage grouping;
8. evidence weighting by direct observation vs derived copy without turning node reputation into truth;
9. scalable provenance-graph storage/pruning and revocation propagation;
10. calibrated empirical probabilities only after a labeled benchmark supports such calibration.

Those items correspond directly to the roadmap distinction between **v0.2 Verify** and **v0.6 Resist & Scale Trust**.
