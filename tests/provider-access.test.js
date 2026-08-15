import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { TruynAdapterHost } from '../adapters/sdk/index.js';

test('provider policy is fail-closed by default', () => {
  const previousMode = process.env.TRUYN_PROVIDER_ACCESS_MODE;
  const previousAllowed = process.env.TRUYN_ALLOWED_REQUESTER_IDS;
  delete process.env.TRUYN_PROVIDER_ACCESS_MODE;
  delete process.env.TRUYN_ALLOWED_REQUESTER_IDS;
  try {
    const policy = createProviderAccessPolicy();
    assert.equal(policy.mode, 'owner-only');
    assert.equal(policy.authorize({ from: 'truyn:node:external' }).ok, false);
  } finally {
    if (previousMode === undefined) delete process.env.TRUYN_PROVIDER_ACCESS_MODE; else process.env.TRUYN_PROVIDER_ACCESS_MODE = previousMode;
    if (previousAllowed === undefined) delete process.env.TRUYN_ALLOWED_REQUESTER_IDS; else process.env.TRUYN_ALLOWED_REQUESTER_IDS = previousAllowed;
  }
});

test('owner-only provider policy only permits exact requester identity', () => {
  const policy = createProviderAccessPolicy({ mode: 'owner-only', allowedRequesterIds: 'truyn:node:owner' });
  assert.equal(policy.authorize({ from: 'truyn:node:owner' }).ok, true);
  assert.equal(policy.authorize({ from: 'truyn:node:external' }).ok, false);
});

test('AdapterHost denies before paid adapter execution', async () => {
  let executions = 0;
  let resultPayload = null;
  const node = {
    sessionToken: null,
    async register() { this.sessionToken = 'session'; },
    async offer() { return { offerId: 'offer-1' }; },
    async poll() {
      return {
        events: [{
          kind: 'NEED',
          verification: { ok: true },
          envelope: {
            id: 'need-1',
            from: 'truyn:node:external',
            payload: { capability: 'reasoning.general', input: 'do not execute' }
          }
        }]
      };
    },
    async result(id, output, metadata) { resultPayload = { id, output, metadata }; }
  };
  const adapter = {
    name: 'paid-provider',
    version: '1',
    capabilities: ['reasoning.general'],
    async execute() { executions += 1; return { output: 'spent tokens' }; }
  };
  const host = new TruynAdapterHost({
    node,
    adapter,
    accessPolicy: createProviderAccessPolicy({ mode: 'owner-only', allowedRequesterIds: 'truyn:node:owner' })
  });
  const run = await host.runOnce();
  assert.equal(run.handled, 1);
  assert.equal(executions, 0);
  assert.equal(resultPayload.output, null);
  assert.equal(resultPayload.metadata.error, 'PROVIDER_ACCESS_DENIED');
  assert.equal(resultPayload.metadata.accessDenied, true);
});
