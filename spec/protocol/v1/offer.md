# TRUYN/1 OFFER

**Status:** draft normative target. The current MVP does not yet enforce the full provider-policy model described here.

`OFFER` advertises that a node can provide a named capability. It references a `CAPABILITY` descriptor and may include validity, locality, availability, quality/history metadata and optional price/usage conditions.

Offers are revocable provider advertisements. A requester is not required to know the provider before issuing a `NEED`.

## Offer is not entitlement

An `OFFER` does not mean every requester is authorized to execute the capability.

Provider ownership/visibility/billing policy is evaluated separately under `provider-policy.md`.

A public capability advertisement may describe:

```text
capability
schema/version
availability/validity
optional price/usage terms
safe provider metadata
```

while authorization-sensitive owner/tenant/grant state may live in trusted relay/provider policy state rather than requester-controlled wire fields.

## Default privacy

A newly registered execution provider is private by default unless the provider owner deliberately publishes a broader visibility policy.

An implementation MUST NOT infer `network/public` visibility merely because an offer reached a public relay.

## Credential rule

Provider credentials, cloud secrets and private provider keys MUST NOT be embedded in an `OFFER`.

## Discovery filtering

Unauthorized requesters SHOULD NOT receive owner-private offers through normal discovery. If they learn an offer/provider ID by another route, execution authorization still applies.
