# TRUYN — The Intelligence Network

**An open-source, trust-aware network for AI agents, machines, and autonomous systems.**

> **The Internet was built to move data. TRUYN is being built to move intelligence.**

TRUYN is an open-source project for **agent-to-agent communication, decentralized AI, machine-to-machine networking, capability discovery, provenance, and real-time trustability**. It is designed as a new logical network that runs **over the Internet we already have** — existing computers, servers, routers, Wi-Fi, mobile networks, fiber, UDP/IP and QUIC.

No new cables. No new hardware Internet. A new network contract.

[Read the Manifesto](MANIFESTO.md) · [Read the Whitepaper](WHITEPAPER.md) · [0BSD License](LICENSE)

---

## What is TRUYN?

Today, software usually communicates like this:

```text
address → server → API → request → data → response
```

TRUYN proposes a different model:

```text
need → discover capability → verify → route → result + trustability
```

An AI agent should not always need to know **which server**, **which company**, **which URL**, or **which API** can solve a task.

It should be able to express:

```text
I NEED this capability or state.
It must be this fresh.
It must be this trustworthy.
Return the minimum information required.
```

The network can then discover eligible providers, evaluate evidence, select a route, reuse trusted state when possible, and return a result.

**TRUYN shifts the logical center of networking from _where information is_ to _what intelligence is needed_.**

---

## Why does this matter?

AI agents are becoming persistent network participants, but most agent infrastructure still relies on a Web-era model: fixed endpoints, vendor APIs, repeated polling, repeated data transfer, duplicated computation, and trust decisions made outside the network.

TRUYN is designed around the needs of autonomous systems:

- **Capability instead of location** — discover what can perform a task without hard-coding a provider.
- **Intent instead of endpoint coupling** — describe the required outcome and constraints.
- **Trustability instead of blind transport** — treat verifiability as a first-class network property.
- **Provenance instead of repetition** — distinguish independent evidence from one claim copied a million times.
- **State and deltas instead of unnecessary retransmission** — communicate what changed when full data is not required.
- **Compute near information** — move computation toward data when that is cheaper, faster, safer, or more private.
- **Open participation instead of a single gatekeeper** — the intelligence layer should not belong to one model vendor, cloud, company, or government.

---

## What do you actually get?

TRUYN is designed to turn agent interoperability from a collection of one-off integrations into a **network capability**.

For a person or developer, the practical goal is simple: connect an agent once and let it discover, request, verify, and use capabilities provided by other agents, computers, services, sensors, or models — without manually wiring every possible provider in advance.

That creates several concrete outcomes:

- **Use more intelligence without rebuilding your stack.** A Codex, Claude, Gemini, Grok, Llama, Perplexity, local model, enterprise agent, or future system can participate through an adapter instead of requiring every pair of systems to invent a private integration.
- **Spend fewer AI tokens on agents talking to agents.** Reusable state, compact machine-native claims, references, deltas, receipts, and verified cached results can replace repeated natural-language restatement of context where prose is unnecessary.
- **Reduce inference cost.** Fewer tokens processed and fewer duplicated model calls can directly reduce usage-based AI expenditure.
- **Shorten request/response cycles.** Smaller contexts, less repeated serialization, less network transfer, reusable results, and capability-aware routing can reduce end-to-end latency.
- **Improve the information available to computation.** Provenance, evidence, freshness, source independence, and trustability can travel with a result instead of forcing every downstream agent to reconstruct that context independently.
- **Get a result with context about whether it should be trusted.** A response can carry provenance, evidence, source independence, freshness, and a trustability assessment instead of arriving as an opaque answer.
- **Reduce dependency on one provider.** If several nodes can perform the same capability, the network can select among them according to trust, latency, price, privacy, freshness, or availability.
- **Move less data.** If only a small part of shared state changed, send the delta. If a valid result is already available, reuse it. If a large dataset can be processed locally, send the result instead of the dataset.
- **Do less duplicate work.** Repeated equivalent requests can reuse sufficiently fresh, signed state or results rather than recomputing everything from zero.
- **Stop polling when nothing happened.** A system can subscribe to a meaningful change and receive an update only when the condition is satisfied.
- **Keep sensitive data closer to where it lives.** Computation can move toward private or local information while only a result, proof, or minimal derived state crosses the network.
- **Fail over by capability, not hostname.** The disappearance of one provider does not have to mean the disappearance of the capability.

### Token and inference economics

> **One of TRUYN's primary economic goals is to reduce the number of AI tokens and repeated inference operations required for machines to cooperate.**

Today's multi-agent systems often make machines communicate through human-oriented text. An agent may repeatedly receive a long prompt, conversation history, copied documents, tool outputs, intermediate reasoning summaries, and another agent's prose answer — even when both sides only need a small state change or a structured result.

TRUYN is designed to make a different exchange possible:

```text
re-send context + explain it again + infer again
                     ↓
state reference + delta + claim + proof + result
```

If a baseline workflow processes `T_base` tokens and the equivalent TRUYN-assisted workflow processes `T_truyn`, the token reduction is:

```text
token reduction = 1 − (T_truyn / T_base)
```

For usage-priced models, if input and output token prices are `P_in` and `P_out`, the direct model cost of a workflow is approximately:

```text
AI cost = T_in × P_in + T_out × P_out
```

so avoided token processing and avoided duplicate calls translate directly into avoided inference spend.

**Illustrative example — not a measured TRUYN benchmark:** suppose an agent-to-agent handoff currently consumes 4,000 input tokens plus 1,000 output tokens. Across 100,000 handoffs per month, that is 500 million processed tokens. If structured state, references, deltas and reusable results reduce the average handoff to 500 input + 150 output tokens, the same number of handoffs would process 65 million tokens — an **87% reduction** in this hypothetical workload.

At a hypothetical blended processing price of **$5 per million tokens**, that arithmetic corresponds to roughly **$2,500/month → $325/month**, or **$2,175/month avoided token spend** for that workload alone. Actual savings depend entirely on model prices, caching policies, context sizes, output sizes, workload structure and how much information can safely be represented without prose.

The commercial effect compounds in large agent systems because token cost is only one component:

```text
fewer tokens
    ↓
less inference work
    ↓
less model spend
    +
shorter contexts
    ↓
faster model cycles
    +
fewer duplicate calls
    ↓
lower compute demand
    +
smaller payloads
    ↓
lower transfer / storage overhead
```

This creates a direct business objective for TRUYN:

**more useful machine cooperation per dollar, per second, and per unit of compute.**

TRUYN also aims to improve **effective computation quality**, but not because fewer tokens are automatically better. Compression that removes necessary information can make results worse. The intended quality gain comes from replacing repeated, lossy re-explanation with explicit machine-readable state, provenance, evidence, freshness and verification — while escalating to richer data or natural language whenever the task actually requires it.

The target is therefore not simply **minimum tokens**. It is:

> **minimum sufficient information for the required result and trust level.**

### The measurable effects

The exact gains depend on workload and must be benchmarked by the reference implementation. But the architectural savings are directly measurable.

| Current pattern | TRUYN target behavior | Measurable effect |
|---|---|---|
| Long natural-language context is repeatedly passed between agents | Exchange state references, structured claims, deltas and reusable results where sufficient | Token reduction = **`1 − T_truyn / T_base`** |
| Equivalent reasoning/inference is repeatedly executed | Reuse sufficiently fresh, signed and policy-compatible results | Avoided inference calls = **baseline calls − required fresh calls** |
| One agent integrates separately with `N` providers | Agent connects to TRUYN; providers advertise capabilities | Agent-side network integration can move from many provider connections toward **one network adapter**, while capability semantics remain explicit |
| Full object of size `S` is retransmitted after a small change `d` | Send a `DELTA` against shared state | Payload ratio approaches **`d / S`** when both sides share the base state |
| The same object of size `S` is fetched independently by `N` consumers | Reuse a fresh signed/cached result | Transfer can approach **`S + N·r` instead of `N·S`**, where `r` is a small receipt/result reference |
| A dataset of size `D` is moved to a remote computer only to obtain result `R` | Compute near the data and return `R` | Avoided payload fraction can approach **`1 − R/D`** when remote raw data is unnecessary |
| Poll every `p` seconds for duration `t` | `SUBSCRIBE` and deliver only on relevant changes | Polling requests fall from approximately **`t/p` to the number of actual events `k`** |
| One hard-coded API becomes unavailable | Discover another eligible provider | Failover can occur at the **capability layer** instead of requiring application-specific fallback logic |
| A result arrives without evidence | Return claim + provenance + attestations + trust vector | The consumer receives a **machine-readable basis for acceptance or rejection**, not only a payload |

A simple data-transfer example: if two nodes share a 10 MB state object and only 10 KB changed, a delta representation has a theoretical payload ratio of roughly **0.1% of the full state size before protocol overhead**. If a private 1 GB dataset can be evaluated locally and the remote party only requires a 1 KB signed decision result, the potential avoided raw-data transfer is correspondingly enormous. These are arithmetic examples, not claims of measured TRUYN production performance.

### The new capability

The deeper benefit is not just lower bandwidth, fewer tokens, lower AI cost, or lower latency.

Today an application normally asks:

```text
Which API do I call?
```

TRUYN is designed to let it ask:

```text
What do I need?
How fresh must it be?
How trustworthy must it be?
What constraints must be respected?
```

Then the network can determine **who can provide it, whether existing state can satisfy it, whether independent verification is required, where computation should happen, and what minimum information must move**.

That is the real change: **from connecting applications to endpoints to connecting intelligence to available intelligence.**

> **Status note:** these are architectural outcomes and validation targets described by the TRUYN design. The repository does not claim production benchmark results before the reference implementation and reproducible measurements exist. See the [Whitepaper](WHITEPAPER.md) for the quantitative model and evaluation methodology.

---

## Trustability is a network primitive

A signature can prove **who said something**. It cannot prove that what was said is true.

TRUYN therefore treats trust as a continuously computed property of a **specific claim in a specific context**, not as one permanent rating for an entire computer.

A trustability decision can consider:

```text
identity
+ evidence
+ provenance
+ source independence
+ historical accuracy
+ freshness
+ agreement / disagreement
+ integrity signals
+ anomaly / Sybil risk
+ relying-party policy
```

A thousand agents repeating the same upstream error should not count as a thousand independent confirmations.

**Trust must be computed, challenged, and continuously earned — never assumed.**

---

## Core network objects

TRUYN is being designed around a small set of machine-native primitives:

| Primitive | Meaning |
|---|---|
| `IDENTITY` | Who is acting? |
| `OFFER` | What capability can this node provide? |
| `NEED` | What result, state, or capability is required? |
| `CLAIM` | What assertion is being made? |
| `ATTEST` | What evidence or verification supports or disputes it? |
| `STATE` / `DELTA` | What is known, and what changed? |
| `SUBSCRIBE` | What change should trigger delivery? |
| `RESULT` | What outcome satisfies the intent? |
| `TRUSTABILITY` | How strongly should this result be accepted for this purpose? |

These primitives are independent of any single AI model or agent framework.

---

## Designed for the Internet that already exists

TRUYN does **not** require replacing IP, routers, modems, operating systems, terrestrial fiber, submarine cables, Wi-Fi, or mobile networks.

The intended architecture is an overlay:

```text
AI agent / model / machine
          ↓
     TRUYN adapter
          ↓
      TRUYN node
          ↓
identity · discovery · routing · trust · state
          ↓
      QUIC / UDP
          ↓
           IP
          ↓
   existing Internet
```

Existing infrastructure remains the transport underlay. TRUYN changes the logical layer that autonomous machines use to find, evaluate, and exchange intelligence.

---

## Any agent should be able to join

**TRUYN is vendor-neutral by design. Intelligence should be able to communicate with intelligence regardless of who built the model, agent, runtime, IDE, cloud, or device.**

The target is interoperability with **any agent that can expose or consume an adapter through MCP, an SDK, a local API, a remote API, a gateway, or a native TRUYN client**.

That includes, but is not limited to:

| Ecosystem | Agents, models, and runtimes TRUYN should be able to connect |
|---|---|
| **OpenAI** | ChatGPT, Codex, OpenAI API / Responses-based agents, custom OpenAI agents |
| **Anthropic** | Claude, Claude Code, Anthropic API-based agents |
| **Google** | Gemini, Gemini CLI, Gemini Code Assist, Vertex AI / Gemini-based agents |
| **xAI** | Grok and xAI API-based agents |
| **Perplexity** | Perplexity Agent API, Sonar-based systems, Perplexity-powered agents |
| **Microsoft** | Microsoft Copilot Studio agents, Microsoft 365 Copilot agents, Microsoft Agents SDK / Agent Framework systems |
| **GitHub** | GitHub Copilot, Copilot coding agents, Copilot CLI, custom GitHub agents |
| **Amazon Web Services** | Amazon Q Developer and AWS-hosted agentic systems |
| **Cursor** | Cursor Agent and custom agents operating through Cursor environments |
| **Windsurf** | Windsurf / Cascade-based coding agents |
| **Meta** | Llama-based agents and open-weight Llama runtimes |
| **Mistral AI** | Mistral Agents, Mistral Vibe, Mistral API-based agents |
| **DeepSeek** | DeepSeek-based agents and self-hosted DeepSeek runtimes |
| **Alibaba / Qwen** | Qwen-based agents and self-hosted Qwen runtimes |
| **Cohere** | Cohere-powered agents and enterprise agent systems |
| **NVIDIA** | NVIDIA NIM / Nemotron-based agentic systems and GPU-hosted inference agents |
| **Local / open-source runtimes** | Ollama, vLLM, llama.cpp and other locally hosted model runtimes |
| **Agent frameworks** | LangChain / LangGraph, AutoGen, CrewAI, Semantic Kernel and other multi-agent frameworks |
| **Custom systems** | Private enterprise agents, research agents, robots, sensors, edge devices, autonomous software and agents that do not exist yet |

The list is intentionally open-ended. **TRUYN should never require two agents to use the same model provider, the same framework, or even the same kind of intelligence.**

A Codex agent should be able to request a capability from Claude Code. A Gemini agent should be able to receive a verified result produced by a Llama node. Grok should be able to consume a claim attested by independent Perplexity, Mistral, Qwen, or sensor nodes. A private enterprise agent should be able to participate without becoming dependent on any of them.

```text
Codex ───────┐
Claude ──────┤
Gemini ──────┤
Grok ────────┤
Perplexity ──┤
Copilot ─────┤
Llama ───────┤
Mistral ─────┤
Qwen ────────┤──→ TRUYN ←──→ any intelligence
DeepSeek ────┤
Amazon Q ────┤
Cursor ──────┤
Windsurf ────┤
Custom AI ───┘
```

Adapters such as **MCP, SDKs, local APIs, remote APIs, and gateways** connect existing systems to TRUYN without making those adapter protocols the network itself.

> **MCP can connect an agent to TRUYN. TRUYN connects intelligence to intelligence.**

The names above describe the intended interoperability surface; they do not imply endorsement, partnership, or that every native adapter is already implemented in the current repository.

---

## Example

Instead of hard-coding:

```text
GET https://specific-provider.example/weather/almaty
```

an agent could express an intent such as:

```text
NEED
  capability: weather.current
  location: Almaty
  freshness: < 30s
  trustability: > 0.99
```

The network may discover multiple eligible providers, compare trustability and latency, account for provenance and independence, reuse a sufficiently fresh trusted result, or execute computation closer to the underlying data.

The requester asks for the **outcome**, not a predetermined server.

---

## Who should care?

TRUYN is for people working on:

**AI agents · multi-agent systems · decentralized AI · distributed systems · peer-to-peer networking · agent interoperability · trustworthy AI · provenance · semantic communication · edge AI · machine-to-machine communication · autonomous systems · next-generation Internet architecture**

If you build agents, models, networking infrastructure, distributed systems, trust systems, developer tools, or machine economies, this project is intended to be useful to you.

---

## How to participate

TRUYN is deliberately open.

**Read it. Challenge it. Fork it. Implement it. Break it. Improve it.**

Useful contributions include protocol design, Rust/networking implementation, trust algorithms, adversarial testing, cryptography, distributed discovery, NAT traversal, MCP/agent adapters, SDKs, benchmarks, simulations, documentation, and independent academic critique.

The project uses the **Zero-Clause BSD (0BSD)** license to minimize friction for research, open-source, private, and commercial use.

---

## Frequently asked questions

### Is TRUYN a new blockchain?

No. TRUYN does not require a blockchain or global consensus ledger. Different applications may use different mechanisms for identity, scarcity, payment, or auditability.

### Is TRUYN another AI agent framework?

No. Agent frameworks run agents. **TRUYN is intended to connect intelligence to intelligence across frameworks, models, devices, and organizations.**

### Does TRUYN replace the Internet?

Not physically. TRUYN is designed to run in parallel over existing Internet infrastructure. IP remains useful as an underlay; TRUYN changes the logical model used by autonomous systems above it.

### What makes TRUYN different from ordinary P2P networking?

P2P connectivity is only a building block. TRUYN makes **capability, intent, state, provenance, claims, and trustability** first-class network concepts.

### What is the long-term goal?

A global, open intelligence layer where machines can discover capabilities, exchange the minimum necessary information, verify claims, and route decisions according to trust — without requiring one central platform to mediate every interaction.

---

## Read next

**Start with the [Manifesto](MANIFESTO.md)** if you want to understand *why* TRUYN should exist.

**Read the [Whitepaper](WHITEPAPER.md)** if you want the architecture, formulas, security model, academic foundations, and implementation path.

---

> **Stop routing only packets. Start routing intelligence.**
>
> **Trust must be computed, not assumed.**
>
> **TRUYN — The Intelligence Network.**
