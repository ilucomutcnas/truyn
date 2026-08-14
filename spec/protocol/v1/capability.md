# TRUYN/1 Capability

**Status:** draft normative skeleton.

A capability is a machine-readable description of what a node can provide or compute, including name/version/domain and optional input/output schema identifiers.

A capability descriptor is **not** itself a network action. `OFFER` advertises a capability; `NEED` requests one; `COMPUTE` asks an eligible provider to execute one.

Capability naming SHOULD be stable enough for discovery while allowing version/schema evolution. Provider-specific implementation details should remain outside the semantic identifier when possible.
