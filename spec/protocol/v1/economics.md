# TRUYN/1 Cost-Aware Capability Routing

**Status:** optional protocol metadata; settlement is out of scope for core TRUYN/1. Full billing/quota enforcement is not yet an implementation claim.

`OFFER` may advertise price/usage terms and `NEED` may declare maximum cost. Routing can use price as one policy input together with trust, latency, freshness, availability, locality, privacy and quality.

## Cost does not imply authorization

Price metadata never grants provider access. Provider ownership/visibility authorization is evaluated before cost-based ranking.

## Billing responsibility

Before a chargeable provider invocation, the implementation must be able to resolve who is authorized to cause the call and who is responsible for its cost.

Logical billing modes may include:

```text
byok
owner-funded
prepaid
subscription
sponsored
```

The precise billing backend is outside the protocol.

If a chargeable provider requires entitlement/quota and that decision cannot be resolved, execution fails closed.

## BYOK

In BYOK mode, upstream provider credentials and billing belong to the requester/provider owner. Raw credentials do not become settlement metadata and are not sent through TRUYN envelopes.

## Sponsored access

Sponsored or free owner-funded access, if offered, is an explicit provider-owner entitlement with explicit limits. It is not implied by public relay access or by the presence of an `OFFER`.

The reference architecture defaults sponsored/free owner-funded allowance to disabled/zero until deliberately enabled.

## Settlement neutrality

TRUYN/1 does not prescribe currency, billing provider, blockchain, smart contract or settlement rail. Settlement adapters can evolve independently while preserving provider ownership and authorization invariants.
