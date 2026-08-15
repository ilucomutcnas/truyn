# TRUYN Provider and Relay Threat Model

**Status:** approved target threat model; this document does not assert that every mitigation is implemented today.

## Assets to protect

The provider-security architecture protects:

- provider credentials and private keys;
- provider-owner quota and paid inference capacity;
- cloud/runtime identities;
- private provider availability;
- tenant isolation;
- signed TRUYN identity and provenance;
- billing/accounting integrity;
- internal topology and operational metadata where disclosure is unnecessary.

## Adversary model

Assume a network participant may:

- register a valid independent TRUYN identity;
- know public protocol details and source code;
- know or guess a private provider ID;
- send arbitrary signed protocol payloads;
- modify or replace the official client;
- call legacy/compatibility endpoints directly;
- replay old requests;
- enumerate discovery surfaces;
- lie about owner/tenant/billing fields;
- attempt high-rate or high-cost workloads;
- coordinate multiple identities;
- inspect public repository history and generic deployment examples.

Security MUST NOT depend on the attacker being unaware of the protocol or provider-ID format.

## Primary threats

### T1 — Foreign consumption of owner-funded AI
A foreign requester discovers or guesses an operator-owned provider and causes a paid upstream call.

**Required mitigation:** server-side provider ownership authorization before dispatch; default deny.

### T2 — Authorization attribute forgery
A requester claims `ownerId`, `tenantId`, billing mode or privileged role in its payload.

**Required mitigation:** derive authoritative authorization attributes from authenticated context/provisioning state, not requester-controlled fields.

### T3 — Legacy-route bypass
A new secure path is deployed while an older HTTP/WebSocket/MCP route can still invoke a provider without the same checks.

**Required mitigation:** all execution-capable transports converge on one authorization layer.

### T4 — Discovery leakage
A foreign requester enumerates private provider metadata, internal URLs or operational identifiers.

**Required mitigation:** authorization-aware discovery plus minimal public metadata.

### T5 — Credential exfiltration
Provider API keys or cloud credentials are placed in protocol envelopes, logs, public artifacts or relay state.

**Required mitigation:** credentials remain local/provider-runtime secrets and are never required as TRUYN routing payloads.

### T6 — Relay/origin bypass
An attacker reaches an origin or provider invocation surface directly and bypasses intended edge policy.

**Required mitigation:** authenticated provider backchannel, origin protection and server-side authorization at the execution boundary.

### T7 — Quota exhaustion / cost abuse
An authorized or partially authorized actor generates excessive valid work.

**Required mitigation:** quotas, rate/resource limits, cost attribution, concurrency limits and operational kill switches.

### T8 — Fail-open dependency behavior
Authorization, tenant resolution, billing attribution or quota service fails and the relay proceeds anyway.

**Required mitigation:** fail closed for chargeable/private execution.

### T9 — Repository disclosure
Public documentation or examples reveal unnecessary production topology, cloud identities, limits or secret paths.

**Required mitigation:** public/private documentation boundary and operational-data review.

## Security acceptance matrix

The provider-security implementation is not complete until tests demonstrate at minimum:

| Scenario | Expected result |
|---|---|
| anonymous requester → owner-private provider | denied; zero upstream calls |
| registered foreign node → owner-private provider | denied; zero upstream calls |
| foreign node supplies private provider ID directly | denied |
| foreign node forges owner/tenant fields | denied |
| legacy execution route attempts same private provider | denied by same central policy |
| user → own BYOK provider | allowed when valid |
| explicitly authorized shared provider | allowed within policy/quota |
| trusted owner workflow → owner-private provider | allowed within private policy |

## Out of scope for this document

This file does not publish real privileged identities, exact firewall/WAF rules, private origins, quotas, billing limits or incident-response credentials. Those are operational/private data.
