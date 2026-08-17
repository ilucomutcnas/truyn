import { spawnSync } from 'node:child_process';
const file = 'tests/peer-record-renewal-productionization.test.js';
const run = spawnSync(process.execPath, ['--test', file], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
if ((run.status ?? 1) !== 0) {
  const output = `${run.stdout || ''}${run.stderr || ''}`;
  const lines = output.split(/\r?\n/);
  const useful = lines.filter((line) => /^(not ok|# Subtest:)|failureType:|error:|code:|name:|expected:|actual:|operator:|TestContext\.|AssertionError|assert\.|ERR_|condition_not_met|renewal_|PING|peer_record/i.test(line.trim()));
  const compact = useful.slice(-120).join('\n').replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.log(`::error file=${file},title=TRUYN isolated test failure::${compact}`);
}
process.exit(run.status ?? 1);
