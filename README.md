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

The goal is vendor-neutral interoperability.

A TRUYN node should be connectable to:

- OpenAI / Codex-based agents
- Llama and other open-weight models
- local AI runtimes
- autonomous software agents
- sensors and edge devices
- cloud services
- enterprise systems
- future agent frameworks that do not exist yet

Adapters such as **MCP, SDKs, local APIs, and gateways** can connect existing systems to the network without making those adapter protocols the network itself.

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
