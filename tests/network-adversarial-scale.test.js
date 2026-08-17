import assert from 'node:assert/strict';
import test from 'node:test';
import { runAdversarialScaleGate } from '../simulations/network-failure/adversarial-scale.js';

test('adversarial QUIC/Kademlia scale harness isolates partitions and rejects Byzantine/Sybil/colluding responses', { timeout: 120_000 }, async () => {
  const report = await runAdversarialScaleGate({
    count: 8,
    seed: 0x54525559,
    baselineProviders: 6,
    baselineSamples: 6
  });

  assert.equal(report.finalNetwork.live, 8);
  assert.equal(report.finalNetwork.uniqueLibp2pPeerIds, 8);
  assert.equal(report.finalNetwork.uniqueTruynNodeIds, 8);
  assert.ok(report.baseline.routingSuccessRatio >= 0.95, JSON.stringify(report.baseline, null, 2));
  assert.ok(report.baseline.endToEndIntegritySuccessRatio >= 0.95, JSON.stringify(report.baseline, null, 2));

  assert.equal(report.partition.samePartitionRoutingSucceeded, true);
  assert.equal(report.partition.crossPartitionRoutingBlocked, true);
  assert.equal(report.partition.healed, true);

  assert.equal(report.churn.recoveredNodes, report.churn.stoppedNodes);
  assert.equal(report.churn.peerIdentityRotations, report.churn.stoppedNodes);

  assert.equal(report.eclipse.integrityForged, false);
  assert.equal(report.eclipse.healed, true);

  assert.equal(report.sybilPressure.integrityPreserved, true);
  assert.equal(report.byzantineCollusion.integrityPreserved, true);
  assert.equal(report.byzantineCollusion.maliciousAccepted, 0);
  assert.equal(report.passed, true, JSON.stringify(report.gates, null, 2));
});
