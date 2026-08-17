# TRUYN Security Documentation

This directory is the detailed security documentation layer. Root [`SECURITY.md`](../../SECURITY.md) remains the public security policy/reporting entry point.

## Documents

- [Security Architecture Status](SECURITY_ARCHITECTURE_STATUS.md) — what is implemented, proven and still deployment-specific.
- [Operational Security](OPERATIONAL_SECURITY.md) — safe runtime/edge/provider proof handling and incident rules.

Related architecture:

- `../architecture/PROVIDER_OWNERSHIP.md`
- `../architecture/AUTHORIZATION_MODEL.md`
- `../architecture/BILLING_BOUNDARY.md`
- `../architecture/RELAY_SECURITY.md`
- `../architecture/THREAT_MODEL.md`
- `../architecture/PUBLIC_PRIVATE_BOUNDARY.md`

## Security maturity rule

A security control can be:

- defined;
- implemented;
- regression/CI proven;
- deployment-proven;
- productionized.

Reference code for an origin guard does not prove that a real deployment denies direct-origin bypass. A signed entitlement verifier does not prove that a production issuer/store exists. Security documentation must preserve these distinctions.

## Core invariant

```text
open protocol / public reachability
!=
permission to consume another party's paid intelligence capacity
```

Security is fail-closed at both routing and provider-host execution boundaries.
