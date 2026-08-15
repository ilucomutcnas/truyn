import test from 'node:test';
import assert from 'node:assert/strict';
import { createNodeBackchannelPolicy } from '../core/security/node-backchannel.js';
import { createRuntimeBackchannelConfig } from '../runtime/backchannel-config.js';

test('provider backchannel policy is inert when no protected nodes are configured', () => {
  const policy = createNodeBackchannelPolicy();
  assert.equal(policy.configured, false);
  assert.equal(policy.requiresProof('node-public'), false);
  assert.deepEqual(policy.authorize('node-public', null), { ok: true, protected: false });
});

test('provider backchannel policy fails closed on partial configuration', () => {
  assert.throws(
    () => createNodeBackchannelPolicy({ protectedNodeIds: ['node-owner'] }),
    /require a backchannel token/
  );
  assert.throws(
    () => createNodeBackchannelPolicy({ token: 'secret' }),
    /requires protected provider node IDs/
  );

  assert.throws(
    () => createRuntimeBackchannelConfig({
      TRUYN_ROLE: 'relay',
      TRUYN_PROTECTED_PROVIDER_NODE_IDS: 'node-owner'
    }),
    /TRUYN_PROVIDER_BACKCHANNEL_TOKEN/
  );
  assert.throws(
    () => createRuntimeBackchannelConfig({
      TRUYN_ROLE: 'relay',
      TRUYN_PROVIDER_BACKCHANNEL_TOKEN: 'secret'
    }),
    /TRUYN_PROTECTED_PROVIDER_NODE_IDS/
  );
});

test('protected provider identity requires the exact M2M proof while ordinary nodes remain unaffected', () => {
  const policy = createNodeBackchannelPolicy({
    protectedNodeIds: ['node-owner-a', 'node-owner-b'],
    token: 'owner-backchannel-secret'
  });

  assert.equal(policy.configured, true);
  assert.deepEqual(policy.protectedNodeIds, ['node-owner-a', 'node-owner-b']);
  assert.equal(policy.requiresProof('node-owner-a'), true);
  assert.equal(policy.requiresProof('node-user'), false);

  assert.deepEqual(policy.authorize('node-user', null), { ok: true, protected: false });
  assert.deepEqual(policy.authorize('node-owner-a', null), {
    ok: false,
    protected: true,
    reason: 'provider_backchannel_denied'
  });
  assert.deepEqual(policy.authorize('node-owner-a', 'wrong-secret'), {
    ok: false,
    protected: true,
    reason: 'provider_backchannel_denied'
  });
  assert.deepEqual(policy.authorize('node-owner-a', 'owner-backchannel-secret'), {
    ok: true,
    protected: true
  });
});

test('provider runtime may hold the proof without knowing the relay protected-node list', () => {
  assert.deepEqual(createRuntimeBackchannelConfig({
    TRUYN_ROLE: 'provider',
    TRUYN_PROVIDER_BACKCHANNEL_TOKEN: 'provider-side-secret'
  }), {
    protectedProviderNodeIds: [],
    providerBackchannelToken: 'provider-side-secret'
  });
});
