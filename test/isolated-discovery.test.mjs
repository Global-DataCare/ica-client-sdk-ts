// Flow contract: the default isolated test command discovers both client and controller-binding suites; live HTTP tests require their explicit journey.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

test('default Jest discovery includes every isolated suite and separates the real HTTP journey', () => {
  const output = execFileSync(process.execPath, [
    path.join(root, 'node_modules/jest/bin/jest.js'), '--listTests', '--json', '--runInBand',
  ], { cwd: root, encoding: 'utf8' });
  const discovered = JSON.parse(output).map((file) => path.basename(file)).sort();
  assert.deepEqual(discovered, ['IcaClient.test.ts', 'controllerBinding.test.ts']);
});
