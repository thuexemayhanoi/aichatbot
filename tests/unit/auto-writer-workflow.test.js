import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repo = new URL('../../', import.meta.url).pathname;
const workflow = readFileSync(join(repo, '.github/workflows/auto-writer.yml'), 'utf8');

test('maintenance dry-run opens only sandbox verification; production remains blocked by the incident or failed lock lookup', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'writer-gate-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'docs/state/operations'), { recursive: true });
  writeFileSync(join(dir, 'docs/state/operations/maintenance.json'), JSON.stringify({ production_enabled: true, active_incident: { incident_id: 'INC-test' } }));
  writeFileSync(join(dir, 'git'), '#!/bin/bash\nif [ "$FAIL_LOOKUP" = true ]; then exit 1; fi\necho "abc refs/ops/maintenance-lock/INC-test"\n', { mode: 0o755 });
  const script = workflow.split("- name: 'Ops gate")[1].split("\n      - name:")[0]
    .split('        run: |\n')[1].split('\n').map((line) => line.replace(/^          /, '')).join('\n');
  const run = (dry, fail) => {
    const output = join(dir, `output-${dry}-${fail}`);
    const p = spawnSync('bash', ['-e', '-c', script], { cwd: dir, encoding: 'utf8', env: {
      ...process.env, PATH: `${dir}:${process.env.PATH}`, DRY_RUN: dry, FAIL_LOOKUP: fail, GITHUB_OUTPUT: output,
    } });
    return { status: p.status, output: p.status === 0 ? readFileSync(output, 'utf8') : '' };
  };
  assert.match(run('true', 'true').output, /open=true\nread_only=true/);
  assert.match(run('false', 'false').output, /open=false/);
  assert.equal(run('false', 'true').status, 1, 'failed remote lookup must fail closed');
  const before = readFileSync(join(dir, 'docs/state/operations/maintenance.json'), 'utf8');
  assert.ok(before.includes('INC-test'), 'incident retained');
  for (const name of ['Mark the chunk READY_TO_PUSH', 'Push the writer branch', 'Dispatch the writer-publisher', 'No ACTIVE chunk']) {
    const step = workflow.split(`- name: '${name}`)[1].split('        run: |')[0];
    assert.match(step, /dry_run != 'true'/, name + ' excludes dry-run');
  }
});

test('a failed generation preserves outputs and reaches the failure handler', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'writer-failure-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'node'), '#!/bin/bash\necho status=FAILED\necho batch=WRITER-BATCH-0013\nexit 1\n', { mode: 0o755 });
  const output = join(dir, 'outputs');
  const section = workflow.split("- name: 'Generate the next chunk")[1].split('\n      # ---')[0];
  const script = section.split('        run: |\n')[1].split('\n').map((line) => line.replace(/^          /, '')).join('\n');
  const result = spawnSync('bash', ['-e', '-c', script], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_OUTPUT: output, DRY_RUN: 'false', MAX_ATTEMPTS: '2' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(readFileSync(output, 'utf8'), /status=FAILED/);
  const handler = workflow.split("- name: 'Fail closed on generation failure'")[1].split('\n      - name:')[0];
  assert.match(handler, /if: failure\(\).*steps.gen.outputs.status == 'FAILED'/);
  assert.match(handler, /source_run_id="\$GITHUB_RUN_ID"/);
});

test('inspect resumes a staged chunk without regenerating its prose', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'writer-resume-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const batch = { batch_id: 'WRITER-BATCH-0013', status: 'ACTIVE', chunks: [
    { seq: 4, writer: 'writer_A', status: 'RESERVED', ids: ['BA-0305', 'BA-0306'] },
  ] };
  const record = { ...batch.chunks[0], batch_id: batch.batch_id, status: 'READY_TO_PUSH' };
  mkdirSync(join(dir, 'docs/state'), { recursive: true });
  writeFileSync(join(dir, 'docs/state/writer-assignments.json'), JSON.stringify({ active: batch }));
  const chunkDir = join(dir, 'writer-work', batch.batch_id, 'A');
  mkdirSync(chunkDir, { recursive: true });
  writeFileSync(join(chunkDir, 'chunk-04.json'), JSON.stringify(record));
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  };
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture');
  git('update-ref', `refs/remotes/origin/writer/${batch.batch_id}/A`, 'HEAD');
  const inspect = () => spawnSync(process.execPath, [join(repo, 'tools/auto-writer.mjs'), 'inspect'], {
    env: { ...process.env, MOTOAI_FACTORY_ROOT: dir }, encoding: 'utf8',
  });
  const ready = inspect();
  assert.equal(ready.status, 0, ready.stderr);
  assert.match(ready.stdout, /status=READY_EXISTING/);
  git('update-ref', '-d', `refs/remotes/origin/writer/${batch.batch_id}/A`);
  const fresh = inspect();
  assert.match(fresh.stdout, /status=GENERATE/);
  writeFileSync(join(dir, 'docs/state/writer-assignments.json'), JSON.stringify({ active: null }));
  assert.match(inspect().stdout, /status=NEED_BATCH/);
});

function stepScript(name) {
  return workflow.split(`- name: '${name}'`)[1].split('\n      - name:')[0]
    .split('        run: |\n')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
}

test('smoke and dry-run gates permit read-only verification without changing a paused state', t => {
  const dir = mkdtempSync(join(tmpdir(), 'writer-readonly-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const mode of ['smoke', 'dry']) {
    const output = join(dir, mode);
    const result = spawnSync('bash', ['-e', '-c', stepScript('Ops gate (owner stop / incident lock -> idle, not failed)')], {
      cwd: dir,
      env: { ...process.env, GITHUB_OUTPUT: output, DRY_RUN: mode === 'dry' ? 'true' : 'false', SMOKE_ONLY: mode === 'smoke' ? 'true' : 'false' },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(output, 'utf8'), /open=true/);
    assert.match(result.stdout, /production lock preserved/);
  }
  for (const name of ['Mark the chunk READY_TO_PUSH', 'Push the writer branch', 'Dispatch the writer-publisher', 'No ACTIVE chunk']) {
    const block = workflow.split(`- name: '${name}`)[1].split('        run: |')[0];
    assert.match(block, /dry_run != 'true'/);
    assert.match(block, /smoke_only != 'true'/);
  }
});
