import test from 'node:test';
import assert from 'node:assert/strict';
import { runClassD1000LocalSafetyProbes } from '../benchmarks/scale/class-d-1000-safety-probes.js';

test('D-1000 exact-commit safety probes reject stale receipts and foreign provider execution', async () => {
  const result = await runClassD1000LocalSafetyProbes();
  assert.equal(result.staleRevokedReceiptAcceptedCount, 0);
  assert.equal(result.unauthorizedProviderExecutionCount, 0);
  assert.equal(result.probes.staleReceipt.freshReceiptVerified, true);
  assert.equal(result.probes.staleReceipt.revocationApplied, true);
  assert.equal(result.probes.staleReceipt.reason, 'trust_receipt_v2_lifecycle_head_stale');
  assert.equal(result.probes.providerAuthorization.accessDenied, true);
  assert.equal(result.probes.providerAuthorization.handled, 1);
});
