# TRUYN Compatibility

**Current software:** `0.1.0-dev`  
**Current protocol generation:** `TRUYN/1` draft

TRUYN separates compatibility dimensions that evolve at different rates:

1. software release;
2. network protocol generation;
3. wire schema generation;
4. Agent Descriptor schema/version;
5. first-party SDK semantic/API version;
6. local storage/config format.

A newer software or SDK build does not automatically imply a new protocol generation, and a draft `TRUYN/1` implementation does not yet carry a stable v1 compatibility guarantee.

## Documents

- [Protocol and Node Compatibility](PROTOCOL_AND_NODE_COMPATIBILITY.md)
- [Adapter Compatibility](ADAPTER_COMPATIBILITY.md)
- [SDK Compatibility](SDK_COMPATIBILITY.md)

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
- nodes/adapters/SDKs should validate the protocol/wire/descriptor versions they actually understand;
- SDKs must fail explicitly on unknown required semantics rather than guessing;
- migrations should be explicit when persisted state/config formats change;
- architecture/evidence should name the tested software commit/version when behavior is compatibility-sensitive;
- cross-language SDK parity is not claimed until the shared conformance suite exists and is green.

Stable protocol, Agent Descriptor and SDK compatibility are v1.0 gates, not present claims.
