# TRUYN Security Architecture Status

**Snapshot:** 2026-08-20.  
**Software:** `0.1.0-dev`  
**Protocol:** `TRUYN/1` draft

This document records the implemented reference security boundary. Network scale/WAN benchmark progress does not weaken or bypass provider authorization, billing or edge/origin controls.

## Implemented and regression-proven reference controls

| Control | Status |
|---|---|
| signed provider ownership binding | implemented |
| private/owner-only default provider policy | implemented at relay and low-level provider/runtime |
| authorization-aware discovery/dispatch | implemented |
| provider-signed requester allowlists | implemented |
| provider-host second authorization check | implemented |
| owner-funded public-execution denial | implemented |
| BYOK private provider boundary | implemented |
| public-provider explicit opt-in | implemented |
| public-network registration/dispatch explicit opt-in | implemented |
| local-development vs public/production hard conflict | implemented |
| bounded HTTP/WebSocket input | implemented |
| oversized HTTP 413 + connection close | implemented |
| minimal public health disclosure | implemented |
| origin guard | implemented reference control |
| expiry-bound origin proof + active/previous rotation window | implemented reference control |
| Cloudflare-compatible proof-injecting edge proxy | implemented reference control |
| protected-provider M2M guard | implemented reference control |
| transport proof stripping before inner relay | implemented |
| sponsored signed entitlement verification boundary | implemented interface/policy |
| durable atomic sponsored usage-store requirement | enforced as activation prerequisite |
| prepaid/subscription execution without resolver | fail-closed |
| benchmark redact-not-delete guard | implemented repository policy/tests |
| temporary privileged acceptance workflows removed from permanent main after pinned start | enforced operational pattern |

## Network-productionization security boundary

Accepted Class B/Class C evidence and the active Class D scale gate exercise networking, failure and recovery behavior. They do **not** create a new provider entitlement model.

The invariant remains:

```text
network/session authenticity
        ↓
provider ownership / visibility authorization
        ↓
billing responsibility / entitlement
        ↓
request constraints / routing
        ↓
provider-host authorization + billing
        ↓
execution
```

A public/reachable peer, DHT record, QUIC endpoint, relay route or successful NAT traversal does not authorize use of a private provider.

The active Class D-100 acceptance campaign must remain security-green on its immutable tested commit. Scale acceptance cannot be obtained by disabling provider/default-deny, identity, signature or evidence-integrity checks.

## Current network evidence and security interpretation

- **Class B accepted:** proves bounded real multi-host network behavior, not open provider access.
- **Class C accepted:** proves bounded heterogeneous Azure/GCP WAN/NAT/relay behavior, not provider/account authorization.
- **Class D-100 active:** no accepted PASS claim exists at this snapshot; the terminal evaluator and cleanup evidence remain authoritative.

Temporary cloud acceptance workflows are mechanisms. Permanent public `main` returns to the normal allowlisted workflow surface after a pinned run is started. Durable sanitized benchmark reports, rather than privileged workflow source, are the public evidence record.

## Deployment-specific / not globally proven

The repository does **not** by itself prove:

- every production origin is unreachable except through a trusted edge;
- live edge/M2M token issuance and rotation are correctly operated in every deployment;
- cloud IAM/firewall/tunnel policy is correct in every environment;
- a production durable sponsored usage store is deployed;
- a production entitlement issuer/revocation control plane exists;
- rich account/org tenant identity is enforced everywhere;
- large open-network Sybil/eclipse/collusion resistance;
- carrier-field CGNAT behavior;
- stable mainnet incident/SLO operations;
- installer/update supply-chain closure for a stable release.

## Security decision order

```text
transport/session authenticity
        ↓
provider ownership / visibility authorization
        ↓
billing responsibility / entitlement
        ↓
request constraints / routing
        ↓
provider-host authorization + billing
        ↓
execution
```

Failure at a mandatory security/billing stage means no chargeable/private execution.

## Evidence rule

Security acceptance should prefer executable negative tests:

```text
unauthorized actor
        ↓
request rejected
        ↓
provider event count = 0
        ↓
adapter execution count = 0
        ↓
upstream chargeable call = 0
```

For deployment controls, also prove bypass traffic cannot reach the protected inner surface.

Published benchmark/security evidence follows **redact-not-delete**: remove sensitive values, not the measured report.