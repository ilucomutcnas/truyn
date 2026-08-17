#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { connectQuicPeers } from '../../network/transport/quic-kademlia.js';
import { scaleValueDigest } from '../../network/testnet/scale-node.js';
import { AdversarialScaleCluster } from '../network-failure/adversarial-scale.js';
import { distribution, ratio } from '../network-failure/metrics.js';

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
    requestedScaleGate: nodeCount,
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

function linuxNetworkBytes() {
  try {
    const text = readFileSync('/proc/net/dev', 'utf8');
    const interfaces = {};
    for (const line of text.split('\n').slice(2)) {
      if (!line.includes(':')) continue;
      const [nameRaw, valuesRaw] = line.split(':');
      const values = valuesRaw.trim().split(/\s+/).map(Number);
      interfaces[nameRaw.trim()] = { rxBytes: values[0] || 0, txBytes: values[8] || 0 };
    }
    return interfaces;
  } catch {
    return null;
  }
}

function networkDelta(before, after) {
  if (!before || !after) return null;
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  const interfaces = {};
  let rxBytes = 0;
  let txBytes = 0;
  for (const name of names) {
    const rx = Math.max(0, Number(after[name]?.rxBytes || 0) - Number(before[name]?.rxBytes || 0));
    const tx = Math.max(0, Number(after[name]?.txBytes || 0) - Number(before[name]?.txBytes || 0));
    interfaces[name] = { rxBytes: rx, txBytes: tx };
    rxBytes += rx;
    txBytes += tx;
  }
  return { rxBytes, txBytes, totalBytes: rxBytes + txBytes, interfaces };
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
      thousandNodeRuntimeGate: false,
      independentFailureDomains: false,
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

async function advertiseWithRetry(node, key, { attempts = 3, timeoutMs = 30_000 } = {}) {
  const failures = [];
  const publicationStarted = performance.now();
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await node.advertise(key, { timeoutMs });
      return { attempts: attempt, publishMs: performance.now() - publicationStarted, failures };
    } catch (error) {
      failures.push({ attempt, code: error.code || null, message: error.message || String(error) });
      if (attempt === attempts) throw error;
      await node.refresh({ timeoutMs: Math.min(15_000, timeoutMs) }).catch(() => null);
      await sleep(200 * attempt);
    }
  }
  throw new Error('unreachable scale publication state');
}

async function bestEffortPublish(assignments, { attempts = 2, timeoutMs = 30_000, concurrency = 2 } = {}) {
  const outcomes = [];
  for (const batch of batches(assignments, concurrency)) {
    const result = await Promise.all(batch.map(async (assignment) => {
      try {
        const publication = await advertiseWithRetry(cluster.nodes[assignment.providerIndex], assignment.key, { attempts, timeoutMs });
        return { providerIndex: assignment.providerIndex, key: assignment.key, ok: true, ...publication };
      } catch (error) {
        return { providerIndex: assignment.providerIndex, key: assignment.key, ok: false, error: errorShape(error) };
      }
    }));
    outcomes.push(...result);
  }
  return outcomes;
}

function overlayOffsets(size) {
  if (size >= 500) return [1, -1, 7, -7, 31, -31, 127, -127];
  if (size >= 80) return [1, -1, 3, -3, 7, -7, 17, -17, 31, -31];
  return [1, -1, 2, -2, 3, -3, 5, -5];
}

async function densify(indices, { rounds = 1, refreshConcurrency = 24 } = {}) {
  const active = indices.filter((index) => cluster.nodes[index]?.node?.status === 'started');
  if (active.length < 2) return cluster.snapshot();
  const position = new Map(active.map((index, offset) => [index, offset]));
  const offsets = overlayOffsets(active.length);
  const plans = active.map((index) => {
    const at = position.get(index);
    const targets = [...new Set(offsets.map((offset) => active[(at + offset + active.length) % active.length]))]
      .filter((target) => target !== index);
    return { index, targets };
  });

  for (const batch of batches(plans, Math.min(24, Math.max(8, Math.floor(active.length / 4))))) {
    await Promise.all(batch.map(async ({ index, targets }) => {
      for (const target of targets) {
        const address = cluster.nodes[target].address;
        if (!address) continue;
        await connectQuicPeers(cluster.nodes[index].node, [address]).catch(() => {});
      }
    }));
  }
  await sleep(active.length >= 500 ? 800 : 400);
  for (let round = 0; round < rounds; round += 1) {
    await cluster.refreshAll({ indices: active, concurrency: refreshConcurrency, timeoutMs: active.length >= 500 ? 20_000 : 12_000 });
    await sleep(200);
  }
  return cluster.snapshot();
}

async function warmAssignments(assignments, { witnessCount = 10, rounds = 3, timeoutMs = 6_000 } = {}) {
  const evidence = [];
  for (const assignment of assignments) {
    const publication = await advertiseWithRetry(cluster.nodes[assignment.providerIndex], assignment.key);
    const candidates = cluster.liveIndices().filter((index) => index !== assignment.providerIndex);
    const witnesses = cluster.shuffled(candidates).slice(0, Math.min(witnessCount, candidates.length));
    let bestRatio = 0;
    const roundsEvidence = [];
    for (let round = 1; round <= rounds; round += 1) {
      let found = 0;
      const details = [];
      for (const batch of batches(witnesses, 4)) {
        const items = await Promise.all(batch.map(async (witnessIndex) => {
          const providers = await cluster.nodes[witnessIndex].findProviders(assignment.key, { timeoutMs, limit: 24 }).catch(() => []);
          const visible = providers.some((provider) => provider.id.toString() === cluster.nodes[assignment.providerIndex].peerIdString);
          return { witnessIndex, visible, providers: providers.length };
        }));
        details.push(...items);
      }
      found = details.filter((item) => item.visible).length;
      const visibilityRatio = ratio(found, witnesses.length) || 0;
      bestRatio = Math.max(bestRatio, visibilityRatio);
      roundsEvidence.push({ round, found, witnessCount: witnesses.length, visibilityRatio, details });
      if (visibilityRatio >= 0.9) break;
      const missing = details.filter((item) => !item.visible).map((item) => item.witnessIndex);
      await cluster.nodes[assignment.providerIndex].refresh({ timeoutMs: 12_000 }).catch(() => null);
      await cluster.refreshAll({ indices: missing, concurrency: 6, timeoutMs: 12_000 });
      await advertiseWithRetry(cluster.nodes[assignment.providerIndex], assignment.key, { attempts: 2 }).catch(() => null);
      await sleep(250 * round);
    }
    evidence.push({ providerIndex: assignment.providerIndex, key: assignment.key, publication, witnessCount: witnesses.length, bestVisibilityRatio: bestRatio, ready: bestRatio >= 0.9, rounds: roundsEvidence });
  }
  return { ready: evidence.every((item) => item.ready), assignments: evidence };
}

async function purgeCrossPartition(left, right) {
  const leftPeers = left.map((index) => cluster.nodes[index].peerId).filter(Boolean);
  const rightPeers = right.map((index) => cluster.nodes[index].peerId).filter(Boolean);
  await Promise.all([
    ...left.map((index) => cluster.nodes[index].purgeRoutingPeers(rightPeers)),
    ...right.map((index) => cluster.nodes[index].purgeRoutingPeers(leftPeers))
  ]);
}

async function connectAcross(left, right, fanout = 3) {
  const offsets = [0, 7, 19, 37].slice(0, Math.min(fanout, 4));
  for (const batch of batches(left, 16)) {
    await Promise.all(batch.map(async (leftIndex, localOffset) => {
      const at = left.indexOf(leftIndex);
      for (const offset of offsets) {
        const rightIndex = right[(at + offset + localOffset) % right.length];
        const address = cluster.nodes[rightIndex]?.address;
        if (address) await connectQuicPeers(cluster.nodes[leftIndex].node, [address]).catch(() => {});
      }
    }));
  }
}

async function customPartitionScenario() {
  const midpoint = Math.floor(nodeCount / 2);
  const left = Array.from({ length: midpoint }, (_, index) => index);
  const right = Array.from({ length: nodeCount - midpoint }, (_, index) => index + midpoint);

  await cluster.setPartition(left, right);
  await purgeCrossPartition(left, right);
  const leftTopology = await densify(left, { rounds: 1, refreshConcurrency: 18 });
  const rightTopology = await densify(right, { rounds: 1, refreshConcurrency: 18 });
  stage('partition:isolated', {
    leftRoutingP50: leftTopology.routingTableSize.p50,
    rightRoutingP50: rightTopology.routingTableSize.p50
  });

  const leftAssignment = { key: `partition:left:${seed}`, providerIndex: left[1], value: { side: 'left', seed } };
  const rightAssignment = { key: `partition:right:${seed}`, providerIndex: right[1], value: { side: 'right', seed } };
  const leftPublication = await advertiseWithRetry(cluster.nodes[leftAssignment.providerIndex], leftAssignment.key);
  const rightPublication = await advertiseWithRetry(cluster.nodes[rightAssignment.providerIndex], rightAssignment.key);

  const sameSide = await cluster.nodes[left[0]].findProviders(leftAssignment.key, { timeoutMs: 6_000, limit: 20 }).catch(() => []);
  const crossSide = await cluster.nodes[left[0]].findProviders(rightAssignment.key, { timeoutMs: 6_000, limit: 20 }).catch(() => []);
  const sameProvider = sameSide.find((provider) => provider.id.toString() === cluster.nodes[leftAssignment.providerIndex].peerIdString);
  const crossProvider = crossSide.find((provider) => provider.id.toString() === cluster.nodes[rightAssignment.providerIndex].peerIdString);
  const sameProbe = sameProvider ? await cluster.nodes[left[0]].probe(sameProvider.id, leftAssignment.value, { timeoutMs: 4_000 }) : null;

  const recoveryStarted = performance.now();
  for (const node of cluster.nodes) node.gater.heal();
  await connectAcross(left, right, nodeCount >= 500 ? 2 : 4);
  await densify(cluster.liveIndices(), { rounds: 2, refreshConcurrency: nodeCount >= 500 ? 32 : 24 });
  const recoveryPublication = await advertiseWithRetry(cluster.nodes[rightAssignment.providerIndex], rightAssignment.key);
  let recovered = false;
  let recoveryAttempts = 0;
  while (!recovered && performance.now() - recoveryStarted < 45_000) {
    recoveryAttempts += 1;
    const providers = await cluster.nodes[left[0]].findProviders(rightAssignment.key, { timeoutMs: 6_000, limit: 24 }).catch(() => []);
    const remote = providers.find((provider) => provider.id.toString() === cluster.nodes[rightAssignment.providerIndex].peerIdString);
    if (remote) recovered = (await cluster.nodes[left[0]].probe(remote.id, rightAssignment.value, { timeoutMs: 4_000 })).ok;
    if (!recovered) {
      await Promise.all([
        cluster.nodes[left[0]].refresh({ timeoutMs: 15_000 }).catch(() => null),
        cluster.nodes[rightAssignment.providerIndex].refresh({ timeoutMs: 15_000 }).catch(() => null)
      ]);
      await advertiseWithRetry(cluster.nodes[rightAssignment.providerIndex], rightAssignment.key, { attempts: 1 }).catch(() => null);
      await sleep(250);
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
  const oldPeerIds = stopped.map((index) => cluster.nodes[index].peerId).filter(Boolean);
  await Promise.all(stopped.map((index) => cluster.nodes[index].stop()));

  const survivors = cluster.liveIndices();
  await Promise.all(survivors.map((index) => cluster.nodes[index].purgeRoutingPeers(oldPeerIds)));
  const survivorTopology = await densify(survivors, { rounds: 1, refreshConcurrency: nodeCount >= 500 ? 32 : 24 });
  stage('churn:survivors-ready', {
    survivors: survivors.length,
    routingP50: survivorTopology.routingTableSize.p50,
    routingP95: survivorTopology.routingTableSize.p95
  });

  const assignments = cluster.makeAssignments({ count: Math.min(nodeCount >= 500 ? 20 : 12, survivors.length), prefix: 'churn-survivor', candidateIndices: survivors });
  const warmup = await warmAssignments(assignments, { witnessCount: nodeCount >= 500 ? 4 : 8, rounds: 2, timeoutMs: nodeCount >= 500 ? 8_000 : 6_000 });
  const duringChurn = await cluster.measureRouting(assignments, { samples: Math.min(nodeCount >= 500 ? 60 : 24, survivors.length), timeoutMs: nodeCount >= 500 ? 8_000 : 6_000 });

  const bootstrap = survivors.slice(0, 6).map((index) => cluster.nodes[index].address).filter(Boolean);
  const recoveryDurations = [];
  const peerRotations = [];
  for (const batch of batches(stopped, nodeCount >= 500 ? 12 : 6)) {
    await Promise.all(batch.map(async (index) => {
      const recoveryStarted = performance.now();
      await cluster.nodes[index].start({ bootstrap: bootstrap.slice(0, 4) });
      recoveryDurations.push(performance.now() - recoveryStarted);
      peerRotations.push(oldPeers.get(index) !== cluster.nodes[index].peerIdString);
    }));
  }
  const healedTopology = await densify(cluster.liveIndices(), { rounds: 2, refreshConcurrency: nodeCount >= 500 ? 32 : 24 });

  return {
    stoppedNodes: stopped.length,
    recoveredNodes: stopped.length,
    peerIdentityRotations: peerRotations.filter(Boolean).length,
    providerWarmupReady: warmup.ready,
    duringChurn,
    recoveryMs: distribution(recoveryDurations),
    healedRoutingTable: healedTopology.routingTableSize
  };
}

async function customEclipseScenario() {
  const victimIndex = 0;
  const honestProviderIndex = 1;
  const attackerCount = Math.min(nodeCount >= 500 ? 12 : 6, Math.max(3, Math.floor(nodeCount / 12)));
  const attackers = cluster.liveIndices().filter((index) => index > 1).slice(-attackerCount);
  const honest = cluster.liveIndices().filter((index) => index !== victimIndex && !attackers.includes(index));
  const key = `eclipse:${seed}`;
  const expectedValue = { committed: 'eclipse-target', seed };
  const forgedValue = { committed: 'eclipse-forgery', seed };
  for (const index of attackers) cluster.nodes[index].setFault({ mode: 'colluding', value: forgedValue });

  const honestAssignment = { key, providerIndex: honestProviderIndex, value: expectedValue };
  await advertiseWithRetry(cluster.nodes[honestProviderIndex], key);
  const attackerAssignments = attackers.map((providerIndex) => ({ key, providerIndex, value: forgedValue }));
  const attackerPublication = await bestEffortPublish(attackerAssignments, { attempts: 2, timeoutMs: 30_000, concurrency: 2 });
  const publishedAttackers = attackerPublication.filter((item) => item.ok).map((item) => item.providerIndex);

  const victim = cluster.nodes[victimIndex];
  const honestPeers = honest.map((index) => cluster.nodes[index].peerId).filter(Boolean);
  victim.gater.block(honestPeers);
  for (const index of honest) cluster.nodes[index].gater.block([victim.peerId]);
  await victim.purgeRoutingPeers(honestPeers);
  await Promise.all(victim.node.getPeers().map((peer) => victim.node.hangUp(peer).catch(() => {})));
  for (const index of publishedAttackers) {
    const address = cluster.nodes[index].address;
    if (address) await connectQuicPeers(victim.node, [address]).catch(() => {});
  }
  await victim.refresh({ timeoutMs: 12_000 }).catch(() => null);
  await bestEffortPublish(attackerAssignments.filter((item) => publishedAttackers.includes(item.providerIndex)), { attempts: 1, timeoutMs: 30_000, concurrency: 2 });
  await sleep(300);

  const providers = await victim.findProviders(key, { timeoutMs: 8_000, limit: attackerCount + 8 }).catch(() => []);
  const attackerPeerIds = new Set(publishedAttackers.map((index) => cluster.nodes[index].peerIdString));
  let attackerResponsesObserved = 0;
  let attackerResponsesAccepted = 0;
  let honestResponsesAccepted = 0;
  const verdicts = [];
  for (const provider of providers) {
    const malicious = attackerPeerIds.has(provider.id.toString());
    const probe = await victim.probe(provider.id, expectedValue, { timeoutMs: 4_000, expectedDigest: scaleValueDigest(expectedValue) });
    if (malicious) {
      attackerResponsesObserved += 1;
      if (probe.ok) attackerResponsesAccepted += 1;
    } else if (probe.ok) honestResponsesAccepted += 1;
    verdicts.push({ peerId: provider.id.toString(), malicious, accepted: probe.ok, probe });
  }
  if (attackerResponsesObserved === 0) {
    for (const index of publishedAttackers.slice(0, 3)) {
      const probe = await victim.probe(cluster.nodes[index].peerId, expectedValue, { timeoutMs: 4_000, expectedDigest: scaleValueDigest(expectedValue) });
      attackerResponsesObserved += 1;
      if (probe.ok) attackerResponsesAccepted += 1;
      verdicts.push({ peerId: cluster.nodes[index].peerIdString, malicious: true, directEclipsePath: true, accepted: probe.ok, probe });
    }
  }

  const recoveryStarted = performance.now();
  for (const node of cluster.nodes) node.gater.heal();
  await connectAcross([victimIndex], honest.slice(0, Math.min(24, honest.length)), Math.min(4, honest.length));
  await densify(cluster.liveIndices(), { rounds: 2, refreshConcurrency: nodeCount >= 500 ? 32 : 24 });
  await advertiseWithRetry(cluster.nodes[honestProviderIndex], key);
  let recovered = false;
  while (!recovered && performance.now() - recoveryStarted < 45_000) {
    const recoveredProviders = await victim.findProviders(key, { timeoutMs: 8_000, limit: attackerCount + 12 }).catch(() => []);
    const honestProvider = recoveredProviders.find((provider) => provider.id.toString() === cluster.nodes[honestProviderIndex].peerIdString);
    if (honestProvider) recovered = (await victim.probe(honestProvider.id, expectedValue, { timeoutMs: 4_000 })).ok;
    if (!recovered) {
      await victim.refresh({ timeoutMs: 15_000 }).catch(() => null);
      await advertiseWithRetry(cluster.nodes[honestProviderIndex], key, { attempts: 1 }).catch(() => null);
      await sleep(250);
    }
  }
  for (const index of attackers) cluster.nodes[index].setFault({ mode: 'honest' });

  return {
    attackerCount: attackers.length,
    publishedAttackers: publishedAttackers.length,
    providerResponses: providers.length,
    attackerResponsesObserved,
    attackerResponsesAccepted,
    honestResponsesAccepted,
    attackExercised: attackerResponsesObserved > 0,
    integrityForged: attackerResponsesAccepted > 0,
    eclipseAvailabilityLost: honestResponsesAccepted === 0,
    healed: recovered,
    recoveryMs: performance.now() - recoveryStarted,
    attackerPublication,
    verdicts
  };
}

async function probeProviderSet(requesterIndex, providers, expectedValue, attackerPeers, timeoutMs = 5_000) {
  const verdicts = [];
  for (const provider of providers) {
    const malicious = attackerPeers.has(provider.id.toString());
    const probe = await cluster.nodes[requesterIndex].probe(provider.id, expectedValue, { timeoutMs, expectedDigest: scaleValueDigest(expectedValue) });
    verdicts.push({ requesterIndex, peerId: provider.id.toString(), malicious, accepted: probe.ok, probe });
  }
  return verdicts;
}

async function customSybilCollusionScenario() {
  const honestProviderIndex = 1;
  const sybilCount = Math.min(nodeCount >= 500 ? 40 : 15, Math.max(5, Math.floor(nodeCount * 0.15)));
  const attackers = cluster.liveIndices().filter((index) => index > 1).slice(-sybilCount);
  const key = `sybil-pressure:${seed}`;
  const expectedValue = { committed: 'honest-value', seed };
  const forgedValue = { committed: 'sybil-value', seed };
  for (const index of attackers) cluster.nodes[index].setFault({ mode: 'colluding', value: forgedValue });

  await advertiseWithRetry(cluster.nodes[honestProviderIndex], key);
  const attackerAssignments = attackers.map((providerIndex) => ({ key, providerIndex, value: forgedValue }));
  const attackerPublication = await bestEffortPublish(attackerAssignments, { attempts: 2, timeoutMs: 30_000, concurrency: 2 });
  const publishedAttackers = attackerPublication.filter((item) => item.ok).map((item) => item.providerIndex);
  const attackerPeers = new Set(publishedAttackers.map((index) => cluster.nodes[index].peerIdString));

  const requesters = cluster.liveIndices().filter((index) => index !== honestProviderIndex && !attackers.includes(index)).slice(0, nodeCount >= 500 ? 12 : 8);
  const sybilVerdicts = [];
  for (const requesterIndex of requesters) {
    await cluster.nodes[requesterIndex].refresh({ timeoutMs: 12_000 }).catch(() => null);
    const providers = await cluster.nodes[requesterIndex].findProviders(key, { timeoutMs: nodeCount >= 500 ? 10_000 : 8_000, limit: sybilCount + 8 }).catch(() => []);
    sybilVerdicts.push(...await probeProviderSet(requesterIndex, providers, expectedValue, attackerPeers));
  }
  const attackerObserved = sybilVerdicts.filter((item) => item.malicious).length;
  const attackerAccepted = sybilVerdicts.filter((item) => item.malicious && item.accepted).length;
  const honestAccepted = sybilVerdicts.filter((item) => !item.malicious && item.accepted).length;

  for (const index of attackers) cluster.nodes[index].setFault({ mode: 'honest' });

  const collusionAttackers = attackers.slice(0, Math.min(6, attackers.length));
  const collusionKey = `collusion:${seed}`;
  const collusionExpected = { immutable: 'truyn-known-good', seed };
  const collusionForged = { immutable: 'coordinated-forgery', seed };
  for (const index of collusionAttackers) cluster.nodes[index].setFault({ mode: 'colluding', value: collusionForged });
  await advertiseWithRetry(cluster.nodes[honestProviderIndex], collusionKey);
  const collusionPublication = await bestEffortPublish(collusionAttackers.map((providerIndex) => ({ key: collusionKey, providerIndex, value: collusionForged })), { attempts: 2, timeoutMs: 30_000, concurrency: 2 });
  const collusionPublished = collusionPublication.filter((item) => item.ok).map((item) => item.providerIndex);
  const collusionPeers = new Set(collusionPublished.map((index) => cluster.nodes[index].peerIdString));
  const collusionVerdicts = [];
  for (const requesterIndex of requesters.slice(0, Math.min(4, requesters.length))) {
    const providers = await cluster.nodes[requesterIndex].findProviders(collusionKey, { timeoutMs: 8_000, limit: 16 }).catch(() => []);
    collusionVerdicts.push(...await probeProviderSet(requesterIndex, providers, collusionExpected, collusionPeers));
  }
  const maliciousObserved = collusionVerdicts.filter((item) => item.malicious).length;
  const maliciousAccepted = collusionVerdicts.filter((item) => item.malicious && item.accepted).length;
  const collusionHonestAccepted = collusionVerdicts.filter((item) => !item.malicious && item.accepted).length;
  for (const index of collusionAttackers) cluster.nodes[index].setFault({ mode: 'honest' });

  return {
    sybil: {
      sybilIdentities: attackers.length,
      publishedSybilIdentities: publishedAttackers.length,
      requesterSamples: requesters.length,
      attackerResponsesObserved: attackerObserved,
      attackerResponsesAccepted: attackerAccepted,
      acceptedValidResponses: honestAccepted,
      attackExercised: attackerObserved > 0,
      integrityPreserved: attackerObserved > 0 && attackerAccepted === 0,
      routingAvailabilityUnderPressure: honestAccepted > 0,
      attackerPublication,
      verdicts: sybilVerdicts
    },
    collusion: {
      attackerCount: collusionAttackers.length,
      publishedAttackers: collusionPublished.length,
      maliciousResponsesObserved: maliciousObserved,
      maliciousAccepted,
      honestAccepted: collusionHonestAccepted,
      attackExercised: maliciousObserved > 0,
      integrityPreserved: maliciousObserved > 0 && maliciousAccepted === 0,
      publication: collusionPublication,
      verdicts: collusionVerdicts
    }
  };
}

let cluster;
const networkBefore = linuxNetworkBytes();
try {
  const kBucketSize = Math.max(20, Math.min(Number.parseInt(process.env.TRUYN_SCALE_K_BUCKET_SIZE || '32', 10), Math.max(20, nodeCount - 1)));
  cluster = new AdversarialScaleCluster({ count: nodeCount, seed, kBucketSize });
  stage('topology:start', { nodeCount, kBucketSize });
  await cluster.start({ concurrency: nodeCount >= 500 ? 20 : 10 });
  const topologyAfterDensify = await densify(cluster.liveIndices(), { rounds: 2, refreshConcurrency: nodeCount >= 500 ? 32 : 24 });
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

  const identityGate = topology.live === nodeCount && topology.uniqueLibp2pPeerIds === nodeCount && topology.uniqueTruynNodeIds === nodeCount;
  let result;
  let gates;

  if (scenario === 'baseline') {
    const assignments = cluster.makeAssignments({ count: Math.min(nodeCount >= 500 ? 24 : 16, nodeCount), prefix: `scale${nodeCount}-baseline` });
    stage('baseline:warmup:start', { providers: assignments.length });
    const warmup = await warmAssignments(assignments, { witnessCount: nodeCount >= 500 ? 6 : 10, rounds: 3, timeoutMs: nodeCount >= 500 ? 10_000 : 6_000 });
    stage('baseline:measure:start', { samples: Math.min(nodeCount >= 500 ? 100 : 40, nodeCount), warmupReady: warmup.ready });
    const measurement = await cluster.measureRouting(assignments, { samples: Math.min(nodeCount >= 500 ? 100 : 40, nodeCount), timeoutMs: nodeCount >= 500 ? 10_000 : 6_000 });
    result = { warmup, measurement };
    gates = {
      uniqueNodeIdentities: identityGate,
      providerVisibilityWarmup: warmup.ready,
      firstAttemptRouting: measurement.firstAttemptRoutingSuccessRatio >= 0.95,
      routing: measurement.routingSuccessRatio >= 0.95,
      integrity: measurement.endToEndIntegritySuccessRatio >= 0.95
    };
    stage('baseline:done', {
      warmupReady: warmup.ready,
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
    stage('partition:done', { samePartitionRouting: measurement.samePartitionRoutingSucceeded, samePartitionIntegrity: measurement.samePartitionIntegritySucceeded, crossBlocked: measurement.crossPartitionRoutingBlocked, healed: measurement.healed, recoveryMs: measurement.recoveryMs });
  } else if (scenario === 'churn') {
    stage('churn:start', { fraction: 0.2 });
    const measurement = await customChurnScenario();
    result = measurement;
    gates = {
      uniqueNodeIdentitiesBeforeChurn: identityGate,
      recoveredAllStoppedNodes: measurement.recoveredNodes === measurement.stoppedNodes,
      transportIdentityRotated: measurement.peerIdentityRotations === measurement.stoppedNodes,
      providerVisibilityDuringChurn: measurement.providerWarmupReady,
      routingDuringChurn: measurement.duringChurn.routingSuccessRatio >= 0.90,
      integrityDuringChurn: measurement.duringChurn.endToEndIntegritySuccessRatio >= 0.90
    };
    stage('churn:done', { stopped: measurement.stoppedNodes, recovered: measurement.recoveredNodes, peerRotations: measurement.peerIdentityRotations, routing: measurement.duringChurn.routingSuccessRatio, integrity: measurement.duringChurn.endToEndIntegritySuccessRatio, recoveryP95Ms: measurement.recoveryMs.p95 });
  } else if (scenario === 'eclipse') {
    stage('eclipse:start');
    const measurement = await customEclipseScenario();
    result = measurement;
    gates = {
      uniqueNodeIdentities: identityGate,
      attackersPublished: measurement.publishedAttackers > 0,
      attackExercised: measurement.attackExercised,
      forgedValueRejected: !measurement.integrityForged && measurement.attackerResponsesAccepted === 0,
      eclipseIsolation: measurement.eclipseAvailabilityLost,
      recovery: measurement.healed
    };
    stage('eclipse:done', { attackers: measurement.attackerCount, publishedAttackers: measurement.publishedAttackers, attackerResponsesObserved: measurement.attackerResponsesObserved, attackerResponsesAccepted: measurement.attackerResponsesAccepted, availabilityLost: measurement.eclipseAvailabilityLost, recoveryMs: measurement.recoveryMs });
  } else {
    stage('sybil:start');
    const measurement = await customSybilCollusionScenario();
    result = measurement;
    gates = {
      uniqueNodeIdentities: identityGate,
      sybilAttackPublished: measurement.sybil.publishedSybilIdentities >= Math.min(5, measurement.sybil.sybilIdentities),
      sybilAttackExercised: measurement.sybil.attackExercised,
      sybilForgedResponsesRejected: measurement.sybil.integrityPreserved && measurement.sybil.attackerResponsesAccepted === 0,
      honestAvailabilityUnderSybilPressure: measurement.sybil.routingAvailabilityUnderPressure,
      collusionAttackPublished: measurement.collusion.publishedAttackers > 0,
      collusionAttackExercised: measurement.collusion.attackExercised,
      colludingResponsesRejected: measurement.collusion.integrityPreserved && measurement.collusion.maliciousAccepted === 0
    };
    stage('sybil:done', { sybilIdentities: measurement.sybil.sybilIdentities, publishedSybilIdentities: measurement.sybil.publishedSybilIdentities, attackerResponsesObserved: measurement.sybil.attackerResponsesObserved, attackerResponsesAccepted: measurement.sybil.attackerResponsesAccepted, availability: measurement.sybil.routingAvailabilityUnderPressure });
    stage('collusion:done', { attackers: measurement.collusion.attackerCount, publishedAttackers: measurement.collusion.publishedAttackers, maliciousObserved: measurement.collusion.maliciousResponsesObserved, maliciousAccepted: measurement.collusion.maliciousAccepted, honestAccepted: measurement.collusion.honestAccepted });
  }

  const finalNetwork = cluster.snapshot();
  const perNodeApplicationBytes = finalNetwork.nodes.map((node) => Number(node.telemetry.applicationBytesSent || 0) + Number(node.telemetry.applicationBytesReceived || 0));
  const report = {
    schema: 'truyn-adversarial-scale-scenario-v2',
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
    bandwidth: {
      hostNetworkBytes: networkDelta(networkBefore, linuxNetworkBytes()),
      applicationBytesPerNode: distribution(perNodeApplicationBytes),
      scope: 'host-interface counters plus TRUYN probe application bytes; not per-peer QUIC wire attribution'
    },
    gates,
    passed: Object.values(gates).every(Boolean),
    execution: execution()
  };
  report.claims = {
    hundredNodeRuntimeGate: nodeCount === 100 && identityGate,
    thousandNodeRuntimeGate: nodeCount === 1000 && identityGate,
    independentFailureDomains: report.execution.hostCount >= nodeCount,
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