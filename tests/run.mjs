/**
 * EasyWeb Ad Blocker — test runner
 *
 * Runs every *.test.mjs in this directory in its own process so a failure in one
 * suite cannot affect the others. Exits non-zero when anything fails.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const suites = fs.readdirSync(__dirname)
  .filter((file) => file.endsWith('.test.mjs'))
  .sort();

let failed = 0;
const summary = [];

for (const suite of suites) {
  const result = spawnSync(process.execPath, [path.join(__dirname, suite)], { encoding: 'utf8' });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  const tally = output.split('\n').filter(Boolean).pop() || 'no output';

  if (result.status === 0) {
    summary.push(`  ✓ ${suite.padEnd(28)} ${tally}`);
  } else {
    failed += 1;
    summary.push(`  ✗ ${suite.padEnd(28)} ${tally}`);
    console.log(`\n--- ${suite} ---\n${output}\n`);
  }
}

console.log('\n🛡  Ad blocker test suites');
console.log(summary.join('\n'));
console.log(`\n${suites.length - failed}/${suites.length} suites passed`);

process.exitCode = failed ? 1 : 0;
