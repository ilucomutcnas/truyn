# TRUYN/1 Active Verification

**Status:** draft normative skeleton.

TRUYN supports active verification without adding three more envelope kinds.

## CHALLENGE

A requester creates a verification-oriented `NEED` referencing a claim and requesting specified evidence, independent observations or verifier capabilities.

## VERIFY

Eligible verifier nodes evaluate the claim/evidence and return signed `ATTEST` messages with verdict, confidence, domain and evidence/provenance references.

## DISPUTE

A contradictory `ATTEST` with a dispute verdict can trigger additional independent verification according to policy. A dispute is evidence against acceptance; it does not automatically prove the opposite claim.

## Completion

The trust engine aggregates available independent evidence and may issue a `TRUST_RECEIPT`. High-value/high-risk policies can require more independent roots, stronger credentials or remote-attestation evidence.

## Scale

A consumer MUST NOT be required to download millions of attestations. Aggregation, sampling, evidence commitments, pruning and compact receipts are permitted as long as the relying-party policy can audit/retrieve sufficient underlying evidence.
