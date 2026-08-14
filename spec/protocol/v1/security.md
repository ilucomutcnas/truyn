# TRUYN/1 Security

**Status:** draft security skeleton.

TRUYN assumes hostile or faulty peers can exist.

Core requirements include:

- authenticated encrypted transport where available;
- canonical signed messages;
- replay/expiry checks;
- explicit key/credential revocation;
- provenance preservation;
- Sybil/collusion-aware trust policy;
- rate/resource limits;
- sandboxing for compute execution;
- privacy/egress controls;
- signed software updates and rollback-capable migrations.

Cryptographic identity proves control/attribution, not truth. Remote attestation can strengthen integrity evidence but also does not prove factual correctness.

Security-critical revocations and compromised-key information should receive high propagation priority.
