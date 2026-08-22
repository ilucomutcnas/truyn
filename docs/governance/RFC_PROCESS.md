# TRUYN RFC Process

Normative protocol, governance, official-extension, stable compatibility and conformance changes use a public RFC process.

## When an RFC is required

An RFC is required for:

- new or changed normative TRUYN protocol semantics;
- additions/removals of stable wire fields or core objects;
- changes to identity, Trustability, authorization, settlement neutrality or stable discovery semantics;
- official extension promotion;
- breaking compatibility changes;
- stable SDK/Agent Descriptor conformance changes;
- governance/TSC/voting/stewardship changes;
- project-wide compatibility/deprecation policy.

Routine implementation work that preserves existing normative behavior does not need an RFC.

## RFC states

```text
Draft
  ↓
Discussion
  ↓
Accepted ─────────→ Implemented ─────────→ Superseded
  │
  ├───────────────→ Rejected
  └───────────────→ Withdrawn
```

`Accepted` means the project approved the direction. It does not mean the implementation exists or is proven.

## Required RFC sections

A normative RFC should contain:

1. Summary
2. Motivation / problem statement
3. Scope and non-goals
4. Proposed specification or governance rule
5. Compatibility and versioning impact
6. Security and privacy impact
7. Trust/authorization/billing/settlement impact where relevant
8. SDK / interoperability impact where relevant
9. Operational/deployment impact
10. Alternatives considered
11. Migration/deprecation plan
12. Reference implementation plan
13. Conformance/evidence plan
14. Unresolved questions

Missing sections may be marked not applicable with rationale; they should not silently disappear.

## Review periods

Normal minimum public discussion targets:

- Class B compatible normative change: **7 calendar days**;
- Class C core/normative change: **14 calendar days**;
- Class D breaking stable change: **14 calendar days** plus explicit migration/version boundary;
- governance/stewardship change: **14 calendar days**.

A review may remain open longer when substantial disagreement or unresolved evidence exists.

A security emergency may shorten or embargo the review. The reason must be recorded after safe disclosure, and permanent normative changes still require subsequent governance review.

## Sponsorship

During bootstrap, a protocol/subsystem Maintainer or the Founding Steward sponsors an RFC into formal Discussion. After a TSC exists, sponsorship may come from the responsible Maintainer or a TSC member.

Sponsorship means the proposal is worth formal review. It is not approval.

## Decision

The applicable decision class and voting rule are defined by `GOVERNANCE.md` and `DECISION_PROCESS.md`.

An accepted RFC should record:

- final decision;
- approving authority;
- date;
- material objections and how they were resolved or consciously accepted;
- compatibility/security conditions;
- implementation/conformance follow-up.

During bootstrap the record explicitly says **Founding Steward decision** rather than inventing a TSC vote.

## Implementation and conformance

Normative specification changes and implementation changes should be separable in review where practical.

No RFC becomes a proven maturity claim until the corresponding implementation and conformance/evidence gates exist. `docs/architecture/IMPLEMENTATION_STATUS.md` remains authoritative for factual maturity.

## Rejected and superseded RFCs

Rejected RFCs remain useful history. They should not be deleted merely because the outcome was negative.

A later RFC may supersede an earlier one and should link the previous decision and explain the changed evidence or requirements.
