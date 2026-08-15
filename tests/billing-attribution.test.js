import test from 'node:test';
import assert from 'node:assert/strict';
import {
  billingAttributionFromExecution,
  createBillingAttributionReceipt
} from '../core/security/billing-attribution.js';

test('successful chargeable receipt requires requester, provider, payer identity and request id', () => {
  assert.throws(() => createBillingAttributionReceipt({
    requesterId: 'truyn:node:requester',
    providerId: 'truyn:node:provider',
    billingMode: 'owner-funded',
    billingResponsibility: 'provider-owner'
  }), /requestId is required/);

  assert.throws(() => createBillingAttributionReceipt({
    requestId: 'req-1',
    requesterId: 'truyn:node:requester',
    providerId: 'truyn:node:provider',
    billingMode: 'owner-funded',
    billingResponsibility: 'provider-owner'
  }), /providerOwnerId is required/);
});

test('receipt records explicit billing identity without inventing unresolved tenants', () => {
  const receipt = createBillingAttributionReceipt({
    requestId: 'req-1',
    requesterId: 'truyn:node:requester',
    providerId: 'truyn:node:provider',
    providerOwnerId: 'truyn:node:provider',
    billingMode: 'byok',
    billingResponsibility: 'provider-owner',
    status: 'success'
  });

  assert.equal(receipt.version, 'billing-attribution/1');
  assert.equal(receipt.requesterTenant, null);
  assert.equal(receipt.providerTenant, null);
  assert.equal(receipt.providerOwnerId, 'truyn:node:provider');
  assert.equal(receipt.billingMode, 'byok');
});

test('usage is normalized to a stable allowlisted schema', () => {
  const receipt = createBillingAttributionReceipt({
    requestId: 'req-2',
    requesterId: 'truyn:node:requester',
    providerId: 'truyn:node:provider',
    providerOwnerId: 'truyn:node:provider',
    billingMode: 'subscription',
    billingResponsibility: 'requester-subscription',
    usage: {
      inputTokens: 10,
      outputTokens: 4,
      estimatedTokens: 20,
      requestBytes: 120,
      responseBytes: 80,
      apiKey: 'must-not-survive',
      authorization: 'Bearer must-not-survive'
    }
  });

  assert.deepEqual(receipt.usage, {
    inputTokens: 10,
    outputTokens: 4,
    totalTokens: 14,
    estimatedTokens: 20,
    reservedTokens: null,
    requestBytes: 120,
    responseBytes: 80,
    artifactBytes: null
  });
  const serialized = JSON.stringify(receipt);
  assert.equal(serialized.includes('must-not-survive'), false);
  assert.equal(serialized.includes('apiKey'), false);
  assert.equal(serialized.includes('Bearer '), false);
  assert.equal(Object.hasOwn(receipt.usage, 'authorization'), false);
});

test('execution receipt uses verified request/provider context and normalized provider metadata only', () => {
  const receipt = billingAttributionFromExecution({
    need: {
      id: 'need-1',
      from: 'truyn:node:requester',
      payload: { policy: { billing: { maxTokens: 64 } } }
    },
    providerId: 'truyn:node:provider',
    billing: {
      mode: 'sponsored',
      billingResponsibility: 'provider-owner-sponsored',
      reservedTokens: 64,
      secret: 'ignored'
    },
    resultMetadata: {
      inputTokens: 20,
      outputTokens: 10,
      latencyMs: 42,
      requestId: 'provider-request-1',
      token: 'ignored',
      apiKey: 'ignored'
    }
  });

  assert.equal(receipt.requestId, 'need-1');
  assert.equal(receipt.requesterId, 'truyn:node:requester');
  assert.equal(receipt.providerId, 'truyn:node:provider');
  assert.equal(receipt.providerOwnerId, 'truyn:node:provider');
  assert.equal(receipt.usage.totalTokens, 30);
  assert.equal(receipt.usage.estimatedTokens, 64);
  assert.equal(receipt.usage.reservedTokens, 64);
  assert.equal(receipt.providerRequestId, 'provider-request-1');
  assert.equal(receipt.quotaDecision, 'reserved');
  assert.equal(JSON.stringify(receipt).includes('ignored'), false);
});

test('execution receipt fails closed when billing responsibility is unresolved', () => {
  assert.throws(() => billingAttributionFromExecution({
    need: { id: 'need-2', from: 'truyn:node:requester' },
    providerId: 'truyn:node:provider',
    billing: { mode: 'owner-funded' }
  }), /billing authorization decision is required/);
});

test('unsupported billing mode and status are rejected', () => {
  const base = {
    requestId: 'req-3',
    requesterId: 'truyn:node:requester',
    providerId: 'truyn:node:provider',
    providerOwnerId: 'truyn:node:provider',
    billingResponsibility: 'provider-owner'
  };
  assert.throws(() => createBillingAttributionReceipt({ ...base, billingMode: 'mystery' }), /Unsupported billingMode/);
  assert.throws(() => createBillingAttributionReceipt({ ...base, billingMode: 'byok', status: 'unknown' }), /Unsupported billing attribution status/);
});
