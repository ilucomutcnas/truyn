# TRUYN/1 NEED

**Status:** draft normative skeleton.

`NEED` expresses an outcome, capability, state, object or verification requirement without requiring a predetermined host/provider.

A request MAY carry inline input and/or references to existing objects/state.

## Authorization boundary

A `NEED` is a request, not an authorization grant.

A requester MAY express provider preferences/selectors and cost/privacy constraints, but requester-controlled fields such as desired owner, tenant, billing mode or provider identity MUST NOT make an otherwise unauthorized provider eligible.

The implementation resolves authoritative requester identity/tenant and provider policy separately under `provider-policy.md` before dispatch.

## Hard constraints and decision context

The request policy can include:

- minimum trustability;
- maximum information age/freshness;
- maximum latency;
- maximum cost and currency/unit;
- absolute deadline;
- priority;
- urgency;
- decision value/value unit;
- domain;
- purpose;
- privacy/data-release requirements;
- compute-near-data preference;
- optional provider-selection preferences that apply only within the authorized provider set.

Unauthorized providers and providers/routes that violate hard constraints MUST be rejected before soft ranking.

Decision value is not a payment. It is the requester's declared value/risk context and can be used to justify additional verification or a higher-cost route within the authorized/eligible set.
