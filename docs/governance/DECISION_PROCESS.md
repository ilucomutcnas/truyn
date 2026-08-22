# TRUYN Decision Process

This document operationalizes the decision classes in `GOVERNANCE.md`.

## Decision matrix

| Decision | Minimum process | Approval during bootstrap | Approval after TSC |
|---|---|---|---|
| Class A routine/non-normative | PR + responsible review | Maintainer/Founding Steward | Responsible Maintainer(s) |
| Class B compatible normative | RFC/issue + security/compatibility review | Founding Steward | TSC ordinary decision |
| Class C core/normative | Formal RFC + public review + decision record | Founding Steward | TSC ordinary decision with quorum |
| Class D breaking stable change | Formal RFC + explicit new generation/major boundary | Founding Steward | TSC supermajority where stable core is affected |
| Governance/stewardship | Governance RFC + public review | Founding Steward, recorded as bootstrap decision | Two-thirds supermajority of full active TSC |
| Official extension promotion | Extension review + evidence | Founding Steward | TSC ordinary decision |
| Core Candidate → Core | Class C/D RFC | Founding Steward | TSC under applicable Class C/D rule |

## Consensus first

Maintainers and the TSC should first seek a technically coherent consensus. “Consensus” does not mean unanimous enthusiasm. It means material objections have been heard, evidence considered and the chosen direction has a documented rationale.

Voting is used when a decision needs a crisp close or when consensus cannot be reached.

## Required review dimensions

Normative decisions must explicitly consider the relevant dimensions:

- protocol/wire compatibility;
- security and privacy;
- identity/Trustability/provenance;
- provider authorization and billing responsibility;
- settlement neutrality;
- interoperability/adapters;
- SDK/Agent Descriptor compatibility;
- operations/migration/deprecation;
- conformance/evidence.

A proposal cannot evade a relevant dimension by omitting it from the text.

## Quorum and voting

After a TSC exists:

- quorum = majority of active voting members;
- ordinary formal decision = simple majority of votes cast with quorum;
- governance/stewardship and breaking stable-core decisions = two-thirds supermajority of the full active voting TSC;
- abstention is not an affirmative vote;
- recusals for conflicts are recorded;
- a Chair coordinates but has no unilateral veto/override unless a future governance RFC explicitly defines a narrow procedural power.

## Organizational neutrality

For steady-state governance, voting-seat diversity is evaluated by actual organizational affiliation, not by number of GitHub accounts.

If three employees of the same company hold seats, they represent one organizational interest for neutrality analysis even if each has an individual vote under the current roster.

No single organization may hold a majority of voting seats when TRUYN claims G3 multi-organization governance.

## Conflict of interest

A decision-maker should disclose a material conflict when the proposal directly affects a commercial product, proprietary extension, employer-specific advantage, paid certification interest or other private interest beyond normal participation in the ecosystem.

Disclosure does not automatically require recusal. The remaining decision-makers determine whether recusal is appropriate. The public record should capture the disposition without requiring disclosure of confidential business information.

## Decision records

A formal decision record should include:

- proposal/RFC identifier;
- decision class;
- date;
- approving authority;
- participants and recusals where applicable;
- outcome;
- concise rationale;
- important objections/minority view;
- compatibility/security conditions;
- follow-up implementation/evidence work.

Decision records belong in the public repository or linked public issue/PR history.

## Security exception

An embargoed vulnerability may be handled privately and quickly under `SECURITY.md`. The security process may temporarily override normal disclosure timing, but not permanently erase the requirement to document material normative changes after safe disclosure.

## Inactivity and deadlock

A future TSC should define an active-member threshold and inactivity window through a governance RFC before G3 is claimed. Until then, the bootstrap steward must avoid inventing inactive seats merely to satisfy quorum or neutrality metrics.

If a multi-organization TSC later deadlocks on a non-emergency proposal, the status quo remains until consensus/evidence changes or the applicable voting threshold is reached. Deadlock is not permission for a vendor to ship a silent normative fork under the same stable identifier.
