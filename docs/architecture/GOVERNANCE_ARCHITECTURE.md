# TRUYN Governance Architecture

**Status:** Defined architecture / bootstrap governance operating state.

TRUYN governance is part of the architecture of the standard because it defines **how normative architecture is allowed to change**.

A protocol that is technically vendor-neutral but permanently controlled by one vendor is not fully vendor-neutral as a standard. TRUYN therefore treats governance maturity as a first-class pre-stability dimension alongside network productionization, security, compatibility, interoperability and developer experience.

## Architectural separation

TRUYN separates four authority domains:

```text
TRUYN protocol/specification
        ↓
public technical governance

reference implementation/repository
        ↓
repository maintainers

TRUYN-operated infrastructure
        ↓
actual infrastructure operators

commercial products/services
        ↓
their respective companies
```

Ownership or operation in one domain MUST NOT silently create permanent authority in another.

Examples:

- operating a public relay does not grant protocol voting rights;
- funding development does not grant permanent control of the standard;
- being a Maintainer does not allow bypassing normative RFC requirements;
- owning a commercial TRUYN-compatible product does not grant control over official conformance semantics;
- the protocol governance body does not gain rights over third-party cloud accounts or provider credentials.

## Source-of-truth boundary

Governance authority is split across:

| Concern | Source of truth |
|---|---|
| Governance principles, roles, TSC target, maturity | `GOVERNANCE.md` |
| Factual current role roster | `MAINTAINERS.md` |
| Normative proposal lifecycle | `docs/governance/RFC_PROCESS.md` |
| Extension lifecycle and official namespace | `docs/governance/EXTENSIONS.md` |
| Decision classes, quorum, conflicts, records | `docs/governance/DECISION_PROCESS.md` |
| Implementation sequence | `ROADMAP.md` Governance & Standardization Gate |
| Factual current maturity | `docs/architecture/IMPLEMENTATION_STATUS.md` |

Protocol semantics remain owned by `spec/`. Governance controls the process for changing those semantics; it does not replace the specification.

## Bootstrap state

Current factual state:

```text
Founding Steward: InnMedia
Public governance contract: defined
Independent maintainer model: not yet operating
Multi-organization TSC: not yet constituted
Neutral legal stewardship: not yet established
```

This is **G1 defined governance with bootstrap operations still transitioning from G0**.

The project MUST NOT convert this documentation into a false claim that neutral governance already exists.

## Steady-state architecture

Target:

```text
contributors
     ↓
earned maintainers / subsystem maintainers
     ↓
multi-organization TSC
     ↓
public RFC + extension + decision records
     ↓
neutral legal/stewardship layer
```

At G3:

- at least three independent organizations/constituencies participate;
- no single organization has a voting majority;
- decisions and affiliations are public;
- routine implementation authority remains delegated to Maintainers rather than centralized in the TSC.

At G4, appropriate project IP/marks/official namespace stewardship moves to a legally/organizationally neutral home. The exact vehicle is a future organizational decision; architecture does not pretend that a foundation already exists.

## Extension-first standard evolution

TRUYN core is intentionally conservative.

```text
new idea
   ↓
can it live outside core?
   ├── yes → Community/Experimental extension
   │           ↓
   │        Official
   │           ↓
   │      Core Candidate only with evidence
   │
   └── no  → normative core RFC
```

This boundary protects the protocol from becoming a collection of vendor integrations.

External standards such as A2A, MCP, x402 or AP2 remain independently versioned adapter/extension concerns unless a future core RFC demonstrates a universal network-level need.

## Governance and protocol stability

A stable protocol identifier must mean that normative behavior cannot be silently changed by repository ownership.

Therefore:

- pre-stable TRUYN/1 may evolve under the published RFC process;
- after a generation is declared stable, incompatible changes require a new generation/major boundary;
- governance itself cannot waive compatibility rules through an undocumented decision;
- emergency security work may accelerate disclosure/patching but permanent normative changes receive post-embargo governance review.

## Governance and conformance

Official conformance is also governed, not vendor-defined ad hoc.

Stable conformance profiles should specify:

- required core semantics;
- optional/required Official Extensions;
- version compatibility;
- security/privacy invariants;
- SDK/Agent Descriptor behavior where applicable;
- test fixtures and evidence requirements.

A commercial certification product may exist independently, but it cannot redefine the normative meaning of “TRUYN-conformant” without project governance approval.

## Governance and security

Public governance must not force publication of secrets or active vulnerability details.

The security boundary is:

```text
normal normative change → public process
embargoed vulnerability → private bounded response
                         → safe disclosure
                         → public durable record for material normative change
```

Security review can delay disclosure; it cannot create a hidden permanent standards channel.

## Governance maturity model

| Stage | Architecture requirement |
|---|---|
| G0 | Single-steward operation; governance incomplete. |
| G1 | Public governance, RFC, extension and decision contracts defined. |
| G2 | Earned maintainer model demonstrably operating with external maintainers. |
| G3 | Multi-organization TSC with no single-vendor majority and public decisions. |
| G4 | Neutral legal/stewardship home for the standard/marks/namespaces as applicable. |
| G5 | Succession, appeals, deprecation/release authority and continuity demonstrated in operation. |

Governance maturity is factual. Markdown alone can close G1, but cannot close G2-G5.

## Pre-v1 stability rule

Stable TRUYN v1 MUST NOT be presented as a mature vendor-neutral standard solely because the code/specification is open.

Before a strong vendor-neutral governance claim, the project should reach at least G3. Before claiming neutral legal stewardship, it must reach G4.

Network/security/SDK/interoperability gates and governance gates are independent dimensions: passing one does not implicitly pass another.

## Roadmap ownership

The Governance & Standardization Gate in `ROADMAP.md` is the implementation plan for this architecture:

- GOV-0 — public governance contract;
- GOV-1 — RFC + extension framework;
- GOV-2 — open maintainer model;
- GOV-3 — multi-organization TSC;
- GOV-4 — neutral stewardship;
- GOV-5 — stable ecosystem governance.

GOV-0/GOV-1 are documentation/process work and can be completed immediately. GOV-2 through GOV-5 require real organizational evidence and cannot be closed by text alone.
