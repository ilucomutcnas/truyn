# Compute

TRUYN can move computation toward information instead of always moving raw information toward computation.

This subsystem owns:

- `executor/` — execution lifecycle for advertised capabilities;
- `sandbox/` — isolation/resource restrictions for untrusted or constrained execution;
- `placement/` — choose local/remote/data-near execution subject to request policy;
- `policies/` — allowed capabilities, data egress, resource/time/network limits and audit requirements.

`COMPUTE` is a network request, not permission to run arbitrary code. A provider decides which capability/sandbox profiles it accepts. Results return through `RESULT` with optional claims/provenance/trust receipts.
