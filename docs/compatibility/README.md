# TRUYN Compatibility

**Current software:** `0.1.0-dev`  
**Current protocol generation:** `TRUYN/1` draft

TRUYN separates four compatibility dimensions:

1. software release;
2. network protocol generation;
3. wire schema generation;
4. local storage/config format.

A newer software build does not automatically imply a new protocol generation, and a draft `TRUYN/1` implementation does not yet carry a stable v1 compatibility guarantee.

## Documents

- [Protocol and Node Compatibility](PROTOCOL_AND_NODE_COMPATIBILITY.md)
- [Adapter Compatibility](ADAPTER_COMPATIBILITY.md)

## Current policy

Before v1.0/stable TRUYN/1:

- compatibility is best-effort and explicitly versioned;
- testnet may introduce breaking changes;
- mainnet compatibility is not yet promised;
- nodes/adapters should validate the protocol/wire version they actually understand;
- migrations should be explicit when persisted state/config formats change;
- architecture/evidence should name the tested software commit/version when behavior is compatibility-sensitive.

Stable compatibility policy is a v1.0 gate, not a present claim.
