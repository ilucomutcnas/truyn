import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('repository, specification, and SDK license surfaces are Apache-2.0', () => {
  const license = read('LICENSE');
  const notice = read('NOTICE');
  const specLicense = read('spec/LICENSE');
  const specNotice = read('spec/NOTICE');
  const sdkLicense = read('sdk/LICENSE');
  const sdkNotice = read('sdk/NOTICE');
  const packageJson = JSON.parse(read('package.json'));
  const readme = read('README.md');
  const structure = read('STRUCTURE.md');
  const contributing = read('CONTRIBUTING.md');
  const specReadme = read('spec/README.md');
  const sdkReadme = read('sdk/README.md');

  assert.match(license, /Apache License\s+Version 2\.0/);
  assert.equal(packageJson.license, 'Apache-2.0');
  assert.equal(specLicense, license);
  assert.equal(sdkLicense, license);

  assert.match(notice, /^TRUYN — The Intelligence Network/m);
  assert.match(notice, /https:\/\/truyn\.org/);
  assert.equal(specNotice, notice);
  assert.equal(sdkNotice, notice);

  for (const [name, content] of [
    ['README.md', readme],
    ['STRUCTURE.md', structure],
    ['CONTRIBUTING.md', contributing],
    ['spec/README.md', specReadme],
    ['sdk/README.md', sdkReadme],
  ]) {
    assert.match(content, /Apache(?: License)? 2\.0|Apache-2\.0/, `${name} must identify Apache-2.0`);
    assert.doesNotMatch(content, /\b0BSD\b|Zero-Clause BSD/i, `${name} must not advertise the former 0BSD license`);
  }
});
