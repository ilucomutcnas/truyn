# TRUYN Roadmap

This roadmap describes intended engineering milestones, not guaranteed release dates.

## v0.1 — Connect
- Cryptographic node identity
- Peer discovery
- Direct node communication
- `OFFER`, `NEED`, `RESULT`

## v0.2 — Verify
- `CLAIM`, `ATTEST`
- Basic claim-centric Trustability
- Signed provenance

## v0.3 — Synchronize
- `STATE`, `DELTA`, `SUBSCRIBE`
- Cache and freshness semantics

## v0.4 — Route
- Capability routing
- Multiple-provider selection
- Trust/latency/cost policy inputs

## v0.5 — Interoperate
- MCP adapter
- Initial OpenAI/Codex, Claude, Gemini, and local-model adapters
- Public SDK surface

## v0.6 — Resist
- Provenance graph
- Independence estimation
- Sybil/collusion defenses

## v0.7 — Measure
- Token, latency, bandwidth, inference-cost, trust, and scale benchmarks
- 100/1,000-node simulations and testnet exercises

## v1.0 — Stabilize
- Stable `TRUYN/1`
- Stable node identity and Trustability contracts
- Installers and automatic upgrade path
- Public network bootstrap
- Documented SDKs and compatibility policy

## Versioning rule

Software releases (`v0.1.0`, `v1.0.0`) and network protocol versions (`TRUYN/1`, `TRUYN/2`) are deliberately separate. A newer node may support multiple protocol versions simultaneously.
