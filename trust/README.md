# Trustability

TRUYN Trustability is claim-centric, domain-scoped, policy-dependent and continuously revisable.

Implementation ownership:

- `engine/` — orchestration of trust evaluation.
- `scoring/` — vector/score calculations; no globally fixed weights.
- `provenance/` — claim/evidence lineage graph.
- `independence/` — collapse correlated sources and estimate independent roots.
- `domains/` — domain/capability-specific history and expertise context.
- `reputation/` — historical outcome tracking.
- `aggregation/` — scalable attestation aggregation/sampling/commitments.
- `receipts/` — signed compact Trust Receipts.
- `sybil/` — Sybil/collusion defenses and admission signals.
- `anomaly/` — behavioral/outlier signals.
- `policies/` — relying-party acceptance/verification policies.

Canonical evaluation context:

```text
Trust(claim, requester, purpose, domain, time, policy)
```

Raw vote count is never sufficient evidence by itself. One upstream source repeated by a million descendants remains one lineage unless independent evidence exists.
