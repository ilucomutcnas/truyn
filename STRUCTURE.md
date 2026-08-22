# Repository Structure

TRUYN is a **single evolving codebase**. Software releases are tracked with Git tags/releases, while compatibility-sensitive network contracts coexist in versioned directories.

The repository deliberately separates versioning and authority dimensions:

```text
Software release      0.1.0-dev, v1.0.0, v2.3.1, ...
Network protocol      TRUYN/1, TRUYN/2, ...
Wire schema           proto/v1, proto/v2, ...
Local storage/config  migrated independently
External adapters     A2A / MCP versions negotiated independently
SDK packages          versioned independently within declared TRUYN compatibility
Governance             RFC/extension/decision rules evolve under GOVERNANCE.md
```

A newer node may support multiple protocol generations simultaneously. We do **not** copy the entire repository into `v1/`, `v2/`, `v3/`.

## Root documents

- `README.md` — public project entry point and practical value.
- `MANIFESTO.md` — values and direction.
- `WHITEPAPER.md` — academic and engineering rationale.
- `STRUCTURE.md` — repository ownership and versioning model.
- `ROADMAP.md` — staged implementation/maturity sequence, including governance maturity.
- `GOVERNANCE.md` — canonical project governance, roles, bootstrap stewardship, TSC target and maturity model.
- `MAINTAINERS.md` — factual current governance-role roster.
- `LICENSE` — Apache License 2.0 (`Apache-2.0`).
- `SECURITY.md` — security reporting, provider/relay security baseline and repository boundary.
- `CONTRIBUTING.md` — contribution principles plus entry points into normative governance.
- `CHANGELOG.md` — factual repository/release changes.
- `VERSION` — current software development version.

## Source-of-truth hierarchy

Different documents have different jobs:

1. `spec/protocol/<generation>/` — **normative protocol semantics**.
2. `proto/<generation>/` — **machine-readable wire schema** implementing normative semantics.
3. `GOVERNANCE.md` + `docs/governance/` — **how normative project decisions, RFCs and official extensions are allowed to change the standard**.
4. `docs/architecture/ARCHITECTURE_CONTRACT.md` — subsystem ownership and cross-document mapping.
5. `docs/architecture/IMPLEMENTATION_STATUS.md` — canonical factual maturity/status.
6. subsystem architecture documents — current implementation contracts + target boundaries, including governance, interoperability and SDK/developer experience.
7. `docs/benchmarks/` — durable measured evidence.
8. `WHITEPAPER.md` — scientific rationale/models/research basis.
9. `README.md` — human-facing summary; must not redefine protocol behavior or governance maturity.
10. `ROADMAP.md` — sequencing/maturity; must not silently redefine protocol semantics or claim organizational states that do not exist.

If these disagree, the inconsistency must be corrected rather than treated as a feature.

Governance controls the **process for changing** normative sources. It does not replace `spec/` as the source of protocol semantics.

## Main architecture directories

- `docs/` — architecture, concepts, setup, operations, security, Trustability, compatibility, governance, developer onboarding, decisions and evidence.
- `docs/governance/` — RFC lifecycle, extension tiers, decision classes/quorum/conflict rules and governance documentation index.
- `spec/` — normative protocol specifications, versioned by protocol generation. `spec/protocol/v1/agent-descriptor.md` owns the draft TRUYN Agent Descriptor semantics without creating a new top-level envelope kind.
- `proto/` — machine-readable wire schemas.
- `core/` — protocol-independent domain logic: identity, capability, intent, claims, content-addressed objects, provenance, trust, state, routing policy and crypto.
- `core/security/` — **implemented reference owner** for provider access policy, relay provider policy, provider billing safety, protected-node/backchannel helpers and sponsored entitlement verification. Rich account/tenant membership, commercial entitlement administration and distributed accounting remain broader future control-plane work.
- `network/` — real QUIC transport, authenticated sessions, Kademlia discovery/DHT RPC/state, P2P routing, relay, NAT traversal and testnet mechanics.
- `node/` — long-running TRUYN Node/daemon composition, service lifecycle, config/storage/health/telemetry ownership as it matures.
- `runtime/` — executable relay/provider runtime composition and security configuration.
- `cli/` — user-facing `truyn` commands, including implemented reference BYOK onboarding. CLI gates are UX/defense-in-depth, not authoritative provider security.
- `adapters/` — bridges to AI/model/agent ecosystems and protocols. Provider credentials belong at adapter/runtime secret boundaries, not TRUYN envelopes.
- `adapters/mcp/` — implemented bounded TRUYN-as-MCP server surface.
- `adapters/a2a/` — **reserved implementation owner** for the planned A2A Agent Card/server facade and A2A client/provider bridge; the directory may not exist until implementation starts.
- `adapters/providers/` — provider-specific and external-tool-backed provider adapters, including the bounded configured MCP HTTP tool provider path.
- `sdk/` — first-party/native client SDK program. Required stable-v1 targets are JavaScript/TypeScript, Python, Go, Java and C#/.NET; Rust is an optional additional track. SDKs consume TRUYN contracts and MUST NOT redefine protocol or bypass authorization.
- `gateways/` — HTTP/REST/webhook/legacy compatibility bridges. Execution-capable gateways must preserve equivalent central authorization.
- `compute/` — remote capability execution, compute-near-data placement, sandboxing and execution policy ownership; not yet a fully productionized general subsystem.
- `trust/` — Trustability engine, provenance/independence, receipts, lifecycle, source-owner authority, revocation and trust-network components.
- `storage/` — persistent state/claims/content/index/cache metadata and migrations.
- `economics/` — optional capability pricing/settlement/accounting abstractions; never an implicit authorization source.
- `installers/` — OS installation/service-registration lifecycle target.
- `packaging/` — package/distribution metadata and checksums target, including future SDK publication/release metadata where appropriate.
- `updater/` — signed update channels, compatibility checks, migrations, rollback/recovery target.
- `config/` — defaults plus `local`, `testnet`, `mainnet` profiles. Public network mode never overrides provider visibility.
- `bootstrap/` — bootstrap/discovery configuration/contracts for testnet/mainnet.
- `tests/` — unit, integration, interoperability, network, trust, compute, security, adversarial and future SDK conformance tests.
- `tests/interoperability/` — **reserved target owner** for A2A/MCP cross-protocol round-trip, exact-version and negative-security gates.
- `benchmarks/` — benchmark code/workloads for latency, tokens, bandwidth, inference cost, trust and scale. Durable reports live in `docs/benchmarks/`.
- `simulations/` — controlled multi-node, network-failure, trust and adversarial simulations.
- `examples/` — runnable interoperability/use-case examples; future SDK examples should demonstrate the same semantic flow across languages; no live private secrets/topology.
- `scripts/` — development/testing/benchmark/release helpers, including future schema/codegen/conformance generation where appropriate.
- `migrations/` — explicit config/storage/protocol migration tooling target.
- `.github/` — CI and temporary bounded operational workflows; permanent public workflows must respect the repository security boundary. Future SDK CI must cover all required first-party languages. GitHub permissions/CODEOWNERS are implementation controls and do not by themselves define project governance roles.

## Documentation tree

```text
docs/
├── architecture/     canonical architecture + implementation status + governance + A2A/MCP + SDK/DX contracts
├── benchmarks/       append-only sanitized evidence ledger
├── compatibility/    software/protocol/node/adapter/A2A/MCP/SDK compatibility
├── concepts/         explanatory concepts
├── decisions/        ADR-style implementation/architecture decisions
├── governance/       RFC + extension + decision-process governance
├── getting-started/  user setup/BYOK/MVP/SDK onboarding guidance
├── operations/       node/testnet/billing operational contracts
├── security/         security architecture status + operational security
└── trustability/     claim/trust lifecycle architecture
```

`operations`, `security`, `compatibility` and `governance` are explicit documentation layers.

## Public architecture documents

Canonical provider/network/security/status/interoperability/developer/governance documents include:

```text
docs/architecture/
├── ARCHITECTURE_CONTRACT.md
├── IMPLEMENTATION_STATUS.md
├── GOVERNANCE_ARCHITECTURE.md
├── A2A_MCP_INTEROPERABILITY.md
├── SDK_DEVELOPER_EXPERIENCE.md
├── NETWORK_UNDERLAY_V01.md
├── PROVIDER_OWNERSHIP.md
├── AUTHORIZATION_MODEL.md
├── RELAY_SECURITY.md
├── BILLING_BOUNDARY.md
├── SETTLEMENT_ADAPTERS.md
├── BYOK_ARCHITECTURE.md
├── THREAT_MODEL.md
├── PUBLIC_PRIVATE_BOUNDARY.md
├── PUBLIC_EDGE_DOMAINS.md
├── MULTI_CLOUD_PROVIDER_ARCHITECTURE.md
├── SEMANTIC_INDEX_LIFECYCLE.md
├── SEMANTIC_SCALE_GATE_V3.md
├── DISTRIBUTED_SEMANTIC_RETRIEVAL.md
├── DECENTRALIZED_PLACEMENT_BYZANTINE_RETRIEVAL.md
└── KADEMLIA_QUIC_TRUST_TESTNET.md
```

Governance contracts:

```text
GOVERNANCE.md
MAINTAINERS.md
docs/governance/README.md
docs/governance/RFC_PROCESS.md
docs/governance/EXTENSIONS.md
docs/governance/DECISION_PROCESS.md
```

Developer-facing SDK/DX contracts:

```text
sdk/README.md
sdk/typescript/README.md
sdk/python/README.md
sdk/go/README.md
sdk/java/README.md
sdk/dotnet/README.md
sdk/rust/README.md                 # optional secondary track
docs/getting-started/SDK_QUICKSTART.md
docs/compatibility/SDK_COMPATIBILITY.md
spec/protocol/v1/agent-descriptor.md
```

External interoperability compatibility:

```text
docs/compatibility/A2A_MCP_COMPATIBILITY.md
```

User-facing BYOK setup contract:

```text
docs/getting-started/BYOK.md
```

Detailed operations/security/compatibility:

```text
docs/operations/
docs/security/
docs/compatibility/
```

Normative provider-policy target:

```text
spec/protocol/v1/provider-policy.md
```

## Governance ownership

TRUYN deliberately separates:

```text
protocol/spec governance
repository/reference implementation maintenance
TRUYN-operated infrastructure
commercial products/services
```

A company may fund code or operate infrastructure without gaining a permanent right to define the protocol. A repository collaborator is not automatically a Maintainer/TSC member. A future TSC controls normative project decisions but does not control third-party products or private provider accounts.

Current factual state is bootstrap governance with InnMedia as Founding Steward. The public governance contracts are defined (G1), while external maintainers, a multi-organization TSC and neutral legal stewardship remain future organizational gates.

Official extension namespace use is governed by `docs/governance/EXTENSIONS.md`; Community Extensions remain permissionless in third-party namespaces.

## Adapter protocol ownership

A2A and MCP are **external adapter protocols**, not normative TRUYN/1 vocabulary.

Their repository boundary is:

```text
A2A/MCP client or server
        ↓
adapters/a2a or adapters/mcp
        ↓ normalize / version-check / authenticate
TRUYN node + normal provider authorization
        ↓
TRUYN network
```

The current MCP implementation has bounded reference server/provider paths. A2A is architecture-only until `adapters/a2a/` is implemented and evidenced. External Agent Card/Task/Artifact or Tool/Resource objects do not become new TRUYN wire primitives merely because adapters translate them.

The native TRUYN Agent Descriptor is not the A2A Agent Card. They belong to different interfaces and may only be projected across adapters with explicit identity/visibility semantics.

## Public repository vs private operations

The public repository owns protocol/architecture, governance contracts, generic adapters, generic deployment patterns, SDK contracts/implementations, tests, conformance fixtures, examples and reproducible sanitized public benchmarks.

Credentials, private keys, private cloud identity/topology, privileged allowlists, private origins/backchannels, exact production quotas/cost ceilings, billing/credit information and sensitive incident/customer data belong to protected operational systems.

Public Agent Descriptors and public A2A Agent Cards must follow the same boundary: only intentionally public interfaces/capabilities may appear in an unauthenticated view. Remote A2A/MCP bearer tokens, API keys, private endpoints and privileged discovery credentials remain adapter/runtime secrets.

Public governance does not require disclosure of active vulnerability details or secrets. Security embargoes may delay disclosure, but material permanent normative changes receive a public record after safe disclosure.

Security must remain correct even if the public architecture and SDK/adapter implementation are fully known.

## Canonical TRUYN/1 vocabulary

The first protocol generation defines top-level exchange objects:

```text
IDENTITY
OFFER
NEED
OBJECT
CLAIM
ATTEST
STATE
DELTA
SUBSCRIBE
COMPUTE
RESULT
TRUST_RECEIPT
REVOKE
```

`CAPABILITY` is a descriptor used by `OFFER`, `NEED` and `COMPUTE`.

The **TRUYN Agent Descriptor** is discovery/bootstrap metadata, not a new top-level exchange object. It describes participant identity, supported protocol/interfaces and intentionally visible capability classes; dynamic availability/conditions remain in `OFFER`.

A2A Agent Cards/Tasks/Artifacts and MCP Tools/Resources are also **not** top-level TRUYN/1 exchange objects. They remain compatibility objects owned by adapters.

Provider ownership/authorization/billing policy is not a new top-level exchange object. It is a policy layer around discovery/eligibility/execution, specified in `spec/protocol/v1/provider-policy.md` and implemented incrementally by `core/security/` + relay/provider runtime boundaries.

`CHALLENGE`, `VERIFY` and `DISPUTE` are composed verification behaviors built from existing primitives, not additional TRUYN/1 envelope types.

## Runtime model

TRUYN installs/runs a **Node**, not an AI model. The intended background process name remains `truynd` as the daemon lifecycle stabilizes; current reference runtimes are executable through repository runtime/node/testnet entry points.

```text
AI agent / model / machine
          ↓
adapter / SDK / local API
          ↓
       TRUYN Node
 identity · discovery · routing
 objects/state · execution
 provenance · trustability
          ↓
 authorization / provider policy / billing
          ↓
      QUIC / UDP / IP
          ↓
   existing Internet
```

For provider execution, authorization and billing decisions occur before upstream work.

An SDK is a typed developer-facing access surface to this model. It does not move provider policy into application code.

## First-run lifecycle

The intended installer/runtime sequence is:

```text
detect OS / architecture
        ↓
install verified binary
        ↓
create local TRUYN data area
        ↓
generate or import cryptographic node identity
        ↓
store private key in OS secure storage where available
        ↓
create config + local database/state
        ↓
register background service (`truynd`) when packaged
        ↓
select local / testnet / mainnet profile
        ↓
optionally configure BYOK provider(s)
        ↓
discover bootstrap peers when applicable
        ↓
start authenticated networking
        ↓
TRUYN Node online
```

Parts of this lifecycle (identity, config, BYOK, networking/testnet runtime) exist in reference form. Verified cross-platform installers, stable service registration and signed updater/rollback remain v0.8/v1.0 work.

The future SDK onboarding path can connect to an already-running node or approved gateway; it does not require every application process to embed the full network node.

## Intended local runtime data

```text
~/.truyn/
├── config.toml
├── identity/
├── objects/
├── state/
├── claims/
├── trust/
├── cache/
├── peers/
├── adapters/
├── logs/
└── db/
```

This is a logical ownership model, not a requirement to store secrets as plaintext. Private keys/provider credential material SHOULD use operating-system/cloud secure storage where possible.

## Network modes

Canonical names are exactly:

- `local` — isolated development/testing on one machine or LAN;
- `testnet` — public/controlled experimental network for protocol changes, adversarial testing and interoperability;
- `mainnet` — future stable public network with stricter compatibility/update/rollback requirements.

Network mode affects reachability/compatibility; it never grants access to a private provider.

## Current maturity

Current software is `0.1.0-dev`; `TRUYN/1` remains draft. The v0.1 underlay is implemented/CI-proven and bounded real QUIC/Kademlia trust-network evidence exists. MCP has bounded executable reference paths; A2A and the general bidirectional A2A↔TRUYN↔MCP bridge remain implementation/evidence work. The SDK/DX architecture and Agent Descriptor draft are defined, but the required first-party SDK packages and descriptor runtime path remain implementation work. Governance contracts/RFC/extension tiers are now defined at G1, but actual governance remains bootstrap/single-steward: external maintainers, a multi-organization TSC and neutral legal stewardship are not yet facts. Stable mainnet, production commercial tenancy/accounting, large real-node WAN scale and stable updater/compatibility contracts remain future gates.
