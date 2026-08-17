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
let cluster;

const allowedScenarios = new Set(['baseline', 'partition', 'churn', 'eclipse', 'byzantine', 'sybil-collusion']);
if (!allowedScenarios.has(scenario)) throw new Error(`unsupported TRUYN_SCALE_SCENARIO: ${scenario}`);
if (!Number.isInteger(nodeCount) || nodeCount < 6) throw new Error('TRUYN_SCALE_NODE_COUNT must be an integer >= 6');

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function batches(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
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

function overlayOffsets(size) {
  if (size >= 500) return [1, -1, 7, -7, 31, -31, 127, -127, 251, -251];
  if (size >= 80) return [1, -1, 3, -3, 7, -7, 17, -17, 31, -31];
  return [1, -1, 2, -2, 3, -3, 5, -5];
}

function subsetSnapshot(indices) {
  const snapshots = indices
    .map((index) => cluster.nodes[index].snapshot())
    .filter((item) => item.status === 'started');
  return {
    nodes: snapshots.length,
    connectedPeers: distribution(snapshots.map((item) => item.connectedPeers)),
    routingTableSize: distribution(snapshots.map((item) => item.routingTableSize)),
    refreshSoftDeadlines: snapshots.reduce((sum, item) => sum + Number(item.telemetry.refreshSoftDeadlines || 0), 0),
    advertisementSoftDeadlines: snapshots.reduce((sum, item) => sum + Number(item.telemetry.advertisementSoftDeadlines || 0), 0)
  };
}

async function densify(indices, { rounds = 1, refreshConcurrency = nodeCount >= 500 ? 40 : 24 } = {}) {
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

  for (const batch of batches(plans, nodeCount >= 500 ? 40 : 20)) {
    await Promise.all(batch.map(async ({ index, targets }) => {
      for (const target of targets) {
        const address = cluster.nodes[target]?.address;
        if (address) await connectQuicPeers(cluster.nodes[index].node, [address]).catch(() => {});
      }
    }));
  }
  await sleep(nodeCount >= 500 ? 600 : 300);
  for (let round = 0; round < rounds; round += 1) {
    await cluster.refreshAll({ indices: active, concurrency: refreshConcurrency, timeoutMs: nodeCount >= 500 ? 16_000 : 10_000 });
    await sleep(150);
  }
  return subsetSnapshot(active);
}

function assignment(providerIndex, prefix) {
  return {
    providerIndex,
    value: { key: `${prefix}:${providerIndex}`, providerIndex, epoch: prefix }
  };
}

function requesterFor(providerIndex, pool) {
  const targetPeer = cluster.nodes[providerIndex].peerIdString;
  const candidates = pool.filter((index) => index !== providerIndex && cluster.nodes[index]?.node?.status === 'started');
  const nonDirect = candidates.filter((index) => !cluster.nodes[index].node.getPeers().some((peer) => peer.toString() === targetPeer));
  return cluster.pick(nonDirect.length > 0 ? nonDirect : candidates);
}

async function warmOnePeer(target, {
  witnessPool = cluster.liveIndices(),
  witnessCount = nodeCount >= 500 ? 4 : 8,
  rounds = 3,
  timeoutMs = nodeCount >= 500 ? 10_000 : 6_000
} = {}) {
  const pool = witnessPool.filter((index) => index !== target.providerIndex && cluster.nodes[index]?.node?.status === 'started');
  const witnesses = cluster.shuffled(pool).slice(0, Math.min(witnessCount, pool.length));
  const evidence = [];
  let bestVisibilityRatio = 0;

  for (let round = 1; round <= rounds; round += 1) {
    const details = [];
    for (const batch of batches(witnesses, nodeCount >= 500 ? 12 : 6)) {
      const items = await Promise.all(batch.map(async (witnessIndex) => {
        const found = await cluster.nodes[witnessIndex].findPeer(cluster.nodes[target.providerIndex].peerId, { timeoutMs });
        return { witnessIndex, found: found?.id?.toString?.() === cluster.nodes[target.providerIndex].peerIdString };
      }));
      details.push(...items);
    }
    const foundCount = details.filter((item) => item.found).length;
    const visibilityRatio = ratio(foundCount, witnesses.length) || 0;
    bestVisibilityRatio = Math.max(bestVisibilityRatio, visibilityRatio);
    evidence.push({ round, foundCount, witnessCount: witnesses.length, visibilityRatio, details });
    if (visibilityRatio >= 0.90) break;
    const missing = details.filter((item) => !item.found).map((item) => item.witnessIndex);
    await cluster.refreshAll({ indices: [target.providerIndex, ...missing], concurrency: nodeCount >= 500 ? 16 : 8, timeoutMs: nodeCount >= 500 ? 14_000 : 10_000 });
    await sleep(150 * round);
  }

  return {
    providerIndex: target.providerIndex,
    witnessCount: witnesses.length,
    bestVisibilityRatio,
    ready: witnesses.length > 0 && bestVisibilityRatio >= 0.90,
    rounds: evidence
  };
}

async function warmPeers(assignments, options = {}) {
  const evidence = [];
  const concurrency = Math.max(1, Number(options.concurrency || (nodeCount >= 500 ? 6 : 4)));
  for (const batch of batches(assignments, concurrency)) {
    evidence.push(...await Promise.all(batch.map((item) => warmOnePeer(item, options))));
  }
  return { ready: evidence.every((item) => item.ready), assignments: evidence };
}

async function measurePeerRouting(assignments, {
  samples = assignments.length,
  timeoutMs = nodeCount >= 500 ? 10_000 : 6_000,
  requesterPool = cluster.liveIndices(),
  concurrency = nodeCount >= 500 ? 12 : 6,
  retryAfterRefresh = true
} = {}) {
  const plans = Array.from({ length: samples }, (_, sample) => {
    const target = assignments[sample % assignments.length];
    return { target, requesterIndex: requesterFor(target.providerIndex, requesterPool) };
  });
  const results = [];

  for (const batch of batches(plans, concurrency)) {
    const batchResults = await Promise.all(batch.map(async ({ target, requesterIndex }) => {
      const requester = cluster.nodes[requesterIndex];
      const targetNode = cluster.nodes[target.providerIndex];
      const lookupStarted = performance.now();
      let peerInfo = null;
      let firstAttemptFound = false;
      let lookupAttempts = 0;

      for (let attempt = 1; attempt <= (retryAfterRefresh ? 2 : 1); attempt += 1) {
        lookupAttempts = attempt;
        peerInfo = await requester.findPeer(targetNode.peerId, { timeoutMs });
        const found = peerInfo?.id?.toString?.() === targetNode.peerIdString;
        if (attempt === 1) firstAttemptFound = found;
        if (found) break;
        if (attempt === 1 && retryAfterRefresh) {
          await requester.refresh({ timeoutMs: Math.min(nodeCount >= 500 ? 14_000 : 10_000, timeoutMs + 4_000) }).catch(() => null);
          await sleep(75);
        }
      }

      const routingLatencyMs = performance.now() - lookupStarted;
      const providerFound = peerInfo?.id?.toString?.() === targetNode.peerIdString;
      const probe = providerFound
        ? await requester.probe(targetNode.peerId, target.value, { timeoutMs: Math.min(timeoutMs, 5_000), expectedDigest: scaleValueDigest(target.value) })
        : null;
      return {
        requesterIndex,
        providerIndex: target.providerIndex,
        firstAttemptFound,
        providerFound,
        lookupAttempts,
        routingLatencyMs,
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

async function hardPartition(left, right) {
  const leftPeers = left.map((index) => cluster.nodes[index].peerId).filter(Boolean);
  const rightPeers = right.map((index) => cluster.nodes[index].peerId).filter(Boolean);
  const leftSet = new Set(leftPeers.map((peer) => peer.toString()));
  const rightSet = new Set(rightPeers.map((peer) => peer.toString()));
  for (const index of left) cluster.nodes[index].gater.block(rightPeers);
  for (const index of right) cluster.nodes[index].gater.block(leftPeers);
  await Promise.all(cluster.nodes.map(async (node) => {
    if (node.node?.status !== 'started') return;
    const cross = node.node.getPeers().filter((peer) => {
      if (left.includes(node.index)) return rightSet.has(peer.toString());
      if (right.includes(node.index)) return leftSet.has(peer.toString());
      return false;
    });
    await Promise.all(cross.map((peer) => node.node.hangUp(peer).catch(() => {})));
  }));
  await purgeCrossPartition(left, right);
  await Promise.all([densify(left, { rounds: 0 }), densify(right, { rounds: 0 })]);
  await purgeCrossPartition(left, right);
  await sleep(200);
}

async function healPartition(left, right) {
  for (const node of cluster.nodes) node.gater.heal();
  const bridges = Math.min(nodeCount >= 500 ? 12 : 8, left.length, right.length);
  for (const batch of batches(Array.from({ length: bridges }, (_, i) => i), 8)) {
    await Promise.all(batch.map(async (i) => {
      const source = left[i];
      const target = right[(i * 7) % right.length];
      const address = cluster.nodes[target]?.address;
      if (address) await connectQuicPeers(cluster.nodes[source].node, [address]).catch(() => {});
    }));
  }
  await densify(cluster.liveIndices(), { rounds: 1 });
  await sleep(200);
}

async function injectAttackers(requesterIndices, attackerIndices) {
  let attempted = 0;
  let connected = 0;
  for (const batch of batches(requesterIndices, 8)) {
    await Promise.all(batch.map(async (requesterIndex) => {
      for (const attackerIndex of attackerIndices) {
        attempted += 1;
        const address = cluster.nodes[attackerIndex]?.address;
        if (!address) continue;
        try {
          await connectQuicPeers(cluster.nodes[requesterIndex].node, [address]);
          connected += 1;
        } catch {
          // Counted below as failed pressure injection.
        }
      }
    }));
  }
  return { attempted, connected };
}

async function baselineScenario() {
  const targetCount = Math.min(nodeCount >= 500 ? 20 : 12, nodeCount - 1);
  const targets = cluster.shuffled(cluster.liveIndices()).slice(0, targetCount).map((index) => assignment(index, `scale${nodeCount}-baseline`));
  stage('baseline:warmup:start', { targets: targets.length });
  const warmup = await warmPeers(targets, { witnessCount: nodeCount >= 500 ? 4 : 8, rounds: 3 });
  stage('baseline:measure:start', { warmupReady: warmup.ready, samples: Math.min(nodeCount >= 500 ? 100 : 40, nodeCount) });
  const measurement = await measurePeerRouting(targets, { samples: Math.min(nodeCount >= 500 ? 100 : 40, nodeCount) });
  return { warmup, measurement };
}

async function partitionScenario() {
  const shuffled = cluster.shuffled(cluster.liveIndices());
  const midpoint = Math.floor(nodeCount / 2);
  const left = shuffled.slice(0, midpoint);
  const right = shuffled.slice(midpoint);
  await hardPartition(left, right);
  const leftTopology = subsetSnapshot(left);
  const rightTopology = subsetSnapshot(right);
  stage('partition:isolated', { leftRoutingP50: leftTopology.routingTableSize.p50, rightRoutingP50: rightTopology.routingTableSize.p50 });

  const leftTarget = assignment(left[1], `partition-left-${seed}`);
  const sameInfo = await cluster.nodes[left[0]].findPeer(cluster.nodes[leftTarget.providerIndex].peerId, { timeoutMs: 8_000 });
  const sameFound = sameInfo?.id?.toString?.() === cluster.nodes[leftTarget.providerIndex].peerIdString;
  const sameProbe = sameFound
    ? await cluster.nodes[left[0]].probe(cluster.nodes[leftTarget.providerIndex].peerId, leftTarget.value, { timeoutMs: 4_000 })
    : null;
  const crossValue = { side: 'right', seed };
  const crossProbe = await cluster.nodes[left[0]].probe(cluster.nodes[right[1]].peerId, crossValue, { timeoutMs: 4_000 });

  const recoveryStarted = performance.now();
  await healPartition(left, right);
  let recovered = false;
  let recoveryAttempts = 0;
  while (!recovered && performance.now() - recoveryStarted < 45_000) {
    recoveryAttempts += 1;
    const info = await cluster.nodes[left[0]].findPeer(cluster.nodes[right[1]].peerId, { timeoutMs: 8_000 });
    if (info?.id?.toString?.() === cluster.nodes[right[1]].peerIdString) {
      recovered = (await cluster.nodes[left[0]].probe(cluster.nodes[right[1]].peerId, crossValue, { timeoutMs: 4_000 })).ok;
    }
    if (!recovered) {
      await cluster.refreshAll({ indices: [left[0], right[1]], concurrency: 2, timeoutMs: 12_000 });
      await sleep(200);
    }
  }

  return {
    leftSize: left.length,
    rightSize: right.length,
    samePartitionRoutingSucceeded: sameFound,
    samePartitionIntegritySucceeded: Boolean(sameProbe?.ok),
    crossPartitionCommunicationBlocked: !crossProbe.ok,
    healed: recovered,
    recoveryMs: performance.now() - recoveryStarted,
    recoveryAttempts,
    leftTopology,
    rightTopology
  };
}

async function churnScenario() {
  const candidates = cluster.shuffled(cluster.liveIndices().filter((index) => index !== 0));
  const stopped = candidates.slice(0, Math.max(1, Math.floor(nodeCount * 0.2)));
  const stoppedSet = new Set(stopped);
  const survivors = cluster.liveIndices().filter((index) => !stoppedSet.has(index));
  const targets = cluster.shuffled(survivors).slice(0, Math.min(nodeCount >= 500 ? 20 : 12, survivors.length)).map((index) => assignment(index, 'churn-survivor'));
  stage('churn:prewarm:start', { targets: targets.length, survivors: survivors.length });
  const warmup = await warmPeers(targets, { witnessPool: survivors, witnessCount: nodeCount >= 500 ? 4 : 8, rounds: 3 });

  const oldPeers = new Map(stopped.map((index) => [index, cluster.nodes[index].peerIdString]));
  const oldNodeIds = new Map(stopped.map((index) => [index, cluster.nodes[index].identity.nodeId]));
  const oldPeerIds = stopped.map((index) => cluster.nodes[index].peerId).filter(Boolean);
  await Promise.all(stopped.map((index) => cluster.nodes[index].stop()));
  await Promise.all(survivors.map((index) => cluster.nodes[index].purgeRoutingPeers(oldPeerIds)));
  const survivorTopology = await densify(survivors, { rounds: 1 });
  stage('churn:survivors-ready', { routingP50: survivorTopology.routingTableSize.p50, routingP95: survivorTopology.routingTableSize.p95, warmupReady: warmup.ready });

  const duringChurn = await measurePeerRouting(targets, {
    samples: Math.min(nodeCount >= 500 ? 100 : 40, survivors.length),
    requesterPool: survivors
  });

  const bootstrap = survivors.slice(0, 8).map((index) => cluster.nodes[index].address).filter(Boolean);
  const recoveryDurations = [];
  const peerRotations = [];
  const stableTruynIds = [];
  for (const batch of batches(stopped, nodeCount >= 500 ? 16 : 8)) {
    await Promise.all(batch.map(async (index) => {
      const recoveryStarted = performance.now();
      await cluster.nodes[index].start({ bootstrap: bootstrap.slice(0, 4) });
      recoveryDurations.push(performance.now() - recoveryStarted);
      peerRotations.push(oldPeers.get(index) !== cluster.nodes[index].peerIdString);
      stableTruynIds.push(oldNodeIds.get(index) === cluster.nodes[index].identity.nodeId);
    }));
  }
  const healedTopology = await densify(cluster.liveIndices(), { rounds: 1 });
  return {
    stoppedNodes: stopped.length,
    recoveredNodes: stopped.length,
    peerIdentityRotations: peerRotations.filter(Boolean).length,
    stableTruynIdentities: stableTruynIds.filter(Boolean).length,
    peerWarmupReady: warmup.ready,
    warmup,
    duringChurn,
    recoveryMs: distribution(recoveryDurations),
    healedRoutingTable: healedTopology.routingTableSize
  };
}

async function eclipseScenario() {
  const victimIndex = 0;
  const honestProviderIndex = 1;
  const attackerCount = Math.min(nodeCount >= 500 ? 20 : 8, Math.max(4, Math.floor(nodeCount / 12)));
  const attackers = cluster.shuffled(cluster.liveIndices().filter((index) => index > 1)).slice(0, attackerCount);
  const attackerSet = new Set(attackers);
  const honest = cluster.liveIndices().filter((index) => index !== victimIndex && !attackerSet.has(index));
  const target = assignment(honestProviderIndex, 'eclipse-target');
  const warmup = await warmPeers([target], { witnessPool: [victimIndex], witnessCount: 1, rounds: 3 });
  const forgedValue = { committed: 'eclipse-forgery', seed };
  for (const index of attackers) cluster.nodes[index].setFault({ mode: 'colluding', value: forgedValue });

  const victim = cluster.nodes[victimIndex];
  const honestPeers = honest.map((index) => cluster.nodes[index].peerId).filter(Boolean);
  victim.gater.block(honestPeers);
  for (const index of honest) cluster.nodes[index].gater.block([victim.peerId]);
  await victim.purgeRoutingPeers(honestPeers);
  await Promise.all(victim.node.getPeers().map((peer) => victim.node.hangUp(peer).catch(() => {})));
  const injection = await injectAttackers([victimIndex], attackers);
  await victim.refresh({ timeoutMs: 10_000 }).catch(() => null);
  await sleep(200);

  const attackerVerdicts = [];
  for (const attackerIndex of attackers.slice(0, Math.min(6, attackers.length))) {
    const probe = await victim.probe(cluster.nodes[attackerIndex].peerId, target.value, { timeoutMs: 4_000, expectedDigest: scaleValueDigest(target.value) });
    attackerVerdicts.push({ attackerIndex, accepted: probe.ok, probe });
  }
  const attackerResponsesObserved = attackerVerdicts.filter((item) => !item.probe.transportError).length;
  const attackerResponsesAccepted = attackerVerdicts.filter((item) => item.accepted).length;
  const honestProbeDuringEclipse = await victim.probe(cluster.nodes[honestProviderIndex].peerId, target.value, { timeoutMs: 4_000 });

  const recoveryStarted = performance.now();
  for (const node of cluster.nodes) node.gater.heal();
  await connectQuicPeers(victim.node, [cluster.nodes[honestProviderIndex].address]).catch(() => {});
  await densify(cluster.liveIndices(), { rounds: 1 });
  let recovered = false;
  while (!recovered && performance.now() - recoveryStarted < 45_000) {
    const info = await victim.findPeer(cluster.nodes[honestProviderIndex].peerId, { timeoutMs: 8_000 });
    if (info?.id?.toString?.() === cluster.nodes[honestProviderIndex].peerIdString) {
      recovered = (await victim.probe(cluster.nodes[honestProviderIndex].peerId, target.value, { timeoutMs: 4_000 })).ok;
    }
    if (!recovered) {
      await victim.refresh({ timeoutMs: 12_000 }).catch(() => null);
      await sleep(200);
    }
  }
  for (const index of attackers) cluster.nodes[index].setFault({ mode: 'honest' });
  return {
    attackerCount: attackers.length,
    injectedConnections: injection,
    attackerResponsesObserved,
    attackerResponsesAccepted,
    attackExercised: injection.connected > 0 && attackerResponsesObserved > 0,
    integrityForged: attackerResponsesAccepted > 0,
    eclipseAvailabilityLost: !honestProbeDuringEclipse.ok,
    healed: recovered,
    recoveryMs: performance.now() - recoveryStarted,
    warmup,
    attackerVerdicts
  };
}

async function byzantineScenario() {
  const honestProviderIndex = 1;
  const attackers = cluster.shuffled(cluster.liveIndices().filter((index) => index > 1)).slice(0, Math.min(nodeCount >= 500 ? 24 : 10, Math.max(6, Math.floor(nodeCount * 0.1))));
  const attackerSet = new Set(attackers);
  const requesters = cluster.shuffled(cluster.liveIndices().filter((index) => index !== honestProviderIndex && !attackerSet.has(index))).slice(0, nodeCount >= 500 ? 20 : 8);
  const target = assignment(honestProviderIndex, 'byzantine-honest');
  const warmup = await warmPeers([target], { witnessPool: requesters, witnessCount: requesters.length, rounds: 3 });
  attackers.forEach((index, offset) => cluster.nodes[index].setFault({
    mode: offset % 2 === 0 ? 'byzantine' : 'invalid-signature',
    value: { committed: 'byzantine-fork', seed, cohort: 'A' }
  }));
  const injection = await injectAttackers(requesters, attackers);
  await cluster.refreshAll({ indices: requesters, concurrency: nodeCount >= 500 ? 16 : 8, timeoutMs: 10_000 });

  const verdicts = [];
  for (const requesterIndex of requesters) {
    for (const attackerIndex of attackers.slice(0, Math.min(4, attackers.length))) {
      const probe = await cluster.nodes[requesterIndex].probe(cluster.nodes[attackerIndex].peerId, target.value, { timeoutMs: 4_000, expectedDigest: scaleValueDigest(target.value) });
      verdicts.push({ requesterIndex, attackerIndex, accepted: probe.ok, probe });
    }
  }
  const observed = verdicts.filter((item) => !item.probe.transportError).length;
  const accepted = verdicts.filter((item) => item.accepted).length;
  const honestRouting = await measurePeerRouting([target], { samples: nodeCount >= 500 ? 60 : 30, requesterPool: requesters });
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
    note: 'Byzantine responder behavior is exercised at the signed TRUYN probe layer; this is not a BFT consensus proof.'
  };
}

async function sybilCollusionScenario() {
  const honestProviderIndex = 1;
  const sybilCount = Math.min(nodeCount >= 500 ? 50 : 15, Math.max(5, Math.floor(nodeCount * 0.15)));
  const attackers = cluster.shuffled(cluster.liveIndices().filter((index) => index > 1)).slice(0, sybilCount);
  const attackerSet = new Set(attackers);
  const requesters = cluster.shuffled(cluster.liveIndices().filter((index) => index !== honestProviderIndex && !attackerSet.has(index))).slice(0, nodeCount >= 500 ? 20 : 8);
  const target = assignment(honestProviderIndex, 'sybil-honest');
  const forgedValue = { committed: 'sybil-forgery', seed };
  const warmup = await warmPeers([target], { witnessPool: requesters, witnessCount: requesters.length, rounds: 3 });
  for (const index of attackers) cluster.nodes[index].setFault({ mode: 'colluding', value: forgedValue });
  const injection = await injectAttackers(requesters, attackers);
  await cluster.refreshAll({ indices: requesters, concurrency: nodeCount >= 500 ? 16 : 8, timeoutMs: 10_000 });
  const routingUnderPressure = await measurePeerRouting([target], { samples: nodeCount >= 500 ? 60 : 32, requesterPool: requesters });

  const sybilVerdicts = [];
  for (const requesterIndex of requesters) {
    for (const attackerIndex of cluster.shuffled(attackers).slice(0, Math.min(3, attackers.length))) {
      const probe = await cluster.nodes[requesterIndex].probe(cluster.nodes[attackerIndex].peerId, target.value, { timeoutMs: 4_000, expectedDigest: scaleValueDigest(target.value) });
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

const networkBefore = linuxNetworkBytes();
try {
  const kBucketSize = Math.max(20, Math.min(Number.parseInt(process.env.TRUYN_SCALE_K_BUCKET_SIZE || '32', 10), Math.max(20, nodeCount - 1)));
  cluster = new AdversarialScaleCluster({ count: nodeCount, seed, kBucketSize });
  stage('topology:start', { nodeCount, kBucketSize, routingPrimitive: 'kademlia-peer-routing' });
  await cluster.start({ concurrency: nodeCount >= 500 ? 24 : 10 });
  const topologyAfterDensify = await densify(cluster.liveIndices(), { rounds: 1 });
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
    result = await baselineScenario();
    const measurement = result.measurement;
    gates = {
      uniqueNodeIdentities: identityGate,
      peerVisibilityWarmup: result.warmup.ready,
      firstAttemptRouting: measurement.firstAttemptRoutingSuccessRatio >= 0.95,
      routing: measurement.routingSuccessRatio >= 0.95,
      integrity: measurement.endToEndIntegritySuccessRatio >= 0.95
    };
    stage('baseline:done', { warmupReady: result.warmup.ready, firstAttemptRouting: measurement.firstAttemptRoutingSuccessRatio, routing: measurement.routingSuccessRatio, integrity: measurement.endToEndIntegritySuccessRatio, routingP95Ms: measurement.routingLatencyMs.p95, probeP95Ms: measurement.probeLatencyMs.p95 });
  } else if (scenario === 'partition') {
    result = await partitionScenario();
    gates = {
      uniqueNodeIdentities: identityGate,
      samePartitionRouting: result.samePartitionRoutingSucceeded,
      samePartitionIntegrity: result.samePartitionIntegritySucceeded,
      crossPartitionIsolation: result.crossPartitionCommunicationBlocked,
      recovery: result.healed
    };
    stage('partition:done', { samePartitionRouting: result.samePartitionRoutingSucceeded, samePartitionIntegrity: result.samePartitionIntegritySucceeded, crossBlocked: result.crossPartitionCommunicationBlocked, healed: result.healed, recoveryMs: result.recoveryMs });
  } else if (scenario === 'churn') {
    result = await churnScenario();
    gates = {
      uniqueNodeIdentitiesBeforeChurn: identityGate,
      recoveredAllStoppedNodes: result.recoveredNodes === result.stoppedNodes,
      transportIdentityRotated: result.peerIdentityRotations === result.stoppedNodes,
      truynIdentityStable: result.stableTruynIdentities === result.stoppedNodes,
      peerVisibilityBeforeChurn: result.peerWarmupReady,
      routingDuringChurn: result.duringChurn.routingSuccessRatio >= 0.90,
      integrityDuringChurn: result.duringChurn.endToEndIntegritySuccessRatio >= 0.90
    };
    stage('churn:done', { stopped: result.stoppedNodes, recovered: result.recoveredNodes, peerRotations: result.peerIdentityRotations, stableTruynIdentities: result.stableTruynIdentities, routing: result.duringChurn.routingSuccessRatio, integrity: result.duringChurn.endToEndIntegritySuccessRatio, recoveryP95Ms: result.recoveryMs.p95 });
  } else if (scenario === 'eclipse') {
    result = await eclipseScenario();
    gates = {
      uniqueNodeIdentities: identityGate,
      attackerPeersInjected: result.injectedConnections.connected > 0,
      attackExercised: result.attackExercised,
      forgedValueRejected: !result.integrityForged && result.attackerResponsesAccepted === 0,
      eclipseIsolation: result.eclipseAvailabilityLost,
      recovery: result.healed
    };
    stage('eclipse:done', { attackers: result.attackerCount, injectedConnections: result.injectedConnections.connected, attackerResponsesObserved: result.attackerResponsesObserved, attackerResponsesAccepted: result.attackerResponsesAccepted, availabilityLost: result.eclipseAvailabilityLost, recoveryMs: result.recoveryMs });
  } else if (scenario === 'byzantine') {
    result = await byzantineScenario();
    gates = {
      uniqueNodeIdentities: identityGate,
      attackerPeersInjected: result.injection.connected > 0,
      attackExercised: result.attackExercised,
      maliciousResponsesRejected: result.integrityPreserved && result.maliciousResponsesAccepted === 0,
      honestRoutingUnderByzantinePressure: result.honestRouting.routingSuccessRatio >= 0.90 && result.honestRouting.endToEndIntegritySuccessRatio >= 0.90
    };
    stage('byzantine:done', { attackers: result.attackerCount, observed: result.maliciousResponsesObserved, accepted: result.maliciousResponsesAccepted, routing: result.honestRouting.routingSuccessRatio, integrity: result.honestRouting.endToEndIntegritySuccessRatio });
  } else {
    result = await sybilCollusionScenario();
    gates = {
      uniqueNodeIdentities: identityGate,
      sybilPeersInjected: result.sybil.injectedConnections.connected > 0,
      sybilAttackExercised: result.sybil.attackExercised,
      sybilForgedResponsesRejected: result.sybil.integrityPreserved && result.sybil.attackerResponsesAccepted === 0,
      honestAvailabilityUnderSybilPressure: result.sybil.routingAvailabilityUnderPressure,
      collusionAttackExercised: result.collusion.attackExercised,
      colludingResponsesRejected: result.collusion.integrityPreserved && result.collusion.maliciousAccepted === 0
    };
    stage('sybil:done', { sybilIdentities: result.sybil.sybilIdentities, injectedConnections: result.sybil.injectedConnections.connected, attackerResponsesObserved: result.sybil.attackerResponsesObserved, attackerResponsesAccepted: result.sybil.attackerResponsesAccepted, routing: result.sybil.routingUnderPressure.routingSuccessRatio, integrity: result.sybil.routingUnderPressure.endToEndIntegritySuccessRatio });
    stage('collusion:done', { attackers: result.collusion.attackerCount, maliciousObserved: result.collusion.maliciousResponsesObserved, maliciousAccepted: result.collusion.maliciousAccepted });
  }

  const finalNetwork = cluster.snapshot();
  const perNodeApplicationBytes = finalNetwork.nodes.map((node) => Number(node.telemetry.applicationBytesSent || 0) + Number(node.telemetry.applicationBytesReceived || 0));
  const passed = Object.values(gates).every(Boolean);
  const report = {
    schema: 'truyn-adversarial-peer-routing-scale-scenario-v1',
    scenario,
    startedAt,
    finishedAt: new Date().toISOString(),
    nodeCount,
    seed,
    routingPrimitive: 'libp2p Kademlia peerRouting.findPeer + signed TRUYN probe',
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
    passed,
    execution: execution()
  };
  report.claims = {
    hundredNodeRuntimeGate: nodeCount === 100 && passed,
    thousandNodeRuntimeGate: nodeCount === 1000 && passed,
    independentFailureDomains: passed && report.execution.hostCount >= nodeCount,
    byzantineConsensus: false,
    sybilResistance: false
  };
  stage('gate:complete', { passed, durationMs: report.durationMs });
  writeReport(report);
  if (!passed) process.exitCode = 1;
} catch (error) {
  writeReport({
    schema: 'truyn-adversarial-peer-routing-scale-error-v1',
    passed: false,
    scenario,
    startedAt,
    failedAt: new Date().toISOString(),
    nodeCount,
    seed,
    stage: currentStage,
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
  process.exitCode = 1;
} finally {
  if (cluster) await cluster.stop().catch(() => {});
}
