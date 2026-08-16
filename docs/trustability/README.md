# TRUYN Trustability

TRUYN keeps three trust questions distinct:

1. **Retrieval integrity** — did the network return the exact immutable context committed by the root CID?
2. **Claim evidence** — what independent signed evidence supports or contradicts a specific proposition?
3. **Node trust** — how reliable is a machine/provider operationally for routing and execution?

These signals may be composed by higher-level policy, but one must not silently substitute for another.

## Implemented

- [Claim-Centric Trustability v1](CLAIM_TRUSTABILITY_V1.md) — signed `CLAIM`, signed `ATTEST`, provenance graph, conservative source-lineage independence, network verifier discovery, evidence-state assessment, and signed `TRUST_RECEIPT`.
- [Active Trustability Lifecycle v2](ACTIVE_TRUST_LIFECYCLE_V2.md) — signed `CHALLENGE`, verifier-bound `VERIFY`, policy-authorized `DISPUTE`, cryptographically certified source-lineage commitments, freshness gates, issuer-authoritative revocation, and active evidence reassessment. The measured resistance record is [`TRUST_NETWORK_V2_2026-08-16.md`](../benchmarks/TRUST_NETWORK_V2_2026-08-16.md).

## Current roadmap boundary

The active v2 slice closes the first executable `CHALLENGE → VERIFY → DISPUTE` lifecycle and certified-lineage/freshness/revocation mechanics. It does **not** complete all v0.6 trust-resistance work. Remaining boundaries include global source-owner/delegate PKI or equivalent governance, durable transparency/revocation logs, recursive claim verification, domain calibration/history, WAN revocation propagation, open-network verifier economics, and stronger long-lived Sybil/collusion defenses.
