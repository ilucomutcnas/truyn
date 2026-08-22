import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('repository license surfaces are Apache-2.0', () => {
  const license = read('LICENSE');
  const packageJson = JSON.parse(read('package.json'));
  const readme = read('README.md');
  const structure = read('STRUCTURE.md');
  const contributing = read('CONTRIBUTING.md');

  assert.match(license, /Apache License\s+Version 2\.0/);
  assert.equal(packageJson.license, 'Apache-2.0');

  for (const [name, content] of [
    ['README.md', readme],
    ['STRUCTURE.md', structure],
    ['CONTRIBUTING.md', contributing],
  ]) {
    assert.match(content, /Apache(?: License)? 2\.0|Apache-2\.0/, `${name} must identify Apache-2.0`);
    assert.doesNotMatch(content, /\b0BSD\b|Zero-Clause BSD/i, `${name} must not advertise the former 0BSD license`);
  }
});
