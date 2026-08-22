# Contributing to TRUYN

TRUYN is an open infrastructure project. Contributions are welcome across protocol design, distributed systems, networking, cryptography, trustability, provider authorization, BYOK, A2A/MCP and other agent interoperability, SDKs, benchmarks, documentation, and adversarial testing.

## License for contributions

TRUYN is licensed under the **Apache License 2.0**. Contributions are accepted under the Apache License 2.0 unless explicitly stated otherwise. See [`LICENSE`](LICENSE).

## Principles

- Keep the network vendor-neutral.
- Separate protocol semantics from adapters and product-specific integrations.
- Treat A2A and MCP as independently versioned interoperability edges rather than new TRUYN/1 wire primitives.
- Preserve backward compatibility once a protocol version is declared stable.
- Prefer measurable claims over marketing claims.
- Document threat models and failure modes.
- Treat capability discovery and provider authorization as separate concerns.
- Preserve the fail-closed/private-by-default provider model.
- Do not add execution paths that bypass central provider authorization.
- Keep provider and remote A2A/MCP credentials at the user/provider runtime boundary; do not put them in protocol envelopes.
- Do not expose private TRUYN providers through public Agent Cards, MCP tool/resource lists or compatibility metadata without authorization.
- Do not commit secrets or private keys.
- Do not publish unnecessary production topology, privileged cloud identities, private origins, allowlists, quotas/cost ceilings or billing information in examples/docs.

## Provider-security and interoperability changes

Changes affecting relay routing, discovery, provider registration, A2A/MCP/HTTP/WebSocket execution, billing/quotas or adapters should explain:

- requester/provider ownership impact;
- authorization boundary;
- external protocol version and fallback behavior where applicable;
- mapping between external objects and TRUYN `OFFER`/`NEED`/`RESULT`/artifact semantics;
- failure behavior when policy or external protocol state is unavailable;
- whether an unauthorized request can cause an upstream provider call;
- whether an external discovery surface can enumerate private providers;
- compatibility with BYOK and private-by-default providers;
- required negative/adversarial tests.

A successful capability match, valid A2A/MCP transport credential or external task/tool identity is never sufficient reason to bypass provider policy.

For A2A/MCP work, read:

- `docs/architecture/A2A_MCP_INTEROPERABILITY.md`;
- `docs/compatibility/A2A_MCP_COMPATIBILITY.md`;
- the v0.5 Interoperability Bridge Gate in `ROADMAP.md`.

## Before v1.0

The repository is intentionally evolving quickly. Proposed protocol or interoperability changes should explain compatibility impact, security implications, versioning assumptions and how they can be tested.

See `ROADMAP.md`, `SECURITY.md`, `spec/`, and `docs/architecture/` for the current direction.
