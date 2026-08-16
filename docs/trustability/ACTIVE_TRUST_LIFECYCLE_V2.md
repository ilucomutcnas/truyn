# TRUYN Active Trustability Lifecycle v2

Status: **implemented protocol primitive; deterministic resistance benchmark pending**

Claim-Centric Trustability v1 separated retrieval integrity from claim truth assessment. Active Trustability v2 adds lifecycle state around that assessment:

```text
CLAIM
  -> CHALLENGE
  -> VERIFY / ATTEST
  -> certified lineage + freshness checks
  -> active evidence assessment
  -> DISPUTE when authorized counter-evidence exists
  -> revocation / expiry propagation
  -> refreshed TRUST_RECEIPT
```

The objective is not to manufacture a numerical probability of truth. It is to make the evidence state actively challengeable, refreshable and revocable while preserving cryptographic accountability.

## 1. New signed objects

`core/trust/lifecycle.js` defines the following versioned objects.

### `CHALLENGE`

A challenger signs:

- claim ID;
- domain;
- requested verification methods;
- challenge reason;
- optional deadline;
- creation time.

A challenge therefore cannot be silently redirected to a different claim.

### `VERIFY`

A verifier signs the relationship between:

- challenge ID;
- claim ID;
- attestation ID;
- attestation verdict.

The verification signer must be the same cryptographic identity that signed the referenced ATTEST. A coordinator cannot re-sign another verifier's evidence as if it originated from the coordinator.

### `DISPUTE`

A disputer signs:

- claim ID;
- targeted attestation IDs;
- digest of the dispute grounds;
- optional counter-evidence commitments.

Signature validity alone is deliberately insufficient to change claim state. `assessActiveTrust()` accepts a policy-controlled set of authorized disputer identities. This prevents arbitrary new keys from creating a denial-of-trust attack by flooding validly signed disputes.

## 2. Cryptographically certified source lineage

Trustability v1 accepted lineage declarations inside signed attestations. That proves what an attester declared, but not that the lineage declaration was independently bound to the cited source.

Active v2 introduces `truyn-lineage-cert-v1`.

A lineage certificate is signed by a source-owner/delegated source key and binds:

- a commitment to the evidence `sourceId`;
- origin commitments;
- publisher commitments;
- generator commitments;
- optional parent certificate IDs;
- issuance and expiry times.

Raw source IDs are converted to SHA-256 commitments before they enter the certificate. The certificate therefore provides equality/linkage proofs without requiring the public graph to reveal the original source identifier.

Before an attestation is admitted to active claim assessment:

1. the ATTEST signature must be valid;
2. its cited evidence source must have a fresh valid lineage certificate;
3. every declared origin/publisher/generator ID used for independence must match a commitment certified for that evidence source;
4. a revoked certificate is rejected.

An attester therefore cannot gain additional independence merely by inventing new lineage strings in its own signed ATTEST.

## 3. Important authority boundary

Cryptographic certification answers:

> Which key signed this source-lineage binding, and has the object been modified?

It does **not yet** answer globally:

> Who has universal authority to declare the owner of every source on the Internet?

The current primitive assumes the caller/network policy has already accepted a source-owner or delegated source key. A global source-owner PKI, DNS/WebPKI binding, DID method, transparency log or other governance mechanism is a separate future layer.

This distinction is mandatory. TRUYN must not call an arbitrary self-signed lineage certificate globally authoritative merely because its signature is valid.

## 4. Freshness

Active assessment rejects evidence that falls outside the configured freshness window.

Current gates include:

- placement record expiry in decentralized discovery;
- lineage certificate expiry;
- maximum ATTEST age;
- bounded future clock skew.

The default maximum ATTEST age in the library is 24 hours, but applications should set domain-specific policy. A stable mathematical fact and a live market price should not use the same freshness window.

Freshness is evidence validity state, not a statement about semantic truth.

## 5. Revocation

`truyn-trust-revoke-v1` supports revocation targets:

- claim;
- attestation;
- lineage certificate;
- verification.

A revocation is cryptographically signed, but authority is issuer-bound:

- only the claim issuer can revoke that claim in the default evaluator;
- only the attestation signer can revoke its attestation;
- only the lineage-certificate owner can revoke its certificate.

A stranger may produce a structurally valid signed revocation object, but it has no authority over another issuer's object and therefore does not deactivate it.

This prevents revocation from becoming a trivial denial-of-service primitive.

## 6. Active assessment

`assessActiveTrust()` evaluates the current evidence state in this order:

1. verify CLAIM;
2. apply issuer-authoritative claim revocation;
3. validate and freshness-check lineage certificates;
4. validate ATTEST signatures;
5. remove issuer-revoked attestations;
6. remove stale/future-invalid attestations;
7. require declared lineage to match certified source lineage;
8. feed only active certified attestations into the existing independence/provenance assessment;
9. apply authorized signed disputes;
10. return explicit lifecycle state.

Possible additional lifecycle states include:

- `revoked`;
- `stale_or_uncertified`;
- `disputed`.

Existing claim states such as `verified`, `contradicted`, `insufficient_independence`, `unsupported` and `retrieval_unverified` remain available from the underlying claim assessment.

## 7. CHALLENGE → VERIFY → DISPUTE network semantics

The objects are transport-neutral. A verifier can receive a CHALLENGE through TRUYN capability routing, perform an independent verification behavior, emit its normal signed ATTEST, then emit VERIFY binding that ATTEST to the challenge.

A DISPUTE is not the same as an ATTEST verdict of `contradict`:

- `ATTEST(contradict)` is evidence about the claim;
- `DISPUTE` is a signed lifecycle action requesting that a claim/evidence state be actively reopened or contested.

A robust network may use both simultaneously.

## 8. Relationship to TRUST_RECEIPT

`TRUST_RECEIPT` remains the signed snapshot of a claim assessment.

Active lifecycle state means receipts are no longer conceptually permanent truth labels. A receipt must be interpreted against:

- receipt issuance time;
- evidence freshness policy;
- current revocation state;
- subsequent challenges/verifications/disputes.

A future receipt version can directly commit the active lifecycle head/revocation set. Until then, the active evaluator and existing receipt primitive remain separate explicit layers rather than silently changing the v1 receipt format.

## 9. Security invariants

- Retrieval integrity and claim truth remain separate.
- A valid signature proves authorship/integrity, not truth.
- Multiple node keys do not automatically imply independent source lineage.
- Attester-declared lineage is insufficient when certified-lineage policy is enabled.
- Expired evidence cannot silently remain active.
- A signed revocation is ignored unless its signer has authority over the target object.
- A signed DISPUTE is ignored for state transition unless the policy authorizes that disputer.
- No calibrated truth probability is invented.

## 10. Explicit non-claims / next layer

This implementation does not yet prove:

- global source ownership PKI/governance;
- transparency-log consistency for certificates/revocations;
- revocation dissemination latency under WAN partitions;
- challenge scheduling across an open public network;
- economic incentives for independent verification;
- adversarial collusion detection across long-lived domains;
- calibrated factual truth probability;
- full v0.6 Sybil/collusion resistance.

The next testnet layer should combine these signed lifecycle objects with decentralized verifier discovery, durable append-only transparency state and multi-region revocation propagation.
