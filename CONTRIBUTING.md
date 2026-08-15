# Contributing to TRUYN

TRUYN is an open infrastructure project. Contributions are welcome across protocol design, distributed systems, networking, cryptography, trustability, provider authorization, BYOK, agent interoperability, SDKs, benchmarks, documentation, and adversarial testing.

## Principles

- Keep the network vendor-neutral.
- Separate protocol semantics from adapters and product-specific integrations.
- Preserve backward compatibility once a protocol version is declared stable.
- Prefer measurable claims over marketing claims.
- Document threat models and failure modes.
- Treat capability discovery and provider authorization as separate concerns.
- Preserve the fail-closed/private-by-default provider model.
- Do not add execution paths that bypass central provider authorization.
- Keep provider credentials at the user/provider runtime boundary; do not put them in protocol envelopes.
- Do not commit secrets or private keys.
- Do not publish unnecessary production topology, privileged cloud identities, private origins, allowlists, quotas/cost ceilings or billing information in examples/docs.

## Provider-security changes

Changes affecting relay routing, discovery, provider registration, MCP/HTTP/WebSocket execution, billing/quotas or adapters should explain:

- requester/provider ownership impact;
- authorization boundary;
- failure behavior when policy state is unavailable;
- whether an unauthorized request can cause an upstream provider call;
- compatibility with BYOK and private-by-default providers;
- required negative/adversarial tests.

A successful capability match is never sufficient reason to bypass provider policy.

## Before v1.0

The repository is intentionally evolving quickly. Proposed protocol changes should explain compatibility impact, security implications, and how they can be tested.

See `ROADMAP.md`, `SECURITY.md`, `spec/`, and `docs/architecture/` for the current direction.
