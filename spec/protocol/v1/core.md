# TRUYN/1 Core

**Status:** draft normative skeleton.

TRUYN/1 defines a logical overlay protocol over existing IP transport. IP addresses are underlay reachability information; cryptographic Node IDs are logical identities.

## Envelope invariants

Every top-level exchange MUST include:

- protocol generation (`TRUYN/1` / numeric equivalent);
- message ID;
- sender Node ID;
- creation time;
- exactly one payload;
- cryptographic signature over the canonical signed representation.

Receivers MUST reject unsupported protocol generations and invalid signatures according to local security policy.

## Payload vocabulary

`IDENTITY`, `OFFER`, `NEED`, `OBJECT`, `CLAIM`, `ATTEST`, `STATE`, `DELTA`, `SUBSCRIBE`, `COMPUTE`, `RESULT`, `TRUST_RECEIPT`, `REVOKE`.

`CAPABILITY` is a reusable descriptor. Evidence and provenance are referenced objects/relationships rather than separate mandatory envelope types.

## Verification behavior

`CHALLENGE`, `VERIFY`, `DISPUTE` are composed behaviors. See `verification.md`.

## Compatibility

Unknown optional fields SHOULD be ignored when the wire encoding permits it. A node MUST NOT reinterpret a field with incompatible semantics inside the same protocol generation. Breaking semantic changes require a new protocol generation or an explicitly negotiated extension.
