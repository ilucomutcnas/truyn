#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AdversarialScaleCluster } from '../network-failure/adversarial-scale.js';

const nodeCount = Number.parseInt(process.env.TRUYN_SCALE_NODE_COUNT || '100', 10);
const seed = Number.parseInt(process.env.TRUYN_SCALE_SEED || '1414681945', 10);
const output = process.env.TRUYN_SCALE_REPORT ? resolve(process.env.TRUYN_SCALE_REPORT) : null;
const started = Date.now();
const startedAt = new Date().toISOString();
let currentStage = 'init';

if (!Number.isInteger(nodeCount) || nodeCount < 6) throw new Error('TRUYN_SCALE_NODE_COUNT must be an integer >= 6');

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function batches(items, size) {
  const outputBatches = [];
  for (let i = 0; i < items.length; i += size) outputBatches.push(items.slice(i, i + size));
  return outputBatches;
}

function stage(name, detail = {}) {
  currentStage = name;
  console.log(`TRUYN_SCALE_STAGE ${JSON.stringify({ stage: name, elapsedMs: Date.now() - started, ...detail })}`);
}

function execution() {
  return {
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
}

function errorShape(error) {
  return {
    name: error?.name || 'Error',
    code: error?.code || null,
    message: error?.message || String(error),
    stack: String(error?.stack || '').split('\n').slice(0, 20).join('\n') || null
  };
}

function writeReport(report) {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output) {
    mkdirSync(resolve(output, '..'), { recursive: true });
    writeFileSync(output, serialized, 'utf8');
  }
  process.stdout.write(serialized);
}

let fatalWritten = false;
function writeFatal(kind, error) {
  if (fatalWritten) return;
  fatalWritten = true;
  writeReport({
    schema: 'truyn-adversarial-scale-gate-error-v1',
    passed: false,
    startedAt,
    failedAt: new Date().toISOString(),
    nodeCount,
    seed,
    stage: currentStage,
    failureKind: kind,
    error: errorShape(error),
    execution: execution(),
    claims: {
      hundredNodeRuntimeGate: false,
      hundredIndependentFailureDomains: false,
      byzantineConsensus: false,
      sybilResistance: false
    }
  });
}

process.once('uncaughtException', (error) => {
  writeFatal('uncaughtException', error);
  process.exit(1);
});
process.once('unhandledRejection', (reason) => {
  writeFatal('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
  process.exit(1);
});

async function advertiseRobust(cluster, assignments, { concurrency = 4, attempts = 3 } = {}) {
  const evidence = [];
  for (const batch of batches(assignments, concurrency)) {
    const batchEvidence = await Promise.all(batch.map(async (assignment) => {
      const node = cluster.nodes[assignment.providerIndex];
      const failures = [];
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const attemptStarted = performance.now();
        try {
          await node.advertise(assignment.key);
          return {
            providerIndex: assignment.providerIndex,
            key: assignment.key,
            attempts: attempt,
            publishMs: performance.now() - attemptStarted,
            failures
          };
        } catch (error) {
          failures.push({ attempt, code: error.code || null, message: error.message || String(error) });
          if (attempt === attempts) throw error;
          await node.refresh({ timeoutMs: 10_000 }).catch(() => null);
          await sleep(100 * attempt);
        }
      }
      throw new Error('unreachable scale publication state');
    }));
    evidence.push(...batchEvidence);
  }
  return {
    published: evidence.length,
    retries: evidence.reduce((sum, item) => sum + Math.max(0, item.attempts - 1), 0),
    evidence
  };
}

let cluster;
try {
  cluster = new AdversarialScaleCluster({ count: nodeCount, seed });

  stage('topology:start', { nodeCount });
  await cluster.start({ concurrency: nodeCount >= 50 ? 8 : 10 });
  const topology = cluster.snapshot();
  stage('topology:ready', {
    live: topology.live,
    libp2pIds: topology.uniqueLibp2pPeerIds,
    truynIds: topology.uniqueTruynNodeIds,
    routingP50: topology.routingTableSize.p50,
    routingP95: topology.routingTableSize.p95
  });

  const baselineAssignments = cluster.makeAssignments({ count: Math.min(24, nodeCount), prefix: 'baseline100' });
  stage('baseline:publish:start', { providers: baselineAssignments.length });
  const baselinePublication = await advertiseRobust(cluster, baselineAssignments, { concurrency: nodeCount >= 50 ? 4 : 6 });
  await cluster.refreshAll({ concurrency: nodeCount >= 50 ? 5 : 8, timeoutMs: 10_000 });
  stage('baseline:publish:ready', { published: baselinePublication.published, retries: baselinePublication.retries });

  stage('baseline:measure:start', { samples: Math.min(50, nodeCount) });
  const baseline = await cluster.measureRouting(baselineAssignments, { samples: Math.min(50, nodeCount), timeoutMs: 4_000 });
  stage('baseline:measure:done', {
    firstAttemptRouting: baseline.firstAttemptRoutingSuccessRatio,
    routing: baseline.routingSuccessRatio,
    integrity: baseline.endToEndIntegritySuccessRatio,
    routingP95Ms: baseline.routingLatencyMs.p95,
    probeP95Ms: baseline.probeLatencyMs.p95
  });

  stage('partition:start');
  const partition = await cluster.partitionScenario({ timeoutMs: 3_000 });
  stage('partition:done', {
    sameSide: partition.samePartitionRoutingSucceeded,
    crossBlocked: partition.crossPartitionRoutingBlocked,
    healed: partition.healed,
    recoveryMs: partition.recoveryMs
  });

  stage('churn:start', { fraction: 0.2 });
  const churn = await cluster.churnScenario({ fraction: 0.2, timeoutMs: 4_000 });
  stage('churn:done', {
    stopped: churn.stoppedNodes,
    recovered: churn.recoveredNodes,
    peerRotations: churn.peerIdentityRotations,
    routingDuringChurn: churn.duringChurn.routingSuccessRatio,
    recoveryP95Ms: churn.recoveryMs.p95
  });

  stage('eclipse:start');
  const eclipse = await cluster.eclipseScenario({ timeoutMs: 3_000 });
  stage('eclipse:done', {
    attackers: eclipse.attackerCount,
    attackerResponsesObserved: eclipse.attackerResponsesObserved,
    attackerResponsesAccepted: eclipse.attackerResponsesAccepted,
    availabilityLost: eclipse.eclipseAvailabilityLost,
    healed: eclipse.healed,
    recoveryMs: eclipse.recoveryMs
  });

  stage('sybil:start');
  const sybilPressure = await cluster.sybilPressureScenario({ timeoutMs: 4_000 });
  stage('sybil:done', {
    sybilIdentities: sybilPressure.sybilIdentities,
    attackerProviderShare: sybilPressure.attackerProviderShare,
    attackerResponsesObserved: sybilPressure.attackerResponsesObserved,
    attackerResponsesAccepted: sybilPressure.attackerResponsesAccepted,
    availability: sybilPressure.routingAvailabilityUnderPressure
  });

  stage('collusion:start');
  const byzantineCollusion = await cluster.byzantineCollusionScenario({ timeoutMs: 4_000 });
  stage('collusion:done', {
    attackers: byzantineCollusion.attackerCount,
    maliciousObserved: byzantineCollusion.maliciousResponsesObserved,
    maliciousAccepted: byzantineCollusion.maliciousAccepted,
    honestAccepted: byzantineCollusion.honestAccepted
  });

  const finalNetwork = cluster.snapshot();
  const gates = {
    uniqueNodeIdentities: finalNetwork.uniqueLibp2pPeerIds === nodeCount && finalNetwork.uniqueTruynNodeIds === nodeCount,
    baselineFirstAttemptRouting: baseline.firstAttemptRoutingSuccessRatio >= 0.95,
    baselineRouting: baseline.routingSuccessRatio >= 0.95,
    baselineIntegrity: baseline.endToEndIntegritySuccessRatio >= 0.95,
    partitionIsolation: partition.samePartitionRoutingSucceeded && partition.crossPartitionRoutingBlocked,
    partitionRecovery: partition.healed,
    churnRecovery: churn.recoveredNodes === churn.stoppedNodes && churn.peerIdentityRotations === churn.stoppedNodes,
    churnRouting: churn.duringChurn.routingSuccessRatio >= 0.90,
    eclipseExercised: eclipse.attackExercised,
    eclipseIntegrity: !eclipse.integrityForged,
    eclipseRecovery: eclipse.healed,
    sybilExercised: sybilPressure.attackExercised,
    sybilIntegrity: sybilPressure.integrityPreserved,
    sybilAvailability: sybilPressure.routingAvailabilityUnderPressure,
    collusionExercised: byzantineCollusion.attackExercised,
    collusionIntegrity: byzantineCollusion.integrityPreserved
  };

  const report = {
    schema: 'truyn-adversarial-scale-gate-v1',
    startedAt,
    finishedAt: new Date().toISOString(),
    nodeCount,
    seed,
    topologyReadiness: cluster.topologyReadiness,
    baselinePublication,
    baseline,
    partition,
    churn,
    eclipse,
    sybilPressure,
    byzantineCollusion,
    finalNetwork,
    durationMs: Date.now() - started,
    gates,
    passed: Object.values(gates).every(Boolean),
    execution: execution()
  };
  report.claims = {
    hundredNodeRuntimeGate: nodeCount === 100 && finalNetwork.live === 100,
    hundredIndependentFailureDomains: nodeCount === 100 && report.execution.hostCount >= 100,
    byzantineConsensus: false,
    sybilResistance: false
  };
  stage('gate:complete', { passed: report.passed, durationMs: report.durationMs });
  writeReport(report);
  if (!report.passed) process.exitCode = 1;
} catch (error) {
  writeFatal('caughtException', error);
  process.exitCode = 1;
} finally {
  if (cluster) await cluster.stop().catch(() => {});
}