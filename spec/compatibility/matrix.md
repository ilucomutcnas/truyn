# Compatibility Matrix

This file records compatibility expectations as implementations appear.

| Software | TRUYN/1 | TRUYN/2 | Storage schema | Notes |
|---|---:|---:|---|---|
| `0.1.0-dev` | draft | no | draft | Architecture/protocol skeleton; not production interoperable |

## Rules

- Software version and protocol generation are independent.
- A node MUST negotiate/recognize supported protocol generation before exchanging semantic payloads.
- Backward-compatible optional fields may be added inside a generation when semantics remain stable.
- Breaking semantic changes require a new protocol generation or explicit extension negotiation.
- Storage/config migrations are local implementation concerns and MUST NOT silently change network identity.
