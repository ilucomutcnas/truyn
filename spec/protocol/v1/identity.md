# TRUYN/1 Identity

**Status:** draft normative skeleton.

A Node ID is a cryptographic logical identity and MUST NOT be defined by the node's current IP address, DNS name or physical location.

Identity records bind a Node ID to public-key material and supported protocol generations. Session authentication proves control of the relevant key; it does not prove the factual truth of claims made by that node.

## Identity is not provider entitlement

A valid TRUYN identity does not grant permission to use every provider reachable/discoverable on the network.

Provider ownership/tenant/visibility/billing authorization is a separate policy decision described in `provider-policy.md`.

Requester-controlled claims about owner, tenant or privileged role MUST NOT become authoritative merely because the requester signs them with a valid node key.

Routine address changes and software upgrades MUST preserve identity. Key rotation/recovery must be explicit, signed/authorized where possible and linked into provenance. Compromised key bindings MUST be revocable through `REVOKE` semantics.
