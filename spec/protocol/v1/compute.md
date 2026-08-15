# TRUYN/1 COMPUTE

**Status:** draft normative skeleton.

`COMPUTE` requests execution of an advertised capability. It allows computation to move toward information when moving the underlying data would be slower, more expensive or less private.

A compute request can reference input objects/state and include the normal `NEED` policy constraints plus an execution/sandbox profile.

## Authorization boundary

A provider advertising a compute capability does not grant every requester permission to execute it.

Before computation begins, provider ownership/visibility policy, requester authorization and any required billing/quota entitlement MUST pass under `provider-policy.md`.

A private/chargeable compute provider MUST fail closed when authorization or billing responsibility cannot be resolved.

## Safety boundary

Accepting a capability offer MUST NOT imply permission to execute arbitrary untrusted code. The provider controls supported execution environments, resource limits and data-release policy.

Implementations SHOULD support:

- capability allowlists;
- provider/requester authorization;
- sandbox/isolation profiles;
- CPU/GPU/memory/time quotas;
- cost/resource entitlements where applicable;
- filesystem/network restrictions;
- data locality and egress policy;
- signed execution/result metadata;
- cancellation/timeouts;
- auditable resource accounting where needed.

The output is returned through `RESULT`, optionally accompanied by claims, provenance and a trust receipt.
