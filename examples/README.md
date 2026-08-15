# Examples

Public examples are deliberately limited to **loopback local development** or **credentials supplied by the person running the example**.

## Included demo boundary

- `mvp-demo.js` — local loopback relay, deterministic nodes, no paid AI.
- `ai-mvp-demo.js` — local loopback relay with deterministic function adapters, no paid AI.
- `live-ai-demo.js` — local loopback relay plus the local user's own OpenAI/Anthropic credentials (BYOK). It does not use or expose TRUYN-operated provider credentials.

Operational cross-cloud proofs, owner-cloud deployment workflows, private provider bootstraps, and raw production benchmark execution tooling do not belong in this public examples directory.

## Security rules

Examples MUST NOT contain:

- real API keys, private keys or client secrets;
- live private origins/backchannels;
- owner cloud/service-account/managed-identity topology;
- private provider node IDs or allowlists;
- live quota/cost ceilings or billing identifiers;
- credential-bearing URLs;
- sensitive prompts, outputs or customer data.

A live-provider example is BYOK only. Publishing adapter code never makes any provider account a public TRUYN resource.

See `../docs/getting-started/BYOK.md`, `../SECURITY.md`, and `../docs/architecture/THREAT_MODEL.md`.
