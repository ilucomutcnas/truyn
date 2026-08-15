# TRUYN/1 Routing

**Status:** draft normative target. The current MVP does not yet implement the full provider-authorization pipeline described here.

Routing/selection is capability-, authorization- and policy-aware. A requester does not require prior knowledge of the provider's hostname/IP, but it also does not gain permission to use every provider matching a capability.

## Phase 0 — requester/provider authorization

Before ranking, the implementation resolves:

```text
requester authenticated identity / tenant
provider ownership / tenant / visibility
explicit grants or entitlement
billing responsibility
mandatory quota policy
```

Candidates that cannot be authorized are removed before routing utility is evaluated.

Authorization-sensitive attributes MUST come from authenticated context or trusted provisioning state rather than requester-controlled ownership claims.

## Phase 1 — eligibility constraints

Among authorized providers, candidates that violate hard request constraints are removed. Hard constraints may include capability/schema compatibility, trust threshold, deadline feasibility, freshness, privacy/location restrictions, maximum cost and availability requirements.

## Phase 2 — ranking

Eligible candidates MAY be ranked with a local multi-objective utility function. One normalized example is:

```text
U = wt*T + wf*F + wa*A + wq*Q + wv*V
    − wl*L − wc*C − wr*R
```

where `T`=trustability, `F`=freshness, `A`=availability, `Q`=quality/history, `V`=value alignment/local utility, `L`=latency, `C`=cost and `R`=policy/risk penalty. Weights are relying-party policy, not global constants.

A high `U` score never makes an unauthorized provider eligible.

## Billing and quota

For a chargeable provider, billing responsibility and required entitlement/quota checks occur before dispatch. If they cannot be resolved, execution fails closed.

BYOK providers normally attribute cost to the requester/provider owner. Owner-funded cross-owner execution requires explicit policy.

## Deadline, urgency and value

Deadline is a feasibility constraint when strict. Urgency/priority can influence queueing and route selection. Decision value can influence verification budget.

A requester MAY perform additional verification when expected value of information is positive:

```text
EVI ≈ E[decision utility after verification]
      − decision utility now
      − verification cost
```

TRUYN does not require a universal ranking formula; it requires that constraints/evidence are machine-readable, provider authorization is enforced before dispatch, and local policy remains sovereign.
