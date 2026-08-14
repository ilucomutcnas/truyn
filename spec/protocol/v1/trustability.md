# TRUYN/1 Trustability

**Status:** draft normative skeleton.

Trustability is claim-centric and contextual. It MUST NOT be represented as one permanent universal score for a node.

Conceptually:

```text
T = Trust(claim, requester, purpose, domain, time, policy)
```

A Trust Vector may contain normalized dimensions in `[0,1]`:

- identity confidence;
- integrity/attestation confidence;
- historical accuracy **in the relevant domain**;
- provenance quality;
- evidence quality;
- consensus support;
- source/lineage independence;
- freshness;
- Sybil/admission confidence;
- anomaly confidence.

A local policy MAY combine dimensions into a score. Weights are not globally fixed.

## Domain scope

A node can be highly reliable for one domain/capability and unknown for another. Reputation/history stores MUST therefore support domain/capability partitioning. Request purpose and relying party may change acceptance thresholds even for the same claim.

## Aggregation

Raw attestation count is not equivalent to independent evidence count. Lineage/provenance analysis SHOULD collapse correlated descendants before consensus weighting.

For scale, a verifier/trust engine MAY issue a signed `TRUST_RECEIPT` that commits to the policy, aggregated vector/score, support/dispute counts, independence count, evidence root/commitment and expiry. Consumers MAY request raw evidence when required.

## Freshness and revocation

Trust assessments expire. New contradictory evidence, revocation, key compromise or changed source history can invalidate an earlier receipt.
