# Security Policy

TRUYN is security-sensitive infrastructure. Do not publish exploitable vulnerabilities, credentials, private keys, private topology, operational allowlists, incident data, or unremediated production bypasses in public issues.

## Reporting

Use GitHub private vulnerability reporting when available. Never place credentials, private keys, production secrets, customer data, or personally identifying data in a public report.

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
- HTTP/WebSocket payload sizes are bounded;
- public health responses omit operational counters/topology by default;
- provider health endpoints do not expose node IDs, relay URLs, provider names, internal errors, or transport details;
- runtime provider processes default to `owner-only`; an empty requester allowlist denies access;
- provider-host authorization is evaluated before `adapter.execute()`, and the regression suite asserts zero adapter executions for a denied requester;
- switching a runtime provider to public mode requires both `TRUYN_PROVIDER_ACCESS_MODE=public` and the separate `TRUYN_ALLOW_PUBLIC_PROVIDER=1` opt-in;
- the user-facing CLI can start only a loopback local-development relay; it cannot expose the permissive local mode on a non-loopback interface.

This implements the first provider ownership/BYOK enforcement boundary. Rich account/tenant ownership, commercial entitlements, sponsored access, durable quota accounting and billing attribution remain later layers and must preserve these fail-closed invariants.

## Core principles

### Open protocol does not mean open billing account

TRUYN source code and protocol can be public while individual AI providers remain private. Public network reachability never implies permission to spend another party's provider quota.

### BYOK by default

Normal users Bring Their Own Intelligence / Bring Their Own Provider. Raw upstream credentials stay with the user's/provider runtime and do not belong in TRUYN envelopes or relay state.

A private BYOK provider may authorize one or more requester node identities in its signed `OFFER`. The relay verifies the `OFFER` signature/session binding, derives provider ownership from the provider node identity, and applies the signed requester allowlist before discovery or dispatch.

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

The in-repository regression suite now proves at minimum:

- non-enrolled node → production-style registration: denied;
- registered external requester → private/owner-only provider: hidden from discovery and denied before dispatch;
- known/guessed capability/provider path cannot bypass provider policy;
- forged requester-controlled owner/tenant metadata does not change the server-bound provider owner;
- private BYOK provider → provider-signed authorized requester: allowed;
- same private BYOK provider → another registered requester: no match, zero provider events, zero adapter executions;
- legacy NEED, compact NEED and WebSocket chain routing use the same provider matching/authorization filter;
- replayed registration envelope: denied;
- oversized input: rejected before unbounded buffering;
- trusted owner requester → explicitly authorized owner provider: allowed;
- provider-host authorization remains a second independent check before adapter execution.

Deployment-specific cloud/IAM/origin acceptance, durable billing/quota accounting and richer account-level tenancy remain separate from these in-repository tests.

## Related architecture

- `docs/architecture/PROVIDER_OWNERSHIP.md`
- `docs/architecture/AUTHORIZATION_MODEL.md`
- `docs/architecture/RELAY_SECURITY.md`
- `docs/architecture/BILLING_BOUNDARY.md`
- `docs/architecture/BYOK_ARCHITECTURE.md`
- `docs/architecture/THREAT_MODEL.md`
- `docs/architecture/PUBLIC_PRIVATE_BOUNDARY.md`
- `spec/protocol/v1/provider-policy.md`