# TRUYN SDKs

Native first-party client libraries for applications that integrate directly with TRUYN without depending on an agent-specific provider adapter.

**Current maturity:** architecture/scaffolding only. These directories do not yet represent published production-ready SDK packages.

## Required first-party SDKs

| Language | Directory | Distribution target | Current status |
|---|---|---|---|
| JavaScript / TypeScript | `typescript/` | npm | planned / scaffold |
| Python | `python/` | PyPI | planned / scaffold |
| Go | `go/` | Go module | planned / scaffold |
| Java | `java/` | Maven-compatible publication | planned / scaffold |
| C# / .NET | `dotnet/` | NuGet | planned / scaffold |
| Rust | `rust/` | crates.io-compatible if maintained | optional secondary track / scaffold |

The five required first-party targets before stable v1 are **JavaScript/TypeScript, Python, Go, Java and C#/.NET**.

Rust may be maintained as an additional SDK but does not replace any required first-party language.

## Common contract

All first-party SDKs must provide equivalent TRUYN semantics while remaining idiomatic to their language:

- connect/configure a TRUYN node/client;
- retrieve requester identity;
- fetch and verify a TRUYN Agent Descriptor;
- discover authorized capabilities/providers;
- publish/revoke `OFFER`;
- submit `NEED` and correlate/stream/poll `RESULT`;
- carry deadlines/cancellation/timeouts;
- expose signed identity/provenance/trust metadata available from the node;
- handle content/artifact references;
- expose normalized error/compatibility status;
- preserve the same authorization/billing boundary as CLI/MCP/HTTP/WebSocket/native paths.

The SDK is a client convenience layer. It is never an authorization bypass and must not contain upstream provider credentials in network metadata.

## Agent Descriptor

The onboarding/discovery metadata contract is the **TRUYN Agent Descriptor**.

For intentionally public HTTP-facing participants, the target well-known path is:

```text
https://<domain>/.well-known/truyn-agent.json
```

The Descriptor provides identity, supported TRUYN versions/interfaces, public capability classes and interaction features. It does **not** replace dynamic `OFFER` state and never grants requester authorization.

See:

- `../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`
- `../spec/protocol/v1/agent-descriptor.md`
- `../docs/compatibility/SDK_COMPATIBILITY.md`
- `../docs/getting-started/SDK_QUICKSTART.md`

## Implementation sequence

1. **DX-0:** architecture, Agent Descriptor, SDK contract, language scaffolds.
2. **DX-1:** TypeScript/JavaScript + Python reference SDKs and shared conformance fixtures.
3. **DX-2:** Go + Java + C#/.NET parity.
4. **DX-3:** package publication, examples, CI matrix, version/compatibility documentation.
5. **DX-4:** stable v1 conformance gate across all five required SDKs.

See `../ROADMAP.md` for sequencing relative to the broader network productionization program.

## License

All TRUYN SDKs in this directory are licensed under the **Apache License 2.0 (`Apache-2.0`)**. SDK distributions must include [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
