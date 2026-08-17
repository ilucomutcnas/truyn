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

if ((run.status ?? 1) !== 0) {
  const output = `${run.stdout || ''}${run.stderr || ''}`;
  const lines = output.split(/\r?\n/);
  const useful = [];
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (/^(not ok|# Subtest:)/.test(trimmed) || /failureType:|error:|code:|name:|expected:|actual:|operator:|AssertionError|ERR_|condition_not_met|Public repository leakage guard failed|peer_record|PING/i.test(trimmed)) {
      useful.push(...lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 5)));
    }
  }
  const compact = [...new Set(useful)].slice(-220).join('\n')
    .replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.log(`::error title=TRUYN full-suite regression::${compact}`);
}

process.exit(run.status ?? 1);
