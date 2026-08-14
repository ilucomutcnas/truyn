# ADR-0002 — Canonical Network Modes

**Status:** Accepted.

TRUYN uses exactly these canonical profile names:

- `local`
- `testnet`
- `mainnet`

The older repository skeleton names `development` and `production` are removed. Environment-specific deployment details can exist under each mode, but must not introduce competing public vocabulary.
