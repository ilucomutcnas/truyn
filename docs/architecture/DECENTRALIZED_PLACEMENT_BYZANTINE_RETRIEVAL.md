# TRUYN Decentralized Placement Discovery and Byzantine Read Quorum

Status: **implemented network primitive; deterministic/local-network proof pending benchmark evidence**

This document extends the distributed semantic retrieval architecture beyond relay-owned placement discovery.

The invariant is:

> a requester that knows only a root CID must be able to discover candidate holders without depending on one relay, and a single incorrect replica must not be able to choose the returned context when the configured honest read quorum agrees on a different immutable CID.

This is a bounded network primitive. It is not a claim of Internet-scale Kademlia deployment, Byzantine consensus, global Sybil resistance, or WAN production readiness.

## 1. Separation of responsibilities

TRUYN now separates four concerns that were previously coupled in the first distributed retrieval proof:

1. **placement publication** — a holder signs where it claims to hold one deterministic root partition;
2. **placement discovery** — directory peers store, gossip and federate those signed records;
3. **holder selection** — the requester chooses a bounded replica set using operational Trustability, placement freshness, directory agreement and failure-domain diversity;
4. **content acceptance** — cryptographically valid candidate responses must satisfy an application-level read quorum over distinct holder identities before they may enter the final semantic selector.

The relay is no longer part of the placement lookup contract in this path.

## 2. Signed placement record

`core/network/placement-discovery.js` defines `truyn-placement-v1`.

A placement record commits to:

- immutable root CID;
- holder node ID;
- deterministic partition index/count;
- expected block count for that partition;
- holder-specific request capability;
- monotonic sequence;
- issuance and expiry timestamps;
- optional failure-domain commitment.

The holder signs the record with the same Ed25519 identity represented by `holderNodeId`.

A directory peer rejects:

- invalid signatures;
- holder/public-key mismatch;
- invalid partition contracts;
- expired records;
- older sequences;
- same-sequence equivocation under the same root/partition/holder key.

## 3. DHT-style placement

`placementResponsiblePeers(rootCid, peers)` uses deterministic rendezvous hashing over the root CID and directory peer IDs.

A holder publishes its signed placement record to a bounded replication set of responsible directory peers.

This gives TRUYN a deterministic placement primitive without requiring a central registry for the root.

The current implementation is intentionally described as **DHT-style rendezvous placement** rather than a complete Kademlia implementation. It does not yet implement XOR routing tables, bucket maintenance, iterative peer discovery, NAT traversal or Internet bootstrap economics.

## 4. Gossip and federation

`PlacementDirectoryPeer` supports anti-entropy exchange through `gossipWith()`.

`FederatedPlacementResolver` independently queries multiple directory peers and counts how many peers report the exact same signed placement record. A configurable `minDirectoryAgreement` gate prevents one directory peer from unilaterally manufacturing a placement view.

Directory agreement is not treated as source truth: directories only relay holder-signed placement objects. A malicious directory cannot forge a valid holder placement without the holder key.

## 5. Real network transport boundary

`node/placement-directory.js` exposes the placement directory over an independent HTTP service boundary:

- `GET /healthz`
- `GET /v1/placements?rootCid=...`
- `POST /v1/placements`
- `POST /v1/revocations`

`HttpPlacementDirectoryClient` lets a resolver federate independent processes/hosts with the same interface as in-memory peers.

Therefore the placement resolver is not tied to a relay process or relay database.

The HTTP directory validates signed records and revocations before ingesting them, enforces a bounded request body, returns bounded errors, and never receives provider credentials.

## 6. Placement revocation and freshness

`truyn-placement-revoke-v1` is signed by the holder identity.

A revocation targets the exact root/partition/holder placement sequence. Once a revocation of equal or greater sequence is observed, that placement is excluded from discovery.

Placement expiry is checked at read time. An expired placement cannot remain eligible merely because it is still stored on a directory peer.

Gossip carries revocations as well as records so revocation state converges across directory peers.

## 7. Trustability-aware holder selection

`core/context/byzantine-retrieval.js` computes an **operational holder routing signal**, not claim truth.

The current bounded score is composed from:

- node execution Trustability: 65%;
- remaining signed placement freshness: 20%;
- directory agreement: 15%.

The weights are routing policy, not a calibrated probability of honesty.

Replica selection prefers distinct declared failure domains before filling remaining replica slots by score. The failure-domain value is currently a signed placement commitment; independent certification of infrastructure failure domains remains future work.

## 8. Byzantine read quorum

`FederatedByzantineContextCoordinator` requests multiple replicas for each deterministic partition.

Two separate gates apply:

### 8.1 Response quorum

For every required partition, at least `quorum` selected holders must return structurally valid responses.

Failure returns `distributed_context_response_quorum_failed`.

### 8.2 Candidate CID quorum

Every candidate is first verified through the existing distributed retrieval proof:

- root manifest is valid;
- content CID matches bytes/text;
- CID belongs to the holder's partition;
- holder receipt matches root/query/partition/content;
- receipt signature matches the discovered holder identity.

Only then are candidates grouped by:

`partition index + immutable candidate CID`

The quorum counts **distinct holder identities**. Repeated responses from one holder do not increase quorum.

A candidate without the configured holder quorum is excluded before semantic final selection.

This is an **application-level Byzantine read quorum**, not a Byzantine consensus protocol. It does not order writes or provide PBFT/Raft semantics.

## 9. Privacy boundary

The agent contract remains exactly:

```text
question + root CID
```

The final public result exposes content plus bounded commitments/receipt digests necessary to audit quorum provenance. Internal block IDs are not added to the requester contract.

Directory nodes see placement metadata needed to route immutable partitions. They do not receive provider secrets or raw source-lineage identities from the Trustability layer.

## 10. Failure behavior

The federated path fails closed when:

- directory agreement is insufficient;
- a root partition has no discovered holders;
- a partition cannot provide the configured replica quorum;
- holder response identity does not match placement identity;
- signed candidate provenance is invalid;
- different replicas fail to form a CID quorum;
- the final selector attempts to select a non-quorum candidate.

## 11. What this changes from Distributed Retrieval v1

Distributed Retrieval v1 proved that immutable blocks could be distributed over signed holder nodes while preserving provenance and minimal context. Its placement discovery path still used relay OFFER discovery.

This layer removes that architectural dependency for placement discovery:

```text
root CID
  -> rendezvous placement peers
  -> federated signed placement view
  -> Trustability-aware replica set
  -> independent holder requests
  -> signed candidate verification
  -> distinct-holder CID quorum
  -> semantic selector
  -> minimal verified context
```

The relay may still be used as one transport option for holder execution, but it is no longer the authoritative placement directory in this architecture.

## 12. Explicit non-claims / next scale boundary

This implementation does **not** yet prove:

- Internet-scale Kademlia routing or millions of placement entries;
- WAN churn convergence time;
- authenticated peer admission policy for an open public DHT;
- global Sybil-resistant directory identity economics;
- certified physical/provider failure domains;
- Byzantine write consensus;
- a globally durable placement database;
- NAT traversal / QUIC peer transport for directory federation;
- cross-region disaster recovery.

Those remain scale/testnet work. The present slice proves the protocol separation and executable network boundary needed to reach that stage without reintroducing a central relay dependency.
