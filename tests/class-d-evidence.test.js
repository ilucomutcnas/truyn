import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateAzureClassD100Evidence,
  normalizeAzureClassD100Evidence
} from '../benchmarks/scale/class-d-evidence.js';

function passingRawEvidence() {
  return {
    scope: '100-real-process-resilience',
    testedCommit: 'abc123',
    workflowRunId: '42',
    topology: {
      nodeCount: 100,
      realProcessCount: 100,
      hostCount: 4,
      uniqueIdentityCount: 100,
      uniqueEndpointCount: 100,
      syntheticNodeCount: 0
    },
    baseline: { routingSuccess: 0.995 },
    adversarial: {
      randomizedChurn: { stopped: 8, restarted: 8, recoveryMs: 25_000 },
      packetPartition: { realPacketPath: true, blockedSuccesses: 0, recoveryMs: 20_000 },
      byzantineReplica: { invalidSignedStateAccepted: 0 },
      sybilPressure: { attackerNodes: 33, attackerBudgetFraction: 0.33 },
      eclipse: { exercised: true, escapedAfterHeal: true, durationMs: 10_000 },
      collusion: { colluders: 3, coordinatedValidSignedRecordsObserved: 3 }
    },
    hardInvariants: {
      invalidSignedStateAccepted: 0,
      staleOrRevokedReceiptAccepted: 0,
      acknowledgedDurableWriteLoss: 0
    },
    healed: {
      routingSuccess: 0.995,
      recoveryP95Ms: 25_000
    },
    cleanup: { confirmed: true }
  };
}

test('Azure Class D-100 evidence normalizes into canonical evaluator schema', () => {
  const { normalized, derivation } = normalizeAzureClassD100Evidence(passingRawEvidence());
  assert.equal(normalized.topology.realNodeCount, 100);
  assert.equal(normalized.topology.distinctIdentityCount, 100);
  assert.equal(normalized.topology.distinctQuicSocketCount, 100);
  assert.equal(normalized.topology.hostCount, 4);
  assert.equal(normalized.routing.baselineSuccessRatio, 0.995);
  assert.equal(normalized.routing.healedSuccessRatio, 0.995);
  assert.equal(normalized.recovery.latencyMs.p95, 25_000);
  assert.equal(normalized.convergence.latencyMs.p95, 25_000);
  assert.equal(normalized.cleanup.complete, true);
  assert.equal(derivation.convergenceMetric, 'healed.recoveryP95Ms');
});

test('real Azure Class D-100 evidence must pass the canonical evaluator', () => {
  const result = evaluateAzureClassD100Evidence(passingRawEvidence());
  assert.equal(result.passed, true);
  assert.deepEqual(result.failed, []);
});

test('cleanup, routing, safety and adversarial evidence fail closed', () => {
  const raw = passingRawEvidence();
  raw.cleanup.confirmed = false;
  raw.baseline.routingSuccess = 0.98;
  raw.hardInvariants.invalidSignedStateAccepted = 1;
  raw.adversarial.eclipse.exercised = false;

  const result = evaluateAzureClassD100Evidence(raw);
  assert.equal(result.passed, false);
  assert.ok(result.failed.includes('cleanup'));
  assert.ok(result.failed.includes('baselineRouting'));
  assert.ok(result.failed.includes('noInvalidSignedStateAccepted'));
  assert.ok(result.failed.includes('eclipseExercised'));
});

test('missing real-node evidence cannot be promoted to Class D-100', () => {
  const result = evaluateAzureClassD100Evidence({});
  assert.equal(result.passed, false);
  assert.ok(result.failed.includes('realNodes'));
  assert.ok(result.failed.includes('distinctIdentities'));
  assert.ok(result.failed.includes('distinctQuicSockets'));
  assert.ok(result.failed.includes('cleanup'));
});
