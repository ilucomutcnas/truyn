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

const allowedScenarios = new Set(['baseline', 'partition', 'churn', 'eclipse', 'byzantine', 'sybil-collusion']);
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

function overlayOffsets(size) {
  if (size >= 500) return [1, -1, 7, -7, 31, -31, 127, -127];
  if (size >= 80) return [1, -1, 3, -3, 7, -7, 17, -17, 31, -31];
  return [1, -1, 2, -2, 3, -3, 5, -5];
}

async function densify(indices, { rounds = 1, refreshConcurrency = 24 } = {}) {
  const active = indices.filter((index) => cluster.nodes[index]?.node?.status === 'started');
  if (active.length < 2) return subsetSnapshot(active);
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
  return subsetSnapshot(active);
}

function subsetSnapshot(indices) {
  const snapshots = indices.map((index) => cluster.nodes[index].snapshot()).filter((item) => item.status === 'started');
  return {
    nodes: snapshots.length,
    connectedPeers: distribution(snapshots.map((item) => item.connectedPeers)),
    routingTableSize: distribution(snapshots.map((item) => item.routingTableSize)),
    refreshSoftDeadlines: snapshots.reduce((sum, item) => sum + Number(item.telemetry.refreshSoftDeadlines || 0), 0),
    advertisementSoftDeadlines: snapshots.reduce((sum, item) => sum + Number(item.telemetry.advertisementSoftDeadlines || 0), 0)
  };
}

async function warmOneAssignment(assignment, { witnessPool = null, witnessCount = 10, rounds = 3, timeoutMs = 6_000 } = {}) {
  const publication = await advertiseWithRetry(cluster.nodes[assignment.providerIndex], assignment.key);
  const pool = (witnessPool || cluster.liveIndices()).filter((index) => index !== assignment.providerIndex && cluster.nodes[index]?.node?.status === 'started');
  const witnesses = cluster.shuffled(pool).slice(0, Math.min(witnessCount, pool.length));
  let bestRatio = 0;
  const roundsEvidence = [];

  for (let round = 1; round <= rounds; round += 1) {
    const details = [];
    for (const batch of batches(witnesses, nodeCount >= 500 ? 8 : 5)) {
      const items = await Promise.all(batch.map(async (witnessIndex) => {
        const providers = await cluster.nodes[witnessIndex].findProviders(assignment.key, { timeoutMs, limit: 24 }).catch(() => []);
        const visible = providers.some((provider) => provider.id.toString() === cluster.nodes[assignment.providerIndex].peerIdString);
        return { witnessIndex, visible, providers: providers.length };
      }));
      details.push(...items);
    }
    const found = details.filter((item) => item.visible).length;
    const visibilityRatio = ratio(found, witnesses.length) || 0;
    bestRatio = Math.max(bestRatio, visibilityRatio);
    roundsEvidence.push({ round, found, witnessCount: witnesses.length, visibilityRatio, details });
    if (visibilityRatio >= 0.9) break;
    const missing = details.filter((item) => !item.visible).map((item) => item.witnessIndex);
    await cluster.nodes[assignment.providerIndex].refresh({ timeoutMs: 12_000 }).catch(() => null);
    await cluster.refreshAll({ indices: missing, concurrency: nodeCount >= 500 ? 12 : 6, timeoutMs: 12_000 });
    await advertiseWithRetry(cluster.nodes[assignment.providerIndex], assignment.key, { attempts: 2 }).catch(() => null);
    await sleep(250 * round);
  }

  return {
    providerIndex: assignment.providerIndex,
    key: assignment.key,
    publication,
    witnessCount: witnesses.length,
    bestVisibilityRatio: bestRatio,
    ready: witnesses.length > 0 && bestRatio >= 0.9,
    rounds: roundsEvidence
  };
}

async function warmAssignments(assignments, options = {}) {
  const evidence = [];
  const concurrency = Math.max(1, Number(options.concurrency || 2));
  for (const batch of batches(assignments, concurrency)) {
    const results = await Promise.all(batch.map((assignment) => warmOneAssignment(assignment, options)));
    evidence.push(...results);
  }
  return { ready: evidence.every((item) => item.ready), assignments: evidence };
}

async function measureRoutingConcurrent(assignments, {
  samples = assignments.length,
  timeoutMs = 6_000,
  requesterPool = null,
  concurrency = nodeCount >= 500 ? 8 : 4,
  retryAfterRefresh = true
} = {}) {
  const live = (requesterPool || cluster.liveIndices()).filter((index) => cluster.nodes[index]?.node?.status === 'started');
  const plans = Array.from({ length: samples }, (_, sample) => {
    const assignment = assignments[sample % assignments.length];
    const requesterCandidates = live.filter((index) => index !== assignment.providerIndex);
    return { sample, assignment, requesterIndex: cluster.pick(requesterCandidates) };
  });
  const results = [];

  for (const batch of batches(plans, concurrency)) {
    const batchResults = await Promise.all(batch.map(async ({ assignment, requesterIndex }) => {
      const requester = cluster.nodes[requesterIndex];
      const expectedPeerId = cluster.nodes[assignment.providerIndex].peerIdString;
      const lookupStarted = performance.now();
      let providers = [];
      let lookupError = null;
      let lookupAttempts = 0;
      let firstAttemptFound = false;

      for (let attempt = 1; attempt <= (retryAfterRefresh ? 2 : 1); attempt += 1) {
        lookupAttempts = attempt;
        try {
          providers = await requester.findProviders(assignment.key, { timeoutMs, limit: 24 });
        } catch (error) {
          lookupError = error.code || error.message;
          providers = [];
        }
        const found = providers.some((item) => item.id.toString() === expectedPeerId);
        if (attempt === 1) firstAttemptFound = found;
        if (found) break;
        if (attempt === 1 && retryAfterRefresh) {
          await requester.refresh({ timeoutMs: Math.min(12_000, timeoutMs + 4_000) }).catch(() => null);
          await sleep(75);
        }
      }

      const routingLatencyMs = performance.now() - lookupStarted;
      const provider = providers.find((item) => item.id.toString() === expectedPeerId);
      const probe = provider
        ? await requester.probe(provider.id, assignment.value, { timeoutMs, expectedDigest: scaleValueDigest(assignment.value) })
        : null;
      return {
        requesterIndex,
        providerIndex: assignment.providerIndex,
        providers: providers.map((item) => item.id.toString()),
        routingLatencyMs,
        lookupError,
        lookupAttempts,
        firstAttemptFound,
        providerFound: Boolean(provider),
        probeOk: Boolean(probe?.ok),
        probe
      };
    }));
    results.push(...batchResults);
  }

  const firstAttemptSuccesses = results.filter((item) => item.firstAttemptFound).length;
  const routeSuccesses = results.filter((item) => item.providerFound).length;
  const integritySuccesses = results.filter((item) => item.probeOk).length;
  return {
    samples: results.length,
    firstAttemptRoutingSuccessRatio: ratio(firstAttemptSuccesses, results.length),
    routingSuccessRatio: ratio(routeSuccesses, results.length),
    endToEndIntegritySuccessRatio: ratio(integritySuccesses, results.length),
    routingLatencyMs: distribution(results.map((item) => item.routingLatencyMs)),
    probeLatencyMs: distribution(results.filter((item) => item.probe).map((item) => item.probe.latencyMs)),
    results
  };
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
    await Promise.all(batch.map(async (leftIndex) => {
      const at = left.indexOf(leftIndex);
      for (const offset of offsets) {
        const rightIndex = right[(at + offset) % right.length];
        const address = cluster.nodes[rightIndex]?.address;
        if (address) await connectQuicPeers(cluster.nodes[leftIndex].node, [address]).catch(() => {});
      }
    }));
  }
}

async function hardPartition(left, right) {
  const leftPeers = left.map((index) => cluster.nodes[index].peerId).filter(Boolean);
  const rightPeers = right.map((index) => cluster.nodes[index].peerId).filter(Boolean);
  const leftSet = new Set(leftPeers.map((peer) => peer.toString()));
  const rightSet = new Set(rightPeers.map((peer) => peer.toString()));
  for (const index of left) cluster.nodes[index].gater.block(rightPeers);
  for (const index of right) cluster.nodes[index].gater.block(leftPeers);

  await Promise.all(cluster.nodes.map(async (node) => {
    if (node.node?.status !== 'started') return;
    const peers = node.node.getPeers().filter((peer) => {
      if (left.includes(node.index)) return rightSet.has(peer.toString());
      if (right.includes(node.index)) return leftSet.has(peer.toString());
      return false;
    });
    await Promise.all(peers.map((peer) => node.node.hangUp(peer).catch(() => {})));
  }));
  await purgeCrossPartition(left, right);
  await Promise.all([
    densify(left, { rounds: 0 }),
    densify(right, { rounds: 0 })
  ]);
  await purgeCrossPartition(left, right);
  await sleep(250);
}

async function customPartitionScenario() {
  const shuffled = cluster.shuffled(cluster.liveIndices());
  const midpoint = Math.floor(nodeCount / 2);
  const left = shuffled.slice(0, midpoint);
  const right = shuffled.slice(midpoint);
  await hardPartition(left, right);

  const leftTopology = subsetSnapshot(left);
  const rightTopology = subsetSnapshot(right);
  stage('partition:isolated', {
    leftRoutingP50: leftTopology.routingTableSize.p50,
    rightRoutingP50: rightTopology.routingTableSize.p50,
    leftConnectedP50: leftTopology.connectedPeers.p50,
    rightConnectedP50: rightTopology.connectedPeers.p50
  });

  const leftAssignment = { key: `partition:left:${seed}`, providerIndex: left[1], value: { side: 'left', seed } };
  const rightAssignment = { key: `partition:right:${seed}`, providerIndex: right[1], value: { side: 'right', seed } };
  const leftPublication = await advertiseWithRetry(cluster.nodes[leftAssignment.providerIndex], leftAssignment.key);
  const rightPublication = await advertiseWithRetry(cluster.nodes[rightAssignment.providerIndex], rightAssignment.key);

  const sameSide = await cluster.nodes[left[0]].findProviders(leftAssignment.key, { timeoutMs: 8_000, limit: 24 }).catch(() => []);
  const sameProvider = sameSide.find((provider) => provider.id.toString() === cluster.nodes[leftAssignment.providerIndex].peerIdString);
  const sameProbe = sameProvider ? await cluster.nodes[left[0]].probe(sameProvider.id, leftAssignment.value, { timeoutMs: 4_000 }) : null;
  const crossProbe = await cluster.nodes[left[0]].probe(cluster.nodes[rightAssignment.providerIndex].peerId, rightAssignment.value, { timeoutMs: 4_000 });

  const recoveryStarted = performance.now();
  for (const node of cluster.nodes) node.gater.heal();
  await connectAcross(left, right, nodeCount >= 500 ? 2 : 4);
  await densify(cluster.liveIndices(), { rounds: 2, refreshConcurrency: nodeCount >= 500 ? 32 : 24 });
  const recoveryPublication = await advertiseWithRetry(cluster.nodes[rightAssignment.providerIndex], rightAssignment.key);
  let recovered = false;
  let recoveryAttempts = 0;
  while (!recovered && performance.now() - recoveryStarted < 45_000) {
    recoveryAttempts += 1;
    const providers = await cluster.nodes[left[0]].findProviders(rightAssignment.key, { timeoutMs: 8_000, limit: 24 }).catch(() => []);
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
    crossPartitionCommunicationBlocked: !crossProbe.ok,
    crossPartitionProbe: crossProbe,
    healed: recovered,
    recoveryMs: performance.now() - recoveryStarted,
    recoveryAttempts,
    leftPublication,
    rightPublication,
    recoveryPublication,
    leftTopology,
    rightTopology
  };
}

async function customChurnScenario() {
  const candidates = cluster.shuffled(cluster.liveIndices().filter((index) => index !== 0));
  const stopped = candidates.slice(0, Math.max(1, Math.floor(nodeCount * 0.2)));
  const stoppedSet = new Set(stopped);
  const survivorsBeforeStop = cluster.liveIndices().filter((index) => !stoppedSet.has(index));
  const assignments = cluster.makeAssignments({
    count: Math.min(nodeCount >= 500 ? 20 : 12, survivorsBeforeStop.length),
    prefix: 'churn-survivor',
    candidateIndices: survivorsBeforeStop
  });
  stage('churn:prewarm:start', { providers: assignments.length, survivorCandidates: survivorsBeforeStop.length });
  const warmup = await warmAssignments(assignments, {
    witnessPool: survivorsBeforeStop,
    witnessCount: nodeCount >= 500 ? 5 : 8,
    rounds: 3,
    timeoutMs: nodeCount >= 500 ? 10_000 : 6_000,
    concurrency: 2
  });

  const oldPeers = new Map(stopped.map((index) => [index, cluster.nodes[index].peerIdString]));
  const oldPeerIds = stopped.map((index) => cluster.nodes[index].peerId).filter(Boolean);
  await Promise.all(stopped.map((index) => cluster.nodes[index].stop()));

  const survivors = cluster.liveIndices();
  await Promise.all(survivors.map((index) => cluster.nodes[index].purgeRoutingPeers(oldPeerIds)));
  const survivorTopology = await densify(survivors, { rounds: 1, refreshConcurrency: nodeCount >= 500 ? 32 : 24 });
  await Promise.all(survivors.map((index) => cluster.nodes[index].purgeRoutingPeers(oldPeerIds)));
  stage('churn:survivors-ready', {
    survivors: survivors.length,
    routingP50: survivorTopology.routingTableSize.p50,
    routingP95: survivorTopology.routingTableSize.p95,
    warmupReady: warmup.ready
  });

  const duringChurn = await measureRoutingConcurrent(assignments, {
    samples: Math.min(nodeCount >= 500 ? 80 : 32, survivors.length),
    timeoutMs: nodeCount >= 500 ? 10_000 : 6_000,
    requesterPool: survivors,
    concurrency: nodeCount >= 500 ? 8 : 4
  });

  const bootstrap = survivors.slice(0, 8).map((index) => cluster.nodes[index].address).filter(Boolean);
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
    warmup,
    duringChurn,
    recoveryMs: distribution(recoveryDurations),
    healedRoutingTable: healedTopology.routingTableSize
  };
}

async function injectAttackers(requesterIndices, attackerIndices) {
  let attempted = 0;
  let connected = 0;
  for (const batch of batches(requesterIndices, 8)) {
    await Promise.all(batch.map(async (requesterIndex) => {
      for (const attackerIndex of attackerIndices) {
        attempted += 1;
        const address = cluster.nodes[attackerIndex].address;
        if (!address) continue;
        try {
          await connectQuicPeers(cluster.nodes[requesterIndex].node, [address]);
          connected += 1;
        } catch {
          // Pressure is quantified below; failed injections are not silently treated as success.
        }
      }
    }));
  }
  return { attempted, connected };
}

async function customEclipseScenario() {
  const victimIndex = 0;
  const honestProviderIndex = 1;
  const attackerCount = Math.min(nodeCount >= 500 ? 16 : 8, Math.max(4, Math.floor(nodeCount / 12)));
  const attackers = cluster.shuffled(cluster.liveIndices().filter((index) => index > 1)).slice(0, attackerCount);
  const attackerSet = new Set(attackers);
  const honest = cluster.liveIndices().filter((index) => index !== victimIndex && !attackerSet.has(index));
  const key = `eclipse:${seed}`;
  const expectedValue = { committed: 'eclipse-target', seed };
  const forgedValue = { committed: 'eclipse-forgery', seed };
  const assignment = { key, providerIndex: honestProviderIndex, value: expectedValue };
  const warmup = await warmAssignments([assignment], { witnessPool: [victimIndex], witnessCount: 1, rounds: 3, timeoutMs: 8_000, concurrency: 1 });
  for (const index of attackers) cluster.nodes[index].setFault({ mode: 'colluding', value: forgedValue });

  const victim = cluster.nodes[victimIndex];
  const honestPeers = honest.map((index) => cluster.nodes[index].peerId).filter(Boolean);
  victim.gater.block(honestPeers);
  for (const index of honest) cluster.nodes[index].gater.block([victim.peerId]);
  await victim.purgeRoutingPeers(honestPeers);
  await Promise.all(victim.node.getPeers().map((peer) => victim.node.hangUp(peer).catch(() => {})));
  const injection = await injectAttackers([victimIndex], attackers);
  await victim.refresh({ timeoutMs: 12_000 }).catch(() => null);
  await sleep(300);

  const providers = await victim.findProviders(key, { timeoutMs: 8_000, limit: 24 }).catch(() => []);
  const honestProvider = providers.find((provider) => provider.id.toString() === cluster.nodes[honestProviderIndex].peerIdString);
  const honestProbe = honestProvider ? await victim.probe(honestProvider.id, expectedValue, { timeoutMs: 4_000 }) : null;
  const attackerVerdicts = [];
  for (const attackerIndex of attackers.slice(0, Math.min(6, attackers.length))) {
    const probe = await victim.probe(cluster.nodes[attackerIndex].peerId, expectedValue, { timeoutMs: 4_000, expectedDigest: scaleValueDigest(expectedValue) });
    attackerVerdicts.push({ attackerIndex, accepted: probe.ok, probe });
  }
  const attackerResponsesObserved = attackerVerdicts.filter((item) => !item.probe.transportError).length;
  const attackerResponsesAccepted = attackerVerdicts.filter((item) => item.accepted).length;

  const recoveryStarted = performance.now();
  for (const node of cluster.nodes) node.gater.heal();
  await connectAcross([victimIndex], honest.slice(0, Math.min(24, honest.length)), Math.min(4, honest.length));
  await densify(cluster.liveIndices(), { rounds: 2, refreshConcurrency: nodeCount >= 500 ? 32 : 24 });
  await advertiseWithRetry(cluster.nodes[honestProviderIndex], key);
  let recovered = false;
  while (!recovered && performance.now() - recoveryStarted < 45_000) {
    const recoveredProviders = await victim.findProviders(key, { timeoutMs: 8_000, limit: 24 }).catch(() => []);
    const remote = recoveredProviders.find((provider) => provider.id.toString() === cluster.nodes[honestProviderIndex].peerIdString);
    if (remote) recovered = (await victim.probe(remote.id, expectedValue, { timeoutMs: 4_000 })).ok;
    if (!recovered) {
      await victim.refresh({ timeoutMs: 15_000 }).catch(() => null);
      await advertiseWithRetry(cluster.nodes[honestProviderIndex], key, { attempts: 1 }).catch(() => null);
      await sleep(250);
    }
  }
  for (const index of attackers) cluster.nodes[index].setFault({ mode: 'honest' });

  return {
    attackerCount: attackers.length,
    injectedConnections: injection,
    victimConnectedPeers: victim.node.getPeers().length,
    attackerResponsesObserved,
    attackerResponsesAccepted,
    attackExercised: injection.connected > 0 && attackerResponsesObserved > 0,
    integrityForged: attackerResponsesAccepted > 0,
    eclipseAvailabilityLost: !honestProbe?.ok,
    healed: recovered,
    recoveryMs: performance.now() - recoveryStarted,
    warmup,
    attackerVerdicts
  };
}

async function customByzantineScenario() {
  const honestProviderIndex = 1;
  const attackers = cluster.shuffled(cluster.liveIndices().filter((index) => index > 1)).slice(0, Math.min(nodeCount >= 500 ? 20 : 10, Math.max(6, Math.floor(nodeCount * 0.1))));
  const attackerSet = new Set(attackers);
  const requesters = cluster.shuffled(cluster.liveIndices().filter((index) => index !== honestProviderIndex && !attackerSet.has(index))).slice(0, nodeCount >= 500 ? 16 : 8);
  const assignment = { key: `byzantine:${seed}`, providerIndex: honestProviderIndex, value: { committed: 'known-good', seed } };
  const warmup = await warmAssignments([assignment], { witnessPool: requesters, witnessCount: requesters.length, rounds: 3, timeoutMs: 8_000, concurrency: 1 });

  attackers.forEach((index, offset) => cluster.nodes[index].setFault({
    mode: offset % 2 === 0 ? 'byzantine' : 'invalid-signature',
    value: { committed: 'byzantine-fork', seed, cohort: 'A' }
  }));
  const injection = await injectAttackers(requesters, attackers);
  await cluster.refreshAll({ indices: requesters, concurrency: 8, timeoutMs: 12_000 });

  const verdicts = [];
  for (const requesterIndex of requesters) {
    for (const attackerIndex of attackers.slice(0, Math.min(4, attackers.length))) {
      const probe = await cluster.nodes[requesterIndex].probe(cluster.nodes[attackerIndex].peerId, assignment.value, { timeoutMs: 4_000, expectedDigest: scaleValueDigest(assignment.value) });
      verdicts.push({ requesterIndex, attackerIndex, accepted: probe.ok, probe });
    }
  }
  const observed = verdicts.filter((item) => !item.probe.transportError).length;
  const accepted = verdicts.filter((item) => item.accepted).length;
  const honestRouting = await measureRoutingConcurrent([assignment], {
    samples: nodeCount >= 500 ? 40 : 24,
    timeoutMs: nodeCount >= 500 ? 10_000 : 8_000,
    requesterPool: requesters,
    concurrency: nodeCount >= 500 ? 8 : 4
  });
  for (const index of attackers) cluster.nodes[index].setFault({ mode: 'honest' });

  return {
    attackerCount: attackers.length,
    injection,
    attackExercised: injection.connected > 0 && observed > 0,
    maliciousResponsesObserved: observed,
    maliciousResponsesAccepted: accepted,
    integrityPreserved: observed > 0 && accepted === 0,
    honestRouting,
    warmup,
    note: 'Byzantine responder/replica behavior is exercised at the signed TRUYN probe layer; this is not a BFT consensus proof.'
  };
}

async function customSybilCollusionScenario() {
  const honestProviderIndex = 1;
  const sybilCount = Math.min(nodeCount >= 500 ? 40 : 15, Math.max(5, Math.floor(nodeCount * 0.15)));
  const attackers = cluster.shuffled(cluster.liveIndices().filter((index) => index > 1)).slice(0, sybilCount);
  const attackerSet = new Set(attackers);
  const requesters = cluster.shuffled(cluster.liveIndices().filter((index) => index !== honestProviderIndex && !attackerSet.has(index))).slice(0, nodeCount >= 500 ? 16 : 8);
  const assignment = { key: `sybil-pressure:${seed}`, providerIndex: honestProviderIndex, value: { committed: 'honest-value', seed } };
  const forgedValue = { committed: 'sybil-forgery', seed };
  const warmup = await warmAssignments([assignment], { witnessPool: requesters, witnessCount: requesters.length, rounds: 3, timeoutMs: 8_000, concurrency: 1 });
  for (const index of attackers) cluster.nodes[index].setFault({ mode: 'colluding', value: forgedValue });

  const injection = await injectAttackers(requesters, attackers);
  await cluster.refreshAll({ indices: requesters, concurrency: 8, timeoutMs: 12_000 });
  const routingUnderPressure = await measureRoutingConcurrent([assignment], {
    samples: nodeCount >= 500 ? 48 : 32,
    timeoutMs: nodeCount >= 500 ? 10_000 : 8_000,
    requesterPool: requesters,
    concurrency: nodeCount >= 500 ? 8 : 4
  });

  const sybilVerdicts = [];
  for (const requesterIndex of requesters) {
    const chosen = cluster.shuffled(attackers).slice(0, Math.min(3, attackers.length));
    for (const attackerIndex of chosen) {
      const probe = await cluster.nodes[requesterIndex].probe(cluster.nodes[attackerIndex].peerId, assignment.value, { timeoutMs: 4_000, expectedDigest: scaleValueDigest(assignment.value) });
      sybilVerdicts.push({ requesterIndex, attackerIndex, accepted: probe.ok, probe });
    }
  }
  const attackerObserved = sybilVerdicts.filter((item) => !item.probe.transportError).length;
  const attackerAccepted = sybilVerdicts.filter((item) => item.accepted).length;

  const collusionAttackers = attackers.slice(0, Math.min(6, attackers.length));
  const collusionExpected = { immutable: 'truyn-known-good', seed };
  const collusionForged = { immutable: 'coordinated-forgery', seed };
  for (const index of collusionAttackers) cluster.nodes[index].setFault({ mode: 'colluding', value: collusionForged });
  const collusionVerdicts = [];
  for (const requesterIndex of requesters.slice(0, Math.min(4, requesters.length))) {
    for (const attackerIndex of collusionAttackers) {
      const probe = await cluster.nodes[requesterIndex].probe(cluster.nodes[attackerIndex].peerId, collusionExpected, { timeoutMs: 4_000, expectedDigest: scaleValueDigest(collusionExpected) });
      collusionVerdicts.push({ requesterIndex, attackerIndex, accepted: probe.ok, probe });
    }
  }
  const maliciousObserved = collusionVerdicts.filter((item) => !item.probe.transportError).length;
  const maliciousAccepted = collusionVerdicts.filter((item) => item.accepted).length;
  for (const index of attackers) cluster.nodes[index].setFault({ mode: 'honest' });

  return {
    sybil: {
      sybilIdentities: attackers.length,
      injectedConnections: injection,
      requesterSamples: requesters.length,
      attackerResponsesObserved: attackerObserved,
      attackerResponsesAccepted: attackerAccepted,
      attackExercised: injection.connected > 0 && attackerObserved > 0,
      integrityPreserved: attackerObserved > 0 && attackerAccepted === 0,
      routingUnderPressure,
      routingAvailabilityUnderPressure: routingUnderPressure.routingSuccessRatio >= 0.90 && routingUnderPressure.endToEndIntegritySuccessRatio >= 0.90,
      verdicts: sybilVerdicts
    },
    collusion: {
      attackerCount: collusionAttackers.length,
      maliciousResponsesObserved: maliciousObserved,
      maliciousAccepted,
      attackExercised: maliciousObserved > 0,
      integrityPreserved: maliciousObserved > 0 && maliciousAccepted === 0,
      verdicts: collusionVerdicts
    },
    warmup
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
    const warmup = await warmAssignments(assignments, {
      witnessCount: nodeCount >= 500 ? 6 : 10,
      rounds: 3,
      timeoutMs: nodeCount >= 500 ? 10_000 : 6_000,
      concurrency: 2
    });
    stage('baseline:measure:start', { samples: Math.min(nodeCount >= 500 ? 100 : 40, nodeCount), warmupReady: warmup.ready });
    const measurement = await measureRoutingConcurrent(assignments, {
      samples: Math.min(nodeCount >= 500 ? 100 : 40, nodeCount),
      timeoutMs: nodeCount >= 500 ? 10_000 : 6_000,
      concurrency: nodeCount >= 500 ? 8 : 4
    });
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
      crossPartitionIsolation: measurement.crossPartitionCommunicationBlocked,
      recovery: measurement.healed
    };
    stage('partition:done', { samePartitionRouting: measurement.samePartitionRoutingSucceeded, samePartitionIntegrity: measurement.samePartitionIntegritySucceeded, crossBlocked: measurement.crossPartitionCommunicationBlocked, healed: measurement.healed, recoveryMs: measurement.recoveryMs });
  } else if (scenario === 'churn') {
    stage('churn:start', { fraction: 0.2 });
    const measurement = await customChurnScenario();
    result = measurement;
    gates = {
      uniqueNodeIdentitiesBeforeChurn: identityGate,
      recoveredAllStoppedNodes: measurement.recoveredNodes === measurement.stoppedNodes,
      transportIdentityRotated: measurement.peerIdentityRotations === measurement.stoppedNodes,
      providerVisibilityBeforeChurn: measurement.providerWarmupReady,
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
      attackerPeersInjected: measurement.injectedConnections.connected > 0,
      attackExercised: measurement.attackExercised,
      forgedValueRejected: !measurement.integrityForged && measurement.attackerResponsesAccepted === 0,
      eclipseIsolation: measurement.eclipseAvailabilityLost,
      recovery: measurement.healed
    };
    stage('eclipse:done', { attackers: measurement.attackerCount, injectedConnections: measurement.injectedConnections.connected, attackerResponsesObserved: measurement.attackerResponsesObserved, attackerResponsesAccepted: measurement.attackerResponsesAccepted, availabilityLost: measurement.eclipseAvailabilityLost, recoveryMs: measurement.recoveryMs });
  } else if (scenario === 'byzantine') {
    stage('byzantine:start');
    const measurement = await customByzantineScenario();
    result = measurement;
    gates = {
      uniqueNodeIdentities: identityGate,
      attackerPeersInjected: measurement.injection.connected > 0,
      attackExercised: measurement.attackExercised,
      maliciousResponsesRejected: measurement.integrityPreserved && measurement.maliciousResponsesAccepted === 0,
      honestRoutingUnderByzantinePressure: measurement.honestRouting.routingSuccessRatio >= 0.90 && measurement.honestRouting.endToEndIntegritySuccessRatio >= 0.90
    };
    stage('byzantine:done', { attackers: measurement.attackerCount, observed: measurement.maliciousResponsesObserved, accepted: measurement.maliciousResponsesAccepted, routing: measurement.honestRouting.routingSuccessRatio, integrity: measurement.honestRouting.endToEndIntegritySuccessRatio });
  } else {
    stage('sybil:start');
    const measurement = await customSybilCollusionScenario();
    result = measurement;
    gates = {
      uniqueNodeIdentities: identityGate,
      sybilPeersInjected: measurement.sybil.injectedConnections.connected > 0,
      sybilAttackExercised: measurement.sybil.attackExercised,
      sybilForgedResponsesRejected: measurement.sybil.integrityPreserved && measurement.sybil.attackerResponsesAccepted === 0,
      honestAvailabilityUnderSybilPressure: measurement.sybil.routingAvailabilityUnderPressure,
      collusionAttackExercised: measurement.collusion.attackExercised,
      colludingResponsesRejected: measurement.collusion.integrityPreserved && measurement.collusion.maliciousAccepted === 0
    };
    stage('sybil:done', { sybilIdentities: measurement.sybil.sybilIdentities, injectedConnections: measurement.sybil.injectedConnections.connected, attackerResponsesObserved: measurement.sybil.attackerResponsesObserved, attackerResponsesAccepted: measurement.sybil.attackerResponsesAccepted, routing: measurement.sybil.routingUnderPressure.routingSuccessRatio, integrity: measurement.sybil.routingUnderPressure.endToEndIntegritySuccessRatio });
    stage('collusion:done', { attackers: measurement.collusion.attackerCount, maliciousObserved: measurement.collusion.maliciousResponsesObserved, maliciousAccepted: measurement.collusion.maliciousAccepted });
  }

  const finalNetwork = cluster.snapshot();
  const perNodeApplicationBytes = finalNetwork.nodes.map((node) => Number(node.telemetry.applicationBytesSent || 0) + Number(node.telemetry.applicationBytesReceived || 0));
  const report = {
    schema: 'truyn-adversarial-scale-scenario-v3',
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
