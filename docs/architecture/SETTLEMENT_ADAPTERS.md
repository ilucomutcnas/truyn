# TRUYN Settlement Adapter Architecture

**Status:** Defined architecture / implementation not started.

TRUYN is deliberately **settlement-neutral**. The base network is responsible for identity, capability discovery, authorization, routing, execution, provenance and trustability. Movement of money is an external concern connected through optional adapters.

> **TRUYN/1 does not prescribe a currency, billing provider, blockchain, smart contract or settlement rail.**

This boundary is intentional. It lets TRUYN remain useful for free exchange, BYOK, enterprise contracts, subscriptions, prepaid entitlements, invoices and future machine-to-machine markets without making the protocol dependent on one financial system.

## Separation of responsibilities

```text
TRUYN core
identity · capability · trust · authorization · routing · execution
                         │
                         │ optional extension boundary
                         ▼
                 Settlement Adapter
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
          x402                       AP2
   payment / settlement       agent payment authorization
            │                         │
            └────────────┬────────────┘
                         ▼
             external payment rails
```

The diagram is conceptual. AP2 and x402 are composable rather than mutually exclusive: AP2 can supply verifiable agent authorization/mandates while x402 can supply a concrete payment and settlement flow.

## What belongs to TRUYN core

TRUYN core may know enough economic information to route safely, for example:

```text
price / pricing terms
maximum requester cost
billing mode
billing responsibility
entitlement requirement
provider owner
requester identity
execution/result identity
```

Core TRUYN does **not** define how funds are moved.

Provider access authorization remains authoritative before any economic ranking. A low price or valid payment proof cannot make an otherwise unauthorized provider eligible.

## What belongs to a settlement adapter

A settlement adapter may implement the external mechanics required by a particular payment/authorization ecosystem, including:

```text
translate offer/payment requirements
prepare external authorization/payment request
verify external authorization or payment proof
invoke external settlement/facilitator services
bind external receipts to a TRUYN transaction
reconcile external settlement state
report success/failure without exposing credentials
```

Adapter-specific credentials, wallets, payment instruments, private keys, processor tokens and account identifiers remain outside core TRUYN envelopes.

TRUYN may retain an opaque external reference, digest or receipt commitment when auditability requires it. The external protocol remains authoritative for the meaning of that object.

## First target adapter: x402

x402 is the first target for a concrete machine-native payment/settlement adapter.

The planned adapter boundary maps a chargeable TRUYN capability execution to the x402 flow without changing TRUYN/1 semantics:

```text
TRUYN authorized capability candidate
        ↓
x402 payment requirements
        ↓
requester payment payload
        ↓
verification (local or facilitator)
        ↓
TRUYN execution according to policy
        ↓
x402 settlement
        ↓
settlement response / receipt reference
```

The adapter must not assume one chain, token or currency at the TRUYN layer. x402 scheme/network selection is adapter configuration and policy.

## Second target adapter: AP2

AP2 is the first target for verifiable **agent payment authorization**.

AP2 provides mandates/receipts that can prove an agent was authorized to perform a purchase/payment action. The planned TRUYN adapter uses that authorization layer for cross-owner capability execution where autonomous agents need verifiable payment intent.

Conceptually:

```text
TRUYN NEED / selected OFFER
        ↓
AP2 authorization / mandate flow
        ↓
verified authority to transact
        ↓
selected payment instrument / rail
        ↓
external payment and receipt
        ↓
TRUYN RESULT + opaque receipt commitment
```

AP2 does not become a TRUYN wire primitive. Its mandates, credentials and receipts remain external extension objects.

## AP2 + x402 composition

TRUYN should support the composition:

```text
TRUYN
  ↓
AP2: is this agent authorized to transact under the user's intent?
  ↓
x402: satisfy and settle the machine-readable payment requirement
  ↓
TRUYN: execute / return result / preserve provenance
```

Other combinations remain possible. An AP2-authorized transaction could use another payment instrument, and an x402 flow does not require AP2 unless policy demands it.

## Security invariants

Settlement adapters MUST preserve the existing TRUYN provider-security boundary:

1. **Authorization before payment/ranking.** Payment capability does not grant provider access.
2. **No optimistic owner-funded fallback.** Failure or absence of settlement authorization must never silently consume a provider owner's paid quota.
3. **Trust and payment are separate.** High Trustability does not prove payment authorization; successful payment does not prove result truth or quality.
4. **Credentials remain external.** Wallet keys, payment credentials, processor secrets and provider API keys do not traverse the TRUYN core network merely because an adapter exists.
5. **Fail closed when required.** If policy requires settlement/authorization and the adapter cannot verify the required state, the chargeable cross-owner execution is denied.
6. **Receipt binding is attributable.** External settlement evidence must bind to the relevant requester/provider/transaction context strongly enough to prevent replay or cross-request substitution.
7. **No mandatory rail.** Nodes that do not use paid cross-owner execution must not require x402, AP2, a blockchain or any payment processor.

## Routing relationship

The future paid cross-owner path is conceptually:

```text
authenticate requester
        ↓
discover capability candidates
        ↓
provider ownership / visibility authorization
        ↓
billing responsibility / entitlement policy
        ↓
price and hard request constraints
        ↓
select eligible provider
        ↓
settlement adapter, when policy requires it
        ↓
provider-host recheck
        ↓
execution
        ↓
external settlement / receipt handling according to adapter policy
        ↓
RESULT + provenance / optional opaque settlement reference
```

Exact pre-authorization versus post-execution settlement timing is adapter/scheme-specific. TRUYN core does not standardize the financial finality model.

## Implementation plan

Implementation is intentionally deferred until the network productionization and operational gates ahead of it are closed.

The planned sequence is:

1. define a stable settlement-adapter interface outside the TRUYN/1 core wire vocabulary;
2. implement x402 adapter support with testnet/sandbox-only money movement first;
3. implement AP2 mandate/receipt authorization support;
4. prove AP2 + x402 composition for an autonomous cross-owner capability purchase;
5. add durable accounting/reconciliation and replay-safe receipt binding;
6. add negative tests proving settlement cannot bypass provider authorization or consume owner-funded quota on failure;
7. only then consider production paid cross-owner capability exchange.

No step above implies a TRUYN currency, token, blockchain or proprietary payment network.

## Compatibility rule

Settlement adapters are extensions. Their release cadence, external protocol versions, supported payment instruments/networks and operational dependencies can evolve independently of TRUYN/1.

A change in x402, AP2, a processor, a chain or a currency must not require a new TRUYN core protocol generation unless the base TRUYN semantics themselves change.

## External protocols

The first integration targets are:

- x402: https://x402.org/ and https://github.com/x402-foundation/x402
- AP2: https://github.com/google-agentic-commerce/AP2

These are integration targets, not dependencies of TRUYN/1 and not endorsements or exclusivity commitments.
