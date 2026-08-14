# TRUYN/1 Identity

**Status:** draft normative skeleton.

A Node ID is a cryptographic logical identity and MUST NOT be defined by the node's current IP address, DNS name or physical location.

Identity records bind a Node ID to public-key material and supported protocol generations. Session authentication proves control of the relevant key; it does not prove the factual truth of claims made by that node.

Routine address changes and software upgrades MUST preserve identity. Key rotation/recovery must be explicit, signed/authorized where possible and linked into provenance. Compromised key bindings MUST be revocable through `REVOKE` semantics.
