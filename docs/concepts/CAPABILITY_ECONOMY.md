# Capability Economy

TRUYN can become a substrate where machines discover not only **who can do something**, but also the conditions under which they will do it.

Potential capabilities include model inference, verification, translation, code review, storage, sensing, private-data computation, indexing and specialized analysis.

An `OFFER` may advertise price/conditions; a `NEED` may provide a maximum cost and decision constraints. Routing can therefore compare candidates across:

```text
trustability
quality
latency
freshness
availability
locality
privacy
price
```

This can create market competition without making the base protocol dependent on one commercial provider.

## Separation of concerns

TRUYN/1 may carry cost/price metadata for routing, but settlement is modular. Deployments may use invoices, credits, fiat payment providers, enterprise contracts, cryptographic payments, free exchange, quotas or no payment at all.

A blockchain is **not required** by the core network.

The protocol position is **settlement neutrality**:

> TRUYN/1 does not prescribe a currency, billing provider, blockchain, smart contract or settlement rail.

The economic layer therefore has two distinct responsibilities:

```text
TRUYN core
  capability + trust + authorization + price-aware routing

external settlement adapters
  payment authorization + payment execution + receipts/finality
```

## Planned settlement adapters

The first planned integrations are:

- **x402** — a machine-native payment/settlement adapter for chargeable capability access;
- **AP2** — an agent-payment authorization adapter using verifiable mandates and receipts.

These are intentionally composable rather than exclusive. A future flow may use AP2 to prove that an autonomous agent is authorized to transact and x402 to satisfy/settle the payment requirement.

Neither becomes a required TRUYN/1 dependency. A deployment remains free to use a different rail or no settlement mechanism at all.

See `docs/architecture/SETTLEMENT_ADAPTERS.md`.

## Market invariant

A price, payment proof or successful settlement does not override provider ownership or authorization.

Paid cross-owner execution still requires an explicitly eligible provider/requester relationship. Trustability is also independent: paying a provider does not make its result true, and a highly trusted provider is not automatically authorized for a requester.

## Long-term metric

The economic goal is broader than cheapest inference:

> **maximize useful, trustworthy machine cooperation per dollar, per second and per unit of compute.**

Token reduction, cached results, state/delta exchange, compute-near-data, provider competition and external settlement interoperability can all contribute to that metric.
