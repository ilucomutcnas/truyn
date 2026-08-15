# Security Policy

TRUYN is security-sensitive infrastructure. Do not publish exploitable vulnerabilities, credentials, private keys, private topology, operational allowlists, incident data, or unremediated production bypasses in public issues.

## Reporting

Use GitHub private vulnerability reporting when available. Never place credentials, private keys, production secrets, customer data, or personally identifying data in a public report.

## Current security baseline

TRUYN is pre-1.0 experimental software. The public reference runtime is intentionally conservative:

- production-style relay registration is denied unless a node is explicitly enrolled;
- provider execution is denied unless the requester is explicitly trusted;
- untrusted requesters do not receive foreign provider offers from discovery;
- legacy mutation/execution routes require an active bearer session bound to the signed node identity;
- registration envelopes are freshness-checked and replay IDs are rejected;
- sessions expire;
- HTTP/WebSocket payload sizes are bounded;
- public health responses omit operational counters/topology by default;
- provider health endpoints do not expose node IDs, relay URLs, provider names, internal errors, or transport details;
- runtime provider processes default to `owner-only`; an empty requester allowlist denies access;
- provider-host authorization is evaluated before `adapter.execute()`, and the regression suite asserts zero adapter executions for a denied requester;
- the user-facing CLI can start only a loopback local-development relay; it cannot expose the permissive local mode on a non-loopback interface.

This immediate fail-closed baseline is not the final multi-tenant provider marketplace. Full provider owner/tenant/visibility/billing semantics still require the complete authorization and negative-test contracts in `docs/architecture/`.

## Core principles

### Open protocol does not mean open billing account

TRUYN source code and protocol can be public while individual AI providers remain private. Public network reachability never implies permission to spend another party's provider quota.

### BYOK by default

Normal users Bring Their Own Intelligence / Bring Their Own Provider. Raw upstream credentials stay with the user's/provider runtime and do not belong in TRUYN envelopes or relay state.

### Server-side authorization

Provider authorization is enforced before provider selection/dispatch and again at the provider-host execution boundary. UI, CLI, obscurity, hidden provider IDs, DNS controls, or Cloudflare rules are not sufficient authorization boundaries.

### Fail closed

If identity, ownership, tenant, authorization, billing responsibility, or required entitlement cannot be resolved, chargeable/private execution must not occur.

### One execution boundary

HTTP, WebSocket, MCP, SDK, fast paths, and legacy compatibility paths must converge on the same authorization decision before any upstream provider invocation.

## Public/private repository boundary

The public repository may contain protocol semantics, generic implementation code, security invariants, local examples, generic adapters, and reviewed benchmark methodology.

It must not contain unnecessary live operational data such as:

- credentials, private keys, access tokens, service-account keys, or credential-bearing URLs;
- private cloud resource/deployment names or internal origins;
- cloud account/subscription/project/tenant identifiers when not required by the public protocol;
- privileged workflow/bootstrap/provisioning automation for owner infrastructure;
- WIF/service-account/managed-identity topology;
- private bucket/container names;
- live quota, cost ceilings, emergency controls, allowlists, or secret-manager paths;
- raw production benchmark artifacts/run IDs that expose execution topology;
- incident-sensitive logs, prompts, outputs, or customer data.

Privileged deployment/operations material belongs in access-controlled operational systems, not in this public repository. Encrypting a file inside a public repository is not treated as making the file private.

The public tree is guarded by automated tests that allowlist the safe public workflow set and reject known operational paths/markers, credential/private-key patterns, and live cloud-topology patterns. The public CI workflow has read-only repository contents permission and does not receive provider/cloud credentials from its workflow definition.

## History and secret response

The normal public Git refs were rewritten onto a sanitized root after validated cleanup. Contributors with clones created before that rewrite should discard the old clone/history and re-clone before contributing so the removed ancestry is not accidentally reintroduced.

Removing content from the current tree is not enough when sensitive data existed historically. Any credential that may have been exposed must still be revoked/rotated; history rewriting is not a substitute for credential rotation.

Git hosting providers may retain unreachable objects, pull-request refs, caches, forks, clones, Actions logs, or artifacts after a force rewrite. Those copies must be purged through the hosting provider and affected fork/clone owners as applicable. Historical Actions artifacts/logs and immutable hosting-side refs are therefore treated as a separate cleanup surface from the sanitized Git tree.

## Security acceptance gate

Before public users can coexist with owner-funded providers, automated/adversarial tests must prove at minimum:

- anonymous or non-enrolled node → registration/provider access: denied;
- enrolled but untrusted requester → owner provider: denied, zero provider events/calls;
- known/guessed provider ID: denied;
- forged requester-controlled owner/tenant fields: denied;
- legacy execution route: same denial policy and active-session binding;
- replayed registration envelope: denied;
- oversized input: rejected before unbounded buffering;
- trusted owner requester → explicitly enrolled provider: allowed;
- future user → own BYOK provider: allowed only after authoritative tenant/ownership binding exists.

The current regression suite covers the relay/provider-host deny boundary, legacy bearer/session enforcement, registration freshness/replay protection, payload bounds, and zero adapter execution on denied owner-only provider requests. Deployment-specific cloud/IAM/origin acceptance remains separate from these in-repository tests.

## Related architecture

- `docs/architecture/PROVIDER_OWNERSHIP.md`
- `docs/architecture/AUTHORIZATION_MODEL.md`
- `docs/architecture/RELAY_SECURITY.md`
- `docs/architecture/BILLING_BOUNDARY.md`
- `docs/architecture/BYOK_ARCHITECTURE.md`
- `docs/architecture/THREAT_MODEL.md`
- `docs/architecture/PUBLIC_PRIVATE_BOUNDARY.md`
- `spec/protocol/v1/provider-policy.md`
