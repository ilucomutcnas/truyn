# TRUYN/2 TRUST_RECEIPT v2

**Status:** implemented testnet protocol slice.

`TRUST_RECEIPT v2` is a signed, time-bounded trust evaluation that is cryptographically bound not only to a claim/evidence assessment, but also to the authority and lifecycle state under which the verifier was permitted to issue it.

## Required commitments

A v2 receipt MUST commit to:

- claim ID and claim digest;
- trust policy and truth-assessment state;
- provenance/evidence commitments;
- verifier TRUYN node identity;
- source-owner root certificate;
- verifier delegation certificate and authority-chain digest;
- durable transparency log ID;
- lifecycle head sequence and hash;
- revocation-state digest at that same head;
- explicit current revocation state for the verifier delegation and the claim.

The receipt signature covers all of those commitments.

## Freshness rule

A receipt is valid only against the lifecycle/revocation state it commits to. If a relying party has a newer durable log head, and that head does not equal the receipt's committed head, the receipt MUST be treated as stale and reevaluated. This intentionally makes revocation monotonic from the relying party's perspective: a receipt cannot remain current after the authoritative lifecycle advances.

## Source-owner authority

The verifier MUST present a source-owner root certificate and a root-signed delegation containing the `trust.verify` scope. The delegation binds the verifier's TRUYN Ed25519 identity to the source-owner authority. A delegation revoked in the committed revocation state MUST NOT issue a v2 receipt.

## Revocation state

The receipt commits both:

1. the global revocation-state digest at the lifecycle head; and
2. relevant subject states for the verifier delegation and claim.

The global digest prevents selective omission of other revocation records from the same lifecycle snapshot. The relevant states allow a relying party to reject the receipt without replaying the full log.

## Non-goals of this slice

Trust Receipt v2 does not claim Byzantine consensus over lifecycle heads. The current replicated log provides durable append-only replication and conflicting-head/equivocation detection. Byzantine quorum, Sybil resistance and collusion exercises are deliberately deferred to the 100/1,000-node test phase.
