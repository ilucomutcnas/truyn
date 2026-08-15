# TRUYN/1 Security

**Status:** draft normative security target. The current MVP does not yet implement every requirement in this file.

TRUYN assumes hostile or faulty peers can exist and that a participant may use a custom client, know the public source code, know or guess provider identifiers, replay requests, forge requester-controlled policy fields and directly call compatibility routes.

## Core requirements

TRUYN/1 security includes:

- authenticated encrypted transport where available;
- canonical signed messages;
- replay/expiry checks;
- explicit key/credential revocation;
- provenance preservation;
- Sybil/collusion-aware trust policy;
- rate/resource limits;
- sandboxing for compute execution;
- privacy/egress controls;
- signed software updates and rollback-capable migrations;
- provider ownership and tenant isolation;
- authorization-aware discovery;
- billing/entitlement resolution before chargeable execution;
- fail-closed provider dispatch;
- credential locality for BYOK providers;
- convergence of every execution-capable transport on equivalent provider-policy enforcement.

## Identity is not authorization

A valid signature proves control of a TRUYN identity. It does not grant that identity permission to use every provider visible on the network.

Cryptographic identity, provider authorization and claim truth are separate concerns.

## Provider execution boundary

Before a private or chargeable provider is invoked, an implementation MUST resolve an authoritative requester identity/tenant, provider policy and billing/entitlement decision.

Requester-supplied owner/tenant/billing claims MUST NOT become authoritative solely because they are signed by the requester.

A missing or ambiguous mandatory policy decision MUST fail closed.

See `provider-policy.md`.

## Public relay boundary

Public relay reachability permits protocol participation only. It MUST NOT be interpreted as entitlement to owner-private AI/provider capacity.

A relay SHOULD avoid disclosing private provider metadata to unauthorized requesters. Execution authorization remains required even if a provider ID is known through logs, history or another channel.

## Credentials

Raw upstream provider credentials, cloud client secrets, service-account private material and private TRUYN keys MUST NOT be required inside normal `OFFER`, `NEED`, `RESULT` or discovery payloads.

BYOK/provider credentials SHOULD remain in the local/provider runtime secret boundary.

## Legacy/alternate transports

HTTP, WebSocket, MCP, SDK, relay fast paths and future native transports MUST NOT define independent execution shortcuts that bypass provider authorization.

## Resource and cost abuse

Authorization is necessary but not sufficient for abuse resistance. Implementations SHOULD additionally enforce replay protection, request-size limits, concurrency/rate limits and explicit quotas/entitlements for chargeable/shared providers.

Operational limits are policy data and need not be published in the public protocol specification.

## Trustability distinction

Cryptographic identity proves control/attribution, not truth. Remote attestation can strengthen integrity evidence but also does not prove factual correctness. Trustability is a claim/decision property and does not override provider authorization.

## Revocation priority

Security-critical revocations and compromised-key information should receive high propagation priority.

## Acceptance condition

A provider-security implementation is incomplete until negative tests prove that anonymous/foreign requesters, known private provider IDs, forged owner/tenant fields and legacy routes cannot cause unauthorized upstream provider calls.
