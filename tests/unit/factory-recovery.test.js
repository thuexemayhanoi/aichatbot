import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryChecksReady, recoveryCodeUnchanged } from '../../tools/factory-recovery.mjs';

const sha = 'a'.repeat(40);
const green = (path, id) => ({
  path, id, head_sha: sha, head_branch: 'main', event: 'push',
  status: 'completed', conclusion: 'success',
});

test('diagnostic result commits do not invalidate green production checks', () => {
  const runs = [
    green('.github/workflows/ci.yml', 1),
    green('.github/workflows/distribution.yml', 2),
  ];
  assert.equal(recoveryChecksReady(runs, sha), true);
  // Real incident: ops-qa-runner's [skip ci] result landed AFTER both suites.
  assert.equal(recoveryCodeUnchanged(['ops/qa-result.txt']), true);
  assert.equal(recoveryCodeUnchanged([
    'ops/qa-result.txt',
    'ops/out/assignments-next.json',
    'ops/out/shim-log.txt',
    'ops/out/verify-verdict.txt',
  ]), true);
});

test('only allowlisted diagnostics can reuse green checks; code, workflow and candidate changes cannot', () => {
  for (const path of [
    'tools/factory-controller.mjs',
    'tools/factory-recovery.mjs',
    '.github/workflows/auto-writer.yml',
    'tests/unit/factory-recovery.test.js',
    'ops/candidate/request.txt',
    'ops/candidate/chunk.json',
    'ops/out/unreviewed-script.js',
    'ops/qa-result.txt/anything',
  ]) {
    assert.equal(recoveryCodeUnchanged([path]), false, path);
    assert.equal(recoveryCodeUnchanged(['ops/qa-result.txt', path]), false, path);
  }
});

test('no stale or failed CI/Distribution run can satisfy the recovery gate', () => {
  const ci = green('.github/workflows/ci.yml', 1);
  const dist = green('.github/workflows/distribution.yml', 2);
  assert.equal(recoveryChecksReady([ci], sha), false);
  assert.equal(recoveryChecksReady([ci, { ...dist, conclusion: 'failure' }], sha), false);
  assert.equal(recoveryChecksReady([ci, { ...dist, head_sha: 'b'.repeat(40) }], sha), false);
  assert.equal(recoveryChecksReady([{ ...ci, event: 'pull_request' }, dist], sha), false);
  assert.equal(recoveryChecksReady([ci, dist], sha), true);
});
