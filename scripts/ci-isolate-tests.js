import { spawnSync } from 'node:child_process';
const file = 'tests/public-repository.test.js';
const run = spawnSync(process.execPath, ['--test', file], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
if ((run.status ?? 1) !== 0) {
  const output = `${run.stdout || ''}${run.stderr || ''}`;
  const marker = 'Public repository leakage guard failed:';
  const index = output.indexOf(marker);
  const useful = index >= 0 ? output.slice(index, index + 9000) : output.slice(-9000);
  const compact = useful.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.log(`::error file=${file},title=TRUYN public guard violation::${compact}`);
}
process.exit(run.status ?? 1);
