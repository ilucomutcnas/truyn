# TRUYN — The Intelligence Network

**An open-source, trust-aware network for AI agents, machines, and autonomous systems.**

> **The Internet was built to move data. TRUYN is being built to move intelligence.**

TRUYN explores a logical network where machines can express **what intelligence is needed**, discover eligible capabilities, exchange signed structured results, reuse verified state/context, and evaluate Trustability without hard-coding one provider or endpoint.

[Manifesto](MANIFESTO.md) · [Whitepaper](WHITEPAPER.md) · [Architecture](docs/architecture/ARCHITECTURE_CONTRACT.md) · [Security](SECURITY.md) · [BYOK](docs/getting-started/BYOK.md) · [Protocol](spec/protocol/v1/README.md) · [Roadmap](ROADMAP.md) · [0BSD License](LICENSE)

## Core idea

Conventional integration is usually endpoint-centric:

```text
address → server → vendor API → request → response
```

TRUYN is capability- and policy-centric:

```text
need → discover → verify → authorize → route / execute → signed result + trustability
```

The network separates **capability** from **authorization**. A provider may be discoverable or technically capable while still being unavailable to a requester.

## Open protocol. Private intelligence accounts.

> **Open protocol ≠ open billing account.**
>
> **TRUYN is open. Intelligence is BYOK by default.**

A public repository, protocol, relay hostname, provider adapter, model family, benchmark methodology, or capability name never grants permission to consume another party's paid AI account or quota.

The safety invariant is:

```text
foreign requester
+ public network knowledge
+ known/guessed private provider identity
+ custom client
= zero unauthorized owner-funded provider calls
```

Normal users Bring Their Own Intelligence / Bring Their Own Provider. Upstream credentials remain at the provider runtime or in an appropriate private secret store; they do not belong in TRUYN envelopes or public repository data.

## Current security baseline

The public reference relay is **fail closed by default**:

- production-style node registration requires explicit enrollment;
- provider execution requires an explicitly trusted requester;
- untrusted requesters cannot enumerate foreign provider offers;
- legacy mutation/execution routes require an active expiring session bound to the signed node identity;
- stale/replayed registration envelopes are rejected;
- request/WebSocket payload sizes and in-memory queues have limits;
- public health output is minimal by default;
- permissive `truyn relay` development mode is loopback-only.

This baseline closes the earlier MVP fail-open behavior. It is still not the final multi-tenant marketplace: authoritative provider owner/tenant/visibility/billing/quota policy and BYOK onboarding remain governed by the architecture and security acceptance matrix.

Read:

- [Provider Ownership](docs/architecture/PROVIDER_OWNERSHIP.md)
- [Authorization Model](docs/architecture/AUTHORIZATION_MODEL.md)
- [Relay Security](docs/architecture/RELAY_SECURITY.md)
- [Billing Boundary](docs/architecture/BILLING_BOUNDARY.md)
- [BYOK Architecture](docs/architecture/BYOK_ARCHITECTURE.md)
- [Threat Model](docs/architecture/THREAT_MODEL.md)
- [Public / Private Boundary](docs/architecture/PUBLIC_PRIVATE_BOUNDARY.md)

## TRUYN/1 concepts

| Concept | Purpose |
|---|---|
| `IDENTITY` | Cryptographic participant identity independent of IP address. |
| `CAPABILITY` | Machine-readable description of what can be provided or computed. |
| `OFFER` | Advertise a capability and conditions. |
| `NEED` | Request an outcome under policy constraints. |
| `OBJECT` | Immutable content-addressed information. |
| `STATE` / `DELTA` | Current state and changes against a known base. |
| `CLAIM` / `ATTEST` | Assertions, evidence, support/dispute. |
| `COMPUTE` | Capability execution under execution policy. |
| `RESULT` | Signed outcome of a request/computation. |
| `TRUST_RECEIPT` | Compact signed trust evidence aggregation. |
| `REVOKE` | Invalidate/supersede revocable objects. |

Trustability is claim- and context-dependent rather than a universal permanent reputation score:

```text
Trust(claim, requester, purpose, domain, time, policy)
```

## Why use it?

TRUYN is designed to enable:

- vendor-neutral agent-to-agent interoperability;
- capability discovery without hard-coded provider endpoints;
- provenance and signed result attribution;
- authorization-aware routing;
- reusable content-addressed context and deltas;
- fewer repeated tokens/data transfers when context can be referenced or materialized minimally;
- compute-near-data patterns;
- explicit Trustability and verification policy;
- future capability markets without requiring one payment rail or blockchain.

Economic claims must be reproducible. Public benchmark methodology lives under `benchmarks/` and `docs/benchmarks/`; raw production execution evidence and privileged infrastructure details do not belong in this public repository.

## Local MVP

The included demos use an explicit loopback-only development relay.

```bash
npm ci
npm test
npm run demo
npm run demo:ai
```

A generic live BYOK demo is also available, but it uses only credentials supplied by the person running it locally. See [Examples](examples/README.md) and [MVP Quickstart](docs/getting-started/MVP_QUICKSTART.md).

Do not expose the permissive local-development relay on a LAN, tunnel, or public interface.

## Provider-neutral architecture

TRUYN routes logical capabilities, not model names. Examples include:

```text
reasoning.general
media.image.generate
media.video.generate
```

Provider/model/cloud labels are metadata and policy inputs. The public architecture may discuss model families and capability parity, but concrete private deployment IDs, cloud identities, origins, quotas, allowlists and operational topology are intentionally excluded.

See [Multi-Cloud Provider Architecture](docs/architecture/MULTI_CLOUD_PROVIDER_ARCHITECTURE.md) and [Multimodal Benchmark Methodology](docs/benchmarks/MULTIMODAL_PROVIDER_PARITY.md).

## Repository security boundary

This public repository is for protocol semantics, generic implementation, local/BYOK examples, tests, security invariants and reviewed methodology.

It is **not** an operations repository. Privileged cloud provisioning workflows, private provider bootstrap instructions, production topology, raw production artifacts, live cloud/account identifiers, secret paths, allowlists, incident data and billing/quota controls belong in access-controlled operational systems.

See [SECURITY.md](SECURITY.md).

## Network modes

- `local` — isolated development/testing;
- `testnet` — experimental public network when safe admission/authorization controls are configured;
- `mainnet` — future stable public network.

Public reachability never changes provider ownership or billing authorization.

## Participate

**Read it. Challenge it. Fork it. Implement it. Break it. Improve it.**

TRUYN uses the **Zero-Clause BSD (0BSD)** license.

> **Stop routing only packets. Start routing intelligence.**
>
> **Trust must be computed, not assumed.**
>
> **TRUYN — The Intelligence Network.**
