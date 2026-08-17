# TRUYN Operational Security

**Status:** public generic runbook. Live topology/secrets remain private.

## Safe defaults

- provider access: `owner-only`;
- public provider execution: off unless explicitly opted in;
- owner-funded provider capacity: private;
- sponsored execution: disabled unless entitlement/store dependencies are present;
- local-development relay: loopback-only and incompatible with public/production markers;
- public diagnostics: minimal.

## Public network switches

Public-network/provider modes require explicit operator intent. Enabling network reachability does not override provider ownership/billing policy. A change that makes a relay public should be reviewed separately from a change that shares a provider.

## Origin proof lifecycle

The reference origin guard uses expiry-bound proof and supports an active + previous token window.

Operational rotation pattern:

1. issue a new token with bounded expiry through the protected deployment secret system;
2. configure it as active while retaining the previous token temporarily;
3. update the trusted edge to send the active token;
4. prove HTTP and WebSocket access through the edge;
5. prove missing/expired/wrong proof is denied at the origin guard;
6. remove the previous token after the overlap window;
7. never log token values or serialize them into public config/evidence.

If proof is suspected compromised, rotate immediately and separately verify direct-origin perimeter controls.

## Protected-provider M2M proof

M2M proof protects specifically enumerated owner-provider identities. It is an additional transport boundary, not provider authorization.

Rotation should preserve the invariant that a protected provider cannot register or use a stolen relay session without the correct current proof. Ordinary non-protected/BYOK nodes must not accidentally inherit owner-provider proof requirements.

## Secrets

Never commit/log:

- private keys or provider API keys;
- origin/M2M proof values;
- entitlement signing private keys or entitlement tokens;
- live privileged allowlists;
- private origins/backchannels;
- secret-manager paths when they expose topology;
- customer/incident-sensitive prompts or outputs.

Routine config serialization should not reveal secret token fields.

## Request abuse

Request size, replay/session expiry, concurrency/backpressure and edge rate controls are defense in depth. They must not turn authorization failure into success when unavailable.

Oversized HTTP requests are closed after 413 so leftover body bytes cannot be interpreted as another request on the same keep-alive connection.

## Billing-security incident

If entitlement/usage accounting becomes unavailable or ambiguous, disable the shared/sponsored path. Do not fall back to free owner-funded execution.

## Evidence / disclosure

Security reports should preserve methodology, tested commit/run identity, negative experiments and limitations while redacting sensitive fields. Benchmark/security evidence is never deleted solely to remove one sensitive field.

## Deployment acceptance

Before calling a deployment production-safe, verify at least:

- expected edge path works for HTTP/WebSocket;
- direct-origin bypass is denied by the intended perimeter/guard chain;
- provider-host deny path produces zero adapter/upstream execution;
- token rotation works without exposing values;
- local-development mode cannot be enabled in production configuration;
- sponsored mode cannot start without valid verifier + durable atomic store;
- operational diagnostics do not leak private topology.
