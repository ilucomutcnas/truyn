# TRUYN Trustability

TRUYN keeps three trust questions distinct:

1. **Retrieval integrity** — did the network return the exact immutable context committed by the root CID?
2. **Claim evidence** — what independent signed evidence supports or contradicts a specific proposition?
3. **Node trust** — how reliable is a machine/provider operationally for routing and execution?

These signals may be composed by higher-level policy, but one must not silently substitute for another.

## Implemented

- [Claim-Centric Trustability v1](CLAIM_TRUSTABILITY_V1.md) — signed `CLAIM`, signed `ATTEST`, provenance graph, conservative source-lineage independence, network verifier discovery, evidence-state assessment, and signed `TRUST_RECEIPT`.

## Roadmap boundary

The implemented v1 mechanics are the first executable slice of roadmap Verify/Trustability. Full trust resistance still requires active `CHALLENGE` / `VERIFY` / `DISPUTE`, certified lineage, temporal revocation/freshness, recursive claim verification, domain calibration/history, and stronger Sybil/collusion defenses.
