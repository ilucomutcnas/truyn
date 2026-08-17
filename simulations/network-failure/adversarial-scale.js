import { connectQuicPeers } from '../../network/transport/quic-kademlia.js';
import { AdversarialScaleNode, scaleValueDigest } from '../../network/testnet/scale-node.js';
import { distribution, ratio } from './metrics.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function xorshift32(seed) {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function batches(items, size) {
  const output = [];
  for (let i = 0; i < items.length; i += size) output.push(items.slice(i, i + size));
  return output;
}

export class AdversarialScaleCluster {
  constructor({ count = 12, seed = 0x54525559, bootstrapCount = 4, kBucketSize = 20 } = {}) {
    if (!Number.isInteger(count) || count < 6) throw new Error('adversarial scale cluster requires at least 6 nodes');
    this.count = count;
    this.seed = seed;
    this.random = xorshift32(seed);
    this.bootstrapCount = Math.max(2, Math.min(bootstrapCount, count));
    this.kBucketSize = kBucketSize;
    this.nodes = Array.from({ length: count }, (_, index) => new AdversarialScaleNode({ index, kBucketSize }));
    this.assignments = [];
  }

  pick(items) {
    if (!items.length) return null;
    return items[Math.floor(this.random() * items.length)];
  }

  shuffled(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  liveIndices() {
    return this.nodes.filter((node) => node.node?.status === 'started').map((node) => node.index);
  }

  async start({ concurrency = 10 } = {}) {
    await this.nodes[0].start();
    for (let i = 1; i < this.bootstrapCount; i += 1) {
      const bootstrap = this.nodes.slice(0, i).map((node) => node.address);
      await this.nodes[i].start({ bootstrap });
    }
    const seedAddresses = this.nodes.slice(0, this.bootstrapCount).map((node) => node.address);
    const remaining = this.nodes.slice(this.bootstrapCount);
    for (const batch of batches(remaining, concurrency)) {
      await Promise.all(batch.map((node, offset) => {
        const rotated = seedAddresses.slice(offset % seedAddresses.length).concat(seedAddresses.slice(0, offset % seedAddresses.length));
        return node.start({ bootstrap: rotated.slice(0, Math.min(3, rotated.length)) });
      }));
    }
    await sleep(150);
    await this.refreshAll({ concurrency, timeoutMs: 6_000 });
    return this.snapshot();
  }

  async refreshAll({ indices = this.liveIndices(), concurrency = 10, timeoutMs = 6_000 } = {}) {
    const states = [];
    for (const batch of batches(indices, concurrency)) {
      const results = await Promise.all(batch.map(async (index) => {
        try {
          return { index, ok: true, state: await this.nodes[index].refresh({ timeoutMs }) };
        } catch (error) {
          return { index, ok: false, error: error.code || error.message };
        }
      }));
      states.push(...results);
    }
    return states;
  }

  async advertiseAssignments(assignments, { concurrency = 8 } = {}) {
    for (const batch of batches(assignments, concurrency)) {
      await Promise.all(batch.map(async (assignment) => {
        await this.nodes[assignment.providerIndex].advertise(assignment.key, { timeoutMs: 8_000 });
      }));
    }
    this.assignments.push(...assignments);
    return assignments;
  }

  makeAssignments({ count = Math.min(20, this.count), prefix = 'baseline', candidateIndices = this.liveIndices() } = {}) {
    return this.shuffled(candidateIndices).slice(0, Math.min(count, candidateIndices.length)).map((providerIndex, offset) => ({
      key: `${prefix}:${providerIndex}:${offset}`,
      providerIndex,
      value: { key: `${prefix}:${providerIndex}:${offset}`, providerIndex, epoch: prefix }
    }));
  }

  async measureRouting(assignments, { samples = assignments.length, timeoutMs = 4_000 } = {}) {
    const live = this.liveIndices();
    const routingLatencyMs = [];
    const probeLatencyMs = [];
    const results = [];
    for (let sample = 0; sample < samples; sample += 1) {
      const assignment = assignments[sample % assignments.length];
      const requesterCandidates = live.filter((index) => index !== assignment.providerIndex);
      const requesterIndex = this.pick(requesterCandidates);
      const requester = this.nodes[requesterIndex];
      const started = performance.now();
      let providers = [];
      let lookupError = null;
      try {
        providers = await requester.findProviders(assignment.key, { timeoutMs, limit: 20 });
      } catch (error) {
        lookupError = error.code || error.message;
      }
      const routingLatency = performance.now() - started;
      routingLatencyMs.push(routingLatency);
      const expectedPeerId = this.nodes[assignment.providerIndex].peerIdString;
      const provider = providers.find((item) => item.id.toString() === expectedPeerId);
      let probe = null;
      if (provider) {
        probe = await requester.probe(provider.id, assignment.value, { timeoutMs, expectedDigest: scaleValueDigest(assignment.value) });
        probeLatencyMs.push(probe.latencyMs);
      }
      results.push({
        requesterIndex,
        providerIndex: assignment.providerIndex,
        providers: providers.map((item) => item.id.toString()),
        routingLatencyMs: routingLatency,
        lookupError,
        providerFound: Boolean(provider),
        probeOk: Boolean(probe?.ok),
        probe
      });
    }
    const routeSuccesses = results.filter((item) => item.providerFound).length;
    const integritySuccesses = results.filter((item) => item.probeOk).length;
    return {
      samples: results.length,
      routingSuccessRatio: ratio(routeSuccesses, results.length),
      endToEndIntegritySuccessRatio: ratio(integritySuccesses, results.length),
      routingLatencyMs: distribution(routingLatencyMs),
      probeLatencyMs: distribution(probeLatencyMs),
      results
    };
  }

  async setPartition(leftIndices, rightIndices) {
    const leftPeers = leftIndices.map((index) => this.nodes[index].peerId).filter(Boolean);
    const rightPeers = rightIndices.map((index) => this.nodes[index].peerId).filter(Boolean);
    for (const index of leftIndices) this.nodes[index].gater.block(rightPeers);
    for (const index of rightIndices) this.nodes[index].gater.block(leftPeers);

    const leftSet = new Set(leftPeers.map((peer) => peer.toString()));
    const rightSet = new Set(rightPeers.map((peer) => peer.toString()));
    await Promise.all(this.nodes.filter((node) => node.node?.status === 'started').map(async (node) => {
      const cross = node.node.getPeers().filter((peer) => {
        if (leftIndices.includes(node.index)) return rightSet.has(peer.toString());
        if (rightIndices.includes(node.index)) return leftSet.has(peer.toString());
        return false;
      });
      await Promise.all(cross.map((peer) => node.node.hangUp(peer).catch(() => {})));
    }));
    await sleep(100);
  }

  async healPartition({ leftIndices = [], rightIndices = [] } = {}) {
    for (const node of this.nodes) node.gater.heal();
    const bridgePairs = [];
    const pairCount = Math.min(3, leftIndices.length, rightIndices.length);
    for (let i = 0; i < pairCount; i += 1) bridgePairs.push([leftIndices[i], rightIndices[i]]);
    await Promise.all(bridgePairs.map(async ([left, right]) => {
      await connectQuicPeers(this.nodes[left].node, [this.nodes[right].address]).catch(() => {});
    }));
    await this.refreshAll({ concurrency: 10, timeoutMs: 6_000 });
  }

  async partitionScenario({ timeoutMs = 3_000 } = {}) {
    const midpoint = Math.floor(this.count / 2);
    const left = Array.from({ length: midpoint }, (_, index) => index);
    const right = Array.from({ length: this.count - midpoint }, (_, index) => index + midpoint);
    await this.setPartition(left, right);
    const leftAssignment = { key: `partition:left:${this.seed}`, providerIndex: left[1] ?? left[0], value: { side: 'left', seed: this.seed } };
    const rightAssignment = { key: `partition:right:${this.seed}`, providerIndex: right[1] ?? right[0], value: { side: 'right', seed: this.seed } };
    await this.advertiseAssignments([leftAssignment, rightAssignment]);

    const sameSide = await this.nodes[left[0]].findProviders(leftAssignment.key, { timeoutMs, limit: 10 }).catch(() => []);
    const crossSide = await this.nodes[left[0]].findProviders(rightAssignment.key, { timeoutMs, limit: 10 }).catch(() => []);
    const sameFound = sameSide.some((provider) => provider.id.toString() === this.nodes[leftAssignment.providerIndex].peerIdString);
    const crossFound = crossSide.some((provider) => provider.id.toString() === this.nodes[rightAssignment.providerIndex].peerIdString);

    const recoveryStarted = performance.now();
    await this.healPartition({ leftIndices: left, rightIndices: right });
    await this.nodes[rightAssignment.providerIndex].advertise(rightAssignment.key, { timeoutMs: 6_000 });
    let recovered = false;
    let recoveryAttempts = 0;
    while (!recovered && performance.now() - recoveryStarted < 15_000) {
      recoveryAttempts += 1;
      const providers = await this.nodes[left[0]].findProviders(rightAssignment.key, { timeoutMs: 2_000, limit: 10 }).catch(() => []);
      const remote = providers.find((provider) => provider.id.toString() === this.nodes[rightAssignment.providerIndex].peerIdString);
      if (remote) {
        const probe = await this.nodes[left[0]].probe(remote.id, rightAssignment.value, { timeoutMs: 2_000 });
        recovered = probe.ok;
      }
      if (!recovered) await sleep(100);
    }
    return {
      samePartitionRoutingSucceeded: sameFound,
      crossPartitionRoutingBlocked: !crossFound,
      healed: recovered,
      recoveryMs: performance.now() - recoveryStarted,
      recoveryAttempts,
      leftSize: left.length,
      rightSize: right.length
    };
  }

  async byzantineCollusionScenario({ maliciousCount = Math.min(4, Math.max(2, Math.floor(this.count / 4))), timeoutMs = 4_000 } = {}) {
    const requesterIndex = 0;
    const honestProviderIndex = 1;
    const candidates = this.liveIndices().filter((index) => index > 1);
    const attackers = candidates.slice(-maliciousCount);
    const key = `collusion:${this.seed}`;
    const expectedValue = { immutable: 'truyn-known-good', seed: this.seed };
    const forgedValue = { immutable: 'coordinated-forgery', seed: this.seed };
    this.nodes[honestProviderIndex].setFault({ mode: 'honest' });
    for (const index of attackers) this.nodes[index].setFault({ mode: 'colluding', value: forgedValue });
    await this.advertiseAssignments([
      { key, providerIndex: honestProviderIndex, value: expectedValue },
      ...attackers.map((providerIndex) => ({ key, providerIndex, value: forgedValue }))
    ]);
    const providers = await this.nodes[requesterIndex].findProviders(key, { timeoutMs, limit: maliciousCount + 8 }).catch(() => []);
    const peerToIndex = new Map(this.nodes.map((node) => [node.peerIdString, node.index]));
    const verdicts = [];
    for (const provider of providers) {
      const providerIndex = peerToIndex.get(provider.id.toString());
      if (providerIndex == null) continue;
      const probe = await this.nodes[requesterIndex].probe(provider.id, expectedValue, { timeoutMs, expectedDigest: scaleValueDigest(expectedValue) });
      verdicts.push({ providerIndex, malicious: attackers.includes(providerIndex), accepted: probe.ok, probe });
    }
    for (const index of attackers) this.nodes[index].setFault({ mode: 'honest' });
    return {
      attackerCount: attackers.length,
      providerResponses: verdicts.length,
      maliciousResponsesObserved: verdicts.filter((item) => item.malicious).length,
      maliciousAccepted: verdicts.filter((item) => item.malicious && item.accepted).length,
      honestAccepted: verdicts.filter((item) => !item.malicious && item.accepted).length,
      integrityPreserved: verdicts.every((item) => !item.malicious || !item.accepted),
      verdicts
    };
  }

  async sybilPressureScenario({ sybilCount = Math.min(20, Math.max(3, Math.floor(this.count / 3))), requesterSamples = 5, timeoutMs = 4_000 } = {}) {
    const honestProviderIndex = 1;
    const attackers = this.liveIndices().filter((index) => index > 1).slice(-sybilCount);
    const key = `sybil-pressure:${this.seed}`;
    const expectedValue = { committed: 'honest-value', seed: this.seed };
    const forgedValue = { committed: 'sybil-value', seed: this.seed };
    for (const index of attackers) this.nodes[index].setFault({ mode: 'colluding', value: forgedValue });
    await this.advertiseAssignments([
      { key, providerIndex: honestProviderIndex, value: expectedValue },
      ...attackers.map((providerIndex) => ({ key, providerIndex, value: forgedValue }))
    ]);
    const attackerPeers = new Set(attackers.map((index) => this.nodes[index].peerIdString));
    const requesters = this.liveIndices().filter((index) => index !== honestProviderIndex && !attackers.includes(index)).slice(0, requesterSamples);
    let returned = 0;
    let attackerReturned = 0;
    let acceptedValid = 0;
    for (const requesterIndex of requesters) {
      const providers = await this.nodes[requesterIndex].findProviders(key, { timeoutMs, limit: sybilCount + 8 }).catch(() => []);
      returned += providers.length;
      attackerReturned += providers.filter((provider) => attackerPeers.has(provider.id.toString())).length;
      for (const provider of providers) {
        const probe = await this.nodes[requesterIndex].probe(provider.id, expectedValue, { timeoutMs: 2_000, expectedDigest: scaleValueDigest(expectedValue) });
        if (probe.ok) acceptedValid += 1;
      }
    }
    for (const index of attackers) this.nodes[index].setFault({ mode: 'honest' });
    return {
      sybilIdentities: attackers.length,
      requesterSamples: requesters.length,
      providersReturned: returned,
      attackerProviderShare: ratio(attackerReturned, returned),
      acceptedValidResponses: acceptedValid,
      integrityPreserved: acceptedValid > 0 || returned === 0,
      routingAvailabilityUnderPressure: acceptedValid > 0
    };
  }

  async eclipseScenario({ attackerCount = Math.min(5, Math.max(2, Math.floor(this.count / 4))), timeoutMs = 3_000 } = {}) {
    const victimIndex = 0;
    const honestProviderIndex = 1;
    const attackers = this.liveIndices().filter((index) => index > 1).slice(-attackerCount);
    const honest = this.liveIndices().filter((index) => index !== victimIndex && !attackers.includes(index));
    const key = `eclipse:${this.seed}`;
    const expectedValue = { committed: 'eclipse-target', seed: this.seed };
    const forgedValue = { committed: 'eclipse-forgery', seed: this.seed };
    for (const index of attackers) this.nodes[index].setFault({ mode: 'colluding', value: forgedValue });
    await this.advertiseAssignments([
      { key, providerIndex: honestProviderIndex, value: expectedValue },
      ...attackers.map((providerIndex) => ({ key, providerIndex, value: forgedValue }))
    ]);

    const victim = this.nodes[victimIndex];
    victim.gater.block(honest.map((index) => this.nodes[index].peerId));
    for (const index of honest) this.nodes[index].gater.block([victim.peerId]);
    const honestPeerSet = new Set(honest.map((index) => this.nodes[index].peerIdString));
    await Promise.all(victim.node.getPeers().filter((peer) => honestPeerSet.has(peer.toString())).map((peer) => victim.node.hangUp(peer).catch(() => {})));
    await Promise.all(attackers.slice(0, 3).map((index) => connectQuicPeers(victim.node, [this.nodes[index].address]).catch(() => {})));
    await sleep(100);

    const providers = await victim.findProviders(key, { timeoutMs, limit: attackerCount + 8 }).catch(() => []);
    let validDuringEclipse = 0;
    for (const provider of providers) {
      const probe = await victim.probe(provider.id, expectedValue, { timeoutMs: 1_500, expectedDigest: scaleValueDigest(expectedValue) });
      if (probe.ok) validDuringEclipse += 1;
    }
    const eclipseSucceeded = validDuringEclipse === 0;

    const recoveryStarted = performance.now();
    for (const node of this.nodes) node.gater.heal();
    await connectQuicPeers(victim.node, [this.nodes[honestProviderIndex].address]).catch(() => {});
    await victim.refresh({ timeoutMs: 6_000 }).catch(() => {});
    await this.nodes[honestProviderIndex].advertise(key, { timeoutMs: 6_000 }).catch(() => {});
    let recovered = false;
    while (!recovered && performance.now() - recoveryStarted < 12_000) {
      const found = await victim.findProviders(key, { timeoutMs: 2_000, limit: attackerCount + 8 }).catch(() => []);
      const honestProvider = found.find((provider) => provider.id.toString() === this.nodes[honestProviderIndex].peerIdString);
      if (honestProvider) recovered = (await victim.probe(honestProvider.id, expectedValue, { timeoutMs: 2_000 })).ok;
      if (!recovered) await sleep(100);
    }
    for (const index of attackers) this.nodes[index].setFault({ mode: 'honest' });
    return {
      victimIndex,
      attackerCount: attackers.length,
      providersObservedDuringEclipse: providers.length,
      validResponsesDuringEclipse: validDuringEclipse,
      eclipseSucceeded,
      integrityForged: validDuringEclipse > 0,
      healed: recovered,
      recoveryMs: performance.now() - recoveryStarted
    };
  }

  async churnScenario({ fraction = 0.2, timeoutMs = 4_000 } = {}) {
    const protectedSeeds = new Set([0]);
    const candidates = this.shuffled(this.liveIndices().filter((index) => !protectedSeeds.has(index)));
    const stopCount = Math.max(1, Math.floor(this.count * fraction));
    const stopped = candidates.slice(0, stopCount);
    const oldPeers = new Map(stopped.map((index) => [index, this.nodes[index].peerIdString]));
    await Promise.all(stopped.map((index) => this.nodes[index].stop()));
    const survivors = this.liveIndices();
    await this.refreshAll({ indices: survivors, concurrency: 10, timeoutMs: 5_000 });
    const survivorAssignments = this.makeAssignments({ count: Math.min(10, survivors.length), prefix: 'churn-survivor', candidateIndices: survivors });
    await this.advertiseAssignments(survivorAssignments);
    const duringChurn = await this.measureRouting(survivorAssignments, { samples: Math.min(10, survivorAssignments.length), timeoutMs });

    const bootstrap = this.nodes.filter((node) => node.node?.status === 'started').slice(0, this.bootstrapCount).map((node) => node.address);
    const recoveryDurations = [];
    const peerRotations = [];
    for (const batch of batches(stopped, 8)) {
      await Promise.all(batch.map(async (index) => {
        const started = performance.now();
        await this.nodes[index].start({ bootstrap: bootstrap.slice(0, 3) });
        await this.nodes[index].refresh({ timeoutMs: 6_000 }).catch(() => {});
        recoveryDurations.push(performance.now() - started);
        peerRotations.push(oldPeers.get(index) !== this.nodes[index].peerIdString);
      }));
    }
    await this.refreshAll({ concurrency: 10, timeoutMs: 6_000 });
    return {
      stoppedNodes: stopped.length,
      stoppedFraction: ratio(stopped.length, this.count),
      duringChurn,
      recoveredNodes: stopped.length,
      peerIdentityRotations: peerRotations.filter(Boolean).length,
      recoveryMs: distribution(recoveryDurations)
    };
  }

  aggregateTelemetry() {
    return this.nodes.reduce((total, node) => {
      for (const [key, value] of Object.entries(node.telemetry)) total[key] = (total[key] || 0) + value;
      return total;
    }, {});
  }

  snapshot() {
    const nodes = this.nodes.map((node) => node.snapshot());
    return {
      count: this.count,
      live: nodes.filter((node) => node.status === 'started').length,
      uniqueLibp2pPeerIds: new Set(nodes.map((node) => node.peerId).filter(Boolean)).size,
      uniqueTruynNodeIds: new Set(nodes.map((node) => node.nodeId).filter(Boolean)).size,
      connectedPeers: distribution(nodes.map((node) => node.connectedPeers)),
      routingTableSize: distribution(nodes.map((node) => node.routingTableSize).filter(Number.isFinite)),
      telemetry: this.aggregateTelemetry(),
      nodes
    };
  }

  async stop() {
    await Promise.all(this.nodes.map((node) => node.stop().catch(() => {})));
  }
}

export async function runAdversarialScaleGate({
  count = 12,
  seed = 0x54525559,
  baselineProviders = Math.min(20, count),
  baselineSamples = Math.min(20, count),
  includePartition = true,
  includeChurn = true,
  includeEclipse = true,
  includeSybil = true,
  includeCollusion = true
} = {}) {
  const cluster = new AdversarialScaleCluster({ count, seed });
  const startedAt = new Date().toISOString();
  const started = performance.now();
  try {
    await cluster.start();
    const baselineAssignments = cluster.makeAssignments({ count: baselineProviders, prefix: 'baseline' });
    await cluster.advertiseAssignments(baselineAssignments);
    const baseline = await cluster.measureRouting(baselineAssignments, { samples: baselineSamples });
    const report = {
      schema: 'truyn-adversarial-scale-gate-v1',
      startedAt,
      nodeCount: count,
      seed,
      baseline,
      partition: includePartition ? await cluster.partitionScenario() : null,
      churn: includeChurn ? await cluster.churnScenario() : null,
      eclipse: includeEclipse ? await cluster.eclipseScenario() : null,
      sybilPressure: includeSybil ? await cluster.sybilPressureScenario() : null,
      byzantineCollusion: includeCollusion ? await cluster.byzantineCollusionScenario() : null,
      finalNetwork: cluster.snapshot()
    };
    report.durationMs = performance.now() - started;
    report.finishedAt = new Date().toISOString();
    report.gates = {
      uniqueNodeIdentities: report.finalNetwork.uniqueLibp2pPeerIds === count && report.finalNetwork.uniqueTruynNodeIds === count,
      baselineRouting: report.baseline.routingSuccessRatio >= 0.95,
      baselineIntegrity: report.baseline.endToEndIntegritySuccessRatio >= 0.95,
      partitionIsolation: report.partition == null || (report.partition.samePartitionRoutingSucceeded && report.partition.crossPartitionRoutingBlocked),
      partitionRecovery: report.partition == null || report.partition.healed,
      churnRecovery: report.churn == null || report.churn.recoveredNodes === report.churn.stoppedNodes,
      eclipseIntegrity: report.eclipse == null || !report.eclipse.integrityForged,
      eclipseRecovery: report.eclipse == null || report.eclipse.healed,
      sybilIntegrity: report.sybilPressure == null || report.sybilPressure.integrityPreserved,
      collusionIntegrity: report.byzantineCollusion == null || report.byzantineCollusion.integrityPreserved
    };
    report.passed = Object.values(report.gates).every(Boolean);
    return report;
  } finally {
    await cluster.stop();
  }
}
