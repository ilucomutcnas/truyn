# TRUYN — The Intelligence Network

**An open-source, trust-aware network for AI agents, machines, and autonomous systems.**

> **The Internet was built to move data. TRUYN is being built to move intelligence.**

TRUYN is an open-source project for **agent-to-agent communication, decentralized AI, machine-to-machine networking, capability discovery, content-addressed objects, state synchronization, provenance, compute-near-data, and real-time trustability**. It is designed as a new logical network that runs over the Internet we already have — existing computers, servers, routers, Wi-Fi, mobile networks, fiber, UDP/IP and QUIC.

No new cables. No new hardware Internet. A new network contract.

[Manifesto](MANIFESTO.md) · [Whitepaper](WHITEPAPER.md) · [Architecture](STRUCTURE.md) · [A2A/MCP](docs/architecture/A2A_MCP_INTEROPERABILITY.md) · [Security](SECURITY.md) · [Provider ownership](docs/architecture/PROVIDER_OWNERSHIP.md) · [BYOK](docs/getting-started/BYOK.md) · [Protocol](spec/protocol/v1/README.md) · [Roadmap](ROADMAP.md) · [Apache-2.0 License](LICENSE)

---

## What is TRUYN?

Today, software usually communicates like this:

```text
address → server → API → request → data → response
```

TRUYN proposes a different logical model:

```text
need → discover capability → verify → authorize → route / execute → result + trustability
```

An AI agent should not always need to know **which server, company, URL, model, or API** can solve a task. It should be able to describe the required outcome, freshness, deadline, cost, privacy, and trust level. The network can then discover **authorized and eligible** providers, determine whether existing state or a content-addressed object already satisfies the request, decide whether verification is required, choose where computation should happen, and return the minimum sufficient result.

**TRUYN shifts the logical center of networking from _where information is_ to _what intelligence is needed_.**

---

## Open network. Private intelligence accounts.

TRUYN is open, but openness of the protocol is not permission to consume another participant's paid AI quota.

> **Open protocol ≠ open billing account.**
>
> **TRUYN is open. Intelligence is BYOK by default.**

The reference implementation now enforces a first fail-closed provider boundary: provider ownership is bound to the cryptographic sender of a signed `OFFER`, private-provider discovery and dispatch are authorization-aware, provider-signed requester allowlists support private BYOK providers, and provider-host access plus billing checks run before adapter/upstream execution.

A public relay may be reachable by anyone while private providers remain unusable by foreign requesters. Knowing a provider ID, using a custom client, forging an `ownerId` field or calling a legacy/fast/WebSocket path does not grant access to an unauthorized private provider.

The safety invariant is:

```text
foreign requester
+ public relay
+ known private provider ID
+ custom/malicious client
= zero unauthorized provider execution
```

Normal users are expected to **Bring Your Own Intelligence / Bring Your Own Provider (BYOK)**. Their upstream provider credentials remain with their own provider runtime or local/cloud execution environment and do not travel through TRUYN protocol envelopes.

The architecture also supports future explicitly shared, prepaid, subscription or sponsored providers, but no such mode creates an implicit entitlement. Sponsored/free owner-funded access defaults to disabled/zero; prepaid/subscription remain fail-closed until an entitlement resolver exists.

The production-style public-network plane is also closed by default. Public registration and public dispatch require an explicit public-network master opt-in plus their own separate opt-ins. Implementing BYOK does not itself open a relay.

### BYOK quickstart

The official CLI now implements a first provider setup flow for OpenAI, OpenAI-compatible, Anthropic, Azure OpenAI and Vertex Gemini profiles.

```bash
truyn init

export OPENAI_API_KEY='...'
truyn setup --provider openai --model <your-model>
truyn setup --provider openai --model <your-model> --test
truyn setup-status
```

The persisted profile stores the credential **environment-variable name**, not the credential value. `--test` makes a minimal call to the user's configured provider and only then marks the profile verified. Requester and provider use separate TRUYN identities; the remote provider is published private (`owner-only`) for that requester and runs with billing mode `byok`.

For a non-loopback relay, official CLI AI-workload entry points require a verified private BYOK profile. This is defense in depth: relay/provider authorization remains authoritative even against a modified client.

See [Bring Your Own Intelligence](docs/getting-started/BYOK.md) for provider-specific constraints and the exact implemented boundary.

Read:

- [Provider Ownership](docs/architecture/PROVIDER_OWNERSHIP.md)
- [Authorization Model](docs/architecture/AUTHORIZATION_MODEL.md)
- [Relay Security](docs/architecture/RELAY_SECURITY.md)
- [Billing Boundary](docs/architecture/BILLING_BOUNDARY.md)
- [BYOK Architecture](docs/architecture/BYOK_ARCHITECTURE.md)
- [A2A / MCP Interoperability](docs/architecture/A2A_MCP_INTEROPERABILITY.md)
- [Threat Model](docs/architecture/THREAT_MODEL.md)
- [Public / Private Information Boundary](docs/architecture/PUBLIC_PRIVATE_BOUNDARY.md)

---

## What do you actually get?

TRUYN is designed to turn agent interoperability from a collection of one-off integrations into a **network capability**.

- **Fewer AI tokens between machines.** Reusable state, references, deltas, claims, receipts and structured results can replace repeated natural-language restatement where prose is unnecessary.
- **Lower inference cost.** Fewer processed tokens and fewer duplicate model calls can reduce usage-based AI expenditure.
- **Faster request/response cycles.** Smaller contexts, reusable results, local state and capability-aware routing can reduce end-to-end latency.
- **Better computational context.** Provenance, evidence, freshness, source independence and trustability can travel with the result instead of being reconstructed by every downstream agent.
- **Less data movement.** Send a delta instead of a full object; reuse a content-addressed object; execute near large or private data and return only the result or proof.
- **Less polling and duplicate work.** Subscribe to meaningful changes and reuse sufficiently fresh signed state/results.
- **Provider independence without billing ambiguity.** Route among authorized providers by capability rather than hard-coded hostname, while preserving explicit ownership and cost responsibility.
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

Provider ownership/visibility/billing policy is an authorization layer around capability execution. It does not make requester-supplied ownership claims authoritative and does not require adding credentials to protocol messages.

`CHALLENGE`, `VERIFY`, and `DISPUTE` are **TRUYN/1 behaviors**, not additional top-level wire primitives. They are composed from `NEED`, `CLAIM`, `ATTEST`, evidence references and `TRUST_RECEIPT`. This keeps the wire vocabulary small while retaining active verification.

A2A Agent Cards/Tasks/Artifacts and MCP Tools/Resources are also external adapter objects, not new TRUYN/1 wire primitives.

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

## Capability, authorization, value and routing

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

Routing is explicitly two different questions:

```text
Can this provider perform the capability?
Can this requester use this provider?
```

The network first excludes unauthorized providers and candidates that violate hard constraints, then can rank the remaining eligible providers by a local multi-objective policy. High-value or high-risk decisions can justify additional independent verification; low-value requests may prefer a cached result or cheaper route.

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

Public reachability in `testnet` or `mainnet` does not grant access to private providers.

---

## Any agent should be able to join

**TRUYN is vendor-neutral by design.** Any system able to expose or consume an A2A/MCP adapter, SDK, local/remote API, gateway or native TRUYN client should be able to participate.

A2A and MCP play different edge roles:

```text
A2A  → agent discovery + task/artifact interoperability
MCP  → model/tool/resource interoperability
TRUYN → identity + capability routing + authorization + provenance + trust across the network
```

They are complementary, not replacements for TRUYN.

### Current factual bridge status

| Interoperability surface | Current state |
|---|---|
| TRUYN as MCP server (stdio / loopback HTTP) | **Implemented bounded reference path** |
| Configured remote MCP HTTP tool as TRUYN provider | **Implemented bounded reference path** |
| General MCP discovery/import | **Not implemented yet** |
| TRUYN as A2A Agent Card/task server | **Defined, not implemented** |
| Remote A2A agent as TRUYN provider | **Defined, not implemented** |
| A2A→TRUYN→MCP round trip | **Not implemented / not proven** |
| MCP→TRUYN→A2A round trip | **Not implemented / not proven** |

The roadmap now treats this as an explicit v0.5 **A2A / MCP Interoperability Bridge Gate** rather than a vague adapter aspiration.

Target ecosystems include, but are not limited to:

| Ecosystem | Intended interoperability surface |
|---|---|
| **A2A** | Agent Card discovery, Messages, Tasks, Artifacts and asynchronous agent interaction through adapters |
| **MCP** | TRUYN tools for MCP clients; selected MCP tools/resources imported through adapters |
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

> **A2A can bring agent task semantics to TRUYN. MCP can bring tool semantics to TRUYN. TRUYN connects intelligence to intelligence.**

See [A2A / MCP Interoperability Architecture](docs/architecture/A2A_MCP_INTEROPERABILITY.md) and [Compatibility Matrix](docs/compatibility/A2A_MCP_COMPATIBILITY.md).

---

## Multi-cloud, multimodal reference implementation

The public provider layer contains adapters for equivalent capabilities across independent clouds, rather than requiring protocol-level model names.

| Capability | Google Cloud / Vertex AI | Microsoft Azure / Foundry |
|---|---|---|
| Reasoning / text | Gemini | GPT, Grok, DeepSeek, Llama, Mistral, Kimi |
| Image generation | Google image-generation track | Azure OpenAI `gpt-image`; Azure FLUX adapter |
| Video generation | Veo | Sora adapter |

Concrete model versions, regions, quotas, deployment IDs, cloud identities and private topology are operational concerns and are not part of the public protocol contract. Provider availability is also distinct from adapter implementation: a cloud deployment may remain unavailable because of provider entitlement/quota even when the TRUYN adapter path exists.

Reference/test providers funded by a TRUYN operator remain owner-private unless explicitly shared. The existence of a provider adapter or private reference deployment does not give public users access to its quota.

Media results travel through the normalized artifact path as verifiable references with provenance, size, media type and digest instead of requiring large image/video binaries inside TRUYN RESULT envelopes.

See [Multi-Cloud Provider Architecture](docs/architecture/MULTI_CLOUD_PROVIDER_ARCHITECTURE.md) and [Multimodal Provider Parity Benchmark](docs/benchmarks/MULTIMODAL_PROVIDER_PARITY.md).

---

## Capability economy

TRUYN's routing model can support a future open market of machine capabilities: inference, verification, translation, storage, data access, code review, sensing and other services. Providers can advertise cost and conditions; requesters can choose according to trust, quality, latency, location, privacy, availability and price.

`TRUYN/1` defines the information needed for cost-aware routing but **does not require a blockchain, payment rail or global settlement system**. Settlement is deliberately modular.

A future capability market is an explicit entitlement system. It does not weaken provider ownership: cross-owner execution must have an explicit grant/contract and attributable billing responsibility.

---

## Current status

TRUYN is an **experimental architecture and implementation project**. The repository contains a working MVP relay/node/adapter path, protocol drafts, provider integrations, security gates, local demos and reproducible tests.

The current reference implementation demonstrates signed identity, capability discovery, authorization-aware routing, signed results, private provider requester allowlists, provider-host access control, fail-closed billing modes, explicit public-network configuration gates, a first official verified BYOK CLI flow and bounded MCP interoperability paths.

This does **not** mean the entire future security/control/interoperability plane is finished. A2A support, generalized current MCP interoperability, bidirectional A2A↔TRUYN↔MCP proof, rich account/tenant ownership, durable distributed quota/accounting, prepaid/subscription entitlement resolution, OS credential-store integration, production origin/perimeter hardening and the future stable mainnet remain additional work.

No document or public A2A/MCP endpoint should be interpreted as permission to consume TRUYN-operated provider accounts.

---

## How to participate

**Read it. Challenge it. Fork it. Implement it. Break it. Improve it.**

Useful contributions include protocol design, networking implementation, trust algorithms, adversarial testing, cryptography, discovery/NAT traversal, A2A/MCP bridges, agent adapters, provider authorization, BYOK UX, compute sandboxing, SDKs, benchmarks, simulations, documentation and independent academic critique.

TRUYN is licensed under the **Apache License 2.0 (`Apache-2.0`)**. See [`LICENSE`](LICENSE).

---

## Read next

- [Manifesto](MANIFESTO.md) — why TRUYN should exist.
- [Whitepaper](WHITEPAPER.md) — academic rationale, formulas, threat model and research basis.
- [Architecture Contract](docs/architecture/ARCHITECTURE_CONTRACT.md) — canonical mapping of concepts to implementation owners.
- [A2A / MCP Interoperability](docs/architecture/A2A_MCP_INTEROPERABILITY.md) — external protocol bridge architecture and implementation gate.
- [A2A / MCP Compatibility](docs/compatibility/A2A_MCP_COMPATIBILITY.md) — factual current support/version matrix.
- [Provider Ownership](docs/architecture/PROVIDER_OWNERSHIP.md) — who owns provider capacity and who may use it.
- [Authorization Model](docs/architecture/AUTHORIZATION_MODEL.md) — fail-closed server-side provider authorization.
- [Relay Security](docs/architecture/RELAY_SECURITY.md) — public relay vs private provider/control-plane boundaries.
- [Billing Boundary](docs/architecture/BILLING_BOUNDARY.md) — BYOK/owner-funded/sponsored accounting semantics.
- [BYOK Architecture](docs/architecture/BYOK_ARCHITECTURE.md) — Bring Your Own Intelligence / Provider.
- [Threat Model](docs/architecture/THREAT_MODEL.md) — provider and relay abuse cases and required negative tests.
- [Public / Private Boundary](docs/architecture/PUBLIC_PRIVATE_BOUNDARY.md) — what belongs in the open repository vs private operations.
- [Multi-Cloud Provider Architecture](docs/architecture/MULTI_CLOUD_PROVIDER_ARCHITECTURE.md) — public capability architecture without private deployment identifiers.
- [TRUYN/1 Protocol](spec/protocol/v1/README.md) — normative protocol semantics.
- [Repository Structure](STRUCTURE.md) — where each subsystem belongs.
- [Roadmap](ROADMAP.md) — staged implementation plan.

---

> **Stop routing only packets. Start routing intelligence.**
>
> **Trust must be computed, not assumed.**
>
> **TRUYN — The Intelligence Network.**