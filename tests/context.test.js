import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { applyContextDelta, buildContextDocument, verifyContextManifest, verifyContextSelection } from '../core/context/index.js';

test('content CID is deterministic and delta produces a new immutable root', () => {
  const baseBlocks = [
    { id: 'b', text: 'beta' },
    { id: 'a', text: 'alpha' }
  ];
  const first = buildContextDocument(baseBlocks);
  const second = buildContextDocument([...baseBlocks].reverse());
  assert.equal(first.cid, second.cid);
  assert.equal(verifyContextManifest(first.manifest, first.cid).ok, true);

  const changed = applyContextDelta(baseBlocks, [{ op: 'replace', id: 'b', text: 'beta-v2' }]);
  const child = buildContextDocument(changed);
  assert.notEqual(child.cid, first.cid);
  assert.equal(first.blocks.find((block) => block.id === 'b').text, 'beta');
  assert.equal(child.blocks.find((block) => block.id === 'b').text, 'beta-v2');
});

test('relay context ACL, delta and provider-side selection verification work end-to-end', async (t) => {
  const relay = createRelay();
  const relayUrl = await relay.listen();
  t.after(async () => relay.close());

  const owner = new TruynNode({ relayUrl });
  const provider = new TruynNode({ relayUrl });
  const stranger = new TruynNode({ relayUrl });
  await owner.register({ name: 'context-owner' });
  await provider.register({ name: 'context-provider' });
  await stranger.register({ name: 'context-stranger' });

  const base = await owner.putContext([
    { id: 'policy', text: 'Policy version one. ACCESS_CODE=OLD-17.' },
    { id: 'background', text: 'Background material that should not be selected.' }
  ], { readers: [provider.identity.nodeId] });
  assert.ok(base.cid.startsWith('truyn:ctx:'));

  const child = await owner.deltaContext(base.cid, [
    { op: 'replace', id: 'policy', text: 'Policy version two. ACCESS_CODE=NEW-42.' }
  ]);
  assert.notEqual(child.cid, base.cid);
  assert.ok(child.deltaBytes < base.serializedBytes);

  const selected = await provider.selectContext(child.cid, ['policy']);
  assert.equal(selected.blocks.length, 1);
  assert.match(selected.blocks[0].text, /NEW-42/);
  assert.equal(verifyContextSelection(child.manifest, selected.blocks, child.cid).ok, true);

  const materialized = await provider.materializeContextRefs({
    task: 'Read the selected policy.',
    context: { $context: { cid: child.cid, ids: ['policy'] } }
  });
  assert.match(materialized.value.context, /NEW-42/);
  assert.equal(materialized.stats.contextRefs, 1);
  assert.equal(materialized.stats.selectedBlocks, 1);
  assert.ok(materialized.stats.selectedContentBytes > 0);

  await assert.rejects(
    stranger.selectContext(child.cid, ['policy']),
    (error) => error?.status === 403 && error?.message === 'context_forbidden'
  );
});
