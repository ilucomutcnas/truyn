# TRUYN/1 Provider Policy

**Status:** draft normative target; the current MVP relay does not yet implement all requirements in this file.

This specification defines authorization semantics for capability providers. It does not require one account system, database schema or wire representation.

## Provider policy

A provider has policy attributes equivalent to:

```text
provider identity
owner identity / owner domain
tenant boundary
visibility
billing mode
explicit grants / policy reference
quota or entitlement policy reference
```

The exact representation MAY be local relay state, signed provider metadata, account policy or another implementation mechanism, provided the authorization invariants below are preserved.

## Authoritative binding

Authorization-sensitive ownership and tenant attributes MUST be derived from authenticated context or trusted provisioning state. A requester MUST NOT gain access by supplying a desired `ownerId`, `tenantId`, billing mode or privileged role inside a request payload.

## Default visibility

A newly registered execution provider MUST be treated as private unless its owner explicitly publishes a broader visibility policy.

## Eligibility

A provider is eligible for routing only if all of the following are true:

1. capability/request constraints match;
2. requester identity/tenant is resolved;
3. provider policy is resolved;
4. requester is authorized by provider visibility/ownership/grants;
5. billing responsibility is resolved for chargeable execution;
6. required entitlement/quota checks pass.

Failure to resolve a mandatory authorization attribute MUST make the provider ineligible.

## Discovery

Discovery MUST NOT imply execution authorization. Implementations SHOULD filter private providers from unauthorized discovery results. Knowledge of a provider ID MUST NOT bypass the execution authorization decision.

## BYOK

A requester-owned provider may use `byok` billing semantics. Raw upstream credentials are outside the TRUYN wire contract and SHOULD remain local to the provider runtime/secure secret facility.

## Shared/network providers

Cross-owner execution requires an explicit grant or intentionally public/network provider policy. The policy may include cost, quota, purpose, capability, time or other restrictions.

## Owner-funded execution

An owner-funded provider MUST NOT be treated as a public resource solely because it is reachable through a public relay or advertises a capability.

## Fail closed

If authorization, billing responsibility or mandatory entitlement cannot be determined, a chargeable/private provider MUST NOT be invoked.

## Transport independence

HTTP, WebSocket, MCP, SDK, relay fast paths and future native transports MUST converge on equivalent provider-policy enforcement before execution.
