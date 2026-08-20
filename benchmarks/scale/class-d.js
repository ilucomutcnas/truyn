import { createHash } from 'node:crypto';

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function assertFraction(value, name) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} must be between 0 and 1`);
  return value;
}

export function seedToUint32(seed) {
  const digest = createHash('sha256').update(String(seed)).digest();
  return digest.readUInt32BE(0) || 0x9e3779b9;
}

export function createSeededRandom(seed) {
  let state = seedToUint32(seed);
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

export function shuffled(values, seed) {
  const output = [...values];
  const random = createSeededRandom(seed);
  for (let index = output.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [output[index], output[selected]] = [output[selected], output[index]];
  }
  return output;
}

export function choose(values, count, seed) {
  if (!Number.isInteger(count) || count < 0 || count > values.length) throw new Error('invalid sample count');
  return shuffled(values, seed).slice(0, count);
}

export function percentile(values, quantile) {
  if (!Array.isArray(values) || values.length === 0) return null;
  if (!Number.isFinite(quantile) || quantile < 0 || quantile > 1) throw new Error('quantile must be between 0 and 1');
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function summarizeDistribution(values = []) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (numbers.length === 0) {
    return { count: 0, min: null, p50: null, p90: null, p95: null, p99: null, max: null, mean: null };
  }
  const sum = numbers.reduce((total, value) => total + value, 0);
  return {
    count: numbers.length,
    min: Math.min(...numbers),
    p50: percentile(numbers, 0.50),
    p90: percentile(numbers, 0.90),
    p95: percentile(numbers, 0.95),
    p99: percentile(numbers, 0.99),
    max: Math.max(...numbers),
    mean: sum / numbers.length
  };
}

function fractionCount(total, fraction, minimum = 1) {
  return Math.max(minimum, Math.min(total, Math.round(total * fraction)));
}

function pairProbes(nodeIds, count, seed) {
  const random = createSeededRandom(seed);
  const pairs = [];
  if (nodeIds.length < 2) return pairs;
  for (let index = 0; index < count; index += 1) {
    const sourceIndex = Math.floor(random() * nodeIds.length);
    let targetIndex = Math.floor(random() * (nodeIds.length - 1));
    if (targetIndex >= sourceIndex) targetIndex += 1;
    pairs.push({ source: nodeIds[sourceIndex], target: nodeIds[targetIndex] });
  }
  return pairs;
}

export function buildClassDScenario({
  nodeIds,
  seed,
  routingProbeMultiplier = 5,
  churnFraction = 0.10,
  partitionFraction = 0.20,
  byzantineFraction = 0.10,
  sybilFraction = 0.20,
  eclipseVictimFraction = 0.05,
  collusionFraction = 0.20
} = {}) {
  if (!Array.isArray(nodeIds) || nodeIds.length < 4) throw new Error('at least four nodeIds are required');
  if (new Set(nodeIds).size !== nodeIds.length) throw new Error('nodeIds must be unique');
  assertPositiveInteger(routingProbeMultiplier, 'routingProbeMultiplier');
  for (const [name, value] of Object.entries({ churnFraction, partitionFraction, byzantineFraction, sybilFraction, eclipseVictimFraction, collusionFraction })) assertFraction(value, name);

  const scenarioSeed = String(seed ?? 'truyn-class-d');
  const attackOrder = shuffled(nodeIds, `${scenarioSeed}:attack-order`);
  const take = (fraction, offsetSeed) => choose(nodeIds, fractionCount(nodeIds.length, fraction), `${scenarioSeed}:${offsetSeed}`);
  const partition = take(partitionFraction, 'partition');
  const partitionSet = new Set(partition);

  return {
    version: 1,
    seed: scenarioSeed,
    nodeCount: nodeIds.length,
    routingProbes: pairProbes(nodeIds, Math.max(100, nodeIds.length * routingProbeMultiplier), `${scenarioSeed}:routing`),
    churnNodes: take(churnFraction, 'churn'),
    partition: { sideA: partition, sideB: nodeIds.filter((nodeId) => !partitionSet.has(nodeId)) },
    byzantineNodes: take(byzantineFraction, 'byzantine'),
    sybilNodes: take(sybilFraction, 'sybil'),
    eclipseVictims: take(eclipseVictimFraction, 'eclipse-victims'),
    colludingNodes: take(collusionFraction, 'collusion'),
    attackOrder
  };
}

function metric(observations, path, fallback = null) {
  let current = observations;
  for (const part of path.split('.')) {
    if (current == null || !Object.hasOwn(current, part)) return fallback;
    current = current[part];
  }
  return current;
}

function evidenceFlag(observations, key) {
  return observations?.adversarial?.[key]?.exercised === true;
}

export const CLASS_D_100_THRESHOLDS = Object.freeze({
  nodeCount: 100,
  minimumHostCount: 4,
  baselineRoutingSuccess: 0.99,
  healedRoutingSuccess: 0.99,
  recoveryP95Ms: 120_000,
  convergenceP95Ms: 120_000,
  acknowledgedWriteLossMax: 0,
  invalidSignedStateAcceptedMax: 0,
  staleRevokedReceiptAcceptedMax: 0
});

export function evaluateClassD100(observations, thresholds = CLASS_D_100_THRESHOLDS) {
  const routingBaseline = metric(observations, 'routing.baselineSuccessRatio');
  const routingHealed = metric(observations, 'routing.healedSuccessRatio');
  const recoveryP95 = metric(observations, 'recovery.latencyMs.p95');
  const convergenceP95 = metric(observations, 'convergence.latencyMs.p95');
  const checks = {
    realNodes: metric(observations, 'topology.realNodeCount') === thresholds.nodeCount,
    distinctIdentities: metric(observations, 'topology.distinctIdentityCount') === thresholds.nodeCount,
    distinctQuicSockets: metric(observations, 'topology.distinctQuicSocketCount') === thresholds.nodeCount,
    hostFailureDomains: metric(observations, 'topology.hostCount', 0) >= thresholds.minimumHostCount,
    baselineRouting: Number.isFinite(routingBaseline) && routingBaseline >= thresholds.baselineRoutingSuccess,
    healedRouting: Number.isFinite(routingHealed) && routingHealed >= thresholds.healedRoutingSuccess,
    recoveryP95: Number.isFinite(recoveryP95) && recoveryP95 <= thresholds.recoveryP95Ms,
    convergenceP95: Number.isFinite(convergenceP95) && convergenceP95 <= thresholds.convergenceP95Ms,
    noAcknowledgedWriteLoss: metric(observations, 'safety.acknowledgedWriteLossCount', Infinity) <= thresholds.acknowledgedWriteLossMax,
    noInvalidSignedStateAccepted: metric(observations, 'safety.invalidSignedStateAcceptedCount', Infinity) <= thresholds.invalidSignedStateAcceptedMax,
    noStaleRevokedReceiptAccepted: metric(observations, 'safety.staleRevokedReceiptAcceptedCount', Infinity) <= thresholds.staleRevokedReceiptAcceptedMax,
    churnExercised: evidenceFlag(observations, 'churn'),
    packetPartitionExercised: evidenceFlag(observations, 'packetPartition'),
    byzantineExercised: evidenceFlag(observations, 'byzantine'),
    sybilPressureExercised: evidenceFlag(observations, 'sybil'),
    eclipseExercised: evidenceFlag(observations, 'eclipse'),
    collusionExercised: evidenceFlag(observations, 'collusion'),
    cleanup: metric(observations, 'cleanup.complete') === true
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { class: 'D-100', passed: failed.length === 0, checks, failed, thresholds };
}

export const CLASS_D_1000_THRESHOLDS = Object.freeze({
  nodeCount: 1000,
  minimumHostCount: 20,
  baselineRoutingSuccess: 0.99,
  healedRoutingSuccess: 0.99,
  convergenceP95Ms: 180_000,
  recoveryP95Ms: 180_000,
  acknowledgedWriteLossMax: 0,
  invalidSignedStateAcceptedMax: 0,
  staleRevokedReceiptAcceptedMax: 0,
  unauthorizedProviderExecutionMax: 0,
  remainingResourcesMax: 0
});

export function evaluateClassD1000(observations, thresholds = CLASS_D_1000_THRESHOLDS) {
  const routingBaseline = metric(observations, 'routing.baselineSuccessRatio');
  const routingHealed = metric(observations, 'routing.healedSuccessRatio');
  const convergenceP95 = metric(observations, 'convergence.latencyMs.p95');
  const recoveryP95 = metric(observations, 'recovery.latencyMs.p95');
  const checks = {
    realNodes: metric(observations, 'topology.realNodeCount') === thresholds.nodeCount,
    distinctIdentities: metric(observations, 'topology.distinctIdentityCount') === thresholds.nodeCount,
    distinctQuicSockets: metric(observations, 'topology.distinctQuicSocketCount') === thresholds.nodeCount,
    noSyntheticNodes: metric(observations, 'topology.syntheticNodeCount', Infinity) === 0,
    hostFailureDomains: metric(observations, 'topology.hostCount', 0) >= thresholds.minimumHostCount,
    baselineRouting: Number.isFinite(routingBaseline) && routingBaseline >= thresholds.baselineRoutingSuccess,
    healedRouting: Number.isFinite(routingHealed) && routingHealed >= thresholds.healedRoutingSuccess,
    convergenceP95: Number.isFinite(convergenceP95) && convergenceP95 <= thresholds.convergenceP95Ms,
    recoveryP95: Number.isFinite(recoveryP95) && recoveryP95 <= thresholds.recoveryP95Ms,
    noAcknowledgedWriteLoss: metric(observations, 'safety.acknowledgedWriteLossCount', Infinity) <= thresholds.acknowledgedWriteLossMax,
    noInvalidSignedStateAccepted: metric(observations, 'safety.invalidSignedStateAcceptedCount', Infinity) <= thresholds.invalidSignedStateAcceptedMax,
    noStaleRevokedReceiptAccepted: metric(observations, 'safety.staleRevokedReceiptAcceptedCount', Infinity) <= thresholds.staleRevokedReceiptAcceptedMax,
    noUnauthorizedProviderExecution: metric(observations, 'safety.unauthorizedProviderExecutionCount', Infinity) <= thresholds.unauthorizedProviderExecutionMax,
    cleanup: metric(observations, 'cleanup.complete') === true,
    noRemainingResources: metric(observations, 'cleanup.remainingResources', Infinity) <= thresholds.remainingResourcesMax
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { class: 'D-1000', passed: failed.length === 0, checks, failed, thresholds };
}
