# TRUYN MVP Quickstart

This quickstart is deliberately **local-development only**. It proves signed identity, capability discovery, request/result routing and Trustability Lite without exposing a permissive relay to a LAN or the public Internet.

## Requirements

- Node.js 20 or newer
- `npm ci`

## Fastest proof

```bash
npm ci
npm test
npm run demo
```

The demo starts an ephemeral **loopback-only** relay, creates independent Ed25519 node identities, publishes a capability, routes a signed `NEED`, returns a signed `RESULT`, verifies the signature, and reports the local Trustability Lite signal.

## Run the local relay

```bash
node cli/index.js relay --host 127.0.0.1 --port 8787
```

The permissive development relay is intentionally restricted to loopback. `localDevelopmentMode` refuses a non-loopback bind.

Health endpoint:

```text
GET http://127.0.0.1:8787/health
```

## Two local identities

Use separate `TRUYN_HOME` directories.

Provider:

```bash
TRUYN_HOME=.truyn-provider node cli/index.js init
TRUYN_HOME=.truyn-provider node cli/index.js offer research --relay http://127.0.0.1:8787
TRUYN_HOME=.truyn-provider node cli/index.js poll --relay http://127.0.0.1:8787
```

Requester:

```bash
TRUYN_HOME=.truyn-requester node cli/index.js init
TRUYN_HOME=.truyn-requester node cli/index.js find research --relay http://127.0.0.1:8787
TRUYN_HOME=.truyn-requester node cli/index.js need research "Analyze TRUYN" --relay http://127.0.0.1:8787
```

Return the result with the request ID received by the provider:

```bash
TRUYN_HOME=.truyn-provider node cli/index.js result <request-id> "Structured answer" --relay http://127.0.0.1:8787
```

Then poll from the requester:

```bash
TRUYN_HOME=.truyn-requester node cli/index.js poll --relay http://127.0.0.1:8787
```

## Security boundary

Do **not** use this quickstart to expose a relay on `0.0.0.0`, a LAN, a tunnel, or the public Internet.

The production-style reference relay is fail closed by default:

- arbitrary node registration is denied unless the node is explicitly enrolled;
- provider dispatch is denied unless the requester is explicitly trusted;
- untrusted requesters cannot enumerate foreign provider offers;
- legacy execution/mutation routes require an active bearer session bound to the signed identity;
- registration replays and stale registration envelopes are rejected;
- sessions and request sizes are bounded.

These controls prevent the old MVP fail-open behavior while the full multi-tenant BYOK owner/tenant/billing authorization layer is completed.

## Public runtime rule

A public TRUYN endpoint never means “use the operator's AI account.” Normal users are BYOK. Owner-funded providers remain private unless an explicit, server-authoritative entitlement says otherwise.

For remote/multi-machine development, deploy a properly authenticated and explicitly enrolled environment; do not bypass the reference relay's fail-closed defaults just to reproduce the local demo.

See:

- `../../SECURITY.md`
- `../architecture/PROVIDER_OWNERSHIP.md`
- `../architecture/AUTHORIZATION_MODEL.md`
- `../architecture/THREAT_MODEL.md`
- `BYOK.md`
