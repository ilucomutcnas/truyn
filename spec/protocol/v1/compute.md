# TRUYN/1 COMPUTE

**Status:** draft normative skeleton.

`COMPUTE` requests execution of an advertised capability. It allows computation to move toward information when moving the underlying data would be slower, more expensive or less private.

A compute request can reference input objects/state and include the normal `NEED` policy constraints plus an execution/sandbox profile.

## Safety boundary

Accepting a capability offer MUST NOT imply permission to execute arbitrary untrusted code. The provider controls supported execution environments, resource limits and data-release policy.

Implementations SHOULD support:

- capability allowlists;
- sandbox/isolation profiles;
- CPU/GPU/memory/time quotas;
- filesystem/network restrictions;
- data locality and egress policy;
- signed execution/result metadata;
- cancellation/timeouts;
- auditable resource accounting where needed.

The output is returned through `RESULT`, optionally accompanied by claims, provenance and a trust receipt.
