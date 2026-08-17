#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { runAdversarialScaleGate } from '../network-failure/adversarial-scale.js';

const nodeCount = Number.parseInt(process.env.TRUYN_SCALE_NODE_COUNT || '100', 10);
const seed = Number.parseInt(process.env.TRUYN_SCALE_SEED || '1414681945', 10);
const output = process.env.TRUYN_SCALE_REPORT ? resolve(process.env.TRUYN_SCALE_REPORT) : null;
const started = Date.now();

if (!Number.isInteger(nodeCount) || nodeCount < 6) throw new Error('TRUYN_SCALE_NODE_COUNT must be an integer >= 6');

const report = await runAdversarialScaleGate({
  count: nodeCount,
  seed,
  baselineProviders: Math.min(32, nodeCount),
  baselineSamples: Math.min(50, nodeCount)
});

report.execution = {
  requestedScaleGate: 100,
  runtimeNodes: nodeCount,
  hostCount: Number.parseInt(process.env.TRUYN_SCALE_HOST_COUNT || '1', 10),
  failureDomainType: process.env.TRUYN_SCALE_FAILURE_DOMAIN_TYPE || 'single-host-process',
  hostId: process.env.TRUYN_SCALE_HOST_ID || process.env.HOSTNAME || 'unknown',
  cloud: process.env.TRUYN_SCALE_CLOUD || null,
  region: process.env.TRUYN_SCALE_REGION || null,
  orchestrationRunId: process.env.GITHUB_RUN_ID || null,
  elapsedMs: Date.now() - started
};

// A run with 100 live cryptographic/network runtimes is a 100-node scale run.
// It is NOT automatically 100 independent infrastructure failure domains; that
// stronger property is reported separately in execution.hostCount/failureDomainType.
report.claims = {
  hundredNodeRuntimeGate: nodeCount === 100 && report.finalNetwork?.live === 100,
  hundredIndependentFailureDomains: nodeCount === 100 && report.execution.hostCount >= 100,
  byzantineConsensus: false,
  sybilResistance: false
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (output) {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, serialized, 'utf8');
}
process.stdout.write(serialized);
if (!report.passed) process.exitCode = 1;
