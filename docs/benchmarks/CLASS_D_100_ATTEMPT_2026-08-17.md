# TRUYN Class D 100 Real-Node Attempt — 2026-08-17

**Evidence status:** **UNACCEPTED / NOT A PASS CLAIM**

This record preserves the first Azure Class D-100 execution attempt without promoting roadmap maturity beyond the durable evidence that actually exists.

## What is established from the repository

- execution commit: `650a661911bffadf6f3da3712803d4206aaca184`;
- the committed harness provisions four Azure VM hosts;
- each host is configured to run 25 independent `network/testnet/node-service.js` processes;
- the intended topology therefore contains 100 independent TRUYN node processes, identities and QUIC listener endpoints;
- the adversarial campaign contains baseline routing, signed Byzantine-state rejection, packet-path partition/heal, churn/restart, Sybil/eclipse pressure, collusion observation, durability checks and healed-baseline measurements;
- the evaluator defines explicit Class D-100 acceptance thresholds rather than treating process count alone as success.

## Why this attempt is not accepted

The public append-only evidence ledger did not contain a durable Class D-100 result report for the run. The temporary privileged workflow was also left in `main`, while the repository security guard intentionally allows only the non-privileged CI workflow on the public default branch. Therefore the repository state could not simultaneously satisfy the evidence and security contracts.

The temporary runner was removed on 2026-08-18. The harness/evaluator and Git history are retained.

## Required acceptance rerun

After the Class C heterogeneous WAN/reachability prerequisite is closed, Class D-100 must be rerun and accepted only if durable sanitized evidence records at least:

- exactly 100 simultaneously running real node processes;
- exactly 100 distinct cryptographic identities;
- exactly 100 distinct QUIC sockets/endpoints;
- at least four host failure domains;
- baseline and healed routing success at or above the declared threshold;
- bounded convergence/recovery distributions;
- zero acknowledged-write loss;
- zero invalid signed-state acceptance;
- exercised churn, packet partition, Byzantine, Sybil, eclipse and collusion scenarios;
- complete ephemeral infrastructure cleanup.

This file is intentionally an **attempt record**, not a substitute for the later accepted Class D-100 benchmark report.
