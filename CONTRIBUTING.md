# Contributing to TRUYN

TRUYN is an open infrastructure project. Contributions are welcome across protocol design, distributed systems, networking, cryptography, trustability, provider authorization, BYOK, A2A/MCP and other agent interoperability, SDKs, developer experience, benchmarks, documentation, and adversarial testing.

## License for contributions

TRUYN is licensed under the **Apache License 2.0**. Contributions are accepted under the Apache License 2.0 unless explicitly stated otherwise. See [`LICENSE`](LICENSE).

## Principles

- Keep the network vendor-neutral.
- Separate protocol semantics from adapters, SDK ergonomics and product-specific integrations.
- Treat A2A and MCP as independently versioned interoperability edges rather than new TRUYN/1 wire primitives.
- Preserve backward compatibility once a protocol version is declared stable.
- Prefer measurable claims over marketing claims.
- Document threat models and failure modes.
- Treat capability discovery and provider authorization as separate concerns.
- Preserve the fail-closed/private-by-default provider model.
- Do not add execution paths that bypass central provider authorization.
- Keep provider and remote A2A/MCP credentials at the user/provider runtime boundary; do not put them in protocol envelopes or Agent Descriptors.
- Do not expose private TRUYN providers through public Agent Cards, MCP tool/resource lists or compatibility metadata without authorization.
- Do not commit secrets or private keys.
- Do not publish unnecessary production topology, privileged cloud identities, private origins, allowlists, quotas/cost ceilings or billing information in examples/docs.

## SDK and developer-experience contributions

The required first-party SDK targets are:

- JavaScript / TypeScript;
- Python;
- Go;
- Java;
- C# / .NET.

Rust is an optional additional SDK track.

SDK contributions should preserve equivalent TRUYN semantics while remaining idiomatic in the host language. They must not invent protocol behavior absent from `spec/` or move authoritative provider-policy decisions into client code.

New SDK work should include or extend shared conformance coverage for:

- Agent Descriptor parsing/verification;
- protocol/descriptor version handling;
- identity retrieval;
- authorization-aware discovery and private capability non-disclosure;
- `OFFER` publish/revoke;
- `NEED` → `RESULT` correlation;
- timeout/deadline/cancellation;
- artifact/reference handling;
- normalized errors;
- negative security behavior proving unauthorized private-provider execution remains zero.

Agent Descriptor contributions must preserve the distinction:

```text
Agent Descriptor = bootstrap/self-description
OFFER            = dynamic availability/conditions
```

A public/scoped Descriptor must not reveal providers/capabilities that normal provider-policy discovery would hide from the requester.

See `docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`, `sdk/README.md`, `spec/protocol/v1/agent-descriptor.md` and `docs/compatibility/SDK_COMPATIBILITY.md`.

## Provider-security and interoperability changes

Changes affecting relay routing, discovery, Agent Descriptor views, provider registration, A2A/MCP/HTTP/WebSocket/SDK execution, billing/quotas or adapters should explain:

- requester/provider ownership impact;
- authorization boundary;
- external protocol version and fallback behavior where applicable;
- mapping between external objects and TRUYN `OFFER`/`NEED`/`RESULT`/artifact semantics;
- failure behavior when policy or external protocol state is unavailable;
- whether an unauthorized request can cause an upstream provider call;
- whether an external discovery surface can enumerate private providers;
- compatibility with BYOK and private-by-default providers;
- required negative/adversarial tests.

A successful capability match, Descriptor entry, valid A2A/MCP transport credential, SDK discovery result or external task/tool identity is never sufficient reason to bypass provider policy.

For A2A/MCP work, read:

- `docs/architecture/A2A_MCP_INTEROPERABILITY.md`;
- `docs/compatibility/A2A_MCP_COMPATIBILITY.md`;
- the v0.5 Interoperability Bridge Gate in `ROADMAP.md`.

## Before v1.0

The repository is intentionally evolving quickly. Proposed protocol, descriptor, SDK or interoperability changes should explain compatibility impact, security implications, versioning assumptions and how they can be tested.

See `ROADMAP.md`, `SECURITY.md`, `spec/`, `sdk/`, and `docs/architecture/` for the current direction.
