# TRUYN Governance

TRUYN is intended to become an open, vendor-neutral technical standard and intelligence network. Open source code alone is not sufficient: the rules that change the protocol, official extensions, compatibility contracts and conformance requirements must also be public, reviewable and able to evolve beyond any single vendor.

## Current governance state

TRUYN is currently in **bootstrap governance**.

InnMedia is the **Founding Steward** and currently performs the project-level functions that a future multi-organization Technical Steering Committee (TSC) will perform. This is a factual description of the current state, not a claim of neutral governance and not a permanent ownership right over the standard.

The intended transition is:

```text
founding stewardship
        ↓
open maintainer model
        ↓
multi-organization TSC
        ↓
neutral legal stewardship
        ↓
stable ecosystem governance
```

TRUYN MUST NOT describe itself as neutrally governed until the corresponding organizational gates in `ROADMAP.md` and `docs/architecture/GOVERNANCE_ARCHITECTURE.md` have actually been met.

## Scope

Project governance applies to normative TRUYN protocol specifications, wire/schema compatibility, official extensions and bindings, Agent Descriptor compatibility, first-party SDK conformance, official interoperability profiles, conformance rules, release/stability/deprecation policy and project governance itself.

Governance does not give the project control over third-party products, private provider infrastructure, commercial pricing, cloud accounts or independently operated TRUYN networks.

Protocol governance is separate from implementation ownership, infrastructure ownership and commercial ownership.

## Principles

1. **Vendor neutrality by structure, not slogan.** The steady-state model must prevent one organization from permanently controlling normative decisions.
2. **Public technical record.** Normative decisions use public issues/RFCs/PRs and durable records except for time-bounded confidential security handling.
3. **Earned authority.** Maintainer/TSC authority follows sustained technical contribution, review quality, reliability and community trust, not employment status alone.
4. **Protocol stability.** Once a protocol generation is stable, incompatible behavior requires a new generation or explicit major boundary.
5. **Extension before core.** New ideas should begin outside the core whenever an extension, adapter or binding is sufficient.
6. **Security and compatibility are mandatory review dimensions.**
7. **Open participation.** Any person or organization may propose changes, create community extensions and participate in public review.
8. **No hidden normative channel.** Private discussion does not replace the public record for normative decisions.
9. **Conflict transparency.** Decision-makers disclose relevant conflicts and recuse where appropriate.
10. **No false maturity claims.** Defined governance is not the same as operating multi-vendor governance or neutral legal stewardship.

## Roles

### Contributor
Any participant who proposes, discusses, documents, tests, implements or reviews TRUYN work.

### Maintainer
A contributor trusted to review and merge changes within an assigned scope. Maintainer status is earned through sustained contribution and may be removed for prolonged inactivity, repeated policy violations, loss of trust or voluntary resignation. Maintainers cannot redefine normative protocol semantics outside the RFC/decision process.

### Subsystem Maintainer
A maintainer with primary review responsibility for a defined subsystem such as networking, protocol/spec, security, SDK/DX, interoperability, Trustability or operations.

### Technical Steering Committee (TSC)
The future TSC is the highest technical governance body for normative project decisions. It owns protocol/governance RFC decisions, official-extension promotion, stability/deprecation policy, cross-subsystem architecture conflicts, maintainer policy, conformance policy and stewardship-transition decisions.

During bootstrap, the Founding Steward performs these functions transparently under the published process wherever practical.

### TSC Chair
The TSC may elect a Chair for coordination, agendas and decision recording. The Chair cannot unilaterally override a valid TSC decision.

### Security Response Team
A small trusted group may privately coordinate vulnerability disclosure and embargoed fixes. Security confidentiality is an exception for disclosure timing, not a permanent bypass around governance. Permanent normative changes caused by an incident enter the public record after disclosure is safe.

## Maintainer admission and removal

A Maintainer candidate should demonstrate sustained high-quality contributions or reviews, understanding of TRUYN architecture and compatibility, responsible security behavior, constructive disagreement and independence from private vendor interests when acting for the project.

Before a multi-organization TSC exists, the Founding Steward may appoint maintainers and must record appointments in `MAINTAINERS.md`. After the TSC exists, admission/removal follows the normal decision process. Employment by a company is neither required nor sufficient.

## TSC composition target

The steady-state TSC must be multi-organization:

- at least three independent organizations or constituencies before claiming multi-organization governance;
- no single organization may hold a majority of voting seats;
- the project should move toward no organization holding more than one third of voting seats as the TSC grows;
- multiple employees of one organization do not create multiple independent interests for neutrality calculations;
- independent maintainers may hold seats;
- seat changes and affiliations are public.

## Decision classes

### Class A — routine/non-normative
Typos, tests, non-normative docs, compatible refactoring and bug fixes that do not redefine normative behavior. Normal PR review applies.

### Class B — compatible normative change
Additive or clarifying specification changes that preserve declared compatibility. Requires public RFC/issue, security/compatibility analysis and governance approval.

### Class C — core/normative architecture change
Changes to identity, wire semantics, trust/security model, authorization semantics, stable discovery behavior, conformance requirements or official core objects. Requires a formal RFC, public review and explicit decision record.

### Class D — breaking change
After a stable generation exists, an incompatible change requires a new protocol generation or explicit major compatibility boundary. It cannot ship as a silent change to a stable contract.

### Governance change
Changes to this governance contract, voting rules, TSC structure or neutral-stewardship commitments require a governance RFC and supermajority approval once a TSC exists.

## Voting, quorum and consensus

The project prefers rough consensus backed by technical evidence. When a formal TSC vote is required:

- quorum is a majority of active voting TSC members;
- ordinary decisions require a simple majority of votes cast with quorum;
- governance changes, breaking stable-core decisions and neutral-stewardship changes require at least a two-thirds supermajority of the full active voting TSC;
- abstentions are not affirmative votes;
- conflicted members should recuse;
- decisions and rationale are public.

During bootstrap there is no fictional multi-party vote: the Founding Steward records the decision explicitly as a bootstrap decision.

## RFC and extension processes

Normative changes follow `docs/governance/RFC_PROCESS.md`.

RFC states:

```text
Draft → Discussion → Accepted / Rejected / Withdrawn
                         ↓
                    Implemented
                         ↓
                    Superseded
```

Extensions follow `docs/governance/EXTENSIONS.md`:

```text
Community → Experimental → Official → Core Candidate → Core
```

A third party never needs permission to create a Community Extension in its own namespace. Use of an official `truyn.org` extension identifier or “Official TRUYN Extension” label requires project approval.

## Security emergency process

A credible security incident may require confidential or accelerated action. The Security Response Team may embargo details, prepare a bounded fix and temporarily disable vulnerable functionality. It may not use an emergency as a permanent mechanism to redefine stable normative semantics without later governance review. Material normative changes receive a public decision record after safe disclosure.

## Conflicts and appeals

Escalation path:

```text
maintainer discussion
        ↓
subsystem maintainers
        ↓
TSC / bootstrap steward
        ↓
recorded final project decision
```

A rejected proposal may be resubmitted when material new evidence or ecosystem requirements exist. Governance decisions do not prevent independent forks under Apache License 2.0.

## Neutral stewardship target

TRUYN intends to transition from founding stewardship to a neutral legal/stewardship structure suitable for an open technical standard. The eventual structure may involve a neutral foundation or another independent standards/open-source steward.

That future state may include stewardship of protocol/specification IP where applicable, project marks, official extension namespaces, a neutral charter, conformance programs and project infrastructure that must not remain vendor-controlled.

No document may claim that this transfer has happened before the legal and organizational facts exist.

## Governance maturity

| Stage | Meaning |
|---|---|
| **G0 — Founder governed** | Single-steward decisions; no complete public governance contract. |
| **G1 — Public governance defined** | Governance/RFC/extension/decision contracts are public; operational control may still be single-vendor bootstrap. |
| **G2 — Open maintainer model operating** | Multiple earned maintainers actively review/merge, including external maintainers. |
| **G3 — Multi-organization TSC** | 3+ independent constituencies, no single-vendor voting majority, public TSC decisions/minutes. |
| **G4 — Neutral legal stewardship** | Relevant protocol/mark/namespace stewardship is legally/organizationally neutral. |
| **G5 — Stable ecosystem governance** | Succession, appeals, release/deprecation authority and continuity are demonstrated in operation. |

Current status after adoption of this contract is **G1 defined, with bootstrap operations still transitioning from G0**. Independent maintainers, a multi-organization TSC and neutral legal stewardship are not yet facts.

See `ROADMAP.md`, `MAINTAINERS.md`, `docs/governance/` and `docs/architecture/GOVERNANCE_ARCHITECTURE.md`.
