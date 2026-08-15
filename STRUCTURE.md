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
- `SECURITY.md` — security reporting, provider/relay security status and acceptance boundary.
- `CONTRIBUTING.md` — contribution principles.
- `CHANGELOG.md` — factual repository/release changes.
- `VERSION` — current software development version.

## Source-of-truth hierarchy

Different documents have different jobs:

1. `spec/protocol/<generation>/` — **normative protocol semantics**.
2. `proto/<generation>/` — **machine-readable wire schema** implementing the normative semantics.
3. `docs/architecture/ARCHITECTURE_CONTRACT.md` — subsystem ownership and cross-document mapping.
4. `docs/architecture/PROVIDER_OWNERSHIP.md`, `AUTHORIZATION_MODEL.md`, `RELAY_SECURITY.md`, `BILLING_BOUNDARY.md`, `BYOK_ARCHITECTURE.md`, `THREAT_MODEL.md` — approved provider-security architecture.
5. `WHITEPAPER.md` — scientific rationale, models and research basis.
6. `README.md` — human-facing summary; it must not redefine protocol behavior.
7. `ROADMAP.md` — sequencing only; it must not silently redefine protocol semantics.

If these disagree, the inconsistency must be corrected rather than treated as a feature.

## Main architecture directories

- `docs/` — architecture, concepts, getting started, operations, security, trustability, compatibility and ADRs.
- `spec/` — normative protocol specifications, versioned by protocol generation.
- `proto/` — machine-readable wire schemas.
- `core/` — protocol-independent domain logic: identity, capability, intent, claims, content-addressed objects, provenance, trust, state, routing policy and crypto.
- `core/security/` — **planned owner** for central provider authorization, provider policy, tenant resolution and quota/entitlement decision logic. Its presence/description here is architectural ownership, not an implementation claim.
- `network/` — transport, discovery, DHT, pub/sub, relay, NAT traversal, authenticated sessions and cache mechanics. Network execution paths must call the central provider authorization layer rather than implement transport-specific shortcuts.
- `node/` — long-running TRUYN Node/daemon runtime, service lifecycle, local config, storage integration, health and telemetry.
- `cli/` — user-facing `truyn` command, including planned BYOK onboarding. CLI gates are UX controls, not the authoritative provider security boundary.
- `adapters/` — bridges to AI/model/agent ecosystems and existing protocols. Provider credentials belong at the adapter/runtime secret boundary, not in TRUYN envelopes.
- `sdk/` — native client SDKs.
- `gateways/` — compatibility bridges to HTTP/REST/webhook/legacy systems. Execution-capable gateways must converge on central authorization.
- `compute/` — remote capability execution, compute-near-data placement, sandboxing and execution policy.
- `trust/` — Trustability engine, scoring, provenance, independence, domain history, aggregation, receipts, Sybil/collusion defense and anomaly handling.
- `storage/` — persistent state, claims, content-addressed objects, cache, identity metadata and migrations.
- `economics/` — optional capability pricing/settlement abstractions plus usage/accounting interfaces; not required for basic networking and not an implicit authorization source.
- `installers/` — OS installation/service-registration lifecycle.
- `packaging/` — package-manager/distribution metadata and checksums.
- `updater/` — signed update channels, compatibility checks, migrations, rollback and recovery.
- `config/` — defaults plus `local`, `testnet`, `mainnet` network profiles. Public network mode never overrides provider visibility.
- `bootstrap/` — bootstrap-node/discovery configuration for testnet/mainnet.
- `tests/` — unit, integration, interoperability, network, trust, compute, security and adversarial tests, including the provider-authorization negative matrix.
- `benchmarks/` — latency, throughput, tokens, bandwidth, inference cost, trust and scale measurements.
- `simulations/` — controlled multi-node, network-failure, trust and adversarial simulations.
- `examples/` — runnable interoperability/use-case examples; examples must not embed live private operational identifiers or credentials.
- `scripts/` — development/testing/benchmark/release helpers; scripts must not pretend to be functional before implementation.
- `migrations/` — explicit config, storage and protocol migration tooling.
- `.github/` — CI/CD, issue templates and PR templates. Operational secrets remain in protected secret systems rather than committed source.

## Public architecture documents

The provider-security/public-private boundary is documented under:

```text
docs/architecture/
├── ARCHITECTURE_CONTRACT.md
├── PROVIDER_OWNERSHIP.md
├── AUTHORIZATION_MODEL.md
├── RELAY_SECURITY.md
├── BILLING_BOUNDARY.md
├── BYOK_ARCHITECTURE.md
├── THREAT_MODEL.md
├── PUBLIC_PRIVATE_BOUNDARY.md
├── MULTI_CLOUD_PROVIDER_ARCHITECTURE.md
└── PUBLIC_EDGE_DOMAINS.md
```

User-facing BYOK setup contract:

```text
docs/getting-started/BYOK.md
```

Normative provider-policy target:

```text
spec/protocol/v1/provider-policy.md
```

## Public repository vs private operations

The public repository owns protocol/architecture, generic adapters, generic deployment patterns, tests and reproducible public benchmarks.

Credentials, private keys, private cloud identity/topology, privileged allowlists, private origins/backchannels, exact production quotas/cost ceilings, billing/credit information and sensitive incident/customer data belong to protected operational systems.

Security must remain correct even if the public architecture is fully known.

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

Provider ownership/authorization policy is not a new top-level exchange object. It is a policy layer around provider discovery/eligibility/execution, specified in `spec/protocol/v1/provider-policy.md`.

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
  authorization / provider policy
          ↓
      QUIC / UDP / IP
          ↓
   existing Internet
```

For provider execution, the authorization decision happens before dispatch to a private/shared/network provider.

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
optionally configure BYOK provider(s)
        ↓
discover bootstrap peers when applicable
        ↓
start authenticated networking
        ↓
TRUYN Node online
```

A future official-client AI requester flow may require at least one successfully configured own provider. That is a UX guardrail; server-side provider authorization remains authoritative.

See `docs/getting-started/NODE_LIFECYCLE.md` and `docs/getting-started/BYOK.md`.

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

Private key/provider credential material SHOULD use operating-system secure storage/keychains or an equivalent secure secret facility where available; this tree is a logical model, not a requirement to store secrets as plaintext files.

## Network modes

The canonical names are exactly:

- `local` — isolated development/testing on one machine or LAN;
- `testnet` — public experimental network where protocol changes and adversarial testing are expected;
- `mainnet` — future stable public network with stricter compatibility, signed-update and rollback requirements.

The repository uses `config/local`, `config/testnet` and `config/mainnet`. The former `development`/`production` naming is deprecated and removed from the skeleton.

Network mode affects reachability/compatibility; it never grants access to a private provider.
