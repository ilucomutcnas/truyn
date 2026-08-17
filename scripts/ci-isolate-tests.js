import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const tests = readdirSync('tests').filter((name) => name.endsWith('.test.js')).sort();
for (const name of tests) {
  const file = `tests/${name}`;
  const run = spawnSync(process.execPath, ['--test', file], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if ((run.status ?? 1) !== 0) {
    const output = `${run.stdout || ''}${run.stderr || ''}`;
    const tail = output.slice(-6000).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.log(`::error file=${file},title=TRUYN isolated test failure::${tail}`);
    process.exit(run.status ?? 1);
  }
}
console.log('::notice title=TRUYN isolated suite::All top-level test files pass separately');
