# TRUYN Roadmap

This roadmap describes intended engineering milestones, not guaranteed release dates. Protocol semantics live in `spec/`; the roadmap only describes sequencing.

## Immediate security gate — before public paid-provider coexistence

The repository already contains an executable MVP and cloud PoC work. Before a public TRUYN relay can safely coexist with operator/owner-funded AI providers, the following security architecture must be implemented and proved:

1. provider owner/tenant/visibility/billing policy;
2. central server-side authorization before every execution dispatch;
3. default-deny/fail-closed behavior;
4. authorization-aware discovery that hides owner-private providers from foreign requesters;
5. BYOK-by-default onboarding and credential locality;
6. billing responsibility and quota/entitlement checks before chargeable calls;
7. authenticated private provider backchannel/control-plane separation;
8. removal or convergence of legacy execution paths that bypass central authorization;
9. emergency owner-paid/provider-visibility kill-switch semantics;
10. negative/adversarial tests proving foreign users cause zero owner-funded upstream calls.

This gate is a **security prerequisite**, not a claim of current implementation. Documentation approval does not satisfy the gate; executable tests must.

See:

- `docs/architecture/PROVIDER_OWNERSHIP.md`
- `docs/architecture/AUTHORIZATION_MODEL.md`
- `docs/architecture/RELAY_SECURITY.md`
- `docs/architecture/BILLING_BOUNDARY.md`
- `docs/architecture/BYOK_ARCHITECTURE.md`
- `docs/architecture/THREAT_MODEL.md`

## v0.1 — Connect
- Cryptographic node identity independent of IP address
- QUIC/UDP underlay session
- Peer/bootstrap discovery and direct node communication
- `OFFER`, `NEED`, `RESULT`
- Minimal `REVOKE` path for offers/keys/results
- `local` and initial `testnet` profiles
- Provider-policy semantics compatible with owner/tenant/default-private authorization

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
- Authorization-before-ranking for private/shared/network providers
- Trust/latency/freshness/cost/privacy selection within the authorized provider set
- Explicit deadline, urgency, priority and decision-value inputs
- Verification effort proportional to decision risk/value
- Billing/usage attribution for chargeable capability execution

## v0.5 — Interoperate
- MCP adapter
- Initial OpenAI/Codex, Claude, Gemini, Grok, Perplexity and local-model adapters
- Provider adapter contract for Copilot, Amazon Q, Cursor, Windsurf, Mistral, DeepSeek, Qwen, Cohere, NVIDIA and future systems
- Public SDK surface
- User-facing BYOK setup for common providers
- Secure local/provider-runtime credential storage contract

## v0.6 — Resist & Scale Trust
- Provenance graph
- Independence/lineage estimation
- Sybil/collusion defenses
- Domain history
- Scalable attestation aggregation, receipts, pruning and revocation propagation
- Provider/resource abuse and anomaly controls

## v0.7 — Measure
- Token, latency, bandwidth, inference-cost, trust and scale benchmarks
- Compare text-heavy agent handoffs with structured state/delta/result exchange
- 100/1,000-node simulations and testnet exercises
- Publish reproducible financial/inference-cost measurements; no invented production claims
- Publish provider-security negative-test results without exposing private topology or operational thresholds

## v0.8 — Operate
- Verified installers for Windows/macOS/Linux
- Service registration for `truynd`
- First-run identity/config/bootstrap lifecycle
- Signed updater channels
- Compatibility preflight, migrations and rollback
- Recovery and uninstall paths
- Operational separation of public data plane, owner control plane and provider backchannels

## v1.0 — Stabilize
- Stable `TRUYN/1`
- Stable node identity, provider policy, object/state, execution and Trustability contracts
- Stable `local` / `testnet` / `mainnet` semantics
- Production-grade authorization/tenant/BYOK boundary
- Production-grade upgrade/rollback contract
- Public mainnet bootstrap
- Documented SDKs and compatibility policy

## Post-v1 research track — Capability Economy
- Capability price discovery
- Provider quality/price/trust competition
- Optional settlement adapters
- Resource accounting and receipts
- Explicit provider-owner entitlements for cross-owner execution
- No mandatory blockchain or single payment rail

## Versioning rule

Software releases (`v0.1.0`, `v1.0.0`) and network protocol generations (`TRUYN/1`, `TRUYN/2`) are deliberately separate. A newer node may support multiple protocol generations simultaneously.
