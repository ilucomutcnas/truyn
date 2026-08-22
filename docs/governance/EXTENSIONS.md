# TRUYN Extension Governance

TRUYN keeps the core protocol deliberately small. New functionality should normally prove itself as an extension, adapter or binding before it can become part of the core standard.

## Lifecycle

```text
Community Extension
        ↓
Experimental TRUYN Extension
        ↓
Official TRUYN Extension
        ↓
Core Candidate
        ↓
Core TRUYN (separate normative RFC)
```

Promotion is not automatic. An extension may remain healthy and useful indefinitely without becoming core.

## Tier 0 — Community Extension

Any person or organization may create a Community Extension without project permission.

Requirements:

- use a namespace/identifier controlled by the extension author, not an official `truyn.org` namespace;
- do not imply endorsement or official conformance;
- document required TRUYN protocol generation and interoperability assumptions;
- obey applicable licenses for any reused TRUYN code/spec text.

Community experimentation is intentionally open.

## Tier 1 — Experimental TRUYN Extension

An Experimental extension is accepted into the TRUYN project incubation surface for broader testing.

Requirements:

- a Maintainer/Founding Steward sponsor;
- public problem statement and draft specification;
- explicit `EXPERIMENTAL` status;
- versioned identifier;
- security/privacy/compatibility notes;
- no requirement that conforming TRUYN nodes implement it;
- breaking changes are allowed while experimental, with versioning/documentation.

Target official identifier form:

```text
https://truyn.org/extensions/experimental/<name>/vN
```

The project may change the exact URI layout before stable-v1 governance/namespace freeze, but only governance may allocate identifiers under the official project namespace.

## Tier 2 — Official TRUYN Extension

An Official extension is a supported ecosystem standard outside the mandatory TRUYN core.

Promotion requires:

- complete specification;
- Apache-2.0-compatible reference material/implementation where project-hosted;
- stable versioned identifier;
- defined compatibility and deprecation contract;
- threat/security/privacy analysis;
- reference implementation or executable interoperability proof;
- conformance tests/fixtures;
- SDK/interoperability impact documented;
- named maintainership commitment;
- demonstrated real ecosystem use or credible multi-party demand;
- governance approval.

Target identifier form:

```text
https://truyn.org/extensions/<name>/vN
```

An Official extension remains optional unless a separate conformance profile explicitly requires it.

## Tier 3 — Core Candidate

Core Candidate is reserved for an Official extension that has accumulated evidence that the concept is broadly fundamental to TRUYN rather than an ecosystem-specific feature.

Minimum expectations:

- sustained production/testnet use;
- mature security and compatibility record;
- stable conformance tests;
- more than one independent adopter/operator;
- preferably more than one independent implementation;
- clear evidence that keeping the feature optional creates material ecosystem fragmentation or inefficiency;
- migration analysis for all supported nodes/SDKs/adapters.

Core Candidate status does not modify the core protocol.

## Promotion to Core

Promotion to Core requires a separate Class C or Class D normative RFC, depending on compatibility impact.

The RFC must answer:

- Why is this a universal network primitive rather than an extension?
- What interoperability problem cannot be solved cleanly while remaining optional?
- What stable compatibility burden does core adoption create?
- How are older nodes/SDKs/adapters affected?
- What security/Trustability/authorization/settlement assumptions change?
- What independent implementation/adoption evidence exists?

Core promotion should be rare.

## Demotion, deprecation and transfer

An Experimental or Official extension may be deprecated when maintenance disappears, security assumptions fail, ecosystem use collapses or a better standard supersedes it.

Deprecation must preserve a public record and migration guidance where practical.

An extension can be transferred to independent maintainers or another neutral standards home when that better serves interoperability; the identifier/history should clearly document the stewardship change.

## Relationship to A2A, MCP, x402, AP2 and other external standards

External standards do not become TRUYN core merely because TRUYN supports them.

A2A/MCP compatibility and settlement adapters such as x402/AP2 should remain adapter/extension-level boundaries unless future evidence supports a separate core RFC. This preserves independent versioning and settlement neutrality.

## Authorization and security

No extension may bypass TRUYN provider authorization, billing responsibility, Trustability or security invariants simply because it is Official.

An official identifier proves governance status of the extension specification, not authorization to execute a provider or correctness of a third-party implementation.
