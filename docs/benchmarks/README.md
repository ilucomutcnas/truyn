# TRUYN Benchmark Evidence

`docs/benchmarks/` is the public, reviewable evidence ledger for TRUYN benchmark claims.

## Evidence preservation rule

Published benchmark reports are **append-only evidence**. Security cleanup must not delete a report merely because it contains a field that should not be public.

If a report contains sensitive operational information:

1. redact only the sensitive field or value;
2. preserve the report filename and benchmark date;
3. preserve measured results, methodology, limitations and acceptance gates;
4. preserve tested commit SHA, workflow/run identity, artifact identity and artifact digest when those identifiers are not themselves sensitive;
5. add a clear redaction note when a material evidence field was removed or generalized;
6. keep the correction/redaction in Git history.

Credentials, private keys, privileged cloud identities, private origins, secret-bearing URLs, customer data, private deployment/resource names, live allowlists, exact live quota/cost ceilings and other operational secrets remain forbidden. Raw logs/artifacts containing such data belong outside the public repository. Safe identifiers and cryptographic digests may be retained here so the public report remains auditable.

Deleting or replacing a measured report with a summary/stub is not an acceptable security response. If a published report is proven invalid or duplicated, retain an explicit tombstone/correction that points to the superseding evidence rather than silently removing the record.

The repository regression suite treats established evidence files as protected and fails if they disappear or are replaced by trivial stubs.

## Current productionization gate — 2026-08-20 snapshot

Class B and Class C have durable accepted reports below. **Class D-100 has not yet been promoted to PASS in this ledger.**

The current pinned V14 acceptance run is `32367799512`, testing immutable commit `b835c8fa0283a004d616ce8d25d7aa78cee1a1c0`. At the documentation snapshot, immutable preflight and Azure login had passed and the real 4-host/100-node campaign was still running. Canonical post-cleanup evaluation, strict terminal verification and a durable accepted report were still pending.

Therefore:

- do not infer D-100 PASS from the existence of a workflow/harness;
- do not overwrite the historical failed `CLASS_D_100_ATTEMPT_2026-08-17.md`;
- if a fresh run passes, publish a **new** dated D-100 acceptance report with tested commit, run/artifact identity/digest, fixed thresholds, measured results, limitations and cleanup proof;
- then update the status-bearing docs in the same synchronization.

## Current evidence ledger

### Measured results

- [`CLASS_C_HETEROGENEOUS_WAN_2026-08-18.md`](CLASS_C_HETEROGENEOUS_WAN_2026-08-18.md) — **accepted Class C** heterogeneous Azure/GCP WAN/reachability proof: direct cross-cloud QUIC with zero relay calls, real packet-path partition/heal, real Azure NAT source observation, two-layer CGNAT-like outbound path, authenticated relay fallback, outage fail-closed, recovery, and complete ephemeral cleanup; explicitly does not claim carrier-field CGNAT, 100/1,000-node scale or operational closure.
- [`NETWORK_PRODUCTIONIZATION_AZURE_4HOST_2026-08-17.md`](NETWORK_PRODUCTIONIZATION_AZURE_4HOST_2026-08-17.md) — **accepted Class B** four-host Azure productionization proof: real public UDP/QUIC direct NEED with zero relay calls, injected partition/heal, 3-of-3 DHT replication and remote read, real holder-process failure, 5,097 ms replacement repair, restart identity/sequence continuity, stale DHT-client invalidation, and complete ephemeral cleanup; explicitly does not claim packet-path WAN partition, NAT/CGNAT, 100/1,000 real-node scale or mainnet readiness.
- [`V01_CONNECT_GATE_2026-08-17.md`](V01_CONNECT_GATE_2026-08-17.md) — first real lower-network gate: real QUIC/UDP signed NEED transport, authenticated peer sessions, relay-free three-node Kademlia discovery/state, STUN/same-port hole punching, explicit relay fallback and backpressure.
- [`KADEMLIA_QUIC_TRUST_TESTNET_2026-08-17.md`](KADEMLIA_QUIC_TRUST_TESTNET_2026-08-17.md) — real libp2p QUIC/Kademlia trust-lifecycle testnet proof: four-node topology, relay-free signed verifier discovery, durable transparency replication/recovery through bootstrap loss, verifier transport-ID rotation with stale-provider tolerance, revocation convergence, Trust Receipt v2 staleness after revocation, and zero relay calls in the tested path.
- [`CROSS_CLOUD_AB_2026-08-15.md`](CROSS_CLOUD_AB_2026-08-15.md) — first paired Azure OpenAI → Vertex Gemini direct-vs-TRUYN baseline; includes the negative baseline result and per-sample evidence.
- [`CROSS_CLOUD_8X_OPTIMIZATION_2026-08-15.md`](CROSS_CLOUD_8X_OPTIMIZATION_2026-08-15.md) — fixed 8× hot-path optimization gate; measured protocol and orchestration overhead.
- [`CONTEXT_EFFICIENCY_2026-08-15.md`](CONTEXT_EFFICIENCY_2026-08-15.md) — content-addressed context and signed-delta economic A/B gate.
- [`SEMANTIC_RETRIEVAL_GATE_2026-08-15.md`](SEMANTIC_RETRIEVAL_GATE_2026-08-15.md) — question + root CID semantic retrieval, provenance, token and cost gate.
- [`SEMANTIC_RETRIEVAL_MULTI_ACTOR_2026-08-15.md`](SEMANTIC_RETRIEVAL_MULTI_ACTOR_2026-08-15.md) — seven heterogeneous actor extension: 192/192 retrieval, 56/56 provider stages and 97.313% mean input-token reduction.
- [`SEMANTIC_RETRIEVAL_V2_CONFIDENCE_GATE_2026-08-16.md`](SEMANTIC_RETRIEVAL_V2_CONFIDENCE_GATE_2026-08-16.md) — final production Semantic Retrieval Gate v2 proof: stochastic cheap-judge disagreement hardening, 359/360 immutable retrieval cases, 100% six-chain / 42-stage live actor success, 98.102% input-token reduction and 90.188% comparable cost reduction with routing overhead included.
- [`SEMANTIC_INDEX_LIFECYCLE_2026-08-16.md`](SEMANTIC_INDEX_LIFECYCLE_2026-08-16.md) — deterministic production lifecycle proof: no request-time document indexing, restart persistence with zero document re-embedding, incremental root reuse, single-flight preparation and vector-preserving invalidation.
- [`SEMANTIC_SCALE_GATE_V3_2026-08-16.md`](SEMANTIC_SCALE_GATE_V3_2026-08-16.md) — infrastructure-scale Semantic Retrieval proof at 600 / 10,000 / 100,000 immutable blocks; explicitly separate from real WAN-node scale.
- [`SEMANTIC_CONCURRENT_LOAD_2026-08-16.md`](SEMANTIC_CONCURRENT_LOAD_2026-08-16.md) — signed concurrent NEED proof including the preserved 256-event legacy relay queue boundary failure.
- [`DISTRIBUTED_SEMANTIC_RETRIEVAL_2026-08-16.md`](DISTRIBUTED_SEMANTIC_RETRIEVAL_2026-08-16.md) — distributed immutable-root retrieval across signed holders with provenance and minimal context.
- [`CLAIM_TRUSTABILITY_V1_2026-08-16.md`](CLAIM_TRUSTABILITY_V1_2026-08-16.md) — claim-centric verification/resistance proof.
- [`TRUST_NETWORK_V2_2026-08-16.md`](TRUST_NETWORK_V2_2026-08-16.md) — decentralized placement + Byzantine read-quorum + active Trustability proof.
- [`ORIGIN_BYPASS_SECURITY_EVALUATION_2026-08-16.md`](ORIGIN_BYPASS_SECURITY_EVALUATION_2026-08-16.md) — production origin-bypass security evaluation preserving negative experiments and limitations.

### Unaccepted / negative scale evidence

- [`CLASS_D_100_ATTEMPT_2026-08-17.md`](CLASS_D_100_ATTEMPT_2026-08-17.md) — preserved first Class D 100-node launch attempt. It is explicitly **not a PASS claim** and remains historical negative evidence even after a future accepted run.

### Methodology / planned parity

- [`MULTIMODAL_PROVIDER_PARITY.md`](MULTIMODAL_PROVIDER_PARITY.md) — apples-to-apples methodology for text, image and video provider comparisons; it does not claim a completed multimodal benchmark result.

## Real-node terminology rule

A real-node gate requires concurrently running network processes with distinct cryptographic identities and QUIC sockets in the topology declared by the evaluator. Synthetic rows/records, virtual node objects, simulations or semantic blocks do not count as 100/1,000 real running network nodes.

## Reproducibility note

GitHub Actions artifacts can expire. Therefore a report should retain, whenever safe and available:

- workflow/run ID;
- tested commit SHA;
- artifact name and ID;
- artifact SHA-256/digest;
- model/version identifiers relevant to the measurement;
- corpus/workload/topology description;
- fixed gates and measured values;
- known limitations and corrections;
- cleanup result for ephemeral network/cloud gates.

The report, not the temporary Actions artifact, is the durable public evidence record.