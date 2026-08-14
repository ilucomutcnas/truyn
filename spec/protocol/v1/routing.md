# TRUYN/1 Routing

**Status:** draft normative skeleton.

Routing/selection is capability- and policy-aware. A requester does not require prior knowledge of the provider's hostname/IP.

## Phase 1 — eligibility

Candidates that violate hard request constraints are removed. Hard constraints may include capability/schema compatibility, trust threshold, deadline feasibility, freshness, privacy/location restrictions, maximum cost and availability requirements.

## Phase 2 — ranking

Eligible candidates MAY be ranked with a local multi-objective utility function. One normalized example is:

```text
U = wt*T + wf*F + wa*A + wq*Q + wv*V
    − wl*L − wc*C − wr*R
```

where `T`=trustability, `F`=freshness, `A`=availability, `Q`=quality/history, `V`=value alignment/local utility, `L`=latency, `C`=cost and `R`=policy/risk penalty. Weights are relying-party policy, not global constants.

## Deadline, urgency and value

Deadline is a feasibility constraint when strict. Urgency/priority can influence queueing and route selection. Decision value can influence verification budget.

A requester MAY perform additional verification when expected value of information is positive:

```text
EVI ≈ E[decision utility after verification]
      − decision utility now
      − verification cost
```

TRUYN does not require a universal routing formula; it requires that constraints/evidence are machine-readable and local policy remains sovereign.
