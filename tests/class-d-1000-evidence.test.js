import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAzureClassD1000Evidence } from '../benchmarks/scale/class-d-1000-evidence.js';

function passing() {
  return {
    scope: '1000-real-process-scale',
    testedCommit: 'abc123',
    workflowRunId: '42',
    topology: {
      nodeCount: 1000,
      realProcessCount: 1000,
      hostCount: 20,
      uniqueIdentityCount: 1000,
      uniqueEndpointCount: 1000,
      syntheticNodeCount: 0
    },
    routing: {
      baselineSuccessRatio: 0.995,
      postRestartSuccessRatio: 0.994
    },
    convergence: { latencyMs: { p95: 120_000 } },
    recovery: { latencyMs: { p95: 130_000 } },
    safety: {
      acknowledgedWriteLossCount: 0,
      invalidSignedStateAcceptedCount: 0,
      staleRevokedReceiptAcceptedCount: 0,
      unauthorizedProviderExecutionCount: 0
    },
    cleanup: { confirmed: true, remainingResources: 0 }
  };
}

test('real D-1000 evidence passes only with exact process/identity/socket counts, safety and cleanup', () => {
  const result = evaluateAzureClassD1000Evidence(passing());
  assert.equal(result.passed, true);
  assert.deepEqual(result.failed, []);
  assert.equal(result.derivation.healedRoutingMetric, 'routing.postRestartSuccessRatio');
});

test('logical count cannot substitute for 1000 real processes', () => {
  const raw = passing();
  raw.topology.realProcessCount = 100;
  const result = evaluateAzureClassD1000Evidence(raw);
  assert.equal(result.passed, false);
  assert.ok(result.failed.includes('realNodes'));
});

test('D-1000 evidence fails closed on cleanup, write loss, synthetic nodes or insufficient host domains', () => {
  const raw = passing();
  raw.cleanup.confirmed = false;
  raw.cleanup.remainingResources = 3;
  raw.safety.acknowledgedWriteLossCount = 1;
  raw.topology.syntheticNodeCount = 1;
  raw.topology.hostCount = 19;
  const result = evaluateAzureClassD1000Evidence(raw);
  assert.equal(result.passed, false);
  assert.ok(result.failed.includes('cleanup'));
  assert.ok(result.failed.includes('noRemainingResources'));
  assert.ok(result.failed.includes('noAcknowledgedWriteLoss'));
  assert.ok(result.failed.includes('noSyntheticNodes'));
  assert.ok(result.failed.includes('hostFailureDomains'));
});

test('D-1000 evidence fails closed when healed routing or safety counters are absent', () => {
  const raw = passing();
  delete raw.routing.postRestartSuccessRatio;
  delete raw.safety.invalidSignedStateAcceptedCount;
  delete raw.safety.staleRevokedReceiptAcceptedCount;
  delete raw.safety.unauthorizedProviderExecutionCount;
  const result = evaluateAzureClassD1000Evidence(raw);
  assert.equal(result.passed, false);
  assert.ok(result.failed.includes('healedRouting'));
  assert.ok(result.failed.includes('noInvalidSignedStateAccepted'));
  assert.ok(result.failed.includes('noStaleRevokedReceiptAccepted'));
  assert.ok(result.failed.includes('noUnauthorizedProviderExecution'));
});

test('empty evidence is never promotable to D-1000', () => {
  const result = evaluateAzureClassD1000Evidence({});
  assert.equal(result.passed, false);
  assert.ok(result.failed.includes('realNodes'));
  assert.ok(result.failed.includes('distinctIdentities'));
  assert.ok(result.failed.includes('distinctQuicSockets'));
  assert.ok(result.failed.includes('noSyntheticNodes'));
  assert.ok(result.failed.includes('healedRouting'));
  assert.ok(result.failed.includes('noInvalidSignedStateAccepted'));
  assert.ok(result.failed.includes('cleanup'));
  assert.ok(result.failed.includes('noRemainingResources'));
});
