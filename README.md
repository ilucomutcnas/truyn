# TRUYN — The Intelligence Network

**An open-source, trust-aware network for AI agents, machines, and autonomous systems.**

> **The Internet was built to move data. TRUYN is being built to move intelligence.**

TRUYN is an open-source project for **agent-to-agent communication, decentralized AI, machine-to-machine networking, capability discovery, content-addressed objects, state synchronization, provenance, compute-near-data, and real-time trustability**. It is designed as a new logical network that runs over the Internet we already have — existing computers, servers, routers, Wi-Fi, mobile networks, fiber, UDP/IP and QUIC.

No new cables. No new hardware Internet. A new network contract.

[Manifesto](MANIFESTO.md) · [Whitepaper](WHITEPAPER.md) · [Architecture](STRUCTURE.md) · [Multi-cloud providers](docs/architecture/MULTI_CLOUD_PROVIDER_ARCHITECTURE.md) · [Protocol](spec/protocol/v1/README.md) · [Roadmap](ROADMAP.md) · [0BSD License](LICENSE)

---

## What is TRUYN?

Today, software usually communicates like this:

```text
address → server → API → request → data → response
```

TRUYN proposes a different logical model:

```text
need → discover capability → verify → route / execute → result + trustability
```

An AI agent should not always need to know **which server, company, URL, model, or API** can solve a task. It should be able to describe the required outcome, freshness, deadline, cost, privacy, and trust level. The network can then discover eligible providers, determine whether existing state or a content-addressed object already satisfies the request, decide whether verification is required, choose where computation should happen, and return the minimum sufficient result.

**TRUYN shifts the logical center of networking from _where information is_ to _what intelligence is needed_.**

---

## What do you actually get?

TRUYN is designed to turn agent interoperability from a collection of one-off integrations into a **network capability**.

- **Fewer AI tokens between machines.** Reusable state, references, deltas, claims, receipts and structured results can replace repeated natural-language restatement where prose is unnecessary.
- **Lower inference cost.** Fewer processed tokens and fewer duplicate model calls can reduce usage-based AI expenditure.
- **Faster request/response cycles.** Smaller contexts, reusable results, local state and capability-aware routing can reduce end-to-end latency.
- **Better computational context.** Provenance, evidence, freshness, source independence and trustability can travel with the result instead of being reconstructed by every downstream agent.
- **Less data movement.** Send a delta instead of a full object; reuse a content-addressed object; execute near large or private data and return only the result or proof.
- **Less polling and duplicate work.** Subscribe to meaningful changes and reuse sufficiently fresh signed state/results.
- **Provider independence.** Route by capability rather than hard-coded hostname, with failover across eligible providers.
- **Risk-aware decisions.** Trustability is evaluated for a specific claim, domain, requester, purpose and time — not as one permanent global reputation number.

### Token and inference economics

> **One of TRUYN's primary economic goals is to reduce the AI tokens and repeated inference operations required for machines to cooperate.**

If a baseline workflow processes `T_base` tokens and a semantically equivalent TRUYN-assisted workflow processes `T_truyn`, then:

```text
token reduction = 1 − (T_truyn / T_base)
```

For token-priced models:

```text
AI cost ≈ T_in × P_in + T_out × P_out
```

**Illustrative arithmetic, not a measured TRUYN benchmark:** a workflow using 4,000 input + 1,000 output tokens per handoff across 100,000 handoffs/month processes 500M tokens. If reusable state, references, deltas and compact results reduce the average handoff to 500 input + 150 output tokens, the workload processes 65M tokens — an **87% reduction**. At a hypothetical blended price of `$5 / 1M tokens`, the arithmetic is about `$2,500 → $325/month` for that workload.

The target is not minimum tokens at any cost. It is:

> **minimum sufficient information for the required result and trust level.**

Fewer tokens are useful only when required information is preserved or replaced by stronger machine-readable state, provenance, evidence and verification.

---

## Core network objects and behaviors

TRUYN/1 separates **conceptual objects**, **wire primitives**, and **composed verification behaviors**.

| Concept | Purpose |
|---|---|
| `IDENTITY` | Who is acting? Cryptographic identity independent of current IP address. |
| `CAPABILITY` | What can a node provide or compute? |
| `OFFER` | Advertise a capability, conditions and optional price. |
| `NEED` | Express required outcome plus trust, freshness, deadline, cost, privacy and value constraints. |
| `OBJECT` | Content-addressed immutable information that can be retrieved/reused independently of location. |
| `CLAIM` | A signed assertion with domain, time, provenance and evidence references. |
| `ATTEST` | Support, dispute or remain inconclusive about a claim. |
| `STATE` | Identified current state. |
| `DELTA` | A change relative to known state. |
| `SUBSCRIBE` | Request delivery when a relevant change occurs. |
| `COMPUTE` | Request capability execution, including compute-near-data preferences and sandbox policy. |
| `RESULT` | Outcome satisfying a request or computation. |
| `TRUST_RECEIPT` | Compact signed aggregation of trust evidence for a claim under a policy. |
| `REVOKE` | Invalidate or supersede a claim, offer, result, key binding, credential or other revocable object. |

`CHALLENGE`, `VERIFY`, and `DISPUTE` are **TRUYN/1 behaviors**, not additional top-level wire primitives. They are composed from `NEED`, `CLAIM`, `ATTEST`, evidence references and `TRUST_RECEIPT`. This keeps the wire vocabulary small while retaining active verification.

---

## Trustability is a network primitive

A signature can prove **who signed something**. It cannot prove that the statement is true.

TRUYN therefore evaluates trust in context:

```text
Trust(claim, requester, purpose, domain, time)
```

The Trust Vector may include identity confidence, integrity evidence, historical accuracy **in the relevant domain**, provenance quality, evidence quality, consensus, source independence, freshness, Sybil resistance and anomaly signals. A relying-party policy converts that evidence into an acceptance decision.

A million downstream copies of one source must not count as a million independent confirmations. Provenance and independence are therefore first-class inputs. Large verification sets can be collapsed into signed **Trust Receipts** so a consumer does not need to download every raw attestation.

**Trust must be computed, challenged, and continuously earned — never assumed.**

---

## Capability, value and routing

A request can include hard constraints and decision context such as:

```text
capability
minimum trustability
maximum age / freshness
maximum latency
maximum cost
deadline
priority / urgency
decision value
privacy requirements
domain / purpose
compute-near-data preference
```

The network first rejects candidates that violate hard constraints, then can rank eligible providers by a local multi-objective policy. High-value or high-risk decisions can justify additional independent verification; low-value requests may prefer a cached result or cheaper route.

---

## Designed for the Internet that already exists

TRUYN does **not** require replacing IP, routers, modems, operating systems, terrestrial fiber, submarine cables, Wi-Fi, or mobile networks.

```text
AI agent / model / machine
          ↓
adapter / SDK / local API
          ↓
       TRUYN Node
identity · capability · objects · state
routing · execution · provenance · trust
          ↓
      QUIC / UDP
          ↓
           IP
          ↓
   existing Internet
```

The installed program is the **TRUYN Node** (planned daemon name: `truynd`). AI agents connect to that node; they are not replaced by it.

---

## Three network modes

TRUYN uses one vocabulary everywhere:

- `local` — isolated development/testing on one machine or LAN;
- `testnet` — public experimental network for protocol changes, adversarial testing and interoperability work;
- `mainnet` — future stable public network with stricter compatibility and upgrade requirements.

Configuration lives under `config/local`, `config/testnet`, and `config/mainnet`.

---

## Any agent should be able to join

**TRUYN is vendor-neutral by design.** Any system able to expose or consume an MCP adapter, SDK, local/remote API, gateway or native TRUYN client should be able to participate.

Target ecosystems include, but are not limited to:

| Ecosystem | Intended interoperability surface |
|---|---|
| **OpenAI** | ChatGPT, Codex, API/agent systems |
| **Anthropic** | Claude, Claude Code, Anthropic-based agents |
| **Google** | Gemini, Gemini CLI/Code Assist, Vertex AI agents |
| **xAI** | Grok and xAI-based agents |
| **Perplexity** | Perplexity/Sonar-based agents |
| **Microsoft** | Copilot and Microsoft agent systems |
| **GitHub** | GitHub Copilot and coding agents |
| **AWS** | Amazon Q and AWS-hosted agents |
| **Cursor / Windsurf** | Coding agents and IDE runtimes |
| **Meta / local** | Llama, Ollama, vLLM, llama.cpp |
| **Mistral / DeepSeek / Qwen / Cohere / NVIDIA** | Hosted or self-hosted model/agent systems |
| **Agent frameworks** | LangGraph/LangChain, AutoGen, CrewAI, Semantic Kernel |
| **Custom systems** | Enterprise agents, robots, sensors, edge devices and future agents |

The names above describe intended interoperability, not endorsement, partnership or a claim that every adapter is already implemented.

> **MCP can connect an agent to TRUYN. TRUYN connects intelligence to intelligence.**

---

## Multi-cloud, multimodal reference target

The public reference architecture is designed to test **equivalent capabilities across independent clouds**, rather than comparing unlike outputs.

| Capability | Google Cloud / Vertex AI | Microsoft Azure / Foundry |
|---|---|---|
| Reasoning / text | Gemini | GPT, Grok, DeepSeek, Llama, Mistral, Kimi |
| Image generation | Google image-generation track (Imagen lineage / current supported Vertex image endpoint) | Azure OpenAI `gpt-image` family; Azure-direct FLUX as an optional second image provider |
| Video generation | Veo | Sora 2 |

This is an **architecture target, not a claim that every listed provider is already implemented or deployed**. Concrete model versions, regions, quotas and access requirements are resolved at deployment/benchmark time.

The distinction matters for Grok: xAI offers Grok Imagine image/video generation through xAI's own API, but the current Azure Foundry Grok catalog documents the Azure Grok path as chat/reasoning; some variants accept image input while returning text. TRUYN therefore does not advertise Azure Grok as an image/video generator unless that capability becomes explicitly available through the deployed Azure catalog.

Media results are intended to travel through TRUYN as verifiable **artifact references** with provenance, size, media type and digest instead of embedding large image/video binaries in protocol envelopes.

See [Multi-Cloud Provider Architecture](docs/architecture/MULTI_CLOUD_PROVIDER_ARCHITECTURE.md) and [Multimodal Provider Parity Benchmark](docs/benchmarks/MULTIMODAL_PROVIDER_PARITY.md).

---

## Capability economy

TRUYN's routing model can support a future open market of machine capabilities: inference, verification, translation, storage, data access, code review, sensing and other services. Providers can advertise cost and conditions; requesters can choose according to trust, quality, latency, location, privacy, availability and price.

`TRUYN/1` defines the information needed for cost-aware routing but **does not require a blockchain, payment rail or global settlement system**. Settlement is deliberately modular.

---

## Current status

TRUYN is currently an **architecture and protocol implementation project**. The repository contains the manifesto, research whitepaper, versioned protocol skeleton, wire schemas, implementation ownership structure, test/benchmark areas and a staged roadmap. The project does not claim production-scale benchmarks before a reference implementation and reproducible measurements exist.

The first implementation milestone is `v0.1 — Connect`: cryptographic identity, discovery, direct authenticated node communication and the minimal request path.

---

## How to participate

**Read it. Challenge it. Fork it. Implement it. Break it. Improve it.**

Useful contributions include protocol design, Rust/networking implementation, trust algorithms, adversarial testing, cryptography, discovery/NAT traversal, agent adapters, compute sandboxing, SDKs, benchmarks, simulations, documentation and independent academic critique.

TRUYN uses the **Zero-Clause BSD (0BSD)** license to minimize friction for research, private, open-source and commercial use.

---

## Read next

- [Manifesto](MANIFESTO.md) — why TRUYN should exist.
- [Whitepaper](WHITEPAPER.md) — academic rationale, formulas, threat model and research basis.
- [Architecture Contract](docs/architecture/ARCHITECTURE_CONTRACT.md) — canonical mapping of concepts to implementation owners.
- [Multi-Cloud Provider Architecture](docs/architecture/MULTI_CLOUD_PROVIDER_ARCHITECTURE.md) — public Google/Azure reasoning, image and video capability architecture.
- [Multimodal Provider Parity Benchmark](docs/benchmarks/MULTIMODAL_PROVIDER_PARITY.md) — planned apples-to-apples benchmark methodology.
- [TRUYN/1 Protocol](spec/protocol/v1/README.md) — normative protocol semantics.
- [Repository Structure](STRUCTURE.md) — where each subsystem belongs.
- [Roadmap](ROADMAP.md) — staged implementation plan.

---

> **Stop routing only packets. Start routing intelligence.**
>
> **Trust must be computed, not assumed.**
>
> **TRUYN — The Intelligence Network.**
