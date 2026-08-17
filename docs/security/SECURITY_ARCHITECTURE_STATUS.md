# TRUYN Security Architecture Status

**Snapshot:** 2026-08-17.

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
| benchmark redact-not-delete guard | implemented repository policy/tests |

## Deployment-specific / not globally proven

The repository does **not** by itself prove:

- every production origin is unreachable except through the trusted edge;
- live edge/M2M token issuance and rotation are correctly operated;
- cloud IAM/firewall/tunnel policy is correct in every environment;
- a production durable sponsored usage store is deployed;
- a production entitlement issuer/revocation control plane exists;
- rich account/org tenant identity is enforced everywhere;
- large open-network Sybil/eclipse/collusion resistance;
- stable mainnet incident/SLO operations.

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

For deployment controls, also prove that bypass traffic cannot reach the protected inner surface.
