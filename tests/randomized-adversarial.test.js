import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRandomizedAdversarialCampaign, summarizeAdversarialCampaignRuns, evaluateRandomizedAdversarialCampaign } from '../benchmarks/scale/randomized-adversarial.js';

const nodeIds = Array.from({ length: 100 }, (_, index) => `truyn:node:adv-${index}`);

test('randomized campaign produces deterministic but distinct seeded attack plans', () => {
  const seeds = ['a', 'b', 'c', 'd'];
  const first = buildRandomizedAdversarialCampaign({ nodeIds, seeds });
  const second = buildRandomizedAdversarialCampaign({ nodeIds, seeds });
  assert.deepEqual(first, second);
  assert.equal(first.length, 4);
  assert.equal(new Set(first.map((run) => JSON.stringify(run.scenario.churnNodes))).size > 1, true);
  for (const run of first) {
    assert.ok(run.attackerBudget >= 0.10 && run.attackerBudget <= 0.33);
    assert.ok(run.scenario.byzantineNodes.length > 0);
    assert.ok(run.scenario.sybilNodes.length > 0);
    assert.ok(run.scenario.eclipseVictims.length > 0);
    assert.ok(run.scenario.colludingNodes.length > 0);
  }
});

test('adversarial campaign distributions pass only with complete safe runs', () => {
  const runs = [0, 1, 2, 3].map((index) => ({ completed: true, routingSuccessRatio: 0.995 - index * 0.001, convergenceMs: 40_000 + index * 1_000, recoveryMs: 30_000 + index * 1_500, latencyMs: 25 + index, bytesPerSuccessfulRoute: 1400 + index * 10, acknowledgedWriteLossCount: 0, invalidSignedStateAcceptedCount: 0, staleRevokedReceiptAcceptedCount: 0 }));
  const summary = summarizeAdversarialCampaignRuns(runs);
  assert.equal(summary.completedRuns, 4);
  assert.equal(evaluateRandomizedAdversarialCampaign(summary).passed, true);
});

test('adversarial campaign fails closed on incomplete or unsafe observations', () => {
  const runs = [
    { completed: true, routingSuccessRatio: 0.99, convergenceMs: 20_000, recoveryMs: 20_000, latencyMs: 10, bytesPerSuccessfulRoute: 1000, acknowledgedWriteLossCount: 0, invalidSignedStateAcceptedCount: 0, staleRevokedReceiptAcceptedCount: 0 },
    { completed: false },
    { completed: true, routingSuccessRatio: 0.94, convergenceMs: 20_000, recoveryMs: 20_000, latencyMs: 10, bytesPerSuccessfulRoute: 1000, acknowledgedWriteLossCount: 1, invalidSignedStateAcceptedCount: 0, staleRevokedReceiptAcceptedCount: 0 },
    { completed: true, routingSuccessRatio: 0.99, convergenceMs: 20_000, recoveryMs: 20_000, latencyMs: 10, bytesPerSuccessfulRoute: 1000, acknowledgedWriteLossCount: 0, invalidSignedStateAcceptedCount: 0, staleRevokedReceiptAcceptedCount: 0 }
  ];
  const result = evaluateRandomizedAdversarialCampaign(summarizeAdversarialCampaignRuns(runs));
  assert.equal(result.passed, false);
  assert.ok(result.failed.includes('complete'));
  assert.ok(result.failed.includes('routingFloor'));
  assert.ok(result.failed.includes('noAcknowledgedWriteLoss'));
});
