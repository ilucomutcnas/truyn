# TRUYN: A Trust-Aware Intelligence Network Over Existing Internet Infrastructure

**Research and Engineering Whitepaper**  
**Version 0.1 — August 2026**  
**TRUYN Project**

> **TRUYN — The Intelligence Network**

---

## Abstract

The Internet is exceptionally successful at moving bytes between network endpoints. Its dominant architecture, however, was not designed for a world in which autonomous software agents, machine-learning systems, sensors, edge computers, models, services, and other machine actors continuously discover one another, exchange claims, verify evidence, synchronize state, select computational capabilities, and make decisions without human mediation.

This paper proposes **TRUYN**, a deployable overlay architecture for an intelligence-centric network that runs on existing Internet infrastructure. TRUYN does not require replacement of routers, modems, operating systems, terrestrial or submarine fiber, Wi-Fi, mobile networks, or IP. Instead, it treats the present Internet as an underlay transport and introduces a new logical network whose primary abstractions are **identity, capability, intent, state, claim, provenance, and trustability** rather than host location and opaque byte transfer.

The central design objective is to allow a machine participant to express *what it needs* and *how trustworthy the result must be*, without requiring prior knowledge of a specific server, URL, vendor API, or physical location. A TRUYN node advertises capabilities, discovers other nodes through decentralized routing, exchanges signed claims and state deltas, validates provenance, computes claim-specific trustability, and routes requests according to trust, latency, freshness, cost, privacy, and capability constraints.

A central contribution of the architecture is a **claim-centric Trustability Layer**. Cryptographic authenticity alone proves who signed information; it does not prove that the information is true. TRUYN therefore separates identity from trustworthiness and computes a multidimensional, continuously updated assessment using evidence, source history, provenance, source independence, real-time agreement and disagreement, freshness, integrity evidence, anomaly signals, and risk policy. Trustability is not defined as a universal reputation score for a node. It is defined as a context-dependent estimate associated with a particular claim and decision.

TRUYN also introduces state-oriented communication primitives intended to reduce unnecessary transmission. Where participants share prior state, the network can distribute deltas instead of full objects. Where a result is already available and sufficiently fresh, the network can reuse a cached signed result. Where raw data is large but a decision output is small, computation can be placed near the data and only the required result or proof need cross the network.

The architecture deliberately reuses mature work in information theory, peer-to-peer discovery, information-centric networking, distributed systems, cryptographic identity, remote attestation, reputation systems, semantic communication, and secure transport. The novelty is not the claim that each underlying mechanism is new. The proposal is to combine these mechanisms around a different network contract: **route intelligence according to intent and trustability while remaining immediately deployable over the Internet that already exists.**

This whitepaper defines the problem, architectural model, protocol primitives, trust model, routing objective, state model, security assumptions, quantitative expectations, implementation path, evaluation methodology, limitations, and research agenda for a TRUYN v0.1 reference implementation.

---

## 1. Scope and Scientific Status

TRUYN is proposed as an **overlay network architecture**, not as a replacement physical layer and not as a claim that IP, QUIC, distributed hash tables, content-centric networking, semantic communication, reputation systems, or cryptographic signatures are individually novel.

The contribution is architectural composition around a new set of first-class network objects:

1. **Identity** — which participant is acting?
2. **Capability** — what can that participant provide or compute?
3. **Intent** — what result is required?
4. **State** — what is currently known?
5. **Delta** — what changed?
6. **Claim** — what assertion is being made?
7. **Evidence and provenance** — why should that assertion be considered?
8. **Trustability** — how strongly should a specific relying party accept that claim for a specific purpose?

This document presents a **deployable engineering design using technologies available today**. It does not claim that a production-scale TRUYN network has already demonstrated the numerical performance targets described below. Numerical examples labeled *derived* are analytical consequences of explicit assumptions. Numerical findings attributed to prior work are referenced. Performance targets labeled *validation targets* must be measured by the reference implementation.

That distinction is intentional. An infrastructure whitepaper should separate architecture from evidence and should not manufacture benchmark results before measurements exist.

---

## 2. The Problem

### 2.1 The current Internet solves a different problem

The classical engineering problem of communication, formalized by Shannon, is concerned with the accurate or approximate reproduction of a selected message at another point under channel constraints [1]. The Internet built an extraordinarily general packet network on top of this premise. At the network layer, IP fundamentally addresses endpoints and forwards datagrams toward destinations. Higher layers add reliable transport, encryption, naming, application semantics, APIs, documents, and services.

This architecture is general precisely because the network does not need to understand the meaning of application data. That property remains valuable and TRUYN does not propose to remove it from the underlay.

The problem is that autonomous machine communication increasingly requires a different *logical* abstraction.

A machine often does not intrinsically require:

```text
connect to host X
send document Y
receive document Z
```

Its actual requirement may be closer to:

```text
obtain current state X
with freshness <= 10 s
and trustability >= 0.995
using a provider capable of operation Y
subject to privacy and cost constraints
```

The difference is substantial. The first abstraction is location- and endpoint-centric. The second is **goal-, capability-, and evidence-centric**.

### 2.2 Endpoint coupling

Conventional applications commonly bind logic to a provider through some combination of DNS names, URLs, API schemas, authentication methods, vendor SDKs, and service contracts. This creates several forms of coupling:

- **location coupling** — a client must know where a service can be reached;
- **provider coupling** — a client must know which organization provides the service;
- **interface coupling** — the client must know a provider-specific request/response format;
- **failure coupling** — provider unavailability becomes application unavailability unless failover is separately engineered;
- **discovery coupling** — capability discovery is typically performed outside the network through search, registries, configuration, or hard-coded infrastructure.

Information-Centric Networking (ICN) and Content-Centric/Named Data Networking demonstrated that content can be requested by name rather than by host location and that such a shift enables in-network caching, replication, and location-independent retrieval [2][3][4]. TRUYN adopts the same general lesson — **location need not be the primary logical identifier** — but extends the addressable object from named content to machine capabilities, state, claims, evidence, and intent.

### 2.3 Syntactic transmission can exceed decision-relevant information

A machine decision may require very little information even when the source data used to obtain that decision is large.

For example, a local system may possess a 100 MiB sensor dataset while a remote controller only needs to know whether a threshold condition is true. Moving the entire dataset across a long-haul path and computing at the remote endpoint may be unnecessary if a trusted computation can execute near the data and return a small signed result.

This observation is consistent with work on semantic and task-oriented communication, which investigates systems that optimize transmission for meaning or task success rather than exact bit-level reconstruction of every original representation [17][18][19]. TRUYN does not require neural semantic encoding at the physical layer. Instead, it applies the same high-level principle to the overlay: **the network should be able to transport the minimum sufficient state, result, delta, or evidence required by the declared intent.**

### 2.4 The present Internet transports information without estimating its truthfulness

TLS can authenticate a server and protect confidentiality and integrity in transit. A digital signature can establish that a particular key signed a particular object. Neither mechanism establishes that a substantive claim is correct.

A signed statement asserting that the temperature is 51°C is still false if the actual temperature is 21°C.

This distinction is critical for autonomous agents. A human can often evaluate source reputation, context, contradiction, and plausibility outside the network. An autonomous system operating at machine speed needs these dimensions to be available in machine-readable form.

Remote attestation work likewise distinguishes **trust** from **trustworthiness**: trust is a decision by a relying party; trustworthiness is a property or evidence about another system that can inform that decision [11]. TRUYN adopts this distinction and generalizes it from device state to information claims.

### 2.5 Scale magnifies redundancy and misinformation

If machine agents become persistent network actors, simple replication of today's application pattern can produce large amounts of repeated activity:

- repeated polling for unchanged state;
- repeated retrieval of identical information;
- repeated model inference for identical or equivalent requests;
- repeated conversion between verbose representations;
- repeated transfer of source data where local computation would suffice;
- repeated propagation of the same claim through many downstream agents, creating an illusion of independent corroboration.

The last point is especially dangerous. One original erroneous source can be repeated by one million agents. A naive voting system sees one million confirmations. A provenance-aware system sees **one informational lineage with one million descendants**.

TRUYN therefore treats provenance and independence as part of the trust computation rather than interpreting repetition as evidence by default.

---

## 3. Design Thesis

TRUYN is based on a simple thesis:

> **The existing Internet should remain the transport underlay, while a new intelligence-centric overlay becomes the logical network used by autonomous machines.**

The physical infrastructure can remain unchanged:

```text
fiber / radio / copper
        ↓
Ethernet / Wi-Fi / cellular
        ↓
IP
        ↓
UDP / QUIC
        ↓
════════════════════════════════════
       TRUYN OVERLAY
════════════════════════════════════
identity
capability
intent
state / delta
claim / evidence
trustability
routing policy
        ↓
agent / model / application / sensor
```

The key architectural choice is to **demote IP addresses from application-level identity to underlay reachability information**.

A TRUYN participant should be able to change Wi-Fi networks, addresses, access providers, or physical locations while retaining its cryptographic network identity.

---

## 4. Design Goals

A v0.1 architecture SHOULD satisfy the following goals.

### G1 — Deployability

A user should be able to install a daemon on an ordinary computer and join the network without replacing networking hardware.

### G2 — Vendor neutrality

The network must not depend on one AI model, cloud provider, operating system, programming language, or agent framework.

### G3 — Capability addressing

A requester should be able to ask for a capability or state without knowing the provider's host address in advance.

### G4 — Cryptographic identity

Claims, offers, attestations, and results must be attributable to cryptographic identities.

### G5 — Claim-centric trustability

Trust must be computed primarily for claims and decisions, not assigned as a single permanent global number to an entire node.

### G6 — Provenance awareness

Derived claims must be able to reference upstream claims or evidence so that correlated repetition is distinguishable from independent corroboration.

### G7 — Real-time revision

Trustability must be capable of changing when new evidence, contradictions, revocations, integrity signals, or fresh measurements arrive.

### G8 — Minimum necessary transfer

The architecture should support state deltas, cached results, local computation, subscriptions, and other mechanisms that avoid unnecessary payload movement.

### G9 — Policy sovereignty

Different relying parties must be able to apply different risk policies to the same evidence. The network may distribute facts and trust vectors; it must not require one globally authoritative truth score.

### G10 — Backward compatibility

Legacy HTTP/API/Web systems should be reachable through gateways so that adoption can proceed incrementally.

---

## 5. Non-Goals

TRUYN v0.1 does **not** attempt to:

- replace IP routing on the global public Internet;
- invent a new physical modulation system;
- require router firmware changes;
- define a universal ontology for all machine knowledge;
- claim perfect truth detection;
- guarantee Byzantine consensus over all statements in an open global network;
- make anonymous Sybil identities impossible without any external scarcity or authority assumption;
- replace all application protocols;
- require natural-language-free agent reasoning;
- depend on blockchain consensus.

A design is more credible when its boundaries are explicit.

---

## 6. Intellectual and Technical Lineage

TRUYN is intentionally built on established research rather than assuming that every layer should be reinvented.

### 6.1 Information theory

Shannon's work provides the statistical foundation for communication efficiency and entropy [1]. If a source has outcomes with probabilities \(p_i\), its entropy is:

$$
H(X) = -\sum_i p_i \log_2 p_i.
$$

For a uniformly selected element among \(M\) alternatives, the minimum fixed-length representation requires at least:

$$
\lceil \log_2 M \rceil
$$

bits.

This reminds us that human-readable representations are not necessarily efficient machine representations. TRUYN therefore separates a semantic object from its wire encoding and permits compact canonical binary serialization.

### 6.2 Information-Centric Networking

CCN/NDN demonstrated that named data can be made a network primitive, decoupling retrieval from a particular host and enabling caching, replication, and stateful forwarding [2][3]. The IRTF ICN terminology formalizes the broader paradigm of requesting named content rather than addressing destination hosts [4].

TRUYN extends the question from:

```text
Where is the host?
```

to:

```text
What data is needed?
```

and then further to:

```text
What capability, state, evidence, or decision is needed,
and under what trust constraints?
```

### 6.3 Distributed lookup

Kademlia showed that decentralized peer lookup can be implemented with an XOR metric and logarithmic routing behavior in a structured overlay [5]. A Kademlia-like DHT is therefore a practical candidate for bootstrap discovery and capability-provider indexing.

TRUYN does not require Kademlia as a permanent protocol commitment; it requires a decentralized discovery interface. Kademlia is an implementation-ready starting point.

### 6.4 Secure transport

QUIC provides encrypted multiplexed transport over UDP, low-latency connection establishment, streams, and connection migration mechanisms designed for deployment over existing IP networks [6]. This makes it a strong underlay candidate for TRUYN node-to-node sessions.

### 6.5 Programmable networking

P4 demonstrated that network forwarding behavior can be made protocol-independent and programmable [7]. TRUYN v0.1 does not require P4-capable hardware. However, the existence of programmable data planes is important for the long-term architecture: functions initially implemented in userspace overlay nodes could later move into programmable NICs, switches, or edge devices where beneficial.

### 6.6 Replicated state and deltas

Delta-state CRDT research shows that replicas can exchange small delta states rather than repeatedly transmitting full state while preserving convergence properties under defined conditions [8]. TRUYN uses the same principle more broadly: if peers share an identified base state, a protocol primitive can convey the relevant delta rather than a complete object.

### 6.7 Distributed reputation

EigenTrust demonstrated a distributed method for deriving global reputation values from local peer experience using a power-iteration approach [9]. TRUYN borrows the insight that trust evidence can be propagated and weighted through a graph, while deliberately rejecting the idea that one permanent global peer reputation is sufficient for machine truth assessment.

### 6.8 Sybil resistance limits

Douceur established a fundamental problem for open peer-to-peer systems: when identities are cheap, a single entity may create many identities and undermine redundancy-based trust mechanisms unless some trusted or scarce resource assumption is introduced [10]. TRUYN therefore treats raw identity count as weak evidence and introduces provenance, independence grouping, rate limits, optional attestation, historical cost, and policy-based admission mechanisms.

### 6.9 Remote attestation

The IETF RATS architecture formalizes evidence, attesters, verifiers, appraisal policies, and relying parties for assessing whether systems are in intended operating states [11]. TRUYN incorporates this conceptual separation into its integrity dimension.

### 6.10 Byzantine systems

The Byzantine Generals literature formalizes limits of reaching agreement when participants may behave arbitrarily or maliciously [12]. TRUYN does not pretend that open-world factual truth can be reduced to classical Byzantine consensus. Instead, it reports evidence and uncertainty and allows decision-specific policies.

### 6.11 Semantic and task-oriented communication

Research on semantic communication explicitly asks whether communications should preserve meaning rather than exact syntax [17][18], while goal-oriented work studies communication metrics tied to task utility and information value [19]. TRUYN adopts this direction at the overlay level: it can route results, state changes, or sufficient evidence rather than requiring raw source transfer when the request permits it.

---

## 7. System Model

Let the TRUYN overlay at time \(t\) be a dynamic graph:

$$
G_t = (V_t, E_t)
$$

where:

- \(V_t\) is the set of reachable TRUYN nodes;
- \(E_t\) is the set of authenticated logical sessions or known routing relationships.

Each node \(v \in V_t\) may possess:

- one cryptographic identity;
- zero or more capabilities;
- local state;
- local caches;
- local policies;
- claims and evidence;
- a trust graph;
- adapters to one or more applications or AI agents.

A node may simultaneously be a requester, provider, verifier, relay, cache, state replica, or gateway.

This is intentionally different from a strict client/server dichotomy.

---

## 8. Core Objects

### 8.1 Node

A **Node** is a running TRUYN participant represented by a persistent cryptographic identity and one or more current network reachability paths.

### 8.2 Identity

A **Node Identity** is derived from or bound to a public key.

A simple v0.1 construction is:

$$
NodeID = H(PK)
$$

where \(PK\) is the public verification key and \(H\) is a cryptographic hash function.

The identity is independent of the node's current IP address.

### 8.3 Capability

A **Capability** is a machine-readable declaration that a node can provide data, perform computation, verify evidence, store state, or execute another network function.

Examples:

```text
weather.current
translate.az-en
code.review
sensor.airquality.pm25
model.inference.classification
storage.content-addressed
verify.weather.observation
```

Capabilities MAY include constraints and descriptors such as:

- input schema;
- output schema;
- geographic scope;
- model or sensor class;
- maximum latency;
- price function;
- privacy properties;
- attestation requirements;
- expected confidence semantics.

### 8.4 Intent

An **Intent** expresses what the requester needs, not which host must supply it.

Example:

```text
NEED
capability: weather.current
target: geo:almaty-kz
property: temperature
freshness_max: 10s
trustability_min: 0.995
latency_max: 100ms
```

### 8.5 State

A **State** is an identified representation of knowledge or system condition at a particular logical version.

### 8.6 Delta

A **Delta** is an incremental update that transforms or joins with a known state.

### 8.7 Claim

A **Claim** is a signed assertion about a subject.

Example:

```text
subject: weather/almaty/temperature
value: 24.7 C
observed_at: 2026-08-15T01:22:10+05:00
issuer: truyn:9af...
```

### 8.8 Evidence

**Evidence** is material supplied to evaluate a claim. Evidence may include measurements, upstream signed claims, device attestations, dataset references, proofs, transformation metadata, or reproducible computation references.

### 8.9 Provenance

**Provenance** is a graph describing informational lineage: which sources, transformations, measurements, or claims contributed to another claim.

### 8.10 Attestation

An **Attestation** is a signed evaluation of a claim or evidence by another node.

### 8.11 Trustability Vector

A **Trustability Vector** is a multidimensional description of factors relevant to a trust decision.

### 8.12 Trustability Score

A **Trustability Score** is a policy-specific scalar projection of a trustability vector for a particular relying party and purpose.

It is explicitly **not equivalent to objective truth**.

---

## 9. Layered Architecture

A reference node can be decomposed into eight logical layers.

```text
┌─────────────────────────────────────────────────────┐
│ 8. Agent / Application Adapters                     │
│    MCP-like tools, SDK, local API, gateway          │
├─────────────────────────────────────────────────────┤
│ 7. Intent and Capability Layer                      │
├─────────────────────────────────────────────────────┤
│ 6. Trustability and Provenance Layer                │
├─────────────────────────────────────────────────────┤
│ 5. State, Claim and Cache Layer                     │
├─────────────────────────────────────────────────────┤
│ 4. Overlay Routing and Discovery Layer              │
├─────────────────────────────────────────────────────┤
│ 3. Identity and Cryptographic Envelope              │
├─────────────────────────────────────────────────────┤
│ 2. Secure Session Transport                         │
│    QUIC / UDP                                       │
├─────────────────────────────────────────────────────┤
│ 1. Existing Internet Underlay                       │
│    IP / Ethernet / Wi-Fi / cellular / fiber         │
└─────────────────────────────────────────────────────┘
```

The architectural rule is straightforward:

> **No change below Layer 2 is required for initial deployment.**

This is what makes the proposal immediately testable.

---

## 10. Node Identity and Cryptographic Envelope

### 10.1 Key generation

At first startup, a node generates a signing key pair:

$$
(SK, PK) \leftarrow KeyGen()
$$

Ed25519 is a practical v0.1 candidate. RFC 8032 specifies EdDSA and notes 32-byte public keys and 64-byte signatures for Ed25519 [13].

### 10.2 Persistent identity

The private key remains local. A content-derived or self-certifying Node ID is generated from the public key.

A node can migrate across underlay addresses while retaining the same logical identity.

### 10.3 Signed objects

The following objects SHOULD be signed:

- capability offers;
- claims;
- evidence manifests;
- attestations;
- revocations;
- trust receipts;
- delegated results where attribution matters.

A signature proves attribution and integrity, not correctness.

### 10.4 Session security

Node-to-node sessions SHOULD use secure authenticated transport. QUIC is a strong reference candidate because it integrates TLS, multiplexes streams, and is explicitly designed to run over UDP for deployability in existing networks [6].

### 10.5 Optional device integrity evidence

For high-risk environments, a node MAY attach remote-attestation evidence consistent with the conceptual roles defined by RATS [11].

This permits a relying party to distinguish:

```text
claim signed by expected key
```

from:

```text
claim signed by expected key
AND generated by a node whose measured software/hardware state
satisfies a declared policy
```

Again, the second statement strengthens integrity evidence; it still does not automatically prove the factual claim.

---

## 11. Discovery and Capability Routing

### 11.1 Bootstrap

A new node requires at least one route into the overlay. v0.1 can ship with multiple bootstrap nodes operated by independent parties.

Bootstrap nodes are not authoritative truth servers. Their role is limited to initial peer discovery and, where necessary, relay assistance.

### 11.2 Distributed peer discovery

A Kademlia-style DHT is a practical reference design [5]. Nodes can register keys derived from capability names and discover provider records without a centralized directory.

For capability \(c\), define:

$$
K_c = H(namespace \parallel c)
$$

Provider advertisements associated with \(K_c\) contain signed, expiring records.

### 11.3 Capability advertisements

An OFFER record may contain:

```text
provider_id
capability_id
schema_hash
constraints
price_function
region_hint
integrity_requirements
valid_from
expires_at
signature
```

Advertisements MUST expire. Stale capability records otherwise become a routing liability.

### 11.4 Provider candidate set

A NEED first resolves to a candidate provider set:

$$
P(c) = \{p_1, p_2, ..., p_n\}
$$

The routing layer then applies hard constraints followed by a utility function.

---

## 12. Protocol Primitives

The protocol should remain small. A v0.1 core can be built around the following primitives.

### 12.1 `OFFER`

Advertises a capability or available state.

### 12.2 `NEED`

Requests a capability, state, result, or evidence subject to constraints.

### 12.3 `CLAIM`

Publishes a signed assertion.

### 12.4 `EVIDENCE`

Provides material supporting or contextualizing a claim.

### 12.5 `ATTEST`

Provides an independent signed assessment or measurement related to a claim.

### 12.6 `DISPUTE`

Signals a contradiction, failed verification, or competing claim.

### 12.7 `RESULT`

Returns the output satisfying a NEED and references relevant claims, evidence, and trust material.

### 12.8 `SUBSCRIBE`

Requests notification on a state, claim family, or condition.

### 12.9 `DELTA`

Conveys a state change relative to an identified prior state.

### 12.10 `REVOKE`

Invalidates or supersedes an earlier offer, claim, credential, or key binding.

These primitives are intentionally semantic at the logical layer but SHOULD be compactly encoded on the wire.

---

## 13. Canonical Wire Representation

TRUYN should define semantics independently from serialization.

For a v0.1 implementation, **CBOR** is an appropriate candidate binary representation because it is standardized by the IETF and designed for small code and message size while preserving an extensible data model [14].

A conceptual message:

```text
NEED
capability = weather.current
target = almaty
freshness <= 10 s
trust >= 0.995
```

need not appear on the wire as human-readable text. It can be represented as integer field identifiers, compact enums, binary IDs, and numeric values.

The network therefore distinguishes:

1. **semantic schema** — what fields mean;
2. **canonical serialization** — how the fields become bytes;
3. **underlay framing** — how bytes cross QUIC/UDP/IP.

This prevents the protocol from confusing human readability with machine efficiency.

---

## 14. Content and Claim Addressing

Claims and immutable objects SHOULD support content-derived identifiers.

For canonical object bytes \(B\):

$$
ObjectID = H(B)
$$

Benefits include:

- deduplication;
- integrity checking;
- cache reuse;
- unambiguous provenance references;
- efficient claim graph construction.

Mutable concepts, such as `weather/almaty/current`, are represented by a stable logical subject whose observations or versions point to immutable claim objects.

This separates **identity of a concept** from **identity of one observation about that concept**.

---

## 15. State and Delta Communication

### 15.1 Motivation

If two nodes share state \(S_t\), and only a small portion changes, retransmitting \(S_{t+1}\) in full is unnecessary.

Instead:

$$
S_{t+1} = Apply(S_t, \Delta_t)
$$

or, for suitable join-semilattice state:

$$
S_{t+1} = S_t \sqcup \Delta_t.
$$

Delta-CRDT research provides formal conditions under which incremental state dissemination can retain convergence properties [8]. TRUYN does not require every application state to be a CRDT, but adopts delta exchange as a first-class primitive.

### 15.2 State identifiers

A DELTA references:

```text
base_state_id
result_state_id
delta_type
delta_payload
issuer
timestamp
signature
```

If the receiver lacks the required base state, it can request the full state or an intermediate delta chain.

### 15.3 Subscription instead of polling

A node may subscribe to changes:

```text
SUBSCRIBE
subject: oil/brent/price
condition: absolute_change >= 0.5%
max_age: 5s
```

No application-level polling is required while the condition is false.

This changes a repeated question:

```text
Has X changed?
Has X changed?
Has X changed?
```

into a stateful network relation:

```text
Tell me when X changes enough to matter.
```

---

## 16. Compute-to-Information

A major TRUYN optimization is the ability to select **where computation occurs**.

Let:

- \(D\) = size of raw source data;
- \(Q\) = size of the computation request;
- \(R\) = size of the result;
- \(C_l\) = local compute cost;
- \(C_r\) = remote compute cost;
- \(B\) = marginal bandwidth cost;
- \(L\) = latency cost.

A traditional remote-data transfer strategy has approximate communication volume:

$$
V_{move-data} \approx D + Q + R.
$$

A compute-near-data strategy has:

$$
V_{move-compute} \approx Q + R + E,
$$

where \(E\) is required evidence/proof metadata.

The routing layer can choose the second approach when:

$$
Cost(Q+R+E, C_l, L_l) < Cost(D+Q+R, C_r, L_r)
$$

subject to trust and privacy constraints.

This is not limited to AI inference. It applies to database filtering, sensor aggregation, analytics, classification, validation, and threshold decisions.

---

# Part II — Trustability

## 17. Why Trustability Must Be Native

A network that allows any node to publish claims without a machine-readable mechanism for evaluating those claims creates a high-speed misinformation substrate.

TRUYN therefore treats trustability as a native network concern.

The guiding rule is:

> **Authenticity answers “who said this?” Trustability asks “how strongly should I rely on this claim for this purpose?”**

These questions must not be conflated.

---

## 18. Claim-Centric Rather Than Node-Centric Trust

A global score such as:

```text
Node A trust = 0.97
```

is too coarse.

The same node may be highly reliable for one capability and untested for another. Its software may have changed. A source can be historically accurate but compromised now. A truthful source may relay an erroneous upstream source. A generally unreliable source may occasionally provide a correct observation.

TRUYN therefore models trust as:

$$
T = T(claim, requester, purpose, time, policy).
$$

Node history is an input, not the final answer.

---

## 19. Trustability Vector

For claim \(c\), define a normalized vector:

$$
\mathbf{x}_c =
[I, G, H, P, E, C, D, F, A, Y]
$$

where each component is in \([0,1]\):

- \(I\) — **Identity confidence**: certainty that attribution is valid;
- \(G\) — **Integrity confidence**: software/hardware/process integrity evidence;
- \(H\) — **Historical accuracy** in the relevant domain;
- \(P\) — **Provenance quality**;
- \(E\) — **Evidence quality**;
- \(C\) — **Consensus support**;
- \(D\) — **Independence/diversity** of corroborating information lineages;
- \(F\) — **Freshness** relative to the claim's required time horizon;
- \(A\) — **Anomaly cleanliness**, where 1 means low detected anomaly risk;
- \(Y\) — **Sybil-resistance confidence** for the corroborating set.

The network SHOULD preserve this vector even when a scalar score is also produced.

Why? Because two consumers can rationally disagree about the same evidence.

A weather dashboard may prioritize freshness. An industrial emergency shutdown system may prioritize independent evidence and device integrity. A financial trading system may assign unusually high weight to latency and source history.

---

## 20. Policy-Specific Scalar Trustability

A simple default scalar projection is a weighted geometric mean:

$$
T_{base}(c) = \prod_{j=1}^{m} \max(\epsilon, x_j)^{w_j}
$$

subject to:

$$
\sum_j w_j = 1, \qquad w_j \ge 0.
$$

The geometric mean is useful because a very weak critical dimension cannot be completely hidden by high values elsewhere.

A policy can impose hard gates first:

$$
I \ge I_{min}, \quad F \ge F_{min}, \quad D \ge D_{min}.
$$

Then compute a scalar only for feasible claims.

A risk-sensitive final value can include additional penalties:

$$
T(c) = T_{base}(c) \cdot (1-r_{anom})^{\gamma_a} \cdot (1-r_{sybil})^{\gamma_s}
$$

where \(r_{anom}\) and \(r_{sybil}\) are estimated anomaly and Sybil risks.

The protocol should not standardize one eternal set of weights. It should standardize the **meaning of factors, evidence format, provenance, and computation transparency** so that policies remain inspectable.

---

## 21. Historical Accuracy With Time Decay

Historical reputation should decay so that ancient good behavior cannot permanently mask recent compromise.

For past verification outcomes \(y_k \in \{0,1\}\) at ages \(\Delta t_k\), define temporal weights:

$$
w_k = e^{-\lambda \Delta t_k}.
$$

Using a Beta prior \(Beta(\alpha_0, \beta_0)\), update:

$$
\alpha = \alpha_0 + \sum_k w_k y_k
$$

$$
\beta = \beta_0 + \sum_k w_k(1-y_k).
$$

The posterior mean becomes:

$$
H = \frac{\alpha}{\alpha + \beta}.
$$

This representation has useful properties:

- no-history sources retain uncertainty rather than starting at 0 or 1;
- recent outcomes matter more when \(\lambda > 0\);
- confidence grows with accumulated evidence;
- domain-specific histories can be maintained separately.

For example:

```text
node X:
  weather.temperature  -> mature history
  weather.humidity     -> moderate history
  medical.diagnosis    -> no history
```

A strong weather reputation does not automatically become a medical reputation.

---

## 22. Consensus Is Not a Vote Count

Suppose a claim receives attestations \(a_1, ..., a_n\). A naive system may compute:

$$
C = \frac{\text{positive votes}}{n}.
$$

That is unsafe in an open network because identities may be cheap and information lineages correlated.

Instead, each attestation receives a weight:

$$
w_i = h_i \cdot d_i \cdot p_i \cdot f_i \cdot y_i
$$

where:

- \(h_i\) = historical reliability of attester in relevant domain;
- \(d_i\) = independence weight;
- \(p_i\) = provenance quality;
- \(f_i\) = freshness;
- \(y_i\) = Sybil-resistance/admission confidence.

Weighted positive and negative evidence become:

$$
S^+ = \sum_{i: support} w_i
$$

$$
S^- = \sum_{i: oppose} w_i.
$$

These values can update a Beta-style posterior for the proposition under an explicit model.

The key rule is:

> **one million identities do not constitute one million independent observations.**

---

## 23. Provenance and Independence

### 23.1 Provenance graph

For every claim, TRUYN can maintain a directed acyclic provenance subgraph where edges encode relationships such as:

```text
derived_from
measured_by
observed_from
computed_from
quoted_from
transformed_from
verified_against
contradicts
supports
```

### 23.2 Lineage collapse

Consider:

```text
                 Source S
              /     |      \
           Agent A Agent B Agent C ... Agent 1,000,000
```

If all descendants copied the same original measurement, the graph reveals a shared root.

The trust engine can group attestations by dominant informational lineage and cap the contribution from each group.

One simple group normalization is:

$$
\tilde{w}_i = \frac{w_i}{\sum_{j \in g(i)} w_j}
$$

where \(g(i)\) is the lineage group containing attestation \(i\).

This forces a lineage's total voting mass to remain bounded even when duplicated many times.

### 23.3 Effective sample size

After independence adjustment, a useful concentration indicator is:

$$
N_{eff} = \frac{(\sum_i \tilde{w}_i)^2}{\sum_i \tilde{w}_i^2}.
$$

This quantity does not itself discover correlation; provenance and clustering must do that. It helps describe how concentrated the resulting weighted evidence is.

TRUYN SHOULD expose both raw attestation count and effective independent evidence measures.

Example:

```text
raw attestations:           100,000
root information lineages:       4
effective evidence size:         3.2
```

This is more honest than reporting “100,000 confirmations.”

---

## 24. Evidence Quality

Evidence should be scored separately from agreement.

Possible evidence classes include:

1. **direct measurement** from a known sensor;
2. **signed primary-source statement**;
3. **reproducible deterministic computation** over identified inputs;
4. **remote-attested measurement**;
5. **independent secondary observation**;
6. **derived inference** with provenance;
7. **unverifiable assertion**.

These classes should not receive universally fixed rankings because contexts differ, but the distinction should be machine-readable.

A claim with weak evidence and high social repetition should not automatically outrank a claim with strong primary evidence and fewer repetitions.

---

## 25. Freshness

Truth can be time-dependent.

For a claim observed at time \(t_o\), evaluated at time \(t\), define age:

$$
Age(c,t) = t - t_o.
$$

A simple exponential freshness function is:

$$
F(c,t) = e^{-\mu Age(c,t)}.
$$

The decay parameter \(\mu\) is domain-specific.

Examples:

- source code license metadata may remain useful for hours or days;
- market prices may become stale within milliseconds or seconds;
- a cryptographic key revocation state may need rapid propagation;
- a scientific publication's content may remain stable for years.

Freshness must therefore be tied to semantics, not merely packet TTL.

---

## 26. Challenges, Disputes and Active Verification

Trustability should not be only a passive reputation lookup.

When uncertainty is high and the decision value warrants it, a node can emit a `CHALLENGE` behavior using `NEED`/`EVIDENCE`/`ATTEST` primitives:

```text
claim C arrives
     ↓
trustability = 0.71
required = 0.99
     ↓
select independent verifiers
     ↓
request evidence / fresh observations
     ↓
receive attestations
     ↓
recompute trustability
```

Verification intensity can therefore depend on decision risk.

For low-impact tasks:

```text
required trustability = 0.60
```

For safety-critical control:

```text
required trustability = 0.9999
independent roots >= 5
integrity evidence required
freshness <= 100ms
```

The exact thresholds belong to application policy, not to the global protocol.

---

## 27. Trust Receipts

A consumer should not be forced to download every raw attestation for every decision.

A verifier or local trust engine can produce a signed **Trust Receipt**:

```text
claim_id
policy_id
trust_vector
scalar_score
raw_attestation_count
independent_lineage_count
effective_sample_size
provenance_root
calculated_at
expires_at
verifier_id
signature
```

A consumer may accept the receipt if it trusts the verifier for that role or may independently recompute the score from underlying evidence.

This preserves a spectrum between:

- full local verification;
- federated verification;
- delegated verification.

TRUYN should support all three.

---

## 28. Trustability Dynamics

Trustability is a process, not a permanent label.

Let \(E_t\) be all evidence known at time \(t\). Then:

$$
T_t(c) = \Phi(c, E_t, P_r)
$$

where \(P_r\) is the relying party's policy.

When new evidence arrives:

$$
E_{t+1} = E_t \cup \Delta E
$$

and therefore:

$$
T_{t+1}(c) = \Phi(c, E_{t+1}, P_r).
$$

A claim may move:

```text
0.50 → 0.72 → 0.94 → 0.993
```

and later fall:

```text
0.993 → 0.61
```

when contradictory primary evidence appears or a source is compromised.

Consumers subscribed to a trust threshold can be notified when a claim crosses that threshold.

---

# Part III — Routing Intelligence

## 29. Constraint-First Routing

A NEED generates a set of provider candidates \(P\).

First apply hard constraints:

$$
P' = \{p \in P : T_p \ge T_{min}, F_p \ge F_{min}, L_p \le L_{max}, ...\}.
$$

Only feasible candidates enter utility ranking.

This is safer than allowing a very cheap or fast untrusted provider to compensate numerically for violating a critical trust threshold.

---

## 30. Multi-Objective Provider Utility

For provider \(p\), define normalized quantities:

- \(T_p\) — expected trustability;
- \(L_p\) — latency;
- \(C_p\) — monetary/resource cost;
- \(F_p\) — freshness;
- \(R_p\) — reliability;
- \(Q_p\) — quality estimate;
- \(V_p\) — privacy/locality value.

A policy may define:

$$
U(p) =
\alpha T_p
+ \beta F_p
+ \gamma R_p
+ \delta Q_p
+ \eta V_p
- \kappa \hat{L}_p
- \xi \hat{C}_p
$$

where hats denote normalized cost terms.

The selected provider is:

$$
p^* = \arg\max_{p \in P'} U(p).
$$

This generalizes routing from shortest-path logic to **result utility under explicit constraints**.

The underlay still routes packets normally. TRUYN chooses *which logical provider, cache, verifier, or compute location should receive the task*.

---

## 31. Cache-Aware Resolution

Before dispatching work, a node checks whether a compatible result already exists.

A cached result is reusable only if:

- subject and schema match;
- result is cryptographically valid;
- freshness requirements are satisfied;
- trustability requirements are satisfied under the current policy;
- revocation state permits reuse;
- privacy rules permit reuse.

A cache hit can eliminate both provider compute and origin traffic.

This extends ICN's in-network caching idea [2][4] to **results and claims whose validity is constrained by time and trustability**.

---

## 32. Verification-Aware Routing

A high-risk request may intentionally route through multiple independent providers.

For example:

```text
NEED weather.current
trustability_min = 0.999
verification_mode = independent(3)
```

can resolve to three providers with deliberately different provenance roots.

The network objective is not maximum agreement at minimum cost. It is **sufficiently independent evidence at acceptable cost**.

---

# Part IV — Security and Adversarial Model

## 33. Threat Model

TRUYN assumes that some nodes may be:

- faulty;
- stale;
- misconfigured;
- compromised;
- malicious;
- colluding;
- impersonating others;
- creating Sybil identities;
- selectively truthful;
- replaying old information;
- poisoning caches;
- fabricating provenance;
- manipulating reputation;
- attempting denial of service;
- attempting eclipse attacks against discovery.

The network must remain useful under partial adversarial participation.

It does not assume that every factual dispute has an algorithmically discoverable objective ground truth.

---

## 34. Security Properties

### 34.1 Attribution

Signed objects provide cryptographic attribution to keys.

### 34.2 Integrity

Content hashes and signatures detect modification.

### 34.3 Confidentiality in transit

Secure transport protects node-to-node sessions.

### 34.4 Replay resistance

Signed timestamps, nonces, expirations, sequence numbers, and state versioning mitigate replay depending on message type.

### 34.5 Revocation

Keys, capabilities, credentials, and claims require explicit revocation/supersession semantics.

### 34.6 Provenance integrity

A provenance link references immutable object identifiers and is covered by the issuer's signature.

This does not prove the provenance statement is truthful; it makes fabrication attributable.

---

## 35. Sybil Attacks

Douceur's result means a purely open network cannot treat identity creation as equivalent to independent authority [10].

TRUYN therefore SHOULD combine several defenses:

1. **lineage-aware weighting** — duplicates of the same source do not multiply truth;
2. **domain history** — new identities start uncertain;
3. **rate limits** — identity creation does not imply unlimited network influence;
4. **diversity requirements** — high-risk policies demand independent evidence roots;
5. **optional credentials** — organizations, sensors, or operators can present verifiable credentials;
6. **optional remote attestation** — integrity-sensitive capabilities can prove platform state;
7. **resource/accountability mechanisms** — deployments may require deposits, quotas, proof-of-resource, contractual identity, or other admission costs;
8. **graph anomaly detection** — coordinated clusters can be down-weighted;
9. **local policy** — no node is required to accept a global reputation authority.

No single mechanism is presented as a universal Sybil solution.

---

## 36. Collusion and Reputation Farming

Attackers may behave honestly long enough to accumulate historical reputation and then coordinate false claims.

Mitigations include:

- time-decayed history;
- sudden-behavior anomaly penalties;
- domain-specific reputation;
- corroboration requirements independent of node reputation;
- provenance diversity;
- revocable verifier roles;
- random verifier selection for high-risk challenges.

Historical reputation should influence trust, not replace evidence.

---

## 37. Byzantine Disagreement

Classical Byzantine agreement research demonstrates that distributed agreement has hard limits under arbitrary faults [12]. Open-world factual claims add another complication: different honest nodes may observe different local realities.

TRUYN therefore distinguishes:

```text
consensus
```

from:

```text
truth
```

Consensus is one input to trustability. It is never defined as truth by protocol fiat.

---

## 38. Privacy

A capability network can create substantial privacy risks if capability advertisements, queries, identities, or trust relations become globally observable.

A production design must therefore address:

- minimal disclosure in capability advertisements;
- private or scoped DHT namespaces;
- encrypted query payloads;
- relay privacy;
- pseudonymous identities where acceptable;
- selective disclosure of credentials;
- local computation for sensitive data;
- private trust policies;
- retention limits;
- traffic-analysis resistance where required.

The W3C Verifiable Credentials model provides relevant standardized concepts for machine-verifiable claims and privacy-respecting credential presentation [15]. TRUYN may reuse compatible credential representations without requiring a Web-specific transport architecture.

---

# Part V — Immediate Implementation

## 39. The `truynd` Daemon

The smallest deployable unit is a single local daemon:

```text
truynd
```

A reference process can contain:

```text
┌─────────────────────────────────────┐
│ local adapter server                │
│ SDK / tool interface / gateway      │
├─────────────────────────────────────┤
│ intent resolver                     │
│ capability registry                 │
│ trustability engine                 │
│ provenance graph                    │
│ state/cache store                   │
│ verifier scheduler                  │
├─────────────────────────────────────┤
│ DHT / peer discovery                │
│ gossip / subscription dissemination │
│ relay / NAT traversal support       │
├─────────────────────────────────────┤
│ QUIC secure transport               │
├─────────────────────────────────────┤
│ UDP / IP                            │
└─────────────────────────────────────┘
```

The user installs one program. Existing network infrastructure remains unchanged.

---

## 40. Agent Integration

TRUYN must not require modification of model weights or inference engines.

An agent connects through an adapter and receives a minimal network API:

```text
need(...)
offer(...)
claim(...)
attest(...)
verify(...)
subscribe(...)
revoke(...)
```

This can be exposed through:

- a local tool protocol;
- a Unix socket;
- local HTTP;
- language SDKs;
- an agent-framework adapter;
- an MCP-compatible bridge;
- a command-line interface.

The adapter is replaceable. The network is not.

This distinction avoids making TRUYN dependent on a particular AI vendor.

---

## 41. Legacy Internet Gateway

Adoption requires coexistence.

A gateway can translate:

```text
TRUYN NEED
     ↓
legacy HTTP/API request
     ↓
legacy result
     ↓
CLAIM + provenance + trust metadata
```

The gateway does not magically make legacy data trustworthy. It makes the origin, transformation, timestamp, and verification path explicit.

This enables gradual migration rather than a flag day.

---

## 42. Minimum Viable Network

A credible v0.1 demonstration requires only two computers and optional bootstrap infrastructure.

### Node A

```text
ordinary laptop
truynd
agent A
```

### Node B

```text
ordinary laptop
truynd
agent B
```

Node B advertises:

```text
OFFER capability = weather.current
```

Node A submits:

```text
NEED
capability = weather.current
subject = almaty.temperature
trustability_min = 0.80
```

The network performs:

```text
capability discovery
→ provider selection
→ authenticated transport
→ execution
→ signed claim
→ trust evaluation
→ result
```

The requester never needs to know Node B's stable IP address or vendor-specific application endpoint in advance.

That is the first falsifiable proof of the architecture.

---

# Part VI — Quantitative Analysis

## 43. Communication Cost Model

Let a conventional transaction transfer:

$$
B_{legacy} = B_{headers} + B_{request} + B_{response} + B_{duplicated\ state}.
$$

A TRUYN transaction transfers:

$$
B_{truyn} = B_{envelope} + B_{intent} + B_{minimum\ result} + B_{required\ evidence}.
$$

The architecture is useful when:

$$
B_{truyn} < B_{legacy}
$$

without reducing task correctness below required policy thresholds.

TRUYN does not guarantee this inequality for every workload. Large evidence bundles or low cache reuse can make TRUYN equal or more expensive. The goal is to expose network primitives that allow the inequality to be optimized rather than structurally forcing full transfers.

---

## 44. Derived Example A — Delta Versus Full State

Assume:

- full shared state = 1 MiB = 1,048,576 bytes;
- meaningful update payload = 64 bytes;
- signed TRUYN delta envelope and metadata = 192 bytes;
- total delta transfer = 256 bytes.

Then the payload ratio is:

$$
R = \frac{1,048,576}{256} = 4096.
$$

**Derived result:** under these explicit assumptions, a delta transfer is **4,096× smaller** than retransmitting the full state.

This is not a measured universal TRUYN result. It illustrates why delta-oriented state exchange can matter when state is large and changes are sparse.

---

## 45. Derived Example B — Compute Near Data

Assume:

- data near provider = 100 MiB;
- remote query = 1 KiB;
- result = 64 bytes;
- proof/evidence omitted from this simplified calculation.

Moving data to the requester requires approximately:

$$
V_1 = 100\ MiB + 1\ KiB + 64\ B.
$$

Moving the query to the data requires:

$$
V_2 = 1\ KiB + 64\ B.
$$

The reduction in long-haul payload is approximately:

$$
1 - \frac{V_2}{V_1} \approx 99.99896\%.
$$

**Derived result:** when a large local dataset can be reduced to a tiny trusted result, compute placement can dominate transport optimization.

The real system must include evidence overhead, compute cost, privacy, and trust constraints.

---

## 46. Derived Example C — Origin Egress With Cache Reuse

Assume:

- result + signed envelope = 704 bytes;
- 10,000 consumers request the same result within its valid freshness window;
- a cache can satisfy subsequent requests.

Without reuse, origin egress is:

$$
10,000 \times 704 = 7,040,000\ bytes.
$$

With one origin fetch followed by downstream cache delivery, origin egress is approximately:

$$
704\ bytes
$$

for that object instance.

**Derived result:** origin egress falls by approximately 99.99% for this highly cacheable workload.

Total network delivery does not become 704 bytes; downstream copies still exist. The optimization concerns redundant origin traffic and repeated origin computation.

---

## 47. Discovery Complexity

Kademlia's structured overlay design provides lookup behavior logarithmic in network size under its assumptions [5]. Conceptually:

$$
Hops = O(\log N).
$$

This makes DHT-based capability discovery plausible for large overlays, although real-world latency, churn, NAT, adversarial behavior, and provider-record volume must be benchmarked.

---

## 48. Trust Verification Cost

Let:

- \(n\) = raw attestations;
- \(g\) = independent provenance groups;
- \(k\) = attestations sampled or required for a decision;
- \(S_a\) = average attestation size.

Naively downloading all evidence costs:

$$
B_{verify-naive} = n S_a.
$$

A trust-receipt design can reduce consumer-side transfer to:

$$
B_{consumer} = S_{receipt} + S_{proof\ subset}
$$

while verifier infrastructure performs the larger aggregation work.

The system therefore separates **verification work** from **verification result distribution**.

This is analogous to many distributed systems in which expensive validation produces compact reusable authenticated state.

---

## 49. Latency Decomposition

A TRUYN request has approximate end-to-end latency:

$$
L_{total} =
L_{local}
+ L_{discovery}
+ L_{connect}
+ L_{provider}
+ L_{verification}
+ L_{return}.
$$

On a warm path with known peers and cached trust state:

$$
L_{discovery} \rightarrow 0,
\qquad
L_{connect} \rightarrow 0
$$

or becomes negligible relative to provider execution.

On a cache hit:

$$
L_{provider} \rightarrow 0.
$$

On a high-risk cold path, verification may make TRUYN slower than a direct API call. That is not necessarily a failure: the requester explicitly asked for stronger assurance.

The correct comparison is therefore **latency at equal trust requirements**, not latency in isolation.

---

## 50. Optimization Objective

A general network optimization can be stated as:

$$
\min_{route,provider,verify,compute}
\quad
\alpha B + \beta L + \gamma C + \delta E
$$

subject to:

$$
T \ge T_{min}
$$

$$
F \ge F_{min}
$$

$$
Privacy \in AllowedPolicy
$$

$$
CorrectnessRisk \le R_{max}.
$$

Where:

- \(B\) = transmitted bytes;
- \(L\) = latency;
- \(C\) = monetary/compute cost;
- \(E\) = energy or resource proxy;
- \(T\) = trustability;
- \(F\) = freshness.

This formulation captures the central difference between TRUYN and ordinary endpoint routing: **trust and task utility enter the routing decision explicitly.**

---

# Part VII — Worked Protocol Flows

## 51. Flow 1 — Trusted Current Observation

Requester:

```text
NEED
capability: weather.current
subject: almaty.temperature
freshness_max: 10s
trustability_min: 0.99
independent_lineages_min: 3
```

Network:

1. resolves capable providers;
2. removes stale or low-integrity providers;
3. selects independent sources where possible;
4. retrieves signed observations;
5. builds provenance graph;
6. detects common upstream origins;
7. computes trustability vector;
8. requests additional verification if threshold is not met;
9. returns result and trust receipt.

Result:

```text
value: 24.7 C
observed_at: ...
trustability: 0.994
independent_lineages: 4
provenance_root: ...
```

The result is not merely a number. It is a number with an explicit machine-readable basis for reliance.

---

## 52. Flow 2 — Agent Capability Invocation

Node B advertises:

```text
OFFER
capability: code.review
languages: [python, rust]
max_context: ...
price: ...
```

Node A submits:

```text
NEED
capability: code.review
artifact_id: sha256:...
policy:
  trustability_min: 0.85
  max_latency: 30s
```

The network selects a provider based on capability, historical task quality, cost, latency, and requester policy.

The provider returns:

```text
RESULT
artifact: ...
claim: review outcome
provenance: input artifact + provider identity + model/runtime metadata
trustability: ...
```

The two agents do not require a shared vendor backend.

---

## 53. Flow 3 — State Subscription

Requester:

```text
SUBSCRIBE
subject: machine/42/vibration
condition: anomaly_score > 0.8
```

Provider maintains local high-frequency sensor data. No raw stream crosses the WAN while the condition is false.

When triggered:

```text
DELTA
subject: machine/42/vibration
anomaly_score: 0.87
window: ...
evidence_digest: ...
```

If the decision policy requires it, the requester can subsequently request the raw evidence window.

This implements **progressive disclosure of information according to task need**.

---

## 54. Flow 4 — Contradictory Claims

Provider A:

```text
CLAIM X = 24.7
```

Provider B:

```text
CLAIM X = 31.1
```

The network does not force an immediate majority answer.

Instead:

1. create a dispute relation;
2. inspect provenance;
3. compare observation times and locations;
4. check source integrity;
5. solicit independent evidence if required;
6. update both trustability estimates;
7. expose residual uncertainty.

A valid response may be:

```text
status: unresolved
candidate_1: 24.7, trustability 0.73
candidate_2: 31.1, trustability 0.69
additional verification required
```

Uncertainty is information. A trustworthy system must be able to return it.

---

# Part VIII — Evaluation Methodology

## 55. Reference Implementation Evaluation

The first implementation should be evaluated in controlled stages.

### Stage A — two-node correctness

Validate:

- identity creation;
- secure connection;
- capability advertisement;
- NEED resolution;
- signed result;
- claim verification;
- local trust computation.

### Stage B — 10–100 node overlay

Measure:

- discovery latency;
- route convergence;
- provider churn;
- cache hit rate;
- duplicate suppression;
- state-delta savings;
- verification overhead.

### Stage C — 1,000+ containerized nodes

Measure:

- DHT lookup hops;
- bandwidth per node;
- bootstrap pressure;
- gossip overhead;
- trust graph growth;
- adversarial behavior;
- Sybil amplification;
- verifier sampling strategies.

### Stage D — heterogeneous real Internet nodes

Deploy across:

- residential NAT;
- cloud VMs;
- mobile access;
- different countries and autonomous systems;
- intermittent nodes.

Measure reachability, relay dependence, path migration, and real latency.

---

## 56. Required Metrics

The project should publish reproducible metrics for:

### Network metrics

- successful peer discovery rate;
- median/P95/P99 discovery latency;
- median/P95/P99 request latency;
- relay rate;
- bytes per completed intent;
- control-plane overhead;
- cache hit ratio;
- provider failover time.

### State metrics

- full-state bytes avoided;
- average delta/full-state ratio;
- convergence time;
- conflict frequency.

### Trust metrics

- calibration of trustability score;
- false acceptance rate;
- false rejection rate;
- time to detect compromised source;
- Sybil amplification factor;
- lineage-collapse accuracy;
- verifier disagreement rate;
- trust-update propagation latency.

### Compute metrics

- compute-near-data bandwidth savings;
- redundant inference avoided;
- provider selection overhead;
- cost per completed intent.

### Security metrics

- replay rejection;
- invalid-signature rejection;
- cache-poisoning resilience;
- eclipse resistance under defined attacker fractions;
- collusion-detection performance.

---

## 57. Benchmark Principles

All published TRUYN benchmarks should specify:

1. hardware;
2. software commit hash;
3. node count;
4. topology;
5. workload;
6. payload sizes;
7. trust policy;
8. attacker model;
9. warm/cold cache state;
10. network conditions;
11. statistical confidence intervals.

Performance claims without these parameters should not be treated as scientific evidence.

---

# Part IX — Utility and Expected Impact

## 58. Reduced Endpoint Dependence

Applications can request capabilities rather than bind permanently to vendor endpoints. This improves provider portability and creates a natural substrate for failover and market competition.

---

## 59. Lower Redundant Data Movement

State deltas, cache reuse, subscriptions, and compute-near-data can reduce traffic where workloads contain repeated requests, sparse changes, or large input/small output transformations.

The magnitude is workload-dependent and must be measured, not assumed.

---

## 60. Lower Redundant Computation

If an identical result already exists, remains fresh, satisfies provenance requirements, and meets the requester's trust policy, a cached result can replace repeated computation.

This is especially relevant for expensive inference and verification tasks.

---

## 61. Native Multi-Provider Resilience

Because requests target a capability rather than a hard-coded server, multiple providers can satisfy the same logical need. Provider failure becomes a routing event rather than necessarily an application outage.

---

## 62. Machine-Readable Provenance

A result can carry a graph of how it was produced. This provides a foundation for auditing, dispute resolution, source-independence analysis, and reproducible computation.

---

## 63. Contextual Trust Rather Than Blind Trust

The network can distinguish:

```text
valid signature
```

from:

```text
strong factual evidence
```

and can distinguish:

```text
100,000 repetitions
```

from:

```text
100 independent observations.
```

This is likely to become increasingly important as synthetic content and autonomous agents amplify information at machine speed.

---

## 64. Data Locality and Privacy

When raw data need not leave its origin, TRUYN can enable computations that expose only a result, aggregate, or proof. This can reduce unnecessary disclosure and lower transport volume simultaneously.

It does not eliminate privacy risks; it gives routing and application policy an explicit way to reason about locality.

---

## 65. A Market of Capabilities

The same protocol can support a decentralized capability market.

Nodes may advertise:

```text
inference
translation
verification
storage
sensor access
research
transcoding
simulation
fact checking
specialized computation
```

A requester can select among them by:

- price;
- latency;
- quality;
- trustability;
- geography;
- privacy;
- availability.

The network thus becomes not only a transport substrate but also a **discovery and execution fabric for machine capabilities**.

---

# Part X — Comparison With Adjacent Architectures

## 66. Versus Conventional HTTP/API Architecture

HTTP APIs answer:

```text
How do I invoke this known endpoint?
```

TRUYN answers:

```text
Who can satisfy this need under these constraints?
```

HTTP remains useful and can exist beneath or behind a TRUYN gateway.

---

## 67. Versus Information-Centric Networking

ICN/NDN makes named data the central network object [2][4]. TRUYN preserves that insight but adds first-class concepts for:

- capabilities;
- computation;
- claims;
- evidence;
- trustability;
- state deltas;
- agent intent.

TRUYN is therefore **intelligence-centric rather than purely content-centric**.

---

## 68. Versus Peer-to-Peer Networks

Conventional P2P overlays solve discovery, routing, file/content distribution, messaging, or consensus problems.

TRUYN uses P2P mechanisms but adds a semantic network contract around intent and trustability.

P2P is an implementation property. Intelligence-centric communication is the architectural objective.

---

## 69. Versus Agent Communication Protocols

Agent protocols generally define how agents describe messages, tasks, tools, or workflows.

TRUYN operates one level lower and broader:

- how an unknown provider is discovered;
- how provider identity persists independently of location;
- how claims are routed and cached;
- how state is synchronized;
- how evidence is attributed;
- how trustability influences provider selection;
- how the network coexists with the current Internet.

Agent protocols can run **over TRUYN**.

---

## 70. Versus Blockchain

TRUYN does not require every statement or state transition to enter a global replicated ledger.

Global consensus is expensive and unnecessary for many machine communications. Weather observations, local sensor readings, temporary inference results, and private computations often require selective verification, not global total ordering.

Blockchains or distributed ledgers may be used optionally for narrow functions such as economic settlement, durable public commitments, or identity collateral. They are not the foundational network architecture.

---

# Part XI — Limitations and Open Research Problems

## 71. Truth Cannot Be Fully Automated

No trustability formula can guarantee truth for arbitrary open-world propositions.

TRUYN can improve the quality of machine decisions by making evidence, provenance, independence, uncertainty, and source behavior explicit. It cannot convert epistemology into a perfect scalar oracle.

The architecture must preserve uncertainty rather than hide it.

---

## 72. Sybil Resistance Requires Assumptions

Open identity systems cannot obtain strong Sybil resistance from identity count alone [10]. High-assurance deployments may need external scarcity, credentials, attestation, organizational identity, deposits, rate limits, or controlled membership.

TRUYN should support multiple admission models rather than pretending one solution fits all environments.

---

## 73. Provenance Can Be Falsified

A malicious source can lie about provenance. Cryptographic signatures make the lie attributable but do not automatically expose it.

Independent verification, reproducible computation, primary evidence, and cross-source consistency are still necessary.

---

## 74. Trust Graph Scalability

A global claim/evidence graph could become enormous. The implementation therefore requires:

- locality;
- expiration;
- pruning;
- compact receipts;
- content-addressed deduplication;
- probabilistic or sampled verification;
- domain partitioning;
- archival policy.

The entire global trust graph should never be required on every node.

---

## 75. Semantic Interoperability

Two nodes can share a transport and still disagree about what a capability or field means.

TRUYN requires versioned schemas and namespaces but should avoid imposing one universal ontology. Schema negotiation and semantic compatibility remain significant research and engineering topics.

---

## 76. Incentives

Open nodes incur bandwidth, compute, verification, storage, and relay costs. A global network requires incentive mechanisms or reciprocal benefit sufficient to support public infrastructure.

Economic settlement is therefore part of the longer-term research agenda.

---

## 77. Privacy Versus Trust Transparency

Provenance improves trust but can reveal organizational relationships, geographic locations, infrastructure, or user behavior. Privacy-preserving provenance and selective disclosure will require careful design.

---

## 78. Adversarial Machine Learning

If trust engines use learned anomaly detectors, they become machine-learning attack surfaces themselves. Poisoning, evasion, model drift, and explainability must be addressed independently from network cryptography.

---

# Part XII — Engineering Roadmap

## 79. Phase 0 — Specification

Deliver:

- core object model;
- canonical schemas;
- wire encoding;
- Node ID format;
- primitive semantics;
- trust vector definition;
- threat model;
- conformance fixtures.

---

## 80. Phase 1 — Two-Node Reference Implementation

Deliver:

- `truynd`;
- secure node identity;
- QUIC transport;
- local SDK;
- OFFER and NEED;
- CLAIM and RESULT;
- basic signed trust receipt;
- two-machine demonstration.

Acceptance criterion:

> Node A discovers and invokes an unknown capability on Node B without prior knowledge of Node B's application endpoint and receives a signed result with machine-readable trust metadata.

---

## 81. Phase 2 — Decentralized Discovery

Deliver:

- DHT discovery;
- capability TTL;
- provider failover;
- bootstrap diversity;
- relay/NAT traversal;
- local caching.

---

## 82. Phase 3 — Trustability Network

Deliver:

- provenance graph;
- attestations;
- disputes;
- historical domain reputation;
- lineage collapse;
- independence scoring;
- real-time trust updates;
- verifier delegation.

---

## 83. Phase 4 — State and Compute Routing

Deliver:

- DELTA;
- SUBSCRIBE;
- cache-aware resolution;
- compute-near-data decisions;
- privacy/locality constraints.

---

## 84. Phase 5 — Open Federation

Deliver:

- third-party node implementations;
- public interoperability test suite;
- multiple independent bootstrap operators;
- protocol version negotiation;
- governance process;
- reproducible public benchmarks.

At that point, success should be measured by independent implementations, not only by the original repository.

---

# Part XIII — Proposed Repository Structure

A reference open-source repository can evolve toward:

```text
truyn/
├── README.md
├── MANIFESTO.md
├── WHITEPAPER.md
├── LICENSE
│
├── spec/
│   ├── TRP-0001-core.md
│   ├── TRP-0002-identity.md
│   ├── TRP-0003-wire.md
│   ├── TRP-0004-discovery.md
│   ├── TRP-0005-trustability.md
│   ├── TRP-0006-state.md
│   └── TRP-0007-security.md
│
├── proto/
│   └── schemas/
│
├── daemon/
│   └── truynd/
│
├── trust/
│   └── engine/
│
├── adapters/
│   ├── mcp/
│   ├── local-api/
│   └── gateway-http/
│
├── sdk/
│   ├── rust/
│   ├── python/
│   └── typescript/
│
├── bootstrap/
├── conformance/
└── examples/
    ├── two-nodes/
    ├── trusted-weather/
    └── multi-agent/
```

The protocol specification must remain separable from the reference code so that independent implementations can emerge.

---

# Part XIV — Research Hypotheses

The project should be explicit about hypotheses that can be falsified.

## H1 — Capability routing

For workloads with interchangeable providers, capability-based resolution can reduce provider coupling without unacceptable discovery latency.

## H2 — State efficiency

For workloads with sparse state change, DELTA-based exchange materially reduces transferred bytes compared with repeated complete state transfer.

## H3 — Cache efficiency

For repeated identical or equivalent intents within result freshness windows, signed result caching reduces redundant origin computation and egress.

## H4 — Compute locality

For workloads with large input data and small result size, compute-near-data routing materially reduces long-haul data transfer.

## H5 — Provenance-aware trust

A trust engine that discounts correlated information lineages is more resistant to repetition-based misinformation than raw majority voting.

## H6 — Domain-specific reputation

Domain-specific historical accuracy produces better calibration than one global node reputation for heterogeneous capabilities.

## H7 — Active verification

Risk-adaptive verification can achieve higher assurance for high-impact decisions without imposing maximum verification cost on every low-risk request.

## H8 — Overlay deployability

The architecture can achieve useful peer connectivity and latency across ordinary existing Internet connections without modification to access routers.

Each hypothesis requires published experimental evidence.

---

# 85. Conclusion

The Internet's existing physical and transport infrastructure is not obsolete. Fiber, radio, routers, IP, secure transport, data centers, personal computers, and edge devices are an extraordinary installed base. Replacing them is neither necessary nor realistic for a near-term redesign of machine communication.

The more practical opportunity is to change the **logical contract** above that infrastructure.

The present Internet is principally excellent at answering:

> Where should these bytes be delivered?

TRUYN proposes a complementary network capable of answering:

> What is needed?  
> Who or what can provide it?  
> What state already exists?  
> What is the minimum information that must move?  
> What evidence supports the result?  
> How independent are the sources?  
> How trustworthy is this claim for this decision, now?

The architecture replaces neither information theory nor packet networking. It builds on them. It reuses peer-to-peer discovery rather than inventing centralized discovery. It reuses secure transports rather than inventing new physical connectivity. It adopts lessons from information-centric networking, replicated state, distributed reputation, semantic communication, remote attestation, and Byzantine systems.

Its proposed novelty is the integration of these mechanisms around **intelligence as the network participant and trustability as a first-class routing dimension**.

The design can begin as a daemon on two ordinary computers. If the model is useful, it can scale through independent nodes, providers, verifiers, gateways, and implementations. If parts of the architecture later benefit from programmable network hardware, those optimizations can follow without being prerequisites for adoption.

The most important design constraint is epistemic as much as technical: the system must not confuse cryptographic identity with truth, popularity with independence, consensus with reality, or numerical confidence with certainty.

A trustworthy intelligence network should be able to say **“I do not know yet”** and actively acquire better evidence.

TRUYN therefore proposes a progression:

```text
host location        → capability
opaque request       → intent
full retransmission  → state / delta
blind repetition     → provenance
source reputation    → claim-specific trustability
central service      → discoverable intelligence
machine-to-machine   → intelligence-to-intelligence
```

The immediate research question is not whether a hypothetical future Internet can be redesigned from the ground up.

It is whether a materially better machine network can be deployed **now**, over the infrastructure already in place.

TRUYN is a concrete architecture for testing that proposition.

---

# References

The references below prioritize peer-reviewed academic publications, original research papers, and primary standards documents. Standards are included where they define concrete deployable mechanisms used by the proposed architecture.

**[1]** C. E. Shannon, “A Mathematical Theory of Communication,” *Bell System Technical Journal*, vol. 27, no. 3, pp. 379–423, 1948; vol. 27, no. 4, pp. 623–656, 1948. DOI: 10.1002/j.1538-7305.1948.tb01338.x and 10.1002/j.1538-7305.1948.tb00917.x.  
https://doi.org/10.1002/j.1538-7305.1948.tb01338.x

**[2]** V. Jacobson, D. K. Smetters, J. D. Thornton, M. F. Plass, N. H. Briggs, and R. L. Braynard, “Networking Named Content,” *Proceedings of the 5th International Conference on Emerging Networking Experiments and Technologies (CoNEXT ’09)*, 2009. DOI: 10.1145/1658939.1658941.  
https://doi.org/10.1145/1658939.1658941

**[3]** L. Zhang et al., “Named Data Networking,” *ACM SIGCOMM Computer Communication Review*, vol. 44, no. 3, pp. 66–73, 2014. DOI: 10.1145/2656877.2656887.  
https://doi.org/10.1145/2656877.2656887

**[4]** B. Wissingh, C. Wood, A. Afanasyev, L. Zhang, D. Oran, and C. Tschudin, “Information-Centric Networking (ICN): Content-Centric Networking (CCNx) and Named Data Networking (NDN) Terminology,” IRTF RFC 8793, June 2020. DOI: 10.17487/RFC8793.  
https://doi.org/10.17487/RFC8793

**[5]** P. Maymounkov and D. Mazières, “Kademlia: A Peer-to-Peer Information System Based on the XOR Metric,” *Peer-to-Peer Systems, IPTPS 2002*, Lecture Notes in Computer Science, vol. 2429, pp. 53–65, 2002. DOI: 10.1007/3-540-45748-8_5.  
https://doi.org/10.1007/3-540-45748-8_5

**[6]** J. Iyengar and M. Thomson, “QUIC: A UDP-Based Multiplexed and Secure Transport,” IETF RFC 9000, May 2021. DOI: 10.17487/RFC9000.  
https://doi.org/10.17487/RFC9000

**[7]** P. Bosshart et al., “P4: Programming Protocol-Independent Packet Processors,” *ACM SIGCOMM Computer Communication Review*, vol. 44, no. 3, pp. 87–95, 2014. DOI: 10.1145/2656877.2656890.  
https://doi.org/10.1145/2656877.2656890

**[8]** P. S. Almeida, A. Shoker, and C. Baquero, “Delta State Replicated Data Types,” *Journal of Parallel and Distributed Computing*, vol. 111, pp. 162–173, 2018. DOI: 10.1016/j.jpdc.2017.08.003.  
https://doi.org/10.1016/j.jpdc.2017.08.003

**[9]** S. D. Kamvar, M. T. Schlosser, and H. Garcia-Molina, “The EigenTrust Algorithm for Reputation Management in P2P Networks,” *Proceedings of the 12th International Conference on World Wide Web (WWW ’03)*, pp. 640–651, 2003. DOI: 10.1145/775152.775242.  
https://doi.org/10.1145/775152.775242

**[10]** J. R. Douceur, “The Sybil Attack,” *Peer-to-Peer Systems, IPTPS 2002*, Lecture Notes in Computer Science, vol. 2429, pp. 251–260, 2002. DOI: 10.1007/3-540-45748-8_24.  
https://doi.org/10.1007/3-540-45748-8_24

**[11]** H. Birkholz, D. Thaler, M. Richardson, N. Smith, and W. Pan, “Remote ATtestation procedureS (RATS) Architecture,” IETF RFC 9334, January 2023. DOI: 10.17487/RFC9334.  
https://doi.org/10.17487/RFC9334

**[12]** L. Lamport, R. Shostak, and M. Pease, “The Byzantine Generals Problem,” *ACM Transactions on Programming Languages and Systems*, vol. 4, no. 3, pp. 382–401, 1982. DOI: 10.1145/357172.357176.  
https://doi.org/10.1145/357172.357176

**[13]** S. Josefsson and I. Liusvaara, “Edwards-Curve Digital Signature Algorithm (EdDSA),” IRTF RFC 8032, January 2017. DOI: 10.17487/RFC8032.  
https://doi.org/10.17487/RFC8032

**[14]** C. Bormann and P. Hoffman, “Concise Binary Object Representation (CBOR),” IETF RFC 8949, December 2020. DOI: 10.17487/RFC8949.  
https://doi.org/10.17487/RFC8949

**[15]** W3C Verifiable Credentials Working Group, “Verifiable Credentials Data Model v2.0,” W3C Recommendation, 15 May 2025.  
https://www.w3.org/TR/vc-data-model-2.0/

**[16]** S. Eum et al., “Information-Centric Networking: Baseline Scenarios,” IRTF RFC 7476, March 2015. DOI: 10.17487/RFC7476.  
https://doi.org/10.17487/RFC7476

**[17]** J. Bao, P. Basu, M. Dean, C. Partridge, A. Swami, W. Leland, and J. A. Hendler, “Towards a Theory of Semantic Communication,” *2011 IEEE Network Science Workshop*, pp. 110–117, 2011. DOI: 10.1109/NSW.2011.6004632.  
https://doi.org/10.1109/NSW.2011.6004632

**[18]** H. Xie, Z. Qin, G. Y. Li, and B.-H. Juang, “Deep Learning Enabled Semantic Communication Systems,” *IEEE Transactions on Signal Processing*, vol. 69, pp. 2663–2675, 2021. Preprint: arXiv:2006.10685. DOI: 10.1109/TSP.2021.3071210.  
https://doi.org/10.1109/TSP.2021.3071210

**[19]** A. Li, S. Wu, S. Meng, R. Lu, S. Sun, and Q. Zhang, “Towards Goal-Oriented Semantic Communications: New Metrics, Open Challenges, and Future Research Directions,” arXiv:2304.00848, 2023; later journal/conference versions may supersede the preprint.  
https://arxiv.org/abs/2304.00848

**[20]** M. Wählisch et al., “Information-Centric Networking (ICN) Research Challenges,” IRTF RFC 7927, July 2016. DOI: 10.17487/RFC7927.  
https://doi.org/10.17487/RFC7927

**[21]** S. Mastorakis, D. Oran, J. Gibson, I. Moiseenko, and R. Droms, “Information-Centric Networking (ICN) Ping Protocol Specification,” IRTF RFC 9508, March 2024. DOI: 10.17487/RFC9508.  
https://doi.org/10.17487/RFC9508

**[22]** S. Mastorakis, D. Oran, I. Moiseenko, J. Gibson, and R. Droms, “Information-Centric Networking (ICN) Traceroute Protocol Specification,” IRTF RFC 9507, March 2024. DOI: 10.17487/RFC9507.  
https://doi.org/10.17487/RFC9507

---

## Reference Notes

1. **Prior art is acknowledged deliberately.** TRUYN does not claim invention of DHTs, ICN, cryptographic signatures, QUIC, CRDTs, reputation propagation, remote attestation, or semantic communication.
2. **The architecture is a synthesis.** The proposed research contribution is the composition of these ideas into an immediately deployable, trust-aware, capability- and intent-routed intelligence overlay.
3. **Trustability remains a research problem.** The formulas in this whitepaper define an initial transparent model suitable for implementation and experimentation; they are not asserted to be the final or universally optimal estimator of truth.
4. **Benchmarks must follow implementation.** Derived examples in this paper are arithmetic illustrations under stated assumptions and must not be cited as measured TRUYN performance.
5. **Protocol evolution should remain open.** A successful architecture should be specified independently enough that multiple interoperable implementations can challenge and improve the reference implementation.

---

**TRUYN — The Intelligence Network**  
**Intelligence to intelligence. Trust computed, not assumed.**
