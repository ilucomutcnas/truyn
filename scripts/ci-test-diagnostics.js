import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const tests = readdirSync('tests')
  .filter((name) => name.endsWith('.test.js'))
  .sort()
  .map((name) => `tests/${name}`);

const run = spawnSync(process.execPath, ['--test', ...tests], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024
});

const output = `${run.stdout || ''}${run.stderr || ''}`;
process.stdout.write(output);

if ((run.status ?? 1) !== 0) {
  const tail = output.slice(-7000)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
  console.log(`::error title=TRUYN npm test failure::${tail}`);
}

process.exit(run.status ?? 1);
