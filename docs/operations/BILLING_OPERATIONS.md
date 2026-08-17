# TRUYN Billing Operations

**Status:** operational safety contract for the implemented reference billing boundary; not a complete commercial accounting system.

## Golden rule

If TRUYN cannot determine both **authorization to cause a chargeable call** and **billing responsibility**, do not execute the provider call.

## Safe modes

### BYOK

Use when the provider relationship belongs to the user/provider owner. Keep the provider private/`owner-only`; keep raw upstream credentials at the provider runtime/secret facility.

### Owner-funded

Use for operator/provider-owner capacity that is not intended as public network quota. Keep access `owner-only`. A public-access mismatch must fail before adapter execution.

### Sponsored

Do not enable unless the runtime has all required dependencies:

- explicit sponsored mode/access opt-in;
- positive provider request/token limits;
- actor-bound signed entitlement verification;
- positive request token estimate/reservation;
- durable atomic usage store with `reserve(...)` behavior;
- successful reservation for that actor/entitlement/day.

A process-local/in-memory usage counter is not an acceptable production billing boundary.

### Prepaid / subscription

Keep disabled/fail-closed until an authoritative entitlement resolver and durable accounting/reconciliation layer exist.

## Sponsored entitlement operations

Entitlements should be treated like security-sensitive authorization artifacts:

- sign with a dedicated issuer key separated from provider API credentials;
- bind to the intended actor identity;
- set explicit expiry and bounded quotas;
- support issuer-side revocation/rotation in the eventual production control plane;
- never log the token value in public logs/benchmark evidence;
- audit entitlement ID and decision, not secret material.

The repository currently provides verification/policy interfaces; production issuance infrastructure is not yet claimed.

## Durable usage store requirements

The production store must provide atomic reservation semantics so concurrent requests cannot exceed an entitlement through races. It must survive process restart and fail closed when unavailable.

Reservation should be keyed by at least actor + entitlement + accounting period, with provider policy limits intersected with entitlement limits.

## Incident response

On ambiguous or incorrect billing state:

1. disable the affected shared/sponsored execution path;
2. keep owner-funded/BYOK private defaults intact;
3. preserve non-secret request/entitlement IDs for audit;
4. reconcile upstream provider usage with durable reservations where available;
5. rotate/revoke compromised entitlement issuer material;
6. restore service only after fail-closed tests pass.

Billing recovery must not temporarily make an owner-funded provider public.

## Public evidence

Benchmark reports may publish provider-native usage and list-price-equivalent economics when safe. They must not publish live credit balances, billing accounts, negotiated private prices, operational ceilings or secret entitlement material.
