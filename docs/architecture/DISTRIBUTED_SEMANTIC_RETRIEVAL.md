# Distributed Semantic Retrieval

Status: implemented network primitive v1

## Goal

Turn Semantic Retrieval from a node-local RAG component into a TRUYN network primitive:

`question + root CID -> discovery -> authorized block holders -> minimal retrieval -> provenance`

The requester/agent supplies only:

- natural-language `question`;
- immutable `rootCid`.

It does not supply block IDs, candidate IDs, holder IDs, placement hints, or shard identifiers.

## Core separation: content identity vs placement

The root CID is an immutable identity for the content manifest. Physical placement is intentionally **not** part of the root CID.

This means the same immutable block can move, be replicated, or be served by another authorized node without changing its content identity.

Placement is discovered from signed TRUYN `OFFER`s.

## v1 placement contract

Distributed Retrieval v1 uses deterministic CID partitions.

For a root with `N` partitions, each immutable block CID deterministically maps to exactly one partition. A holder advertises:

- root CID;
- partition index;
- partition count;
- holder node identity;
- a deterministic request capability;
- count of blocks held for that partition.

The holder does **not** publish individual block IDs in its discovery OFFER.

A holder is accepted only when its local block set is exactly the complete manifest-derived partition. Replication is allowed: multiple authorized holders may advertise the same partition.

The coordinator fails closed unless authorized discovery covers every partition.

## Network flow

1. Agent calls the coordinator with exactly `question + rootCid`.
2. Coordinator resolves and verifies the immutable root manifest.
3. Coordinator derives the root-specific discovery capability.
4. Relay returns only provider-policy-authorized holder OFFERs.
5. Coordinator validates a complete partition contract and selects one authorized holder per partition. Replicas can be ranked by TRUYN trust score.
6. Coordinator sends a signed `NEED` to each holder's unique request capability. Holder request contains the question/root CID/query hash/candidate count, never block IDs.
7. Each holder performs local retrieval over only its physical partition and returns a small candidate set.
8. Every returned candidate carries a holder-signed Ed25519 receipt binding holder identity, root CID, query hash, partition, block identity/CID and local rank.
9. Coordinator verifies, in this order:
   - RESULT signature / provider identity;
   - holder/result routing identity;
   - block text -> block CID;
   - block membership in immutable root manifest;
   - deterministic partition membership;
   - holder receipt payload;
   - holder receipt signature.
10. Coordinator performs final selection only across verified candidates.
11. Agent receives only minimal context plus a sanitized provenance proof. Internal block IDs/CIDs are not exposed in the public result.

## Authorization boundary

Authorization is enforced twice:

- **relay discovery/routing**: owner-only holder OFFERs are invisible and unroutable to requesters outside the holder allowlist;
- **holder execution**: holder host independently checks the requester identity before retrieval.

A requester that is not authorized must produce zero holder retrieval work.

Trusted relay requesters retain the existing TRUYN trusted-requester semantics and therefore may bypass an owner-only provider allowlist. Tests for ordinary unauthorized requesters must not place those identities in `trustedRequesterNodeIds`.

## Provenance model

Holder signatures alone are not sufficient. A malicious holder can sign a lie.

Therefore provenance requires both:

1. cryptographic holder attribution; and
2. content-addressed verification against the immutable root manifest.

A candidate is valid only if its text re-hashes to its claimed immutable block CID and that exact block identity is present in the root manifest.

The public proof returns:

- root CID / manifest CID;
- query hash;
- queried partition/holder counts;
- holder node identity for the selected context;
- double-hashed content commitment rather than the internal block CID;
- digest of the holder receipt;
- `verified: true` only after all checks complete.

Raw internal block IDs/CIDs stay inside the coordinator proof boundary.

## Minimal retrieval

The network does not move the full corpus to the coordinator.

Each holder sends only a bounded local candidate set. Final semantic/reranking work operates over the union of verified candidates.

The coordinator accepts a provider-neutral `candidateSelector`, so production can use the existing Semantic Gate confidence/reranking policy while network mechanics remain independent from a particular model/provider.

The built-in selector is deterministic and intended for tests/local operation. It is not a replacement for the measured live Semantic Retrieval v2 quality gate.

## Failure behavior

Fail closed on:

- invalid root manifest;
- zero authorized holders;
- inconsistent partition counts;
- missing partition coverage;
- holder block-count mismatch;
- unexpected provider routing;
- missing/invalid RESULT signature;
- mismatched root/query/partition metadata;
- block not in manifest;
- block CID mismatch;
- candidate from the wrong partition;
- invalid holder receipt;
- unverified candidate selected by the final selector;
- holder result timeout.

## Implemented files

- `core/context/distributed-retrieval.js`
  - deterministic partitioning;
  - root-specific discovery/request capabilities;
  - coverage verification;
  - holder receipts;
  - candidate provenance verification;
  - sanitized public proof.
- `node/distributed-context.js`
  - `DistributedContextHolderHost`;
  - `DistributedContextCoordinator`;
  - signed OFFER/NEED/RESULT network flow over the existing relay.
- `tests/distributed-context.test.js`
  - content-tampering rejection;
  - incomplete-coverage fail-closed behavior;
  - three-holder end-to-end network retrieval;
  - authorization-before-holder-work;
  - no public block-ID/CID leakage.

## What v1 proves and what it does not

v1 proves that TRUYN can resolve a root across multiple independently signed nodes and reconstruct only the minimum verified context without first centralizing the block payloads.

It does not yet prove:

- internet-scale DHT/gossip holder discovery;
- cross-relay federation;
- Byzantine quorum selection across replicas;
- durable placement attestations independent from live OFFERs;
- WAN partition healing;
- live-model semantic quality across distributed partitions.

Those are follow-on network-scale/trustability layers. They should build on this primitive rather than moving block payloads back into a central RAG store.
