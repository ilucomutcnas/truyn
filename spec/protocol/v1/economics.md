# TRUYN/1 Cost-Aware Capability Routing

**Status:** optional protocol metadata; settlement is out of scope for core TRUYN/1. Full billing/quota enforcement and settlement adapters are not yet implementation claims.

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

TRUYN/1 does not prescribe a currency, billing provider, blockchain, smart contract or settlement rail.

Settlement is deliberately external to the core protocol. A deployment may use invoices, enterprise contracts, prepaid balances, subscriptions, fiat processors, cryptographic payments, free exchange or no payment at all without changing TRUYN/1 identity, routing, trust or execution semantics.

Optional settlement adapters can evolve independently while preserving provider ownership and authorization invariants.

### Extension boundary

A settlement adapter MAY associate a TRUYN transaction with external payment requirements, authorization artifacts, verification results, settlement results or receipts. Those external objects are not new TRUYN/1 wire primitives.

TRUYN MAY retain an opaque external reference, digest or receipt commitment for attribution/audit. The external protocol remains authoritative for the meaning and finality of that settlement object.

Raw payment credentials, wallet/private keys, processor secrets and provider API credentials MUST NOT become core TRUYN routing data merely because a settlement adapter is used.

### Initial adapter targets

The first planned adapter targets are:

- **x402** for machine-native payment requirement, verification and settlement flows;
- **AP2** for verifiable agent payment authorization through mandates/receipts.

They are composable rather than exclusive. For example, policy may use AP2 to prove that an agent is authorized to transact and x402 to satisfy/settle the resulting payment requirement.

Neither adapter is required by TRUYN/1, and neither makes TRUYN dependent on one currency, network, payment instrument or blockchain.

### Security invariants

Settlement integration MUST NOT weaken the provider security model:

- payment capability or payment proof does not grant provider authorization;
- high Trustability does not imply payment authorization;
- successful payment does not imply result truth/quality;
- required settlement/authorization failure must fail closed for the chargeable cross-owner path;
- settlement failure must never silently fall back to consuming owner-funded provider quota;
- settlement/receipt evidence must be attributable to the intended requester/provider/transaction context strongly enough to prevent replay or cross-request substitution.

See `docs/architecture/SETTLEMENT_ADAPTERS.md` for the non-normative architecture and implementation sequence.
