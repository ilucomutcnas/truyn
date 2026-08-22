# Contributing to TRUYN

TRUYN is an open infrastructure project. Contributions are welcome across protocol design, distributed systems, networking, cryptography, trustability, provider authorization, BYOK, agent interoperability, SDKs, developer experience, benchmarks, documentation, and adversarial testing.

## License for contributions

TRUYN is licensed under the **Apache License 2.0**. Contributions are accepted under the Apache License 2.0 unless explicitly stated otherwise. See [`LICENSE`](LICENSE).

## Principles

- Keep the network vendor-neutral.
- Separate protocol semantics from adapters, SDK ergonomics and product-specific integrations.
- Preserve backward compatibility once a protocol version is declared stable.
- Prefer measurable claims over marketing claims.
- Document threat models and failure modes.
- Treat capability discovery and provider authorization as separate concerns.
- Preserve the fail-closed/private-by-default provider model.
- Do not add execution paths that bypass central provider authorization.
- Keep provider credentials at the user/provider runtime boundary; do not put them in protocol envelopes or Agent Descriptors.
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

## Provider-security changes

Changes affecting relay routing, discovery, Agent Descriptor views, provider registration, MCP/HTTP/WebSocket/SDK execution, billing/quotas or adapters should explain:

- requester/provider ownership impact;
- authorization boundary;
- failure behavior when policy state is unavailable;
- whether an unauthorized request can cause an upstream provider call;
- compatibility with BYOK and private-by-default providers;
- required negative/adversarial tests.

A successful capability match, Descriptor entry or SDK discovery result is never sufficient reason to bypass provider policy.

## Before v1.0

The repository is intentionally evolving quickly. Proposed protocol, descriptor or SDK compatibility changes should explain compatibility impact, security implications, and how they can be tested.

See `ROADMAP.md`, `SECURITY.md`, `spec/`, `sdk/`, and `docs/architecture/` for the current direction.
