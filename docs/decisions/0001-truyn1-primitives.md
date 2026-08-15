# ADR-0001 — TRUYN/1 Primitive Set

**Status:** Accepted for the architecture skeleton.

TRUYN/1 top-level exchange objects are:

`IDENTITY`, `OFFER`, `NEED`, `OBJECT`, `CLAIM`, `ATTEST`, `STATE`, `DELTA`, `SUBSCRIBE`, `COMPUTE`, `RESULT`, `TRUST_RECEIPT`, `REVOKE`.

`CAPABILITY` is a descriptor, not an independent exchange action.

`CHALLENGE`, `VERIFY` and `DISPUTE` are composed verification behaviors using existing messages rather than top-level envelope kinds. This prevents vocabulary expansion without losing active verification semantics.

Future protocol generations may change this only through an explicit compatibility decision.
