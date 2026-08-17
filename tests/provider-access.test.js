import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { TruynAdapterHost } from '../adapters/sdk/index.js';

test('provider access is owner-only by default at the lowest policy layer', () => {
  const previous = process.env.TRUYN_PROVIDER_ACCESS_MODE;
  delete process.env.TRUYN_PROVIDER_ACCESS_MODE;
  try {
    const policy = createProviderAccessPolicy();
    assert.equal(policy.mode, 'owner-only');
    assert.deepEqual(policy.authorize({ from: 'truyn:node:external' }), {
      ok: false,
      mode: 'owner-only',
      reason: 'no_allowed_requesters'
    });
  } finally {
    if (previous == null) delete process.env.TRUYN_PROVIDER_ACCESS_MODE;
    else process.env.TRUYN_PROVIDER_ACCESS_MODE = previous;
  }
});

test('public provider access remains an explicit opt-in', () => {
  const policy = createProviderAccessPolicy({ mode: 'public' });
  assert.deepEqual(policy.authorize({ from: 'truyn:node:external' }), { ok: true, mode: 'public' });
});

test('owner-only provider policy denies when allowlist is empty', () => {
  const policy = createProviderAccessPolicy({ mode: 'owner-only', allowedRequesterIds: '' });
  assert.deepEqual(policy.authorize({ from: 'truyn:node:external' }), {
    ok: false,
    mode: 'owner-only',
    reason: 'no_allowed_requesters'
  });
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
