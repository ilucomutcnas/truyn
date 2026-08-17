import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const tests = readdirSync('tests').filter((name) => name.endsWith('.test.js')).sort();
for (const name of tests) {
  const file = `tests/${name}`;
  const run = spawnSync(process.execPath, ['--test', file], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if ((run.status ?? 1) !== 0) {
    const output = `${run.stdout || ''}${run.stderr || ''}`;
    const lines = output.split(/\r?\n/);
    const useful = lines.filter((line) => /^(not ok|# Subtest:)|failureType:|error:|code:|name:|expected:|actual:|operator:|AssertionError|ERR_|Public repository leakage guard failed|benchmark|evidence|peer_record|PING/i.test(line.trim()));
    const compact = useful.slice(-180).join('\n').replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.log(`::error file=${file},title=TRUYN final isolated failure::${compact}`);
    process.exit(run.status ?? 1);
  }
}
console.log('::notice title=TRUYN isolated suite::All top-level test files pass separately');
