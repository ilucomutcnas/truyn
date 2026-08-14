# TRUYN Roadmap

This roadmap describes intended engineering milestones, not guaranteed release dates. Protocol semantics live in `spec/`; the roadmap only describes sequencing.

## v0.1 — Connect
- Cryptographic node identity independent of IP address
- QUIC/UDP underlay session
- Peer/bootstrap discovery and direct node communication
- `OFFER`, `NEED`, `RESULT`
- Minimal `REVOKE` path for offers/keys/results
- `local` and initial `testnet` profiles

## v0.2 — Verify
- `CLAIM`, `ATTEST`
- Active verification behaviors: `CHALLENGE`, `VERIFY`, `DISPUTE`
- Domain-scoped claim-centric Trustability
- Signed provenance
- Trust evidence aggregation and `TRUST_RECEIPT`

## v0.3 — Synchronize
- Content-addressed `OBJECT`
- `STATE`, `DELTA`, `SUBSCRIBE`
- Cache, freshness, object reuse and invalidation semantics

## v0.4 — Execute & Route
- `COMPUTE` and compute-near-data execution
- Execution policy and sandbox boundary
- Multiple-provider capability routing
- Trust/latency/freshness/cost/privacy selection
- Explicit deadline, urgency, priority and decision-value inputs
- Verification effort proportional to decision risk/value

## v0.5 — Interoperate
- MCP adapter
- Initial OpenAI/Codex, Claude, Gemini, Grok, Perplexity and local-model adapters
- Provider adapter contract for Copilot, Amazon Q, Cursor, Windsurf, Mistral, DeepSeek, Qwen, Cohere, NVIDIA and future systems
- Public SDK surface

## v0.6 — Resist & Scale Trust
- Provenance graph
- Independence/lineage estimation
- Sybil/collusion defenses
- Domain history
- Scalable attestation aggregation, receipts, pruning and revocation propagation

## v0.7 — Measure
- Token, latency, bandwidth, inference-cost, trust and scale benchmarks
- Compare text-heavy agent handoffs with structured state/delta/result exchange
- 100/1,000-node simulations and testnet exercises
- Publish reproducible financial/inference-cost measurements; no invented production claims

## v0.8 — Operate
- Verified installers for Windows/macOS/Linux
- Service registration for `truynd`
- First-run identity/config/bootstrap lifecycle
- Signed updater channels
- Compatibility preflight, migrations and rollback
- Recovery and uninstall paths

## v1.0 — Stabilize
- Stable `TRUYN/1`
- Stable node identity, object/state, execution and Trustability contracts
- Stable `local` / `testnet` / `mainnet` semantics
- Production-grade upgrade/rollback contract
- Public mainnet bootstrap
- Documented SDKs and compatibility policy

## Post-v1 research track — Capability Economy
- Capability price discovery
- Provider quality/price/trust competition
- Optional settlement adapters
- Resource accounting and receipts
- No mandatory blockchain or single payment rail

## Versioning rule

Software releases (`v0.1.0`, `v1.0.0`) and network protocol generations (`TRUYN/1`, `TRUYN/2`) are deliberately separate. A newer node may support multiple protocol generations simultaneously.
