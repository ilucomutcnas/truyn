import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAzureClassD1000Evidence } from '../benchmarks/scale/class-d-1000-evidence.js';

function passing() {
  return {
    scope: '1000-real-process-scale+safety-contract-v2',
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
      postRestartSuccessRatio: 0.994,
      healedSuccessRatio: 0.993
    },
    convergence: { latencyMs: { p95: 120_000 } },
    recovery: { latencyMs: { p95: 130_000 } },
    adversarial: {
      packetPartition: {
        exercised: true,
        realPacketPath: true,
        probeCount: 20,
        blockedSuccesses: 0,
        recoveryMs: 12_000
      }
    },
    safety: {
      acknowledgedWriteLossCount: 0,
      invalidSignedStateAcceptedCount: 0,
      staleRevokedReceiptAcceptedCount: 0,
      unauthorizedProviderExecutionCount: 0,
      probes: {
        invalidSignedState: {
          remoteQuicControl: true,
          targetRejected: true,
          validRecordAcks: 3,
          rejectionReason: 'invalid_dht_record:dht_record_signature'
        },
        staleReceipt: {
          exactCommitLocalVerifier: true,
          reason: 'trust_receipt_v2_lifecycle_head_stale'
        },
        providerAuthorization: {
          exactCommitAdapterHost: true,
          accessDenied: true,
          adapterExecutions: 0
        }
      }
    },
    cleanup: { confirmed: true, remainingResources: 0 }
  };
}

test('real D-1000 evidence passes only with exact topology, probe-backed safety and cleanup', () => {
  const result = evaluateAzureClassD1000Evidence(passing());
  assert.equal(result.passed, true);
  assert.deepEqual(result.failed, []);
  assert.equal(result.derivation.healedRoutingMetric, 'routing.healedSuccessRatio after real packet partition');
  assert.equal(result.derivation.invalidSignedStateMetric, 'target-side QUIC dht.store rejection of signature-tampered record');
  assert.equal(result.derivation.invalidSignedStateProbe, true);
  assert.equal(result.derivation.staleReceiptProbe, true);
  assert.equal(result.derivation.providerAuthorizationProbe, true);
  assert.equal(result.derivation.packetPartitionProbe, true);
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

test('zero safety counters without executable-probe provenance cannot pass', () => {
  const raw = passing();
  delete raw.safety.probes;
  const result = evaluateAzureClassD1000Evidence(raw);
  assert.equal(result.passed, false);
  assert.ok(result.failed.includes('noInvalidSignedStateAccepted'));
  assert.ok(result.failed.includes('noStaleRevokedReceiptAccepted'));
  assert.ok(result.failed.includes('noUnauthorizedProviderExecution'));
  assert.equal(result.derivation.invalidSignedStateProbe, false);
  assert.equal(result.derivation.staleReceiptProbe, false);
  assert.equal(result.derivation.providerAuthorizationProbe, false);
});

test('sender-side or ambiguous DHT rejection cannot substitute for target-side QUIC rejection', () => {
  const raw = passing();
  raw.safety.probes.invalidSignedState.remoteQuicControl = false;
  raw.safety.probes.invalidSignedState.targetRejected = false;
  raw.safety.probes.invalidSignedState.rejectionReason = 'TRUYN_DHT_RPC_TIMEOUT';
  const result = evaluateAzureClassD1000Evidence(raw);
  assert.equal(result.passed, false);
  assert.ok(result.failed.includes('noInvalidSignedStateAccepted'));
  assert.equal(result.derivation.invalidSignedStateProbe, false);
});

test('post-restart routing cannot substitute for real partition-heal routing', () => {
  const raw = passing();
  delete raw.adversarial.packetPartition;
  raw.routing.postRestartSuccessRatio = 1;
  raw.routing.healedSuccessRatio = 1;
  const result = evaluateAzureClassD1000Evidence(raw);
  assert.equal(result.passed, false);
  assert.ok(result.failed.includes('healedRouting'));
  assert.equal(result.derivation.packetPartitionProbe, false);
});

test('D-1000 evidence fails closed when healed routing or safety counters are absent', () => {
  const raw = passing();
  delete raw.routing.healedSuccessRatio;
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
