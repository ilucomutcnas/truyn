# TRUYN Compatibility

**Current software:** `0.1.0-dev`  
**Current protocol generation:** `TRUYN/1` draft

TRUYN separates compatibility dimensions instead of pretending that one version number governs the whole system:

1. software release;
2. network protocol generation;
3. wire schema generation;
4. Agent Descriptor schema/version;
5. first-party SDK semantic/API version;
6. local storage/config format;
7. external interoperability protocol versions such as A2A and MCP;
8. provider/model API versions behind adapters.

A newer software or SDK build does not automatically imply a new protocol generation, and a draft `TRUYN/1` implementation does not yet carry a stable v1 compatibility guarantee. Likewise, an A2A or MCP adapter update should not force a new TRUYN generation unless TRUYN network semantics themselves change.

## Documents

- [Protocol and Node Compatibility](PROTOCOL_AND_NODE_COMPATIBILITY.md)
- [Adapter Compatibility](ADAPTER_COMPATIBILITY.md)
- [A2A / MCP Compatibility Matrix](A2A_MCP_COMPATIBILITY.md)
- [SDK Compatibility](SDK_COMPATIBILITY.md)
- [A2A / MCP Interoperability Architecture](../architecture/A2A_MCP_INTEROPERABILITY.md)

## Current A2A / MCP boundary

The MCP edge has bounded executable reference code today: TRUYN-as-MCP server and a configured remote MCP HTTP tool provider path. This does not imply complete current MCP feature coverage or external certification.

A2A is currently architecture-only: the Agent Card/server task facade, client/provider adapter and bidirectional A2A↔TRUYN↔MCP proof have not been implemented.

Compatibility claims MUST distinguish:

```text
Defined
Implemented
CI-proven
Externally interoperable / evidenced
Stable
```

## SDK language policy

The required first-party SDK targets before stable v1 are:

- JavaScript / TypeScript;
- Python;
- Go;
- Java;
- C# / .NET.

Rust is an optional additional track and does not replace any of those required targets.

Every SDK release must declare the protocol and Agent Descriptor versions it understands, its tested node/server version range and its own SDK semantic version.

## Current policy

Before v1.0/stable TRUYN/1:

- compatibility is best-effort and explicitly versioned;
- testnet may introduce breaking changes;
- mainnet compatibility is not yet promised;
- nodes/adapters/SDKs should validate the protocol/wire/descriptor/external-protocol versions they actually understand;
- SDKs must fail explicitly on unknown required semantics rather than guessing;
- unsupported A2A/MCP versions should fail explicitly rather than silently changing semantics;
- external protocol authentication never replaces TRUYN provider authorization;
- migrations should be explicit when persisted state/config formats change;
- architecture/evidence should name the tested software commit/version when behavior is compatibility-sensitive;
- A2A/MCP evidence should name the exact external protocol versions exercised;
- cross-language SDK parity is not claimed until the shared conformance suite exists and is green.

Stable protocol, Agent Descriptor, SDK and external-adapter compatibility are v1.0 gates, not present claims.
