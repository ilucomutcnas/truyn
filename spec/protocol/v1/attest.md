# TRUYN/1 ATTEST

**Status:** draft normative skeleton.

`ATTEST` records a signed verification judgment about a claim. The core verdict space is:

- `SUPPORTS`;
- `DISPUTES`;
- `INCONCLUSIVE`.

An attestation SHOULD include confidence, relevant domain, evidence/provenance references, time and an independence/lineage hint when available. The trust engine determines how much weight the attestation receives; raw count is not automatically independent evidence.

See `verification.md` and `trustability.md`.
