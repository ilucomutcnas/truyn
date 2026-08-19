#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluateAzureClassD100Evidence } from './class-d-evidence.js';

const evidencePath = resolve(process.argv[2] || 'class-d-100-evidence.json');
let raw;
try {
  raw = JSON.parse(await readFile(evidencePath, 'utf8'));
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: 'class_d_terminal_evidence_unreadable', message: error.message })}\n`);
  process.exit(2);
}

const evaluation = evaluateAzureClassD100Evidence(raw);
const n = evaluation.normalized || {};
const checks = {
  canonicalEvaluator: evaluation.passed === true && evaluation.failed.length === 0,
  realNodes: n.topology?.realNodeCount === 100,
  distinctIdentities: n.topology?.distinctIdentityCount === 100,
  distinctQuicSockets: n.topology?.distinctQuicSocketCount === 100,
  hostFailureDomains: Number(n.topology?.hostCount) >= 4,
  baselineRouting: Number(n.routing?.baselineSuccessRatio) >= 0.99,
  healedRouting: Number(n.routing?.healedSuccessRatio) >= 0.99,
  recoveryP95: Number(n.recovery?.latencyMs?.p95) <= 120000,
  convergenceP95: Number(n.convergence?.latencyMs?.p95) <= 120000,
  noAcknowledgedWriteLoss: n.safety?.acknowledgedWriteLossCount === 0,
  noInvalidSignedStateAccepted: n.safety?.invalidSignedStateAcceptedCount === 0,
  noStaleRevokedReceiptAccepted: n.safety?.staleRevokedReceiptAcceptedCount === 0,
  churnExercised: n.adversarial?.churn?.exercised === true,
  packetPartitionExercised: n.adversarial?.packetPartition?.exercised === true,
  byzantineExercised: n.adversarial?.byzantine?.exercised === true,
  sybilPressureExercised: n.adversarial?.sybil?.exercised === true,
  eclipseExercised: n.adversarial?.eclipse?.exercised === true,
  collusionExercised: n.adversarial?.collusion?.exercised === true,
  cleanupConfirmed: n.cleanup?.complete === true,
  zeroRemainingResources: n.cleanup?.remainingResources === 0 && raw?.cleanup?.remainingResources === 0
};
const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
const result = {
  ok: failed.length === 0,
  class: 'D-100',
  failed,
  checks,
  testedCommit: raw?.testedCommit || null,
  workflowRunId: raw?.workflowRunId || null,
  normalized: n
};
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(result.ok ? 0 : 1);
