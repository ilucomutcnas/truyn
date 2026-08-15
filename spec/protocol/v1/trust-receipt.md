# TRUYN/1 TRUST_RECEIPT

**Status:** draft normative skeleton.

A `TRUST_RECEIPT` is a compact signed summary of a trust evaluation under a named policy.

It can contain:

- receipt ID and claim ID;
- requester/relying-party context;
- domain and purpose;
- policy ID;
- Trust Vector and optional composite score;
- raw support/dispute counts;
- independent-lineage support count;
- evidence/provenance commitment or root digest;
- generation/expiry time;
- verifier/trust-engine identity and signature.

A receipt is not eternal truth. It is a time- and policy-bounded evaluation. New evidence, revocation, expiry or policy changes can require reevaluation.

Receipts enable verification at scale without sending every raw attestation to every consumer.
