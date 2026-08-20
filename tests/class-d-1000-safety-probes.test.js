import test from 'node:test';
import assert from 'node:assert/strict';
import { runClassD1000LocalSafetyProbes } from '../benchmarks/scale/class-d-1000-safety-probes.js';
import {
  INVALID_SIGNATURE_REJECTION,
  isExpectedInvalidSignatureRejection,
  mutateSignature
} from '../benchmarks/scale/class-d-1000-remote-dht-probe.js';

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

test('remote DHT probe mutates only the signature and recognizes only target signature rejection', () => {
  const record = {
    recordId: 'truyn:dht:test',
    protocol: 'truyn-kademlia-v1',
    value: { valid: true },
    signature: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  };
  const forged = mutateSignature(record);
  assert.notEqual(forged.signature, record.signature);
  assert.equal(forged.signature.slice(1), record.signature.slice(1));
  assert.deepEqual(forged.value, record.value);
  assert.equal(forged.recordId, record.recordId);
  assert.equal(isExpectedInvalidSignatureRejection(INVALID_SIGNATURE_REJECTION), true);
  assert.equal(isExpectedInvalidSignatureRejection('TRUYN_DHT_RPC_TIMEOUT'), false);
  assert.equal(isExpectedInvalidSignatureRejection('invalid_dht_record:dht_value_digest_mismatch'), false);
});
