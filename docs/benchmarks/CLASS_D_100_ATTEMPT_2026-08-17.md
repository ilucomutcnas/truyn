# TRUYN Class D 100 Real-Node Attempt — 2026-08-17

**Run disposition:** **CLOSED / FROZEN**  
**Acceptance status:** **UNACCEPTED / NOT A PASS CLAIM**  
**Evidence status:** **UNACCEPTED / NOT A PASS CLAIM**

This append-only record preserves the first Azure Class D-100 execution attempt without promoting roadmap maturity beyond durable evidence that actually exists. The run is closed as historical evidence; it is not the accepted 100-real-node gate.

## What is established from the repository

- execution commit: `650a661911bffadf6f3da3712803d4206aaca184`;
- the committed harness provisions four Azure VM hosts;
- each host is configured to run 25 independent `network/testnet/node-service.js` processes;
- the intended topology therefore contains 100 independent TRUYN node processes, identities and QUIC listener endpoints;
- the bounded campaign contains baseline routing, signed Byzantine-state rejection, packet-path partition/heal, bounded churn/restart, Sybil/eclipse pressure, collusion observation, durability checks and healed-baseline measurements;
- the evaluator defines explicit Class D-100 acceptance thresholds rather than treating process count alone as success.

## Why this attempt is not accepted

The public append-only evidence ledger did not contain a durable complete Class D-100 result report produced by the execution. The temporary privileged workflow was also incompatible with the public-default-branch workflow allowlist while it remained present. Therefore the repository could not establish the complete evidence chain required to accept the run.

The temporary Class D runner was removed on 2026-08-18. The harness, evaluator, Git history and this sanitized attempt record are retained under the benchmark redact-not-delete policy.

No later engineering work may reinterpret this record as a PASS. A future accepted 100-node gate requires a new durable evidence report satisfying the current productionization contract.

## Security disposition

The public default branch is required to contain only the allowlisted non-privileged workflow set:

- `.github/workflows/.gitkeep`;
- `.github/workflows/ci.yml`.

Class D privileged execution workflows are ephemeral operational mechanisms and must not remain on `main` after execution. Future cloud acceptance runs should execute from an isolated ops branch or equivalent non-default-branch mechanism and merge only sanitized durable evidence back into `main`.

## Required acceptance rerun

After Class C heterogeneous WAN/reachability is closed, the accepted 100-real-node gate must be rerun and accepted only if durable sanitized evidence records at least:

- exactly 100 simultaneously running real node processes;
- exactly 100 distinct cryptographic identities;
- exactly 100 distinct QUIC sockets/endpoints;
- multiple independent host failure domains;
- baseline and healed routing success at or above the declared threshold;
- bounded convergence/recovery distributions;
- zero acknowledged-write loss;
- zero invalid signed-state acceptance;
- the declared bounded 100-node fault campaign;
- complete ephemeral infrastructure cleanup;
- tested-commit security preflight and durable run/evidence identity.

The later randomized multi-seed adversarial campaign remains a separate gate and must not be conflated with this bounded 100-node acceptance run.

This file is intentionally an **attempt/closure record**, not a substitute for the later accepted Class D-100 benchmark report.
