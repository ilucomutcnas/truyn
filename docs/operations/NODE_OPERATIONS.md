# TRUYN Node Operations

**Status:** reference node/runtime operations for `0.1.0-dev`.

## Runtime profiles

TRUYN reserves exactly three network profiles:

- `local` — isolated development/LAN;
- `testnet` — experimental network with compatibility/adversarial changes expected;
- `mainnet` — future stable public network; not productionized today.

Network profile never grants provider entitlement.

## Safe startup invariants

Before a node/runtime is considered healthy:

1. load/generate cryptographic node identity;
2. load the selected network profile;
3. validate that local-development mode is not combined with public/production markers;
4. validate provider access/billing configuration before adapter initialization;
5. bind network/control listeners according to the profile/deployment boundary;
6. load durable local state required by that subsystem;
7. connect to one or more trusted bootstrap peer records where testnet discovery is required;
8. expose only the minimum health/diagnostic surface allowed by the deployment.

A configuration error that weakens provider or relay security should fail startup rather than degrade silently.

## Identity and local state

Cryptographic identity is the logical node identity; IP/QUIC endpoints are reachability metadata and may change.

Logical local data may include configuration, identity, objects/state, trust data, peer/routing state, semantic indexes/caches and logs. Private keys and provider credentials should use an OS/cloud secret facility where available rather than plaintext project files.

## Provider runtime defaults

Provider runtime safety defaults are:

```text
provider access = owner-only
billing mode = owner-funded (unless explicitly BYOK/etc.)
public provider execution = disabled unless explicitly opted in
sponsored access = disabled unless full entitlement/store dependencies exist
```

For BYOK, the provider remains private for the configured requester and upstream credentials stay at the provider runtime/secret boundary.

## Restart behavior

Restart acceptance depends on subsystem:

- identity should remain the same when the same durable identity is intended;
- durable trust/transparency state must reload and validate before serving;
- semantic index lifecycle should reuse persisted immutable vectors rather than re-embed unchanged documents;
- transient routing/connection state may rebuild through signed bootstrap/Kademlia discovery;
- billing/entitlement state that must survive restart cannot use a process-local counter.

## Health and diagnostics

Public health output must remain minimal and must not expose node IDs, private provider names, relay URLs, topology, secret paths or internal error details. Rich diagnostics belong behind an authenticated operational boundary.

## Shutdown / recovery

Graceful shutdown should stop accepting new work, drain/close transports where supported and flush durable state that requires explicit persistence. Recovery procedures must distinguish corrupt local state from expected peer churn; signed/digested data must be revalidated rather than trusted because it came from disk.

## Current non-claims

There is no current promise of stable mainnet service management, cross-version rolling upgrade compatibility, universal OS service packaging or production SLOs. Those remain v0.8/v1.0 gates.
