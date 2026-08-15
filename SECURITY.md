# Security Policy

TRUYN is security-sensitive infrastructure. Please do not publish exploitable vulnerabilities, credentials, private keys, private topology or unremediated production bypasses in public issues.

## Reporting

Until a dedicated security contact/process is published, use GitHub private vulnerability reporting when available. Do not include private keys, credentials, production secrets, customer data or personally identifying data in public reports.

## Security status

TRUYN is pre-1.0 experimental software. Security guarantees are release- and subsystem-specific.

The repository contains a working MVP and cloud PoC paths, but **the current MVP must not be treated as a production-grade public provider-authorization boundary** until the approved provider-ownership security architecture is implemented and passes its negative test matrix.

A public TRUYN relay or public source repository does **not** imply permission to use TRUYN-operated or third-party paid AI credentials/provider quota.

## Core provider-security principles

### Open protocol does not mean open billing account

TRUYN may be open-source and publicly reachable while individual providers remain private.

### BYOK by default

Normal users are expected to Bring Their Own Intelligence / Bring Their Own Provider. Raw upstream provider credentials stay with the user's/provider runtime and do not belong in TRUYN protocol envelopes or relay state.

### Server-side authorization

Provider authorization must be enforced at the execution boundary. UI/CLI restrictions are helpful but are not sufficient because a network participant can modify or replace the official client.

### Provider ownership

A provider has an accountable owner/tenant boundary, visibility policy and billing mode. Requester-supplied ownership fields are not authoritative. Private is the default visibility.

### Fail closed

If provider ownership, requester tenant, authorization, billing responsibility or mandatory quota/entitlement cannot be resolved, private/chargeable execution must not occur.

### One authorization layer for every execution path

HTTP, WebSocket, MCP, SDK, relay fast paths and legacy compatibility routes must converge on the same provider-authorization decision before execution.

## Security scope

Security work includes:

- protocol integrity and canonical signatures;
- node identity and key handling;
- provider ownership and tenant isolation;
- BYOK credential locality;
- relay/provider authorization;
- billing/quota attribution and cost-abuse prevention;
- authorization-aware discovery;
- replay/expiry protection;
- private provider backchannels and origin protection;
- Trustability manipulation;
- Sybil/collusion resistance;
- transport security;
- storage protection;
- adapter isolation;
- compute sandboxing;
- supply-chain security;
- signed updates, migration and rollback;
- public/private operational-information boundaries.

## Reference threat model

The architecture assumes an attacker may possess a valid independent TRUYN identity, know the source code, know or guess a provider ID, forge requester-controlled policy fields, use a custom client, call legacy routes directly and attempt high-cost workloads.

The security design must still guarantee that an unauthorized foreign requester cannot cause an owner-private provider invocation.

See `docs/architecture/THREAT_MODEL.md`.

## Provider security acceptance gate

Before TRUYN can claim safe coexistence of public users and owner-funded providers, automated/adversarial tests must prove at minimum:

- anonymous requester → owner-private provider: denied, zero upstream calls;
- registered foreign node → owner-private provider: denied, zero upstream calls;
- known/guessed private provider ID: denied;
- forged owner/tenant fields: denied;
- legacy execution route: same denial policy;
- user → own BYOK provider: allowed when valid;
- explicit shared entitlement: allowed only within its policy/quota;
- trusted owner request → owner-private provider: allowed within owner policy.

## Operational data

Public architecture should explain security invariants without publishing unnecessary live operational data. Credentials, private identities, private origins, privileged allowlists, exact quotas/cost ceilings, cloud identity topology and incident-sensitive details belong in private operational systems.

Removing a value from the current branch does not erase Git history or Actions logs. Secret material that was ever exposed must be treated according to normal secret-rotation procedures.

See `docs/architecture/PUBLIC_PRIVATE_BOUNDARY.md`.

## Related architecture

- `docs/architecture/PROVIDER_OWNERSHIP.md`
- `docs/architecture/AUTHORIZATION_MODEL.md`
- `docs/architecture/RELAY_SECURITY.md`
- `docs/architecture/BILLING_BOUNDARY.md`
- `docs/architecture/BYOK_ARCHITECTURE.md`
- `docs/architecture/THREAT_MODEL.md`
- `spec/protocol/v1/provider-policy.md`
