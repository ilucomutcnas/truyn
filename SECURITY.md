# Security Policy

TRUYN is security-sensitive infrastructure. Do not publish exploitable vulnerabilities, credentials, private keys, private topology, operational allowlists, incident data, or unremediated production bypasses in public issues.

## Reporting

Use GitHub private vulnerability reporting when available. Never place credentials, private keys, production secrets, customer data, or personally identifying data in a public report.

## Security and governance

Normal normative changes are public under `GOVERNANCE.md` and `docs/governance/`. Security incidents are the deliberate exception to **disclosure timing**, not an exception that grants permanent hidden authority to change the standard.

A trusted Security Response Team may privately coordinate an embargoed fix, delay public details and temporarily disable vulnerable functionality. After safe disclosure, any material permanent change to stable protocol/security semantics MUST receive the appropriate public RFC/decision record.

Security response therefore follows:

```text
private report / embargo
        ↓
bounded remediation
        ↓
safe disclosure
        ↓
public durable record for material normative change
```

Governance does not require exposing secrets, responder identities when disclosure creates risk, or active exploit details. Conversely, a security label must not be used to create a permanent private standards channel.

## Current security baseline

TRUYN is pre-1.0 experimental software. The public reference runtime is intentionally conservative:

- production-style relay registration is denied unless a node is explicitly enrolled;
- provider dispatch is closed by default; wider authenticated-network dispatch requires explicit relay configuration;
- provider discovery and matching apply provider authorization before returning or dispatching a foreign offer;
- provider ownership is bound by the relay to the cryptographic sender of the signed `OFFER`; requester-controlled `ownerId` / `tenantId` metadata cannot grant ownership;
- provider offers without an explicit recognized public mode fail closed to `owner-only`;
- private/owner-only providers can publish a provider-signed requester allowlist, enabling a BYOK/private provider to authorize its own requester without globally trusting that requester at the relay;
- unauthorized private providers are hidden from discovery and are filtered as `no_matching_provider` before legacy, compact or WebSocket-chain dispatch, so no provider event is queued;
- legacy mutation/execution routes require an active bearer session bound to the signed node identity;
- registration envelopes are freshness-checked and replay IDs are rejected;
- sessions expire;
- HTTP/WebSocket payload sizes are bounded; an oversized HTTP body returns 413 with Connection: close so unread bytes cannot poison a reusable keep-alive socket;
- public health responses omit operational counters/topology by default;
- provider health endpoints do not expose node IDs, relay URLs, provider names, internal errors, or transport details;
- both the low-level provider policy and runtime provider processes default to `owner-only`; an empty requester allowlist denies access, while `public` is always an explicit opt-in;
- provider-host authorization is evaluated before `adapter.execute()`, and the regression suite asserts zero adapter executions for a denied requester;
- switching a runtime provider to public mode requires both `TRUYN_PROVIDER_ACCESS_MODE=public` and the separate `TRUYN_ALLOW_PUBLIC_PROVIDER=1` opt-in;
- the user-facing CLI can start only a loopback local-development relay; it cannot expose the permissive local mode on a non-loopback interface, and the low-level/runtime relay hard-fail if local development mode coexists with public or production markers;
- the reference relay runtime includes an optional fail-closed origin guard: when enabled, the actual relay binds only to loopback while an outer proxy gates HTTP data-plane requests and WebSocket upgrades using deployment-supplied edge proof;
- unauthorized origin-guard health checks receive only a minimal protocol-health response, and the edge proof is stripped before forwarding to the inner relay;
- incomplete origin-guard configuration fails startup rather than silently exposing the inner relay; the default `x-truyn-origin-token` must be expiry-bound, supports an active+previous rotation window, and secret values are deliberately non-enumerable in runtime config so routine object logging/JSON serialization cannot print them;
- the reference code also includes a generic Cloudflare Worker-compatible edge proxy that requires an HTTPS origin plus Worker secret binding, overwrites any client-supplied origin proof, preserves normal requester/session and WebSocket headers, and uses manual redirect handling;
- the edge proxy refuses same-host origin configuration, including alternate ports, so a public Worker route cannot be accidentally configured to recursively fetch itself;
- edge-proxy failures are sanitized and do not return Worker secret bindings or upstream exception details;
- the relay runtime also supports an optional protected-provider M2M guard for explicitly enumerated provider node identities;
- protected provider identities must present the exact M2M proof before registration can produce a relay session, and protected HTTP/WebSocket traffic continues to require that proof;
- possession of a protected relay session without the M2M proof is insufficient, while ordinary non-protected nodes preserve normal transport behavior;
- the provider M2M proof is a transport header only and is stripped before the inner relay; it is never serialized into TRUYN protocol envelopes;
- incomplete protected-node/M2M-token configuration fails closed.

This implements the first provider ownership/BYOK enforcement boundary plus reference edge-to-origin and protected-provider backchannel defense-in-depth components. Sponsored mode is deliberately non-activatable unless an actor-bound signed entitlement verifier and an atomic durable usage store are supplied; the old process-local quota counter is not accepted as a billing boundary. Rich account/tenant ownership, commercial entitlement issuance, durable store deployment and billing attribution remain later operational layers and must preserve these fail-closed invariants. Deployment-specific edge token issuance/rotation, firewall/tunnel policy and direct-origin denial still require separate operational verification.

The TRUYN Agent Descriptor and first-party SDK program are currently **defined architecture/scaffolding**, not implemented runtime security claims. When implemented, they must preserve the existing provider-security invariants in this document.

## Core principles

### Open protocol does not mean open billing account

TRUYN source code and protocol can be public while individual AI providers remain private. Public network reachability never implies permission to spend another party's provider quota.

### BYOK by default

Normal users Bring Their Own Intelligence / Bring Their Own Provider. Raw upstream credentials stay with the user's/provider runtime and do not belong in TRUYN envelopes, relay state or Agent Descriptors.

A private BYOK provider may authorize one or more requester node identities in its signed `OFFER`. The relay verifies the `OFFER` signature/session binding, derives provider ownership from the provider node identity, and applies the signed requester allowlist before discovery or dispatch.

### Server-side authorization

Provider authorization is enforced before provider selection/dispatch and again at the provider-host execution boundary. UI, CLI, SDK, Agent Descriptor content, obscurity, hidden provider IDs, DNS controls, or Cloudflare rules are not sufficient authorization boundaries.

### Agent Descriptor is not authorization

The draft TRUYN Agent Descriptor is discovery/bootstrap metadata. A signed Descriptor can establish integrity/key binding for the metadata, but it does not grant access to a provider and does not prove capability truth/current availability.

Public/scoped Descriptor generation must apply a visibility boundary equivalent to normal authorization-aware discovery:

```text
public descriptor view
    → public/intentionally visible capability subset only

authenticated scoped descriptor view
    → no more than this requester is authorized to discover
```

A Descriptor must not contain upstream provider credentials, private keys, private origins/backchannels, privileged allowlists, hidden private provider IDs/capabilities, long-lived secret-bearing URLs or other private operational state.

### SDKs are not a policy boundary

First-party SDKs for JavaScript/TypeScript, Python, Go, Java and C#/.NET are developer convenience surfaces. They must converge on the same server/node authorization and billing decisions as CLI, MCP, HTTP, WebSocket and native paths.

A modified SDK must not gain any capability that the same requester could not obtain by speaking the public protocol directly.

### Governance is not an authorization boundary

A Maintainer, TSC member, Founding Steward or official-extension author does not gain provider access by virtue of governance role. Protocol governance authority and provider/resource authorization are separate domains.

Likewise, a governance vote cannot make a private provider public without the provider's own authoritative access policy.

### Fail closed

If identity, ownership, tenant, authorization, billing responsibility, or required entitlement cannot be resolved, chargeable/private execution must not occur.

### One execution boundary

HTTP, WebSocket, MCP, SDK, fast paths, and legacy compatibility paths must converge on the same authorization decision before any upstream provider invocation.

## Public/private repository boundary

The public repository may contain protocol semantics, governance contracts/decision records, generic implementation code, security invariants, local examples, generic adapters, first-party SDK source/scaffolding, Agent Descriptor schemas, conformance fixtures, reviewed benchmark methodology, and sanitized benchmark evidence.

It must not contain unnecessary live operational data such as:

- credentials, private keys, access tokens, service-account keys, or credential-bearing URLs;
- private cloud resource/deployment names or internal origins;
- cloud account/subscription/project/tenant identifiers when not required by the public protocol;
- privileged workflow/bootstrap/provisioning automation for owner infrastructure;
- WIF/service-account/managed-identity topology;
- private bucket/container names;
- live quota, cost ceilings, emergency controls, allowlists, protected provider node IDs, or secret-manager paths;
- hidden/private provider IDs or capability inventories that provider policy is intended to conceal;
- raw benchmark logs/artifacts when they expose private execution topology, credentials, prompts/customer data, or privileged operational state;
- incident-sensitive logs, prompts, outputs, or customer data.

Sanitized benchmark reports may retain reproducibility evidence such as public model versions, tested commit SHAs, workflow/run identifiers, artifact identifiers and cryptographic digests when those identifiers do not disclose a private execution boundary. Public relay hostnames and public Agent Descriptor endpoints intentionally exposed as part of the protocol may also remain.

Privileged deployment/operations material belongs in access-controlled operational systems, not in this public repository. Encrypting a file inside a public repository is not treated as making the file private.

The public tree is guarded by automated tests that allowlist the safe public workflow set and reject known operational paths/markers, credential/private-key patterns, and live cloud-topology patterns. The public CI workflow has read-only repository contents permission and does not receive provider/cloud credentials from its workflow definition.

Future SDK/Descriptor release tests should extend that leakage boundary to generated packages, example applications and descriptor fixtures so a safe source tree cannot produce an unsafe package or public descriptor.

## Benchmark evidence preservation

`docs/benchmarks/` is a protected public evidence ledger. Once a measured benchmark report has been published, security cleanup must use **redact-not-delete** handling.

If sensitive information is discovered in a benchmark report:

- redact only the sensitive value/field or generalize the minimum necessary operational detail;
- preserve the report filename, benchmark date, methodology, measured results, fixed gates, limitations and corrections;
- preserve tested commit SHA, run/workflow identity, artifact identity and artifact digest whenever those identifiers are safe to publish;
- record a clear redaction/correction note when a material evidence field changes;
- keep the redaction/correction in Git history.

Deleting a benchmark report, replacing it with a summary/stub, or globally forbidding benchmark evidence paths is not an acceptable secret-response mechanism. If a report is later proven invalid or duplicated, preserve an explicit tombstone/correction pointing to the superseding evidence rather than silently erasing the record.

The repository regression suite protects the established benchmark evidence files from accidental deletion/truncation while continuing to scan their contents for credentials, private keys and live private topology.

## History and secret response

The normal public Git refs were rewritten onto a sanitized root after validated cleanup. Contributors with clones created before that rewrite should discard the old clone/history and re-clone before contributing so the removed ancestry is not accidentally reintroduced.

Removing content from the current tree is not enough when sensitive data existed historically. Any credential that may have been exposed must still be revoked/rotated; history rewriting is not a substitute for credential rotation.

Git hosting providers may retain unreachable objects, pull-request refs, caches, forks, clones, Actions logs, artifacts or published package versions after a force rewrite. Those copies must be purged through the hosting/package provider and affected fork/clone owners as applicable. Historical Actions artifacts/logs and immutable hosting-side refs are therefore treated as a separate cleanup surface from the sanitized Git tree.

History cleanup must not be used as a blanket mechanism to erase sanitized benchmark evidence or public governance history. If a history rewrite is required for secret removal, sanitized benchmark reports and material governance/RFC decision records must be restored into the new root/history immediately, with safe evidence fields preserved to the maximum extent.

## Security acceptance gate

The in-repository regression suite now proves at minimum:

- non-enrolled node → production-style registration: denied;
- registered external requester → private/owner-only provider: hidden from discovery and denied before dispatch;
- known/guessed capability/provider path cannot bypass provider policy;
- forged requester-controlled owner/tenant metadata does not change the server-bound provider owner;
- private BYOK provider → provider-signed authorized requester: allowed;
- same private BYOK provider → another registered requester: no match, zero provider events, zero adapter executions;
- legacy NEED, compact NEED and WebSocket chain routing use the same provider matching/authorization filter;
- replayed registration envelope: denied;
- oversized input: rejected before unbounded buffering, the 413 response explicitly closes that connection, and the next request through the same keep-alive agent succeeds on a fresh socket;
- trusted owner requester → explicitly authorized owner provider: allowed;
- provider-host authorization remains a second independent check before adapter execution;
- optional origin guard → unauthorized HTTP data-plane request: denied before inner relay;
- optional origin guard → unauthorized WebSocket upgrade: denied before inner relay;
- optional origin guard → authorized proxying strips the edge proof before the inner relay;
- Cloudflare edge proxy → missing/invalid/expired origin-token binding: denied before upstream fetch;
- Cloudflare edge proxy → spoofed client proof: overwritten with the Worker binding;
- Cloudflare edge proxy → same public/origin hostname, including alternate ports: denied before upstream fetch;
- Cloudflare edge proxy → upstream exception: sanitized failure without secret or exception leakage;
- protected provider → registration without/wrong M2M proof: denied before a relay session is issued;
- protected provider → stolen protected session without M2M proof: HTTP and WebSocket access denied;
- protected provider → exact M2M proof: registration and protected WebSocket path allowed;
- ordinary non-protected node → no M2M proof required;
- provider M2M proof → transport-only and stripped before the inner relay;
- actual runtime relay entrypoint → protected provider proof enforced before session issuance;
- protected benchmark evidence files remain present/substantial and are scanned for public-repository leakage rather than banned by path.

Deployment-specific cloud/IAM/edge activation, direct-origin production proof, issuance/rotation of live edge and protected-provider tokens, deployment of the durable sponsored-usage store, and richer account-level tenancy remain separate from these in-repository tests.

The future SDK/DX conformance gate must add, before SDK parity/stability is claimed:

- public Agent Descriptor → no private capability/provider disclosure;
- scoped Agent Descriptor → no more visibility than normal authorized discovery;
- expired/invalidly signed Descriptor → explicit rejection;
- every supported SDK language → unauthorized private-provider request causes zero upstream execution;
- generated SDK packages/examples/descriptor fixtures → public-repository leakage scan.

These are future SDK/Descriptor acceptance requirements, not claims about tests that already exist today.

## Related architecture and governance

- `GOVERNANCE.md`
- `MAINTAINERS.md`
- `docs/governance/RFC_PROCESS.md`
- `docs/governance/DECISION_PROCESS.md`
- `docs/architecture/GOVERNANCE_ARCHITECTURE.md`
- `docs/architecture/PROVIDER_OWNERSHIP.md`
- `docs/architecture/AUTHORIZATION_MODEL.md`
- `docs/architecture/RELAY_SECURITY.md`
- `docs/architecture/BILLING_BOUNDARY.md`
- `docs/architecture/BYOK_ARCHITECTURE.md`
- `docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`
- `docs/architecture/THREAT_MODEL.md`
- `docs/architecture/PUBLIC_PRIVATE_BOUNDARY.md`
- `docs/compatibility/SDK_COMPATIBILITY.md`
- `docs/benchmarks/README.md`
- `spec/protocol/v1/provider-policy.md`
- `spec/protocol/v1/agent-descriptor.md`