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

Credentials, private keys, privileged cloud identities, private origins, secret-bearing URLs, customer data, private deployment/resource names, live allowlists, exact live quota/cost ceilings and other operational secrets remain forbidden. Raw logs/artifacts containing such data belong outside the public repository. Their safe identifiers and cryptographic digests may be retained here so the public report remains auditable.

Deleting or replacing a measured report with a summary/stub is not an acceptable security response. If a published report is proven invalid or duplicated, retain an explicit tombstone/correction that points to the superseding evidence rather than silently removing the record.

The repository regression suite treats the evidence files below as protected and fails if they disappear or are replaced by trivial stubs.

## Current evidence ledger

### Measured results

- [`CROSS_CLOUD_AB_2026-08-15.md`](CROSS_CLOUD_AB_2026-08-15.md) — first paired Azure OpenAI → Vertex Gemini direct-vs-TRUYN baseline; includes the negative baseline result and per-sample evidence.
- [`CROSS_CLOUD_8X_OPTIMIZATION_2026-08-15.md`](CROSS_CLOUD_8X_OPTIMIZATION_2026-08-15.md) — fixed 8× hot-path optimization gate; measured protocol and orchestration overhead.
- [`CONTEXT_EFFICIENCY_2026-08-15.md`](CONTEXT_EFFICIENCY_2026-08-15.md) — content-addressed context and signed-delta economic A/B gate.
- [`SEMANTIC_RETRIEVAL_GATE_2026-08-15.md`](SEMANTIC_RETRIEVAL_GATE_2026-08-15.md) — question + root CID semantic retrieval, provenance, token and cost gate.
- [`SEMANTIC_RETRIEVAL_MULTI_ACTOR_2026-08-15.md`](SEMANTIC_RETRIEVAL_MULTI_ACTOR_2026-08-15.md) — seven heterogeneous actor extension: 192/192 retrieval, 56/56 provider stages and 97.313% mean input-token reduction.
- [`SEMANTIC_RETRIEVAL_V2_CONFIDENCE_GATE_2026-08-16.md`](SEMANTIC_RETRIEVAL_V2_CONFIDENCE_GATE_2026-08-16.md) — final production Semantic Retrieval Gate v2 proof: stochastic cheap-judge disagreement hardening, 359/360 immutable retrieval cases, 100% six-chain / 42-stage live actor success, 98.102% input-token reduction and 90.188% comparable cost reduction with routing overhead included.
- [`SEMANTIC_INDEX_LIFECYCLE_2026-08-16.md`](SEMANTIC_INDEX_LIFECYCLE_2026-08-16.md) — deterministic production lifecycle proof: no request-time document indexing, restart persistence with zero document re-embedding, incremental root reuse, single-flight preparation, and vector-preserving invalidation; CI 145/145 pass.
- [`SEMANTIC_SCALE_GATE_V3_2026-08-16.md`](SEMANTIC_SCALE_GATE_V3_2026-08-16.md) — infrastructure-scale Semantic Retrieval proof at 600 / 10,000 / 100,000 immutable blocks: 100% measured retrieval/provenance/no-block-ID/minimal-context, >=99.445% normalized token/cost savings, cold/warm p50/p95/p99, zero document re-embedding after persistence, and zero failures in 100/1,000-node exercises. The report explicitly records the 100k memory/latency boundary and does not replace the live-provider quality proof from v2.
- [`SEMANTIC_CONCURRENT_LOAD_2026-08-16.md`](SEMANTIC_CONCURRENT_LOAD_2026-08-16.md) — signed concurrent NEED proof across GPT/Gemini/Grok/DeepSeek/Llama/Mistral/Kimi requester identities: 280/280 delivered in 70- and 210-request bursts, 4 unique retrieval leaders / 276 followers, 2 query embeddings, 4 reranks, zero document re-embedding and zero duplicate paid semantic work. The same report preserves the earlier 350-NEED failure that exposed the current 256-event legacy relay queue boundary.
- [`DISTRIBUTED_SEMANTIC_RETRIEVAL_2026-08-16.md`](DISTRIBUTED_SEMANTIC_RETRIEVAL_2026-08-16.md) — first measured network primitive proof: one 600-block immutable root distributed over four required CID partitions and five signed holder nodes including one replica; 48/48 retrieval, 100% provenance/minimal-context/no-block-ID leakage, 192/192 holder NEED/RESULT, zero unauthorized holder work, and 90.025% measured semantic/context payload reduction versus transferring the full corpus for each query.
- [`CLAIM_TRUSTABILITY_V1_2026-08-16.md`](CLAIM_TRUSTABILITY_V1_2026-08-16.md) — claim-centric verification/resistance proof: 600/600 expected evidence-state outcomes across independent support, correlated echo, unknown-lineage Sybil, independent dispute/contradiction and retrieval-provenance tampering; zero false verification for echo/Sybil, zero missed disputes/tamper, zero receipt-tamper acceptance, and zero raw source-label leakage in public receipts.
- [`TRUST_NETWORK_V2_2026-08-16.md`](TRUST_NETWORK_V2_2026-08-16.md) — decentralized placement + Byzantine read-quorum + active Trustability proof: 1,000/1,000 deterministic resistance cases, zero Byzantine false acceptance, zero expired/revoked placement leakage, zero fabricated-lineage false verification, zero unauthorized revocation application, and zero missed authorized dispute/tamper; separate functional tests cover four independent HTTP directory nodes, a malicious highest-trust replica losing to a 2-of-3 immutable-CID quorum, and two network verifier nodes returning signed `VERIFY` proofs.
- [`KADEMLIA_QUIC_TRUST_TESTNET_2026-08-17.md`](KADEMLIA_QUIC_TRUST_TESTNET_2026-08-17.md) — first real libp2p QUIC/Kademlia trust-lifecycle testnet proof: 4-node QUIC topology, relay-free signed verifier discovery, durable transparency replication/recovery through bootstrap loss, verifier transport-ID rotation with stale-provider tolerance, 2-ack revocation convergence, Trust Receipt v2 staleness after revocation, and zero relay calls in the gate. The report explicitly does not claim BFT consensus, Sybil/collusion resistance or 100/1,000 real-node scale.
- [`ORIGIN_BYPASS_SECURITY_EVALUATION_2026-08-16.md`](ORIGIN_BYPASS_SECURITY_EVALUATION_2026-08-16.md) — production origin-bypass security evaluation. GCP direct relay path passes; Azure final gate is deliberately recorded as not yet passed. The report preserves the initial unguarded state, Cloudflare permission failures, direct-Azure-403 / edge-525 negative experiment, rollback, and final healthy proxied production path.

### Methodology / planned parity

- [`MULTIMODAL_PROVIDER_PARITY.md`](MULTIMODAL_PROVIDER_PARITY.md) — apples-to-apples methodology for text, image and video provider comparisons; it does not claim a completed multimodal benchmark result.

## Reproducibility note

GitHub Actions artifacts can expire. Therefore a report should retain, whenever safe and available:

- workflow/run ID;
- tested commit SHA;
- artifact name and ID;
- artifact SHA-256/digest;
- model/version identifiers relevant to the measurement;
- corpus/workload description;
- fixed gates and measured values;
- known limitations and corrections.

The report, not the temporary Actions artifact, is the durable public evidence record.
