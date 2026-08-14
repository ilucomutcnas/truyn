# Repository Structure

TRUYN is a **single evolving codebase**. Software releases are tracked with Git tags/releases, while compatibility-sensitive network contracts can coexist in versioned directories.

The repository deliberately separates four kinds of versioning:

```text
Software release      v0.1.0, v1.0.0, v2.3.1, ...
Network protocol      TRUYN/1, TRUYN/2, ...
Wire schema           proto/v1, proto/v2, ...
Local storage/config  migrated independently
```

A newer node may support multiple protocol generations simultaneously. We do **not** copy the entire repository into `v1/`, `v2/`, `v3/`.

## Root documents

- `README.md` — public project entry point and practical value.
- `MANIFESTO.md` — values and direction.
- `WHITEPAPER.md` — academic and engineering rationale.
- `STRUCTURE.md` — repository ownership and versioning model.
- `ROADMAP.md` — staged implementation sequence.
- `LICENSE` — 0BSD.
- `SECURITY.md` — security reporting and scope.
- `CONTRIBUTING.md` — contribution principles.
- `CHANGELOG.md` — factual repository/release changes.
- `VERSION` — current software development version.

## Source-of-truth hierarchy

Different documents have different jobs:

1. `spec/protocol/<generation>/` — **normative protocol semantics**.
2. `proto/<generation>/` — **machine-readable wire schema** implementing the normative semantics.
3. `docs/architecture/ARCHITECTURE_CONTRACT.md` — subsystem ownership and cross-document mapping.
4. `WHITEPAPER.md` — scientific rationale, models and research basis.
5. `README.md` — human-facing summary; it must not redefine protocol behavior.
6. `ROADMAP.md` — sequencing only; it must not silently redefine protocol semantics.

If these disagree, the inconsistency must be corrected rather than treated as a feature.

## Main architecture directories

- `docs/` — architecture, concepts, getting started, operations, security, trustability, compatibility and ADRs.
- `spec/` — normative protocol specifications, versioned by protocol generation.
- `proto/` — machine-readable wire schemas.
- `core/` — protocol-independent domain logic: identity, capability, intent, claims, content-addressed objects, provenance, trust, state, routing policy and crypto.
- `network/` — transport, discovery, DHT, pub/sub, relay, NAT traversal, authenticated sessions and cache mechanics.
- `node/` — long-running TRUYN Node/daemon runtime, service lifecycle, local config, storage integration, health and telemetry.
- `cli/` — user-facing `truyn` command.
- `adapters/` — bridges to AI/model/agent ecosystems and existing protocols. Adapters are not the network itself.
- `sdk/` — native client SDKs.
- `gateways/` — compatibility bridges to HTTP/REST/webhook/legacy systems.
- `compute/` — remote capability execution, compute-near-data placement, sandboxing and execution policy.
- `trust/` — Trustability engine, scoring, provenance, independence, domain history, aggregation, receipts, Sybil/collusion defense and anomaly handling.
- `storage/` — persistent state, claims, content-addressed objects, cache, identity metadata and migrations.
- `economics/` — optional capability pricing/settlement abstractions; not required for basic networking.
- `installers/` — OS installation/service-registration lifecycle.
- `packaging/` — package-manager/distribution metadata and checksums.
- `updater/` — signed update channels, compatibility checks, migrations, rollback and recovery.
- `config/` — defaults plus `local`, `testnet`, `mainnet` network profiles.
- `bootstrap/` — bootstrap-node/discovery configuration for testnet/mainnet.
- `tests/` — unit, integration, interoperability, network, trust, compute, security and adversarial tests.
- `benchmarks/` — latency, throughput, tokens, bandwidth, inference cost, trust and scale measurements.
- `simulations/` — controlled multi-node, network-failure, trust and adversarial simulations.
- `examples/` — runnable interoperability/use-case examples.
- `scripts/` — development/testing/benchmark/release helpers; scripts must not pretend to be functional before implementation.
- `migrations/` — explicit config, storage and protocol migration tooling.
- `.github/` — CI/CD, issue templates and PR templates.

## Canonical TRUYN/1 vocabulary

The first protocol generation defines these top-level exchange objects:

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

`CHALLENGE`, `VERIFY` and `DISPUTE` are composed verification behaviors built from existing primitives, not additional top-level envelope types in TRUYN/1.

## Runtime model

TRUYN installs a **Node**, not an AI model. The intended background process is `truynd`; users and software interact through the `truyn` CLI, adapters, SDKs or local APIs.

```text
AI agent / model / machine
          ↓
adapter / SDK / local API
          ↓
       TRUYN Node
 identity · discovery · routing
 objects · state · execution
 provenance · trustability
          ↓
      QUIC / UDP / IP
          ↓
   existing Internet
```

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
create config + local database
        ↓
register background service (`truynd`)
        ↓
select local / testnet / mainnet profile
        ↓
discover bootstrap peers when applicable
        ↓
start authenticated networking
        ↓
TRUYN Node online
```

See `docs/getting-started/NODE_LIFECYCLE.md`.

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

Private key material SHOULD use operating-system secure storage/keychains where available; this tree is a logical model, not a requirement to store secrets as plaintext files.

## Network modes

The canonical names are exactly:

- `local` — isolated development/testing on one machine or LAN;
- `testnet` — public experimental network where protocol changes and adversarial testing are expected;
- `mainnet` — future stable public network with stricter compatibility, signed-update and rollback requirements.

The repository uses `config/local`, `config/testnet` and `config/mainnet`. The former `development`/`production` naming is deprecated and removed from the skeleton.
