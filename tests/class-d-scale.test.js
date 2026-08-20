import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildClassDScenario,
  evaluateClassD100,
  evaluateClassD1000,
  percentile,
  summarizeDistribution
} from '../benchmarks/scale/class-d.js';

test('Class D scenario planning is deterministic for a fixed seed', () => {
  const nodeIds = Array.from({ length: 100 }, (_, index) => `node-${String(index).padStart(3, '0')}`);
  const first = buildClassDScenario({ nodeIds, seed: 'gate-2026-08-17' });
  const second = buildClassDScenario({ nodeIds, seed: 'gate-2026-08-17' });
  const other = buildClassDScenario({ nodeIds, seed: 'gate-other' });

  assert.deepEqual(first, second);
  assert.notDeepEqual(first.attackOrder, other.attackOrder);
  assert.equal(first.nodeCount, 100);
  assert.equal(first.routingProbes.length, 500);
  assert.equal(first.churnNodes.length, 10);
  assert.equal(first.partition.sideA.length, 20);
  assert.equal(first.partition.sideA.length + first.partition.sideB.length, 100);
  assert.equal(first.byzantineNodes.length, 10);
  assert.equal(first.sybilNodes.length, 20);
  assert.equal(first.eclipseVictims.length, 5);
  assert.equal(first.colludingNodes.length, 20);

  for (const probe of first.routingProbes) assert.notEqual(probe.source, probe.target);
});

test('Class D distribution summaries expose p50/p90/p95/p99 rather than hiding tails in a mean', () => {
  assert.equal(percentile([1, 2, 3, 4, 100], 0.5), 3);
  const summary = summarizeDistribution([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  assert.equal(summary.count, 10);
  assert.equal(summary.min, 10);
  assert.equal(summary.max, 100);
  assert.equal(summary.mean, 55);
  assert.ok(summary.p95 > summary.p90);
  assert.ok(summary.p99 >= summary.p95);
});

function passing100Evidence() {
  return {
    topology: {
      realNodeCount: 100,
      distinctIdentityCount: 100,
      distinctQuicSocketCount: 100,
      hostCount: 10
    },
    routing: {
      baselineSuccessRatio: 0.998,
      healedSuccessRatio: 0.996
    },
    recovery: { latencyMs: { p95: 42_000 } },
    convergence: { latencyMs: { p95: 55_000 } },
    safety: {
      acknowledgedWriteLossCount: 0,
      invalidSignedStateAcceptedCount: 0,
      staleRevokedReceiptAcceptedCount: 0
    },
    adversarial: {
      churn: { exercised: true },
      packetPartition: { exercised: true },
      byzantine: { exercised: true },
      sybil: { exercised: true },
      eclipse: { exercised: true },
      collusion: { exercised: true }
    },
    cleanup: { complete: true }
  };
}

test('100-node resilience gate passes only with complete real/adversarial evidence', () => {
  const evidence = passing100Evidence();
  const result = evaluateClassD100(evidence);
  assert.equal(result.passed, true);
  assert.deepEqual(result.failed, []);

  evidence.adversarial.eclipse.exercised = false;
  evidence.safety.invalidSignedStateAcceptedCount = 1;
  const failed = evaluateClassD100(evidence);
  assert.equal(failed.passed, false);
  assert.ok(failed.failed.includes('eclipseExercised'));
  assert.ok(failed.failed.includes('noInvalidSignedStateAccepted'));
});

test('100-node gate refuses synthetic counts, missing host diversity, weak routing, and absent cleanup', () => {
  const evidence = passing100Evidence();
  evidence.topology.realNodeCount = 99;
  evidence.topology.hostCount = 1;
  evidence.routing.baselineSuccessRatio = 0.98;
  evidence.cleanup.complete = false;

  const result = evaluateClassD100(evidence);
  assert.equal(result.passed, false);
  assert.ok(result.failed.includes('realNodes'));
  assert.ok(result.failed.includes('hostFailureDomains'));
  assert.ok(result.failed.includes('baselineRouting'));
  assert.ok(result.failed.includes('cleanup'));
});

function passing1000Evidence() {
  return {
    topology: {
      realNodeCount: 1000,
      distinctIdentityCount: 1000,
      distinctQuicSocketCount: 1000,
      syntheticNodeCount: 0,
      hostCount: 20
    },
    routing: {
      baselineSuccessRatio: 0.995,
      healedSuccessRatio: 0.994
    },
    convergence: { latencyMs: { p95: 90_000 } },
    recovery: { latencyMs: { p95: 100_000 } },
    safety: {
      acknowledgedWriteLossCount: 0,
      invalidSignedStateAcceptedCount: 0,
      staleRevokedReceiptAcceptedCount: 0,
      unauthorizedProviderExecutionCount: 0
    },
    cleanup: { complete: true, remainingResources: 0 }
  };
}

test('1,000-node scale gate is separate from the 100-node resilience claim', () => {
  const result = evaluateClassD1000(passing1000Evidence());
  assert.equal(result.passed, true);

  const onlyHundred = passing1000Evidence();
  onlyHundred.topology.realNodeCount = 100;
  onlyHundred.topology.distinctIdentityCount = 100;
  onlyHundred.topology.distinctQuicSocketCount = 100;
  const failed = evaluateClassD1000(onlyHundred);
  assert.equal(failed.passed, false);
  assert.ok(failed.failed.includes('realNodes'));
  assert.ok(failed.failed.includes('distinctIdentities'));
  assert.ok(failed.failed.includes('distinctQuicSockets'));
});

test('1,000-node scale gate fails closed on weak failure-domain diversity, healed routing, safety or cleanup', () => {
  const evidence = passing1000Evidence();
  evidence.topology.hostCount = 19;
  evidence.topology.syntheticNodeCount = 1;
  evidence.routing.healedSuccessRatio = 0.98;
  evidence.safety.invalidSignedStateAcceptedCount = 1;
  evidence.safety.unauthorizedProviderExecutionCount = 1;
  evidence.cleanup.remainingResources = 1;

  const result = evaluateClassD1000(evidence);
  assert.equal(result.passed, false);
  assert.ok(result.failed.includes('hostFailureDomains'));
  assert.ok(result.failed.includes('noSyntheticNodes'));
  assert.ok(result.failed.includes('healedRouting'));
  assert.ok(result.failed.includes('noInvalidSignedStateAccepted'));
  assert.ok(result.failed.includes('noUnauthorizedProviderExecution'));
  assert.ok(result.failed.includes('noRemainingResources'));
});
