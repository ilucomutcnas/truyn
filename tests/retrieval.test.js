import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { buildContextDocument, contextQueryHash, retrieveContextBlocks } from '../core/context/index.js';

function semanticFixture(count = 128) {
  const domains = ['aerospace','finance','biotech','logistics','energy','media','security','education'];
  const nouns = ['Aster','Boreal','Cygnus','Dorado','Eos','Fenix','Gaia','Helios','Ion','Juno','Kepler','Lumen','Mira','Nadir','Orion','Pavo'];
  return Array.from({ length: count }, (_, index) => {
    const code = String(index).padStart(3, '0');
    const alias = `${nouns[index % nouns.length]}-${1000 + index}`;
    const domain = domains[index % domains.length];
    const value = `WINDOW-${code}-P${(index % 7) + 1}`;
    const block = {
      id: `record-${code}`,
      text: `${alias} is the canonical ${domain} operations record. The approved maximum recovery duration and service restoration objective is ${value}. This value supersedes older recovery timing notes. Owner team ${nouns[(index + 5) % nouns.length]} maintains the record.`
    };
    const variants = [
      `What recovery window is currently approved for ${alias}?`,
      `For ${alias}, give the authoritative service restoration objective.`,
      `How long is the accepted recovery duration for ${alias}?`,
      `Which recovery-time value governs ${alias} now?`
    ];
    return { block, value, question: variants[index % variants.length] };
  });
}

test('hybrid retriever exceeds 99% top-1 accuracy without block ids in the query', () => {
  const fixture = semanticFixture();
  const document = buildContextDocument(fixture.map((item) => item.block));
  let correct = 0;
  for (let index = 0; index < fixture.length; index += 1) {
    const item = fixture[index];
    assert.equal(item.question.includes(item.block.id), false);
    const result = retrieveContextBlocks(document.blocks, item.question, { topK: 1 });
    assert.equal(result.queryHash, contextQueryHash(item.question));
    if (result.blocks[0]?.id === item.block.id) correct += 1;
  }
  const accuracy = correct / fixture.length;
  assert.ok(accuracy >= 0.99, `retrieval accuracy ${accuracy}`);
});

test('question + root CID retrieves verified context with provenance end-to-end', async (t) => {
  const relay = createRelay();
  const relayUrl = await relay.listen();
  t.after(async () => relay.close());
  const owner = new TruynNode({ relayUrl });
  const provider = new TruynNode({ relayUrl });
  const stranger = new TruynNode({ relayUrl });
  await owner.register({ name: 'semantic-owner' });
  await provider.register({ name: 'semantic-provider' });
  await stranger.register({ name: 'semantic-stranger' });
  const context = await owner.putContext([
    { id: 'ops-a', text: 'Helios observatory launch authorization is AUTH-HEL-904. The authorization is current and supersedes the retired code.' },
    { id: 'ops-b', text: 'Boreal warehouse cold-chain ceiling is TEMP-MINUS-18. This is unrelated to launch authorization.' },
    { id: 'ops-c', text: 'Cygnus treasury settlement window is SETTLE-TPLUS2. This is unrelated to observatory operations.' }
  ], { readers: [provider.identity.nodeId] });
  const question = 'Which current authorization code governs the Helios observatory launch?';
  assert.equal(question.includes('ops-a'), false);
  const retrieved = await provider.retrieveContext(context.cid, question, { topK: 1 });
  assert.equal(retrieved.blocks.length, 1);
  assert.equal(retrieved.blocks[0].id, 'ops-a');
  assert.match(retrieved.blocks[0].text, /AUTH-HEL-904/);
  assert.equal(retrieved.provenanceVerified, true);
  assert.equal(retrieved.retrieval.rootCid, context.cid);
  assert.equal(retrieved.retrieval.queryHash, contextQueryHash(question));
  assert.equal(retrieved.retrieval.selected[0].cid, retrieved.blocks[0].cid);
  const materialized = await provider.materializeContextRefs({
    question,
    context: { $context: { cid: context.cid, query: question, topK: 1 } }
  });
  assert.match(materialized.value.context, /AUTH-HEL-904/);
  assert.equal(materialized.stats.contextRefs, 1);
  assert.equal(materialized.stats.retrievalQueries, 1);
  assert.equal(materialized.stats.provenanceVerifiedRefs, 1);
  assert.equal(materialized.stats.selectedBlocks, 1);
  await assert.rejects(
    stranger.retrieveContext(context.cid, question, { topK: 1 }),
    (error) => error?.status === 403 && error?.message === 'context_forbidden'
  );
});
