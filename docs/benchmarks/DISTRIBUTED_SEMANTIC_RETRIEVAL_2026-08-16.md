# TRUYN Distributed Semantic Retrieval Primitive v1

Date: 2026-08-16
Status: **MEASURED PASS**

## Purpose

This benchmark proves the first implemented distributed form of the TRUYN Semantic Retrieval Gate:

`question + root CID -> discovery -> authorized block holders -> minimal retrieval -> provenance`

Unlike the earlier node-local Semantic Retrieval proofs, the immutable context blocks in this run are physically divided across multiple independently signed TRUYN holder nodes. The coordinator does not begin with the full block payload set. It receives the immutable root manifest, discovers authorized holders through normal signed TRUYN `OFFER`s, sends signed `NEED`s to the selected holders, verifies returned candidates against the immutable root, and returns only the minimum selected context plus sanitized provenance.

This is a network/distribution primitive proof. It does **not** replace the live-provider Semantic Retrieval v2 quality benchmark. The semantic workload here is deliberately deterministic so the benchmark isolates holder discovery, authorization, distributed candidate transfer, content-addressed verification, provenance, placement replication, and minimal network retrieval.

## Evidence

Final immutable GitHub Actions run:

- workflow run: `31962897233`
- workflow name: `Distributed Semantic Retrieval Gate`
- tested commit SHA: `c5a2c9b9529b4a3b346aa84d0ee152bdc3f7fd2f`
- artifact: `truyn-distributed-semantic-retrieval-31962897233`
- artifact ID: `9267696297`
- artifact digest: `sha256:0b6fa99c3fe4998311e35838c8ecc6bf181af2a943a2410cd2e6a4ec1d3d7f6d`
- raw benchmark JSON SHA-256: `9b412e569db4066f11167bfb31f084c28ecbc7864fb0e5c819b24d6ded6392be`
- workflow result: **SUCCESS**

The ephemeral benchmark workflow was removed from `main` after the immutable run had started. The benchmark harness remains in `benchmarks/distributed-semantic-retrieval.js` and the implementation/tests remain in the repository.

## Implementation under test

The distributed primitive is implemented by:

- `core/context/distributed-retrieval.js`
  - deterministic block-CID partitioning;
  - root-specific discovery capability;
  - holder-specific request capability;
  - complete authorized partition-coverage verification;
  - replica handling;
  - holder-signed receipts;
  - candidate verification against the immutable root manifest;
  - sanitized public provenance.
- `node/distributed-context.js`
  - `DistributedContextHolderHost`;
  - `DistributedContextCoordinator`;
  - signed `OFFER -> NEED -> RESULT` network path over the existing TRUYN relay.
- `tests/distributed-context.test.js`
  - content-tampering rejection;
  - incomplete-coverage fail-closed behavior;
  - three-holder end-to-end retrieval;
  - authorization-before-holder-work;
  - public block-ID/CID non-leakage.

Relevant implementation commits include:

- `5ab9ae798532188b78633e9798fcd7589a1fe80e` — distributed retrieval core primitive;
- `e3b96d1c8d7752b82063cc19dea7be438165dab8` — distributed holder/coordinator network implementation;
- `96f65dd444b3def8eb1380665e7fefc1ef6e2862` — corrected ordinary-requester authorization test; CI `31962769207` passed the complete test suite;
- `520efebe4f99e1c9b15b53a21b15160f4d5d4df1` — architecture documentation;
- `3f796aae913d804d97413fea4ed9ef7b7e05db02` — measured benchmark harness.

## Fixed benchmark workload

The final proof used:

- immutable root: `truyn:ctx:4aba610b5bb5e9c326be8ca2b8b6a6cdb7583101863bf3722316f3cba93b9da6`
- corpus: **600 immutable blocks**
- content bytes: **79,842**
- serialized full-corpus bytes: **99,043**
- deterministic CID partitions: **4**
- physical holder nodes: **5**
- complete primary holders: **4**
- replicas: **1** extra holder for partition 0
- immutable questions: **48**
- holder candidate bound: **2 candidates per partition**
- signed holder `NEED`s: **192**
- signed holder `RESULT`s: **192**

The extra replica intentionally proves that placement is not content identity: two independent signed nodes can serve the same immutable partition while the root CID remains unchanged.

## Requester contract

For every measured sample, the agent/requester contract was exactly:

```text
question + rootCid
```

The requester did not receive or submit:

- block ID;
- block CID;
- candidate list;
- holder ID;
- partition index;
- routing hint;
- `ids[]`.

The coordinator derived discovery and placement from the root CID and network state.

## Discovery result

Authorized discovery returned:

- authorized holder OFFERs: **5**
- required partitions: **4**
- holders selected for retrieval: **4**
- discovered replicas: **1**

The coordinator required complete authorized coverage of all four partitions before retrieval could continue.

A separate ordinary authenticated requester that was not in the holder allowlists saw:

- authorized holder OFFERs: **0**
- holder retrieval work caused: **0**

This demonstrates authorization before holder work for the measured path.

## Retrieval and provenance result

Final measured result:

| Gate | Result |
|---|---:|
| Correct retrieval | **48 / 48 = 100%** |
| Provenance verified | **48 / 48 = 100%** |
| Minimal context | **48 / 48 = 100%** |
| Public block-ID/CID leakage-free | **48 / 48 = 100%** |
| Holder NEED delivery | **192 / 192** |
| Holder RESULT delivery | **192 / 192** |
| Verified network candidates | **384** |
| Provenance failures | **0** |
| Unauthorized discovery offers | **0** |
| Unauthorized holder work | **0** |

Every query contacted one selected holder for each of the four required partitions. Each holder returned at most two local candidates. Across 48 queries this produced 384 verified candidates, exactly 8 candidates per query on average, instead of moving all 600 blocks to the coordinator.

## Provenance verification order

The coordinator does not treat a holder signature as proof that content is true to the immutable root. A malicious holder can sign arbitrary bytes. Candidate acceptance therefore requires all of the following:

1. TRUYN `RESULT` signature verifies for the expected holder identity.
2. Routed provider identity equals the selected holder identity.
3. Holder result binds the expected root CID and query hash.
4. Candidate text re-hashes to the claimed immutable block CID.
5. The exact block identity/CID is a member of the verified root manifest.
6. The candidate CID maps to the partition advertised by that holder.
7. The holder receipt binds root CID, query hash, holder identity, partition, block identity/CID and local rank.
8. The Ed25519 holder-receipt signature verifies.
9. Final selection is restricted to this verified candidate set.

The agent-facing proof intentionally replaces raw internal block CIDs with a content commitment and holder-receipt digest while preserving the root CID, query hash, holder identity and verification state.

## Network payload result

Measured distributed context payload across all 48 queries:

- distributed query/candidate payload: **474,240 bytes**
- reference full-corpus payload if the 99,043-byte serialized root were transferred for every query: **4,754,064 bytes**
- measured payload reduction: **90.025%**

This value includes the distributed request payloads and candidate output payloads, including holder receipts. It intentionally does **not** claim complete wire-level savings: HTTP headers, relay envelope framing, TCP/TLS overhead and lower-layer transport bytes are outside this metric. The comparison is the semantic/context payload that must move to perform retrieval.

The result therefore supports the narrower claim that distributed minimal retrieval avoided repeatedly moving the full context corpus and reduced measured context payload by approximately 90% for this workload.

## Latency

Measured end-to-end coordinator retrieval latency on the GitHub Actions runner:

- minimum: **92.201 ms**
- p50: **97.156 ms**
- p95: **122.304 ms**
- p99: **127.465 ms**
- maximum: **127.465 ms**
- mean: **99.053 ms**

These are same-runner/process-network measurements through the actual TRUYN relay path. They are useful for regression comparison but are **not WAN latency claims**. Cross-region, cross-cloud and internet latency must be measured separately.

## Replica behavior

Partition 0 was published by two separately generated Ed25519 identities. Both advertised the same immutable partition under the same root CID.

Discovery reported one replica, while the coordinator selected exactly one authorized holder for that partition. The root CID did not change because placement is not encoded into content identity.

This is the first measured TRUYN proof of the desired separation:

```text
immutable content identity != current physical placement
```

## Fail-closed behavior

Unit/integration tests additionally prove that retrieval fails closed when an authorized holder set does not cover every deterministic partition of the immutable manifest.

The coordinator also rejects:

- invalid root manifest;
- inconsistent partition-count contracts;
- holder-advertised block-count mismatch;
- unexpected provider routing;
- invalid holder RESULT signature;
- root/query/partition mismatch;
- candidate not present in the root manifest;
- content whose re-derived CID differs from the manifest;
- candidate returned by the wrong partition;
- invalid holder receipt;
- a final selector attempting to choose an unverified candidate;
- holder response timeout.

## Authorization test correction retained in history

An earlier CI run, `31962711262`, failed one authorization assertion even though the distributed retrieval itself completed successfully.

The failed test had mistakenly registered the supposed unauthorized requester in `trustedRequesterNodeIds`. Existing TRUYN relay semantics intentionally allow trusted requesters to bypass an owner-only provider allowlist. The test therefore expected denial for an identity that the relay had explicitly been told to trust.

The test was corrected so:

- only the coordinator is a trusted requester;
- the unauthorized identity is an ordinary authenticated requester with dispatch enabled;
- the holder owner-only allowlist excludes that requester.

After that correction, CI `31962769207` completed **SUCCESS** with the full suite, and the final measured benchmark confirmed zero unauthorized discovery offers and zero unauthorized holder work.

This failure is retained because it clarifies the distinction between the trusted-requester control-plane role and ordinary provider authorization. It is not represented as a product security bypass.

## What this proves

The measured implementation proves that TRUYN can now perform the following operation across multiple signed nodes:

```text
root CID
  -> discover current authorized placement
  -> require complete manifest-derived coverage
  -> ask only the required holders for bounded candidates
  -> verify candidates against immutable content identity
  -> verify holder attribution
  -> select minimal context
  -> expose sanitized provenance
```

The coordinator does not need the full block payload corpus in order to begin retrieval, and the agent never supplies physical placement or block routing identifiers.

This is the architectural transition from a node-local RAG helper toward a TRUYN network retrieval primitive.

## What this does NOT yet prove

This report does not claim:

- internet-scale DHT or gossip discovery;
- cross-relay federation;
- Byzantine quorum consensus among replicas;
- durable placement attestations independent of live `OFFER`s;
- WAN partition recovery or healing;
- 100/1,000-node live distributed retrieval throughput;
- live paid-model semantic quality over distributed partitions;
- globally optimal routing by trust/cost/privacy/latency;
- complete wire-byte reduction including HTTP/TLS/TCP framing.

Those are follow-on network and Trustability layers. The existing Semantic Retrieval v2 live-provider benchmark remains the evidence for model-assisted semantic accuracy/economics; this report is the evidence for distributed holder discovery, authorization, minimal candidate movement and content-addressed provenance.

## Conclusion

**Distributed Semantic Retrieval Primitive v1 passes its fixed network gate.**

For the measured 600-block root distributed across four required partitions and five independently signed holder nodes, TRUYN achieved 48/48 correct retrievals, 100% provenance, 100% minimal-context delivery, zero public block-ID/CID leakage, zero unauthorized holder work, one discovered replica, zero provenance failures, and 90.025% reduction in measured semantic/context payload versus transferring the full corpus for every query.

The critical invariant is now implemented: the immutable `root CID` names content, while the network discovers where authorized pieces currently live.
