# Repository Structure

TRUYN is a **single evolving codebase**. Software releases, protocol generations, wire schemas and local storage/config versions evolve independently.

```text
Software release      0.1.0-dev, v1.0.0, ...
Network protocol      TRUYN/1, TRUYN/2, ...
Wire schema           proto/v1, proto/v2, ...
Local storage/config  migrated independently
```

The repository is not copied wholesale into version directories for each software release.

## Source-of-truth hierarchy

1. `spec/protocol/<generation>/` — normative protocol semantics.
2. `proto/<generation>/` — machine-readable wire schema.
3. `docs/architecture/ARCHITECTURE_CONTRACT.md` — cross-subsystem architecture ownership.
4. `docs/architecture/IMPLEMENTATION_STATUS.md` — factual maturity/status.
5. subsystem architecture documents — implementation contracts and target boundaries.
6. `docs/benchmarks/` — durable measured evidence.
7. `WHITEPAPER.md` — scientific rationale/prior art.
8. `README.md` — public summary.
9. `ROADMAP.md` — sequencing/maturity plan.

If these disagree, the inconsistency is a defect.

## Root documents

- `README.md` — public entry point/value.
- `MANIFESTO.md` — values/direction.
- `WHITEPAPER.md` — research/engineering rationale.
- `STRUCTURE.md` — repository ownership/versioning.
- `ROADMAP.md` — implementation sequence and maturity.
- `SECURITY.md` — public security policy/baseline.
- `CHANGELOG.md` — factual repository/release changes.
- `VERSION` — current software development version.

## Main implementation areas

- `core/` — protocol-independent identity, capability, claims, provenance, state/routing and crypto logic.
- `core/security/` — **implemented owner** for reference provider access policy, relay provider policy, provider billing safety, protected-node/backchannel helpers and sponsored entitlement verification. Rich account/tenant/commercial control plane remains broader future work.
- `network/` — QUIC transport, authenticated sessions, Kademlia discovery/state RPC, P2P routing, relay, NAT traversal and testnet networking.
- `node/` — long-running node/runtime composition.
- `runtime/` — executable relay/provider service composition and security configuration.
- `cli/` — user-facing commands including implemented reference BYOK onboarding.
- `adapters/` — AI/model/protocol provider bridges and artifact normalization.
- `sdk/` — native/public client surfaces as they stabilize.
- `gateways/` — compatibility bridges; execution paths must preserve provider authorization.
- `compute/` — compute execution/sandbox ownership; not yet a fully productionized general compute subsystem.
- `trust/` — claim-centric Trustability, provenance/independence, receipts, lifecycle and trust-network components.
- `storage/` — persistent state/content/index stores and migrations.
- `economics/` — optional pricing/settlement/accounting abstractions; never an implicit authorization source.
- `config/` — `local`, `testnet`, `mainnet` profiles and defaults.
- `bootstrap/` — testnet/mainnet bootstrap contracts/configuration.
- `tests/` — unit/integration/network/security/adversarial regression suite.
- `benchmarks/` — benchmark code/workloads; durable public reports live under `docs/benchmarks/`.
- `simulations/` — controlled scale/failure/adversarial simulations.
- `installers/`, `packaging/`, `updater/`, `migrations/` — future/staged distribution and lifecycle ownership.

## Documentation areas

```text
docs/
├── architecture/     canonical subsystem architecture + implementation status
├── benchmarks/       append-only sanitized evidence ledger
├── compatibility/    software/protocol/node/adapter compatibility rules
├── concepts/         explanatory concepts
├── decisions/        ADR-style decisions
├── getting-started/  user setup/BYOK/MVP guidance
├── operations/       actual node/testnet/billing operational contracts
├── security/         security architecture status + operational security runbooks
└── trustability/     claim/trust lifecycle architecture
```

These directories are no longer placeholders: operations, security and compatibility have explicit documentation baselines.

## Canonical architecture set

Important current documents include:

- `docs/architecture/ARCHITECTURE_CONTRACT.md`
- `docs/architecture/IMPLEMENTATION_STATUS.md`
- `docs/architecture/NETWORK_UNDERLAY_V01.md`
- `docs/architecture/PROVIDER_OWNERSHIP.md`
- `docs/architecture/AUTHORIZATION_MODEL.md`
- `docs/architecture/BILLING_BOUNDARY.md`
- `docs/architecture/BYOK_ARCHITECTURE.md`
- `docs/architecture/RELAY_SECURITY.md`
- `docs/architecture/THREAT_MODEL.md`
- `docs/architecture/PUBLIC_PRIVATE_BOUNDARY.md`
- `docs/architecture/MULTI_CLOUD_PROVIDER_ARCHITECTURE.md`
- `docs/architecture/SEMANTIC_INDEX_LIFECYCLE.md`
- `docs/architecture/SEMANTIC_SCALE_GATE_V3.md`
- `docs/architecture/DISTRIBUTED_SEMANTIC_RETRIEVAL.md`
- `docs/architecture/DECENTRALIZED_PLACEMENT_BYZANTINE_RETRIEVAL.md`
- `docs/architecture/KADEMLIA_QUIC_TRUST_TESTNET.md`

## Runtime model

TRUYN installs/runs a network node, not an AI model.

```text
agent / model / machine
        ↓
adapter / SDK / local API
        ↓
TRUYN node
identity · discovery · routing
objects/state · provenance · trust
        ↓
authorization + billing policy
        ↓
QUIC / UDP / IP
        ↓
existing Internet
```

## Network modes

Canonical names are exactly:

- `local` — isolated development/LAN;
- `testnet` — experimental public/controlled network;
- `mainnet` — future stable public network.

Public network mode never overrides provider visibility/authorization.

## Public repository vs private operations

The public repository may contain protocol/architecture, generic implementation, tests and sanitized evidence. It must not contain credentials/private keys, unnecessary private cloud topology, privileged allowlists, live secret paths, private origins, customer data or exact operational billing/quota ceilings.

Security must remain correct even when the public architecture is known.

## Current maturity

Current software is `0.1.0-dev`; `TRUYN/1` remains draft. The v0.1 network underlay is implemented/CI-proven, and bounded real QUIC/Kademlia trust-network evidence exists, but production mainnet, stable compatibility, large real-node WAN scale and full commercial tenant/account operations remain future gates.
