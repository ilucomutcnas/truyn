# TRUYN Architecture Contract

This document prevents architectural ideas and factual implementation status from being lost or silently diverging between the whitepaper, public README, protocol specification, governance, implementation tree, operations and benchmark evidence.

## Document authority

| Concern | Source of truth |
|---|---|
| Scientific rationale and prior art | `WHITEPAPER.md` |
| Normative protocol behavior | `spec/protocol/<generation>/` |
| Wire representation | `proto/<generation>/` |
| Project governance / roles / TSC target | `GOVERNANCE.md` and `MAINTAINERS.md` |
| Normative RFC / extension / decision process | `docs/governance/` |
| Governance as architecture / maturity boundary | `docs/architecture/GOVERNANCE_ARCHITECTURE.md` |
| Repository ownership | `STRUCTURE.md` and subsystem READMEs |
| Implementation sequence | `ROADMAP.md` |
| Factual implementation/governance maturity | `docs/architecture/IMPLEMENTATION_STATUS.md` |
| Public explanation | `README.md` |
| Network underlay | `docs/architecture/NETWORK_UNDERLAY_V01.md` |
| Provider ownership | `docs/architecture/PROVIDER_OWNERSHIP.md` |
| Provider authorization | `docs/architecture/AUTHORIZATION_MODEL.md` and `spec/protocol/v1/provider-policy.md` |
| Relay/control-plane boundary | `docs/architecture/RELAY_SECURITY.md` |
| BYOK model | `docs/architecture/BYOK_ARCHITECTURE.md` |
| Billing/quota/entitlement boundary | `docs/architecture/BILLING_BOUNDARY.md` |
| A2A/MCP interoperability boundary | `docs/architecture/A2A_MCP_INTEROPERABILITY.md` and `docs/compatibility/A2A_MCP_COMPATIBILITY.md` |
| Settlement neutrality / external payment adapters | `spec/protocol/v1/economics.md` and `docs/architecture/SETTLEMENT_ADAPTERS.md` |
| SDK / developer experience architecture | `docs/architecture/SDK_DEVELOPER_EXPERIENCE.md` and `sdk/README.md` |
| TRUYN Agent Descriptor | `spec/protocol/v1/agent-descriptor.md` |
| SDK compatibility | `docs/compatibility/SDK_COMPATIBILITY.md` |
| Provider/relay threat model | `docs/architecture/THREAT_MODEL.md` |
| Public/private information boundary | `docs/architecture/PUBLIC_PRIVATE_BOUNDARY.md` |
| Public multi-cloud provider architecture | `docs/architecture/MULTI_CLOUD_PROVIDER_ARCHITECTURE.md` |
| Semantic lifecycle / scale | `docs/architecture/SEMANTIC_INDEX_LIFECYCLE.md`, `SEMANTIC_SCALE_GATE_V3.md` |
| Distributed/decentralized semantic retrieval | `DISTRIBUTED_SEMANTIC_RETRIEVAL.md`, `DECENTRALIZED_PLACEMENT_BYZANTINE_RETRIEVAL.md` |
| Real trust-testnet slice | `KADEMLIA_QUIC_TRUST_TESTNET.md` |
| Trustability | `docs/trustability/` |
| Operations | `docs/operations/` |
| Detailed security status/runbooks | `docs/security/` plus root `SECURITY.md` |
| Compatibility | `docs/compatibility/` |
| Measured claims | `docs/benchmarks/` |
| Multimodal comparison methodology | `docs/benchmarks/MULTIMODAL_PROVIDER_PARITY.md` |

A mismatch is a defect to be reconciled. README/roadmap language MUST NOT silently create protocol semantics that do not exist in `spec/`. Architecture language MUST NOT promote a subsystem or governance state to a maturity level that factual implementation/organizational evidence does not support.

Governance defines **how normative sources may change**. It does not replace `spec/` as the source of protocol semantics.

## Architecture status discipline

TRUYN documentation distinguishes:

- **Defined** — architecture/specification exists;
- **Implemented** — executable reference behavior exists;
- **CI-proven** — bounded automated tests prove the contract;
- **Bounded real-testnet proven** — a real network/process topology proves a bounded gate;
- **Productionized** — intended deployment lifecycle/recovery/security/observability gates are satisfied;
- **Internet-scale proven** — large real-node/WAN/adversarial evidence exists;
- **Stable** — compatibility guarantees are declared.

The repository is intentionally mixed maturity. The v0.1 QUIC/Kademlia underlay is implemented and CI-proven; the trust lifecycle has bounded real four-node QUIC/Kademlia evidence; semantic retrieval and provider security have substantial implementation/evidence; MCP has bounded executable reference integration; A2A, large real-node WAN scale, rich commercial/account control planes and stable mainnet remain open.

The SDK/DX architecture and Agent Descriptor are **Defined**, but the five required first-party SDK packages and Agent Descriptor runtime serving/discovery path are not yet implementation-complete.

Governance has its own factual maturity axis. Public governance/RFC/extension/decision contracts are now **Defined (G1)**, while operational control remains bootstrap Founding Stewardship. External maintainers, a multi-organization TSC and neutral legal stewardship are not yet facts.

An approved architecture/governance document is not an implementation-complete or organization-complete claim. Conversely, once a slice is implemented/evidenced or a governance stage becomes factual, documentation must stop describing it as purely planned.

## Governance architecture

Governance is a meta-layer of the standard because it determines how normative architecture is allowed to evolve.

TRUYN separates:

```text
protocol/specification governance
repository/reference implementation maintenance
TRUYN-operated infrastructure
commercial products/services
```

Authority in one domain MUST NOT silently become permanent authority in another.

Current factual governance:

```text
Founding Steward: InnMedia
Public governance contract: defined
Independent maintainer model: not yet operating
Multi-organization TSC: not yet constituted
Neutral legal stewardship: not yet established
```

Target maturity:

```text
G0 founder governed
 ↓
G1 public governance defined
 ↓
G2 open/external maintainer model operating
 ↓
G3 multi-organization TSC, no single-vendor majority
 ↓
G4 neutral legal stewardship
 ↓
G5 stable ecosystem governance/continuity
```

Markdown can close G1 only. G2-G5 require real organizational evidence.

The core evolves extension-first where practical:

```text
Community → Experimental → Official → Core Candidate → Core
```

Official project namespace/status is governed; Community Extensions remain permissionless in third-party namespaces. Promotion to Core requires a separate normative RFC and should be rare.

A stable protocol identifier MUST NOT be silently redefined merely because one organization controls a repository. Breaking stable behavior requires a new generation/major compatibility boundary under the governance process.

Security embargoes may temporarily delay disclosure, but they do not create a hidden permanent standards channel. Material normative incident-driven changes receive a public decision record after safe disclosure.

See `GOVERNANCE.md`, `MAINTAINERS.md`, `docs/governance/`, `docs/architecture/GOVERNANCE_ARCHITECTURE.md` and the Governance & Standardization Gate in `ROADMAP.md`.

## Canonical concepts

### Identity
Cryptographic identity is independent of current IP address. Underlay addresses are reachability data, not the long-lived logical identity.

### Capability and Offer
A capability describes what can be provided or computed. `OFFER` advertises a capability with validity, location/policy conditions and optional price.

Capability does not imply authorization. A matching provider is only a candidate until provider ownership, visibility, billing and entitlement policy make it eligible for the requester.

### TRUYN Agent Descriptor

The **TRUYN Agent Descriptor** is bootstrap/self-description metadata for a TRUYN-facing participant. It is not a new top-level TRUYN envelope kind.

It describes, for the visibility scope of the requester:

- participant identity;
- supported TRUYN protocol generation(s);
- supported interfaces/bindings;
- intentionally visible capability classes;
- supported interaction/features such as streaming/artifacts/trust receipts;
- security/compatibility metadata safe to disclose;
- issue/expiry/signature information.

For intentionally public HTTP-facing participants, the target well-known path is:

```text
https://<domain>/.well-known/truyn-agent.json
```

The Descriptor is deliberately different from `OFFER`:

```text
Agent Descriptor = relatively stable bootstrap/self-description
OFFER            = dynamic capability availability/conditions
```

A descriptor never grants provider authorization and MUST NOT expose a private provider/capability that provider-policy discovery would hide from that requester. A public descriptor is a public subset, not a dump of internal topology/providers.

A valid descriptor signature proves integrity/key binding, not capability truth, current availability or requester entitlement.

The TRUYN Agent Descriptor is also distinct from an **A2A Agent Card**. The Descriptor belongs to native TRUYN onboarding; an Agent Card belongs to the external A2A compatibility edge. An adapter may derive one view from another only when identity, visibility and authorization semantics remain explicit.

See `spec/protocol/v1/agent-descriptor.md`.

### Provider ownership

Execution providers have an accountable ownership boundary conceptually equivalent to:

```text
providerId
ownerId
tenantId
visibility
billingMode
explicit access policy
```

Authorization-sensitive ownership attributes are derived from authenticated context or trusted provisioning state, not accepted as authoritative merely because a requester supplied them.

`private`/`owner-only` is the default provider posture. Cross-owner execution requires explicit policy.

The current implemented reference owner binding is node/provider identity based; rich account/organization ownership remains future control-plane work.

### BYOK

TRUYN is BYOK by default: Bring Your Own Intelligence / Bring Your Own Provider. Normal users connect provider capacity they control. Upstream credentials remain local to the provider runtime/secure secret facility and are not TRUYN routing payloads.

The reference CLI/runtime implements private BYOK profiles for supported provider types. OS-native credential-store integration and stable account tenancy remain separate maturity gates.

### Need
`NEED` describes an outcome rather than a predetermined server. It can carry hard constraints for trustability, freshness, latency, cost, deadline, privacy, domain/purpose and compute placement.

A `NEED` cannot grant itself provider authorization by declaring ownership/tenant/billing fields.

### Object
`OBJECT` is immutable, content-addressed information identified by digest. It supports deduplication, cache reuse and location-independent retrieval. Mutable knowledge is represented by `STATE`, with immutable objects/deltas referenced as needed.

Implemented semantic-index/retrieval layers already apply content-addressed root/block concepts, persistent immutable-vector reuse and minimal-context retrieval. That does not mean every generic `OBJECT` network behavior is fully productionized.

### State and Delta
`STATE` identifies current state; `DELTA` represents a change against an identified base state. A receiver MUST know/verify the base before applying a delta.

Generic network-wide `STATE`/`DELTA`/`SUBSCRIBE` maturity remains broader than the implemented semantic/trust state slices.

### Compute
`COMPUTE` requests execution of an advertised capability. Execution placement can prefer the node where data already resides, enabling compute-near-data. Sandboxing, resource limits, data-release rules and result signing belong to the compute subsystem.

Any chargeable/private compute/provider invocation is subject to the same ownership/authorization/billing boundary as AI inference. General production `COMPUTE` sandboxing remains incomplete.

### Claim, Evidence and Attestation
A `CLAIM` is a signed assertion. Evidence/provenance are references attached to claims or attestations. `ATTEST` supports, disputes or reports insufficient evidence about a claim.

Claim-centric Trustability, provenance/source-lineage logic and bounded adversarial evidence are implemented reference slices.

### Active verification
`CHALLENGE`, `VERIFY` and `DISPUTE` are behaviors composed from existing TRUYN/1 messages. They are not separate envelope kinds. A challenge can create a verification `NEED`; independent nodes return `ATTEST`; the trust engine may issue a `TRUST_RECEIPT`.

The active trust lifecycle and a bounded real QUIC/Kademlia verifier-discovery/revocation path are implemented.

### Trustability
Trustability is **claim-centric and context-dependent**:

```text
T = Trust(claim, requester, purpose, domain, time, policy)
```

It is not a universal node score. Domain history, provenance, evidence, independence, freshness, integrity, consensus, anomaly and Sybil-resistance signals can contribute to a Trust Vector. The relying party decides how to interpret it.

Trustability and authorization are separate questions. A provider can be highly trusted but unauthorized; an authorized provider may still fail a trust threshold for a particular decision.

### Trust aggregation and receipts
A consumer should not need every raw attestation. Independent evidence can be aggregated into a signed `TRUST_RECEIPT` containing policy ID, trust vector/score, raw vs independent support counts, dispute counts, evidence commitment and expiry. Raw evidence remains retrievable/auditable when policy requires it.

The implemented trust-network slice additionally commits source-owner delegation/lifecycle state and can detect stale receipts after revocation-state advancement.

### Revocation
`REVOKE` invalidates/supersedes a revocable network object. Key revocation and security-critical revocations require rapid propagation. Revocation does not erase historical provenance; it changes current validity.

The real trust-testnet slice includes durable signed transparency/revocation state and replicated lifecycle advancement in a bounded topology.

### Routing, authorization and value
Routing is constraint-first and policy-local, but provider authorization precedes ranking.

The canonical pipeline is:

```text
authenticate requester
        ↓
resolve authoritative requester identity / tenant where available
        ↓
discover capability candidates
        ↓
provider ownership / visibility authorization
        ↓
billing responsibility + entitlement/quota
        ↓
hard request constraints
        ↓
ranking
        ↓
settlement adapter when required by paid cross-owner policy
        ↓
dispatch
        ↓
provider-host authorization/billing recheck where applicable
        ↓
execution
```

A candidate that fails authorization MUST NOT be recoverable by a high trust score, low price, successful payment or excellent latency.

A useful verification rule is based on expected value of information:

```text
EVI ≈ ExpectedDecisionUtility(after verification)
      − DecisionUtility(now)
      − VerificationCost
```

When EVI is positive and policy permits, additional verification is justified.

### Billing boundary

Before a chargeable provider call, TRUYN must determine who is authorized to cause it and who is responsible for its cost. If billing responsibility is ambiguous, execution fails closed.

Logical billing modes include `byok`, `owner-funded`, `prepaid`, `subscription` and `sponsored`.

Current implementation facts:

- BYOK and owner-funded execution require private/owner-only provider access;
- prepaid/subscription fail closed without an entitlement resolver;
- sponsored access is disabled unless explicitly enabled;
- sponsored activation requires actor-bound signed entitlement verification and an atomic durable usage store;
- a process-local usage counter is not an acceptable production billing boundary.

### External interoperability: A2A and MCP

A2A and MCP are external protocol edges, not new TRUYN/1 primitives.

The compatibility pipeline is:

```text
A2A / MCP request
        ↓
adapter authentication + version validation
        ↓
normalize to TRUYN capability / NEED / RESULT semantics
        ↓
normal TRUYN authorization + billing + trust policy
        ↓
network routing / execution
        ↓
normalize result/status/artifact back to external protocol
```

External protocol metadata is not authoritative TRUYN ownership. An A2A Agent Card, task ID, MCP client metadata or tool name cannot grant provider access by itself.

The current repository contains bounded MCP reference behavior in both directions: TRUYN-as-MCP server and a configured remote MCP HTTP tool provider. General MCP discovery/import, A2A server/client bridges and the bidirectional A2A↔TRUYN↔MCP interoperability proof remain open.

The intended A2A mapping treats Agent Card skills as compatibility views over authorized TRUYN capabilities, A2A Messages as request input, task/context IDs as adapter correlation state and A2A Artifacts as `RESULT` outputs/artifact references. Private TRUYN offers MUST NOT be leaked merely because an Agent Card endpoint exists.

MCP tools can expose TRUYN operations or back a TRUYN provider. MCP Resources may map to `OBJECT`/`STATE` only when their mutability, visibility and integrity semantics are explicitly safe; the adapter must not assume equivalence.

See `docs/architecture/A2A_MCP_INTEROPERABILITY.md` and `docs/compatibility/A2A_MCP_COMPATIBILITY.md`.

### Settlement neutrality

TRUYN/1 is not a payment protocol. It does not prescribe a currency, billing provider, blockchain, smart contract or settlement rail.

The core may carry price/cost constraints for routing and non-secret billing classification for authorization/accountability. Movement of money, payment credentials, financial finality and processor/chain-specific semantics remain outside the core network.

Paid cross-owner execution is planned through optional settlement adapters. The first target integrations are:

- **x402** for machine-native payment requirement, verification and settlement flows;
- **AP2** for verifiable agent payment authorization through mandates and receipts.

AP2 and x402 may be composed: AP2 can prove the agent's authority to transact while x402 can provide the concrete payment/settlement path. Neither is mandatory and neither becomes a new TRUYN/1 wire primitive.

Trustability, provider authorization and settlement remain independent gates:

```text
trusted ≠ authorized
paid ≠ trusted
paid ≠ provider-authorized
```

See `docs/architecture/SETTLEMENT_ADAPTERS.md`.

### Capability economy
Cost-aware routing is part of the core request model; mandatory settlement is not. A future capability market can add payment/settlement adapters without making TRUYN dependent on a blockchain, currency or provider.

Provider ownership remains intact in a market: paid/shared cross-owner execution requires an explicit contract/entitlement and, when required by policy, successful external payment authorization/settlement handling.

## SDK and developer-experience contract

TRUYN requires first-party SDKs for:

```text
JavaScript / TypeScript
Python
Go
Java
C# / .NET
```

Rust may be an additional SDK, but is not a replacement for the five required first-party targets.

All SDKs MUST expose equivalent network semantics while remaining idiomatic to their host language. A minimum SDK must provide:

- node/client connection/configuration;
- identity retrieval;
- Agent Descriptor retrieval/validation;
- authorization-aware capability discovery;
- `OFFER` publish/revoke;
- `NEED` → `RESULT` correlation;
- deadline/timeout/cancellation;
- artifact/reference handling;
- normalized errors and compatibility metadata.

As protocol surfaces stabilize, typed coverage expands to generic object/state/compute/trust primitives.

SDK implementation MUST reuse canonical protocol/wire schemas or shared golden fixtures wherever practical. SDK code MUST NOT invent wire semantics absent from `spec/`.

Stable v1 requires a shared conformance suite green across all five first-party languages. The conformance suite must include security-negative cases proving private-capability non-disclosure and zero unauthorized upstream provider execution.

See `docs/architecture/SDK_DEVELOPER_EXPERIENCE.md` and `docs/compatibility/SDK_COMPATIBILITY.md`.

## Relay and control-plane contract

A relay may be public while providers remain private. Public reachability is not provider authorization.

Execution-capable HTTP, WebSocket, MCP, future A2A, SDK and legacy paths MUST preserve equivalent central authorization before provider execution.

External discovery surfaces such as an A2A Agent Card, MCP tool/resource list or Agent Descriptor MUST preserve the same privacy boundary and MUST NOT enumerate private providers to unauthorized requesters.

The reference provider security path is defense in depth: relay filtering plus provider-host access/billing checks.

Provider runtimes may use an authenticated machine-to-machine backchannel. Edge/WAF/cloud controls are additive and do not replace TRUYN authorization.

## Reference edge/origin security

The reference runtime includes an optional origin guard, Cloudflare-compatible edge proxy and protected-provider M2M guard.

Origin proof is expiry-bound, supports an active+previous rotation window and is stripped before the inner relay. Protected-provider M2M proof is also transport-only and stripped before protocol handling. Oversized HTTP bodies return 413 and close the connection to prevent keep-alive poisoning. Local-development mode hard-fails if combined with public/production markers.

Reference code does not prove that a particular production perimeter is correctly activated; deployment proof is operational work.

## Multi-cloud and multimodal provider contract

TRUYN routes stable logical capabilities. Cloud vendors, model families and concrete model versions are provider metadata and policy inputs; they are not the primary capability namespace.

Reference capabilities include:

```text
reasoning.general
media.image.generate
media.image.edit
media.video.generate
media.video.transform
```

The public reference target maintains capability parity across Google Cloud and Microsoft Azure so benchmarks can compare reasoning with reasoning, image generation with image generation, and video generation with video generation.

Reference providers funded by the project/operator are owner-private by default. Benchmark presence does not make their quota public.

### Media results

Large image/video binaries SHOULD NOT be embedded directly in signed TRUYN envelopes when an authenticated/content-addressed artifact reference can represent them.

A media `RESULT` should carry a logical artifact descriptor such as:

```text
artifact id
media type
content digest
size
provenance
retrieval reference
```

Provider-specific temporary URLs, bucket names and credentials are adapter/storage concerns, not protocol identity.

### Asynchronous providers

A provider MAY require a long-running job or polling operation. That execution detail remains behind the provider adapter; the network boundary still observes a normal TRUYN request/result lifecycle.

### Provider identity isolation

Different provider families or materially different capability runtimes SHOULD remain independently attributable so TRUYN can preserve provider-specific provenance, health, latency, cost and trust history. Reusing implementation code does not require collapsing provider identities.

## Public/private information contract

Public architecture describes invariants, schemas, threats, generic deployment patterns, governance rules and intentionally public service roles.

Private operational state includes credentials/private keys, unnecessary cloud identity details, private origins/backchannels, privileged allowlists, exact quotas/cost ceilings, billing/credit information, secret paths and sensitive incident/customer data.

Public governance does not require publication of active vulnerability details, private security-team identities where disclosure creates risk, or commercial secrets that are irrelevant to normative decisions. It does require a durable public record for normative decisions after any legitimate embargo ends.

Public Agent Descriptors, A2A Agent Cards, MCP examples and SDK examples MUST follow the same boundary. Quickstarts/examples must never normalize embedding real provider credentials or private topology into source code, descriptor/card payloads or protocol discovery surfaces.

Security MUST remain correct even if the public architecture and all SDK/adapter source code are fully known.

## Network modes

Exactly three canonical runtime profiles are reserved:

```text
local
testnet
mainnet
```

- `local`: isolated development/LAN.
- `testnet`: public/controlled experimental network.
- `mainnet`: future stable public network.

Public network mode never overrides provider visibility/authorization.

## Versioning

Software, TRUYN protocol, wire, Agent Descriptor, SDK, storage, external adapter-protocol versions and governance maturity are independently declared where needed. Current software is `0.1.0-dev`; `TRUYN/1` remains draft. A new software release does not automatically imply a new wire generation, and an A2A/MCP adapter upgrade does not automatically imply a new TRUYN generation.

SDK releases must declare the TRUYN protocol/descriptor versions they support. A2A/MCP adapters must record the external protocol version they actually implement. Neither an SDK nor adapter release itself stabilizes TRUYN/1.

Governance maturity is G0-G5 and is not inferred from a software/protocol version. Stable code can coexist with immature governance, and public governance documents can coexist with immature network code.

See `docs/compatibility/`, `GOVERNANCE.md` and `docs/architecture/GOVERNANCE_ARCHITECTURE.md`.

## Installation and upgrades

Installation, first-run bootstrap and update/rollback are infrastructure contracts, not ad-hoc shell-script semantics. Private keys should use OS secure storage where possible. Updates must eventually be authenticated, compatibility-checked and rollback-capable.

Production installer/updater/rollback maturity remains a v0.8/v1.0 gate.

SDK package publication has its own release/provenance requirements but does not replace node installer/update security.

## Interoperability

TRUYN is model/provider-neutral. Vendor and protocol adapters are replaceable edges. A2A, MCP, SDKs, HTTP/gRPC/WebSocket gateways and provider-specific adapters connect systems to TRUYN; none defines the network itself.

A2A is the target agent-task interoperability edge; MCP is the target model/tool/resource interoperability edge. They may interoperate through TRUYN, but neither is treated as a synonym for TRUYN identity, capability policy, Trustability, Agent Descriptor or settlement.

The required first-party SDK targets are JavaScript/TypeScript, Python, Go, Java and C#/.NET. Their shared job is to make the same TRUYN semantics easy to consume from the major software ecosystems without creating five subtly different protocols.

Settlement adapters follow the same extension philosophy: x402, AP2 and future payment systems are replaceable external edges and do not define the TRUYN core network.

Official interoperability/settlement bindings should use the extension/governance process rather than becoming core simply because a particular vendor implementation is popular.

See `docs/compatibility/ADAPTER_COMPATIBILITY.md`, `docs/compatibility/A2A_MCP_COMPATIBILITY.md`, `docs/compatibility/SDK_COMPATIBILITY.md`, `docs/architecture/A2A_MCP_INTEROPERABILITY.md` and `docs/governance/EXTENSIONS.md` for the factual compatibility and standardization boundaries.
