# TRUYN/1 REVOKE

**Status:** draft normative skeleton.

`REVOKE` invalidates or supersedes a previously valid revocable object.

Potential targets include offers, claims, results, subscriptions, credentials, key bindings, capabilities and trust receipts.

A revocation MUST identify the issuer, target kind, target ID, effective time and reason code/text. It MAY reference a replacement/superseding object.

Only an authorized issuer/authority for the target can create an authoritative revocation. Receivers MUST validate that authority according to the target type and local policy.

Revocation does not erase historical provenance. It changes current validity.

Security-critical key/credential revocations SHOULD receive high propagation priority and short cache invalidation latency.
