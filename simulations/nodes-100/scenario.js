#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { connectQuicPeers } from '../../network/transport/quic-kademlia.js';
import { AdversarialScaleCluster } from '../network-failure/adversarial-scale.js';
import { distribution } from '../network-failure/metrics.js';

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

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function batches(items, size) {
  const outputBatches = [];
  for (let i = 0; i < items.length; i += size) outputBatches.push(items.slice(i, i + size));
  return outputBatches;
}

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
      await node.advertise(key, { timeoutMs: 25_000 });
      return { attempts: attempt, publishMs: performance.now() - attemptStarted, failures };
    } catch (error) {
      failures.push({ attempt, code: error.code || null, message: error.message || String(error) });
      if (attempt === attempts) throw error;
      await node.refresh({ timeoutMs: 12_000 }).catch(() => null);
      await sleep(150 * attempt);
    }
  }
  throw new Error('unreachable scale publication state');
}

async function densify(indices, { rounds = 1, refreshConcurrency = 20 } = {}) {
  const active = indices.filter((index) => cluster.nodes[index]?.node?.status === 'started');
  if (active.length < 2) return cluster.snapshot();
  const position = new Map(active.map((index, offset) => [index, offset]));
  const offsets = active.length >= 20 ? [1, -1, 5, -5, 13, -13] : [1, -1, 2, -2, 3, -3];
  const plans = active.map((index) => {
    const at = position.get(index);
    const targets = [...new Set(offsets.map((offset) => active[(at + offset + active.length) % active.length]))]
      .filter((target) => target !== index);
    return { index, targets };
  });

  for (const batch of batches(plans, 12)) {
    await Promise.all(batch.map(async ({ index, targets }) => {
      for (const target of targets) {
        await connectQuicPeers(cluster.nodes[index].node, [cluster.nodes[target].address]).catch(() => {});
      }
    }));
  }
  await sleep(500);
  for (let round = 0; round < rounds; round += 1) {
    await cluster.refreshAll({ indices: active, concurrency: refreshConcurrency, timeoutMs: 12_000 });
    await sleep(150);
  }
  return cluster.snapshot();
}

async function customPartitionScenario() {
  const midpoint = Math.floor(nodeCount / 2);
  const left = Array.from({ length: midpoint }, (_, index) => index);
  const right = Array.from({ length: nodeCount - midpoint }, (_, index) => index + midpoint);

  await cluster.setPartition(left, right);
  const leftTopology = await densify(left, { rounds: 1, refreshConcurrency: 16 });
  const rightTopology = await densify(right, { rounds: 1, refreshConcurrency: 16 });
  stage('partition:isolated', {
    leftRoutingP50: leftTopology.routingTableSize.p50,
    rightRoutingP50: rightTopology.routingTableSize.p50
  });

  const leftAssignment = { key: `partition:left:${seed}`, providerIndex: left[1], value: { side: 'left', seed } };
  const rightAssignment = { key: `partition:right:${seed}`, providerIndex: right[1], value: { side: 'right', seed } };
  const leftPublication = await advertiseWithRetry(cluster.nodes[leftAssignment.providerIndex], leftAssignment.key);
  const rightPublication = await advertiseWithRetry(cluster.nodes[rightAssignment.providerIndex], rightAssignment.key);

  const sameSide = await cluster.nodes[left[0]].findProviders(leftAssignment.key, { timeoutMs: 4_000, limit: 20 }).catch(() => []);
  const crossSide = await cluster.nodes[left[0]].findProviders(rightAssignment.key, { timeoutMs: 4_000, limit: 20 }).catch(() => []);
  const sameProvider = sameSide.find((provider) => provider.id.toString() === cluster.nodes[leftAssignment.providerIndex].peerIdString);
  const crossProvider = crossSide.find((provider) => provider.id.toString() === cluster.nodes[rightAssignment.providerIndex].peerIdString);
  const sameProbe = sameProvider ? await cluster.nodes[left[0]].probe(sameProvider.id, leftAssignment.value, { timeoutMs: 3_000 }) : null;

  const recoveryStarted = performance.now();
  for (const node of cluster.nodes) node.gater.heal();
  await densify(cluster.liveIndices(), { rounds: 2, refreshConcurrency: 20 });
  const recoveryPublication = await advertiseWithRetry(cluster.nodes[rightAssignment.providerIndex], rightAssignment.key);
  let recovered = false;
  let recoveryAttempts = 0;
  while (!recovered && performance.now() - recoveryStarted < 30_000) {
    recoveryAttempts += 1;
    const providers = await cluster.nodes[left[0]].findProviders(rightAssignment.key, { timeoutMs: 4_000, limit: 20 }).catch(() => []);
    const remote = providers.find((provider) => provider.id.toString() === cluster.nodes[rightAssignment.providerIndex].peerIdString);
    if (remote) recovered = (await cluster.nodes[left[0]].probe(remote.id, rightAssignment.value, { timeoutMs: 3_000 })).ok;
    if (!recovered) {
      await cluster.nodes[left[0]].refresh({ timeoutMs: 12_000 }).catch(() => null);
      await sleep(150);
    }
  }

  return {
    leftSize: left.length,
    rightSize: right.length,
    samePartitionRoutingSucceeded: Boolean(sameProvider),
    samePartitionIntegritySucceeded: Boolean(sameProbe?.ok),
    crossPartitionRoutingBlocked: !crossProvider,
    healed: recovered,
    recoveryMs: performance.now() - recoveryStarted,
    recoveryAttempts,
    leftPublication,
    rightPublication,
    recoveryPublication
  };
}

async function customChurnScenario() {
  const candidates = cluster.shuffled(cluster.liveIndices().filter((index) => index !== 0));
  const stopped = candidates.slice(0, Math.max(1, Math.floor(nodeCount * 0.2)));
  const oldPeers = new Map(stopped.map((index) => [index, cluster.nodes[index].peerIdString]));
  await Promise.all(stopped.map((index) => cluster.nodes[index].stop()));

  const survivors = cluster.liveIndices();
  const survivorTopology = await densify(survivors, { rounds: 1, refreshConcurrency: 20 });
  stage('churn:survivors-ready', {
    survivors: survivors.length,
    routingP50: survivorTopology.routingTableSize.p50,
    routingP95: survivorTopology.routingTableSize.p95
  });

  const assignments = cluster.makeAssignments({ count: Math.min(10, survivors.length), prefix: 'churn-survivor', candidateIndices: survivors });
  const publication = [];
  for (const assignment of assignments) {
    publication.push({ providerIndex: assignment.providerIndex, ...await advertiseWithRetry(cluster.nodes[assignment.providerIndex], assignment.key) });
  }
  const duringChurn = await cluster.measureRouting(assignments, { samples: Math.min(10, assignments.length), timeoutMs: 4_000 });

  const bootstrap = survivors.slice(0, 4).map((index) => cluster.nodes[index].address);
  const recoveryDurations = [];
  const peerRotations = [];
  for (const batch of batches(stopped, 5)) {
    await Promise.all(batch.map(async (index) => {
      const recoveryStarted = performance.now();
      await cluster.nodes[index].start({ bootstrap: bootstrap.slice(0, 3) });
      recoveryDurations.push(performance.now() - recoveryStarted);
      peerRotations.push(oldPeers.get(index) !== cluster.nodes[index].peerIdString);
    }));
  }
  const healedTopology = await densify(cluster.liveIndices(), { rounds: 2, refreshConcurrency: 20 });

  return {
    stoppedNodes: stopped.length,
    recoveredNodes: stopped.length,
    peerIdentityRotations: peerRotations.filter(Boolean).length,
    duringChurn,
    recoveryMs: distribution(recoveryDurations),
    publication,
    healedRoutingTable: healedTopology.routingTableSize
  };
}

let cluster;
try {
  cluster = new AdversarialScaleCluster({ count: nodeCount, seed });
  stage('topology:start', { nodeCount });
  await cluster.start({ concurrency: 8 });
  const topologyAfterDensify = await densify(cluster.liveIndices(), { rounds: 1, refreshConcurrency: 20 });
  const topology = cluster.snapshot();
  stage('topology:ready', {
    live: topology.live,
    libp2pIds: topology.uniqueLibp2pPeerIds,
    truynIds: topology.uniqueTruynNodeIds,
    connectedP50: topology.connectedPeers.p50,
    routingP50: topology.routingTableSize.p50,
    routingP95: topology.routingTableSize.p95,
    refreshSoftDeadlines: topology.telemetry.refreshSoftDeadlines,
    advertisementSoftDeadlines: topology.telemetry.advertisementSoftDeadlines
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
    await cluster.refreshAll({ concurrency: 20, timeoutMs: 12_000 });
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
    const measurement = await customPartitionScenario();
    result = measurement;
    gates = {
      uniqueNodeIdentities: identityGate,
      samePartitionRouting: measurement.samePartitionRoutingSucceeded,
      samePartitionIntegrity: measurement.samePartitionIntegritySucceeded,
      crossPartitionIsolation: measurement.crossPartitionRoutingBlocked,
      recovery: measurement.healed
    };
    stage('partition:done', {
      samePartitionRouting: measurement.samePartitionRoutingSucceeded,
      samePartitionIntegrity: measurement.samePartitionIntegritySucceeded,
      crossBlocked: measurement.crossPartitionRoutingBlocked,
      healed: measurement.healed,
      recoveryMs: measurement.recoveryMs
    });
  } else if (scenario === 'churn') {
    stage('churn:start', { fraction: 0.2 });
    const measurement = await customChurnScenario();
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
    const measurement = await cluster.eclipseScenario({ timeoutMs: 4_000 });
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
    const sybil = await cluster.sybilPressureScenario({ timeoutMs: 5_000 });
    stage('sybil:done', {
      sybilIdentities: sybil.sybilIdentities,
      attackerProviderShare: sybil.attackerProviderShare,
      attackerResponsesObserved: sybil.attackerResponsesObserved,
      attackerResponsesAccepted: sybil.attackerResponsesAccepted,
      availability: sybil.routingAvailabilityUnderPressure
    });
    stage('collusion:start');
    const collusion = await cluster.byzantineCollusionScenario({ timeoutMs: 5_000 });
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
    topologyAfterDensify,
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