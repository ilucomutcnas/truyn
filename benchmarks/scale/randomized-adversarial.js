import { buildClassDScenario, createSeededRandom, summarizeDistribution } from './class-d.js';

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

export function buildRandomizedAdversarialCampaign({
  nodeIds,
  seeds = ['truyn-adversarial-1', 'truyn-adversarial-2', 'truyn-adversarial-3', 'truyn-adversarial-4'],
  attackerBudgetRange = [0.10, 0.33],
  churnRange = [0.05, 0.20],
  partitionRange = [0.10, 0.35]
} = {}) {
  if (!Array.isArray(nodeIds) || nodeIds.length < 100) throw new Error('randomized real-network campaign requires at least 100 nodeIds');
  if (!Array.isArray(seeds) || seeds.length < 2) throw new Error('at least two campaign seeds are required');
  const [attackerMin, attackerMax] = attackerBudgetRange;
  const [churnMin, churnMax] = churnRange;
  const [partitionMin, partitionMax] = partitionRange;

  return seeds.map((seed, index) => {
    const random = createSeededRandom(`${seed}:fractions`);
    const attackerBudget = clamp(attackerMin + (attackerMax - attackerMin) * random(), 0.01, 0.49);
    const churnFraction = clamp(churnMin + (churnMax - churnMin) * random(), 0.01, 0.49);
    const partitionFraction = clamp(partitionMin + (partitionMax - partitionMin) * random(), 0.01, 0.49);
    const byzantineFraction = clamp(attackerBudget * (0.25 + random() * 0.35), 0.01, attackerBudget);
    const sybilFraction = clamp(attackerBudget * (0.55 + random() * 0.45), 0.01, attackerBudget);
    const collusionFraction = clamp(attackerBudget * (0.35 + random() * 0.50), 0.01, attackerBudget);
    const eclipseVictimFraction = clamp(0.01 + random() * Math.min(0.09, attackerBudget), 0.01, 0.10);
    return {
      campaignIndex: index,
      seed,
      attackerBudget,
      scenario: buildClassDScenario({ nodeIds, seed, routingProbeMultiplier: 5, churnFraction, partitionFraction, byzantineFraction, sybilFraction, eclipseVictimFraction, collusionFraction })
    };
  });
}

export function summarizeAdversarialCampaignRuns(runs = []) {
  const successfulRuns = runs.filter((run) => run?.completed === true);
  const metric = (selector) => successfulRuns.map(selector).map(Number).filter(Number.isFinite);
  return {
    runCount: runs.length,
    completedRuns: successfulRuns.length,
    completionRatio: runs.length ? successfulRuns.length / runs.length : 0,
    routingSuccess: summarizeDistribution(metric((run) => run.routingSuccessRatio)),
    convergenceMs: summarizeDistribution(metric((run) => run.convergenceMs)),
    recoveryMs: summarizeDistribution(metric((run) => run.recoveryMs)),
    latencyMs: summarizeDistribution(metric((run) => run.latencyMs)),
    bytesPerSuccessfulRoute: summarizeDistribution(metric((run) => run.bytesPerSuccessfulRoute)),
    acknowledgedWriteLoss: runs.reduce((sum, run) => sum + Number(run?.acknowledgedWriteLossCount || 0), 0),
    invalidSignedStateAccepted: runs.reduce((sum, run) => sum + Number(run?.invalidSignedStateAcceptedCount || 0), 0),
    staleRevokedReceiptAccepted: runs.reduce((sum, run) => sum + Number(run?.staleRevokedReceiptAcceptedCount || 0), 0)
  };
}

export function evaluateRandomizedAdversarialCampaign(summary, {
  minimumRuns = 4,
  minimumCompletionRatio = 1,
  minimumRoutingP50 = 0.99,
  minimumRoutingMin = 0.95,
  maximumRecoveryP95Ms = 180_000,
  maximumConvergenceP95Ms = 180_000
} = {}) {
  const checks = {
    enoughRuns: summary?.runCount >= minimumRuns,
    complete: summary?.completionRatio >= minimumCompletionRatio,
    routingP50: Number(summary?.routingSuccess?.p50) >= minimumRoutingP50,
    routingFloor: Number(summary?.routingSuccess?.min) >= minimumRoutingMin,
    recoveryP95: Number(summary?.recoveryMs?.p95) <= maximumRecoveryP95Ms,
    convergenceP95: Number(summary?.convergenceMs?.p95) <= maximumConvergenceP95Ms,
    noAcknowledgedWriteLoss: Number(summary?.acknowledgedWriteLoss) === 0,
    noInvalidSignedStateAccepted: Number(summary?.invalidSignedStateAccepted) === 0,
    noStaleRevokedReceiptAccepted: Number(summary?.staleRevokedReceiptAccepted) === 0
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { passed: failed.length === 0, checks, failed };
}
