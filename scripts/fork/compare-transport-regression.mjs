#!/usr/bin/env node
// Run upstream regression cases against both transport versions without Studio.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const core = path.join(root, 'packages/core');
const originalTest = path.join(core, 'src/__tests__/studio-transport.test.ts');
const suffix = `${process.pid}-${Date.now()}`;
const baselineName = `studio-transport-${suffix}.local`;
const baselineSource = path.join(core, `src/${baselineName}.ts`);
const baselineTest = path.join(core, `src/__tests__/studio-transport-${suffix}.local.test.ts`);
const local = path.join(root, 'local/transport-comparison');
const pattern = 'keeps a peer that answers pings|a disconnect frame unregisters';
const gitFile = (ref, file) => execFileSync('git', ['show', `${ref}:${file}`], { cwd: root, encoding: 'utf8' });
const normalizedFile = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

assert.equal(gitFile('v3.2.0', 'packages/core/src/bridge-service.ts'), gitFile('v3.2.1', 'packages/core/src/bridge-service.ts'), 'Bridge changed: compare the complete baseline instead');
assert.equal(normalizedFile(originalTest), gitFile('v3.2.1', 'packages/core/src/__tests__/studio-transport.test.ts'), 'Upstream regression suite has local changes');
assert.equal(normalizedFile(path.join(core, 'src/studio-transport.ts')), gitFile('v3.2.1', 'packages/core/src/studio-transport.ts'), 'Current transport has local changes');
mkdirSync(local, { recursive: true });
const ownedFiles = [];
try {
  writeFileSync(baselineSource, gitFile('v3.2.0', 'packages/core/src/studio-transport.ts'), { flag: 'wx' });
  ownedFiles.push(baselineSource);
  const test = readFileSync(originalTest, 'utf8').replace("from '../studio-transport.js'", `from '../${baselineName}.js'`);
  assert.notEqual(test, readFileSync(originalTest, 'utf8'), 'Transport import was not redirected');
  writeFileSync(baselineTest, test, { flag: 'wx' });
  ownedFiles.push(baselineTest);
  const results = [];
  for (const [version, testPath, expectedFailures] of [['3.2.1', originalTest, 0], ['3.2.0', baselineTest, 2]]) {
    const output = path.join(local, `${version}-${suffix}.json`);
    const run = spawnSync(process.execPath, [
      path.join(root, 'node_modules/jest/bin/jest.js'),
      '--config', path.join(core, 'jest.config.js'), '--runInBand', '--runTestsByPath', testPath,
      '--testNamePattern', pattern, '--json', '--outputFile', output,
    ], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 120000 });
    if (run.error) throw run.error;
    const summary = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(summary.numFailedTests, expectedFailures, `${version}: unexpected failed test count\n${run.stderr}`);
    assert.equal(summary.numPassedTests + summary.numFailedTests, 2, `${version}: expected two assertions, not a compile failure`);
    assert.equal(run.status, expectedFailures ? 1 : 0, `${version}: unexpected process exit`);
    for (const suite of summary.testResults) {
      for (const item of suite.assertionResults.filter((result) => result.status === 'failed')) {
        assert.match(item.failureMessages.join('\n'), /expect\(received\)/, `${version}: failed before reaching the regression assertion`);
      }
    }
    results.push({ version, passed: summary.numPassedTests, failed: summary.numFailedTests,
      cases: summary.testResults.flatMap((suite) => suite.assertionResults.filter((item) => item.status !== 'pending').map((item) => ({ name: item.title, status: item.status }))) });
  }
  const report = { checkedAt: new Date().toISOString(), comparisonMatched: true, scope: 'simulated_transport_only', results };
  writeFileSync(path.join(local, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const file of ownedFiles) rmSync(file, { force: true });
}
