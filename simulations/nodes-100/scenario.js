#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AdversarialScaleCluster } from '../network-failure/adversarial-scale.js';

const scenario = process.env.TRUYN_SCALE_SCENARIO || 'baseline';
const nodeCount = Number.parseInt(process.env.TRUYN_SCALE_NODE_COUNT || '100', 10);
const seed = Number.parseInt(process.env.TRUYN_SCALE_SEED || '1414681945', 10);
const output = process.env.TRUYN_SCALE_REPORT ? resolve(process.env.TRUYN_SCALE_REPORT) : null;
const startedAt = new Date().toISOString();
const started = Date.now();
let currentStage = 'init';

const allowedScenarios = new Set(['baseline', 'partition', 'churn', 'eclipse', 'sybil-collusion']);
if (!allowedScenarios.has(scenario)) throw new Error(`unsupported TRUYN_SCALE_SCENARIO: ${scenario}`);
if (!Number.isInteger(nodeCount) || nodeCount < 6) throw new Error('TRUYN_SCALE_NODE_COUNT must be an integer >= 6');

function stage(name, detail = {}) {
  currentStage = name;
  console.log(`TRUYN_SCALE_STAGE ${JSON.stringify({ scenario, stage: name, elapsedMs: Date.now() - started, ...detail })}`);
}

function execution() {
  return {
    requestedScaleGate: 100,
    runtimeNodes: nodeCount,
    scenario,
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
    schema: 'truyn-adversarial-scale-scenario-error-v1',
    passed: false,
    scenario,
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

async function advertiseWithRetry(node, key, attempts = 3) {
  const failures = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const attemptStarted = performance.now();
    try {
      await node.advertise(key, { timeoutMs: 10_000 });
      return { attempts: attempt, publishMs: performance.now() - attemptStarted, failures };
    } catch (error) {
      failures.push({ attempt, code: error.code || null, message: error.message || String(error) });
      if (attempt === attempts) throw error;
      await node.refresh({ timeoutMs: 10_000 }).catch(() => null);
    }
  }
  throw new Error('unreachable scale publication state');
}

let cluster;
try {
  cluster = new AdversarialScaleCluster({ count: nodeCount, seed });
  stage('topology:start', { nodeCount });
  await cluster.start({ concurrency: 8 });
  const topology = cluster.snapshot();
  stage('topology:ready', {
    live: topology.live,
    libp2pIds: topology.uniqueLibp2pPeerIds,
    truynIds: topology.uniqueTruynNodeIds,
    connectedP50: topology.connectedPeers.p50,
    routingP50: topology.routingTableSize.p50,
    routingP95: topology.routingTableSize.p95,
    refreshSoftDeadlines: topology.telemetry.refreshSoftDeadlines
  });

  const identityGate = topology.live === nodeCount &&
    topology.uniqueLibp2pPeerIds === nodeCount &&
    topology.uniqueTruynNodeIds === nodeCount;

  let result;
  let gates;

  if (scenario === 'baseline') {
    const assignments = cluster.makeAssignments({ count: Math.min(16, nodeCount), prefix: 'scale100-baseline' });
    stage('baseline:publish:start', { providers: assignments.length });
    const publication = [];
    for (const assignment of assignments) {
      publication.push({
        providerIndex: assignment.providerIndex,
        key: assignment.key,
        ...await advertiseWithRetry(cluster.nodes[assignment.providerIndex], assignment.key)
      });
    }
    await cluster.refreshAll({ concurrency: 5, timeoutMs: 10_000 });
    stage('baseline:measure:start', { samples: Math.min(40, nodeCount) });
    const measurement = await cluster.measureRouting(assignments, { samples: Math.min(40, nodeCount), timeoutMs: 4_000 });
    result = { publication, measurement };
    gates = {
      uniqueNodeIdentities: identityGate,
      firstAttemptRouting: measurement.firstAttemptRoutingSuccessRatio >= 0.95,
      routing: measurement.routingSuccessRatio >= 0.95,
      integrity: measurement.endToEndIntegritySuccessRatio >= 0.95
    };
    stage('baseline:done', {
      firstAttemptRouting: measurement.firstAttemptRoutingSuccessRatio,
      routing: measurement.routingSuccessRatio,
      integrity: measurement.endToEndIntegritySuccessRatio,
      routingP95Ms: measurement.routingLatencyMs.p95,
      probeP95Ms: measurement.probeLatencyMs.p95
    });
  } else if (scenario === 'partition') {
    stage('partition:start');
    const measurement = await cluster.partitionScenario({ timeoutMs: 3_000 });
    result = measurement;
    gates = {
      uniqueNodeIdentities: identityGate,
      samePartitionRouting: measurement.samePartitionRoutingSucceeded,
      crossPartitionIsolation: measurement.crossPartitionRoutingBlocked,
      recovery: measurement.healed
    };
    stage('partition:done', measurement);
  } else if (scenario === 'churn') {
    stage('churn:start', { fraction: 0.2 });
    const measurement = await cluster.churnScenario({ fraction: 0.2, timeoutMs: 4_000 });
    result = measurement;
    gates = {
      uniqueNodeIdentitiesBeforeChurn: identityGate,
      recoveredAllStoppedNodes: measurement.recoveredNodes === measurement.stoppedNodes,
      transportIdentityRotated: measurement.peerIdentityRotations === measurement.stoppedNodes,
      routingDuringChurn: measurement.duringChurn.routingSuccessRatio >= 0.90,
      integrityDuringChurn: measurement.duringChurn.endToEndIntegritySuccessRatio >= 0.90
    };
    stage('churn:done', {
      stopped: measurement.stoppedNodes,
      recovered: measurement.recoveredNodes,
      peerRotations: measurement.peerIdentityRotations,
      routing: measurement.duringChurn.routingSuccessRatio,
      integrity: measurement.duringChurn.endToEndIntegritySuccessRatio,
      recoveryP95Ms: measurement.recoveryMs.p95
    });
  } else if (scenario === 'eclipse') {
    stage('eclipse:start');
    const measurement = await cluster.eclipseScenario({ timeoutMs: 3_000 });
    result = measurement;
    gates = {
      uniqueNodeIdentities: identityGate,
      attackExercised: measurement.attackExercised,
      forgedValueRejected: !measurement.integrityForged && measurement.attackerResponsesAccepted === 0,
      recovery: measurement.healed
    };
    stage('eclipse:done', {
      attackers: measurement.attackerCount,
      attackerResponsesObserved: measurement.attackerResponsesObserved,
      attackerResponsesAccepted: measurement.attackerResponsesAccepted,
      availabilityLost: measurement.eclipseAvailabilityLost,
      recoveryMs: measurement.recoveryMs
    });
  } else {
    stage('sybil:start');
    const sybil = await cluster.sybilPressureScenario({ timeoutMs: 4_000 });
    stage('sybil:done', {
      sybilIdentities: sybil.sybilIdentities,
      attackerProviderShare: sybil.attackerProviderShare,
      attackerResponsesObserved: sybil.attackerResponsesObserved,
      attackerResponsesAccepted: sybil.attackerResponsesAccepted,
      availability: sybil.routingAvailabilityUnderPressure
    });
    stage('collusion:start');
    const collusion = await cluster.byzantineCollusionScenario({ timeoutMs: 4_000 });
    result = { sybil, collusion };
    gates = {
      uniqueNodeIdentities: identityGate,
      sybilAttackExercised: sybil.attackExercised,
      sybilForgedResponsesRejected: sybil.integrityPreserved && sybil.attackerResponsesAccepted === 0,
      honestAvailabilityUnderSybilPressure: sybil.routingAvailabilityUnderPressure,
      collusionAttackExercised: collusion.attackExercised,
      colludingResponsesRejected: collusion.integrityPreserved && collusion.maliciousAccepted === 0
    };
    stage('collusion:done', {
      attackers: collusion.attackerCount,
      maliciousObserved: collusion.maliciousResponsesObserved,
      maliciousAccepted: collusion.maliciousAccepted,
      honestAccepted: collusion.honestAccepted
    });
  }

  const finalNetwork = cluster.snapshot();
  const report = {
    schema: 'truyn-adversarial-scale-scenario-v1',
    scenario,
    startedAt,
    finishedAt: new Date().toISOString(),
    nodeCount,
    seed,
    topology,
    topologyReadiness: cluster.topologyReadiness,
    result,
    finalNetwork,
    durationMs: Date.now() - started,
    gates,
    passed: Object.values(gates).every(Boolean),
    execution: execution()
  };
  report.claims = {
    hundredNodeRuntimeGate: nodeCount === 100 && identityGate,
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