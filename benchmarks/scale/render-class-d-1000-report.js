#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluateAzureClassD1000Evidence } from './class-d-1000-evidence.js';

const inputPath = resolve(process.argv[2] || 'class-d-1000-evidence.json');
const outputPath = resolve(process.argv[3] || 'docs/benchmarks/NETWORK_CLASS_D_1000_2026-08-18.md');
const rawBytes = await readFile(inputPath);
const raw = JSON.parse(rawBytes.toString('utf8'));
const evaluation = evaluateAzureClassD1000Evidence(raw);
const n = evaluation.normalized;
const digest = createHash('sha256').update(rawBytes).digest('hex');
const value = (v) => v == null || Number.isNaN(v) ? 'not-recorded' : String(v);
const bool = (v) => v === true ? 'PASS' : 'FAIL';
const failed = evaluation.failed.length ? evaluation.failed.join(', ') : 'none';

const markdown = `# TRUYN Class D — 1,000 Real Nodes

**Result:** **${evaluation.passed ? 'PASS' : 'FAIL'}**

This report is generated from post-cleanup evidence through the canonical \`evaluateClassD1000\` contract. It does not accept simulations, synthetic node arrays or a logical record count as a substitute for real processes.

## Evidence identity

- tested commit: \`${raw.testedCommit || 'not-recorded'}\`
- GitHub Actions run: ${raw.workflowRunId || 'not-recorded'}
- raw evidence SHA-256: \`${digest}\`
- evidence scope: \`${raw.scope || 'not-recorded'}\`
- canonical evaluator: \`benchmarks/scale/class-d.js#evaluateClassD1000\`
- healed-routing derivation: \`${evaluation.derivation?.healedRoutingMetric || 'not-recorded'}\`
- failed canonical checks: ${failed}

## Canonical acceptance result

| Check | Result |
|---|---:|
${Object.entries(evaluation.checks).map(([name, passed]) => `| ${name} | ${bool(passed)} |`).join('\n')}

## Real topology

| Metric | Measured | Gate |
|---|---:|---:|
| real node processes | ${value(n.topology.realNodeCount)} | exactly ${evaluation.thresholds.nodeCount} |
| distinct cryptographic identities | ${value(n.topology.distinctIdentityCount)} | exactly ${evaluation.thresholds.nodeCount} |
| distinct QUIC sockets/endpoints | ${value(n.topology.distinctQuicSocketCount)} | exactly ${evaluation.thresholds.nodeCount} |
| synthetic nodes | ${value(n.topology.syntheticNodeCount)} | 0 |
| host failure domains | ${value(n.topology.hostCount)} | ≥ ${evaluation.thresholds.minimumHostCount} |
| bootstrap | ${value(raw?.topology?.bootstrap)} | measured |

## Scale measurements

| Metric | Measured | Gate |
|---|---:|---:|
| baseline routing success | ${value(n.routing.baselineSuccessRatio)} | ≥ ${evaluation.thresholds.baselineRoutingSuccess} |
| healed/post-restart routing success | ${value(n.routing.healedSuccessRatio)} | ≥ ${evaluation.thresholds.healedRoutingSuccess} |
| convergence p95, ms | ${value(n.convergence.latencyMs.p95)} | ≤ ${evaluation.thresholds.convergenceP95Ms} |
| recovery p95, ms | ${value(n.recovery.latencyMs.p95)} | ≤ ${evaluation.thresholds.recoveryP95Ms} |
| acknowledged durable write loss | ${value(n.safety.acknowledgedWriteLossCount)} | ${evaluation.thresholds.acknowledgedWriteLossMax} |
| invalid signed state accepted | ${value(n.safety.invalidSignedStateAcceptedCount)} | ${evaluation.thresholds.invalidSignedStateAcceptedMax} |
| stale revoked receipt accepted | ${value(n.safety.staleRevokedReceiptAcceptedCount)} | ${evaluation.thresholds.staleRevokedReceiptAcceptedMax} |
| unauthorized provider execution | ${value(n.safety.unauthorizedProviderExecutionCount)} | ${evaluation.thresholds.unauthorizedProviderExecutionMax} |
| aggregate node RSS, KB | ${value(raw?.resources?.aggregateNodeRssKb)} | measured |
| measured QUIC/UDP bytes | ${value(raw?.resources?.measuredQuicUdpBytes)} | measured |
| observed node processes at end | ${value(raw?.resources?.observedNodeProcesses)} | measured |

## Cleanup

- ephemeral infrastructure cleanup confirmed: **${n.cleanup.complete ? 'true' : 'false'}**
- remaining resources: ${value(n.cleanup.remainingResources)} (gate ≤ ${evaluation.thresholds.remainingResourcesMax})

## Interpretation boundary

A PASS proves the bounded **1,000 simultaneously running real-node scale gate** under the declared topology: exact real process/identity/socket counts, the committed host-failure-domain minimum, baseline and healed routing, convergence/recovery bounds, zero listed safety violations and verified zero-resource cleanup.

It does **not** by itself prove randomized multi-seed Byzantine/Sybil/eclipse/collusion resilience, host+volume-loss durability, long-running SLOs or stable/mainnet compatibility. Those remain explicit later gates.
`;

await writeFile(outputPath, markdown, 'utf8');
process.stdout.write(`${JSON.stringify({ ok: true, passed: evaluation.passed, failed: evaluation.failed, digest, outputPath })}\n`);
process.exit(evaluation.passed ? 0 : 1);
