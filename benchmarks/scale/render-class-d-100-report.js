#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { evaluateAzureClassD100Evidence } from './class-d-evidence.js';

const inputPath = resolve(process.argv[2] || 'class-d-100-evidence.json');
const outputPath = resolve(process.argv[3] || 'docs/benchmarks/NETWORK_CLASS_D_100_2026-08-18.md');
const rawBytes = await readFile(inputPath);
const raw = JSON.parse(rawBytes.toString('utf8'));
const evaluation = evaluateAzureClassD100Evidence(raw);
const n = evaluation.normalized;
const digest = createHash('sha256').update(rawBytes).digest('hex');
const value = (v) => v == null || Number.isNaN(v) ? 'not-recorded' : String(v);
const bool = (v) => v === true ? 'PASS' : 'FAIL';
const failed = evaluation.failed.length ? evaluation.failed.join(', ') : 'none';

const markdown = `# TRUYN Class D — 100 Real Nodes — 2026-08-18

**Result:** **${evaluation.passed ? 'PASS' : 'FAIL'}**

This report is generated from the post-cleanup Class D evidence file through the canonical \`evaluateClassD100\` contract. A campaign banner or process count alone cannot promote this gate.

## Evidence identity

- tested commit: \`${raw.testedCommit || 'not-recorded'}\`
- GitHub Actions run: ${raw.workflowRunId || 'not-recorded'}
- raw evidence SHA-256: \`${digest}\`
- evidence scope: \`${raw.scope || 'not-recorded'}\`
- canonical evaluator: \`benchmarks/scale/class-d.js#evaluateClassD100\`
- failed canonical checks: ${failed}

## Canonical acceptance result

| Check | Result |
|---|---:|
${Object.entries(evaluation.checks).map(([name, passed]) => `| ${name} | ${bool(passed)} |`).join('\n')}

## Real topology

| Metric | Measured |
|---|---:|
| real node processes | ${value(n.topology.realNodeCount)} |
| distinct cryptographic identities | ${value(n.topology.distinctIdentityCount)} |
| distinct QUIC sockets/endpoints | ${value(n.topology.distinctQuicSocketCount)} |
| host failure domains | ${value(n.topology.hostCount)} |

## Routing / recovery

| Metric | Measured | Gate |
|---|---:|---:|
| baseline routing success | ${value(n.routing.baselineSuccessRatio)} | ≥ ${evaluation.thresholds.baselineRoutingSuccess} |
| healed routing success | ${value(n.routing.healedSuccessRatio)} | ≥ ${evaluation.thresholds.healedRoutingSuccess} |
| recovery p95, ms | ${value(n.recovery.latencyMs.p95)} | ≤ ${evaluation.thresholds.recoveryP95Ms} |
| convergence p95, ms | ${value(n.convergence.latencyMs.p95)} | ≤ ${evaluation.thresholds.convergenceP95Ms} |
| aggregate node RSS, KB | ${value(raw?.resources?.aggregateNodeRssKb)} | measured, not a pass threshold |
| measured QUIC/UDP bytes | ${value(raw?.resources?.measuredQuicUdpBytes)} | measured, not a pass threshold |

## Safety / adversarial exercise

| Invariant / scenario | Measured |
|---|---:|
| acknowledged durable write loss | ${value(n.safety.acknowledgedWriteLossCount)} |
| invalid signed state accepted | ${value(n.safety.invalidSignedStateAcceptedCount)} |
| stale/revoked receipt accepted | ${value(n.safety.staleRevokedReceiptAcceptedCount)} |
| randomized churn exercised | ${bool(n.adversarial.churn.exercised)} |
| real packet partition exercised | ${bool(n.adversarial.packetPartition.exercised)} |
| Byzantine replica exercise | ${bool(n.adversarial.byzantine.exercised)} |
| Sybil pressure exercise | ${bool(n.adversarial.sybil.exercised)} |
| eclipse exercise | ${bool(n.adversarial.eclipse.exercised)} |
| collusion exercise | ${bool(n.adversarial.collusion.exercised)} |

## Cleanup

- ephemeral infrastructure cleanup confirmed: **${n.cleanup.complete ? 'true' : 'false'}**
- remaining resources recorded by harness: ${value(raw?.cleanup?.remainingResources)}

## Interpretation boundary

A PASS proves the bounded 100-real-process resilience gate defined by the repository: 100 simultaneously running TRUYN node processes with distinct identities/sockets across at least four hosts, routing/recovery thresholds, zero listed safety violations, required adversarial exercises, and verified cleanup.

It does **not** prove 1,000-real-node scale, broad heterogeneous Internet geography, or stable/mainnet compatibility. Those remain later gates.
`;

await writeFile(outputPath, markdown, 'utf8');
process.stdout.write(`${JSON.stringify({ ok: true, passed: evaluation.passed, failed: evaluation.failed, digest, outputPath })}\n`);
process.exit(evaluation.passed ? 0 : 1);
