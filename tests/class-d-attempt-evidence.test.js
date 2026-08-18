import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const PATH = new URL('../docs/benchmarks/CLASS_D_100_ATTEMPT_2026-08-17.md', import.meta.url);

test('unaccepted Class D-100 attempt remains durable and cannot be mistaken for PASS', async () => {
  const content = await readFile(PATH, 'utf8');
  assert.ok(Buffer.byteLength(content) >= 1800, 'Class D attempt evidence was replaced by a stub');
  for (const marker of [
    '# TRUYN Class D 100 Real-Node Attempt',
    '**Evidence status:** **UNACCEPTED / NOT A PASS CLAIM**',
    '## Why this attempt is not accepted',
    '## Required acceptance rerun',
    'complete ephemeral infrastructure cleanup'
  ]) assert.ok(content.includes(marker), `missing evidence marker: ${marker}`);
  assert.equal(content.includes('**Evidence status:** **PASS**'), false, 'unaccepted attempt must never be promoted to PASS');
});
