# Repository Structure

TRUYN is organized as a single evolving codebase. Software releases are tracked with Git tags/releases, while network protocol and wire-schema generations may coexist in versioned directories.

## Root files

- `README.md` — public entry point.
- `MANIFESTO.md` — values and direction.
- `WHITEPAPER.md` — technical and academic design.
- `LICENSE` — 0BSD license.
- `SECURITY.md` — security reporting and scope.
- `CONTRIBUTING.md` — contribution principles.
- `CHANGELOG.md` — release history.
- `ROADMAP.md` — engineering milestones.
- `VERSION` — current development software version.

## Architecture directories

- `docs/` — human-facing architecture, concepts, operations, security, trustability, compatibility, and architectural decisions.
- `spec/` — normative protocol specifications. Protocol generations live under `spec/protocol/v1`, `v2`, etc.
- `proto/` — machine-readable wire-schema definitions, versioned independently where required.
- `core/` — protocol-independent domain logic: identity, capability, intent, claims, provenance, trust, state, routing policy, and cryptography.
- `network/` — transport and peer-network mechanics: transport, discovery, DHT, pub/sub, relay, NAT traversal, sessions, and caching.
- `node/` — the long-running TRUYN Node/daemon runtime, local configuration, storage integration, health, scheduling, and telemetry.
- `cli/` — the user-facing `truyn` command-line interface.
- `adapters/` — bridges between TRUYN and existing agent/model ecosystems. Adapters are not the TRUYN network itself.
- `sdk/` — language SDKs for native TRUYN clients.
- `gateways/` — bridges to legacy HTTP, REST, webhook, and other existing systems.
- `installers/` — operating-system installers and uninstallers.
- `packaging/` — package-manager and distribution metadata.
- `config/` — defaults and environment/network profiles such as development, testnet, and production.
- `bootstrap/` — bootstrap-node and discovery configuration for public/test networks.
- `trust/` — Trustability implementation: scoring, provenance, independence, reputation, Sybil/collusion defenses, anomaly detection, and policy.
- `storage/` — persistent state, claims, cache, identity metadata, and storage migrations.
- `tests/` — unit, integration, interoperability, network, trust, security, and adversarial tests.
- `benchmarks/` — latency, throughput, token, bandwidth, inference-cost, trust, and scale measurements.
- `simulations/` — controlled multi-node, failure, and adversarial simulations.
- `examples/` — runnable examples for nodes, agents, interoperability, and Trustability.
- `scripts/` — development, testing, benchmarking, release, install, and uninstall helpers.
- `migrations/` — explicit config, storage, and protocol migration tooling.
- `.github/` — CI/CD, issue templates, and pull-request templates.

## Protocol versioning

Software version and protocol version are separate:

```text
TRUYN software: v0.4.2, v1.0.0, v2.3.1, ...
Network protocol: TRUYN/1, TRUYN/2, ...
Wire schemas: proto/v1, proto/v2, ...
Storage schema: migrated independently
```

A newer implementation may support multiple protocol generations at the same time. We do not copy the entire repository into `v1/`, `v2/`, and `v3/`; only compatibility-sensitive contracts are versioned side-by-side.

## Runtime model

TRUYN installs a **Node**, not an AI model. A Node is expected to run as a background service/daemon (planned name: `truynd`) while users and software interact through the `truyn` CLI, adapters, SDKs, or local APIs.

Conceptually:

```text
AI agent / model / machine
          ↓
adapter / SDK / local API
          ↓
       TRUYN Node
 identity · discovery · routing
 state · provenance · trustability
          ↓
      QUIC / UDP / IP
          ↓
   existing Internet
```

## Local runtime data

The intended logical user-data layout is:

```text
~/.truyn/
├── config.toml
├── identity/
├── state/
├── claims/
├── trust/
├── cache/
├── peers/
├── adapters/
├── logs/
└── db/
```

Private key material should use operating-system secure storage/keychains where available; this tree is a logical model, not a requirement to store secrets as plaintext files.

## Network modes

- `local` — development/testing on one machine or LAN.
- `testnet` — public experimental network where protocol changes and adversarial tests are expected.
- `mainnet` — future stable public network where compatibility requirements are stricter.
