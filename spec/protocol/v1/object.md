# TRUYN/1 OBJECT

**Status:** draft normative skeleton.

`OBJECT` represents immutable content addressed by cryptographic digest rather than by physical host location.

A content object SHOULD include/derive:

- object identifier;
- digest algorithm and digest;
- media/content type;
- byte size;
- optional inline payload or chunk references;
- creator/source identity;
- provenance/evidence references where applicable;
- creation/expiry metadata;
- signature when attribution is required.

A receiver MUST verify the digest before accepting content as the referenced object.

Content addressing enables deduplication, cache reuse and retrieval from any eligible provider possessing the same object. Mutable knowledge SHOULD use `STATE` that references immutable objects and/or deltas.
