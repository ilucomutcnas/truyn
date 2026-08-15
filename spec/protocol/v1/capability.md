# TRUYN/1 Capability

**Status:** draft normative skeleton.

A capability is a machine-readable description of what a node can provide or compute, including name/version/domain and optional input/output schema identifiers.

A capability descriptor is **not** itself a network action. `OFFER` advertises a capability; `NEED` requests one; `COMPUTE` asks an **authorized and otherwise eligible** provider to execute one.

Capability naming SHOULD be stable enough for discovery while allowing version/schema evolution. Provider-specific implementation details should remain outside the semantic identifier when possible.

## Capability is not authorization

Capability matching answers:

> Can this provider perform the requested class of work?

Provider policy separately answers:

> May this requester discover/use this provider, and who is responsible for the cost?

A matching capability MUST NOT override provider ownership, visibility, entitlement, billing or quota policy.

See `provider-policy.md` and `routing.md`.
