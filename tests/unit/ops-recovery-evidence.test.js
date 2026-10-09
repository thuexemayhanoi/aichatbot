import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { greenRun, inferenceRun, dryRunEvidence } from '../../tools/ops-recovery-evidence.mjs';

test('recovery refuses red, running, absent, or unrelated CI evidence', () => {
  const run = { headSha: 'a', status: 'completed', conclusion: 'success' };
  assert.equal(greenRun([run], 'a', 'CI'), run);
  for (const runs of [[], [{ ...run, headSha: 'b' }], [{ ...run, conclusion: 'failure' }], [{ ...run, status: 'in_progress' }]]) {
    assert.throws(() => greenRun(runs, 'a', 'CI'), /GREEN/);
  }
});

const dryJobs = () => [{ steps: [
  ['Smoke test local Ollama before long-form generation', 'success'],
  ['Generate the next chunk (AI writer + sandboxed production QA)', 'success'],
  ['Dry run stop (validated, nothing pushed)', 'success'],
  ['Mark the chunk READY_TO_PUSH', 'skipped'],
  ['Push the writer branch', 'skipped'],
  ['Dispatch the writer-publisher', 'skipped'],
].map(([name, conclusion]) => ({ name, conclusion })) }];
const run = { status: 'completed', conclusion: 'success', head_branch: 'main', path: '.github/workflows/auto-writer.yml' };

test('a GREEN idle writer or a mutating run cannot substitute for real read-only inference', () => {
  inferenceRun(run, dryJobs(), 'dry-run');
  assert.throws(() => inferenceRun(run, [], 'dry-run'), /real Ollama/);
  const jobs = dryJobs(); jobs[0].steps[4].conclusion = 'success';
  assert.throws(() => inferenceRun(run, jobs, 'dry-run'), /mutation/);
  assert.throws(() => inferenceRun({ ...run, conclusion: 'failure' }, dryJobs(), 'dry-run'), /successful/);
});

const evidence = () => ({ code_sha: 'a'.repeat(40), batch: 'B', seq: 4, ids: ['BA-0305', 'BA-0306'],
  models: ['qwen3:4b-instruct'], inventory_unchanged: true, before: { checkpoint: 'hash' }, after: { checkpoint: 'hash' },
  results: ['BA-0305', 'BA-0306'].map((article_id) => ({ article_id, words: 1800, qa: `QA PASS ${article_id} score=100 warnings=0` })) });
const chunk = { batch_id: 'B', seq: 4, ids: ['BA-0305', 'BA-0306'] };

test('dry-run proof covers the exact chunk, full word range, pair QA, and unchanged checkpoint', () => {
  dryRunEvidence(evidence(), chunk, { checkpoint: 'hash' });
  for (const words of [800, 2000]) {
    const boundary = evidence(); boundary.results.forEach((r) => { r.words = words; });
    dryRunEvidence(boundary, chunk, { checkpoint: 'hash' });
  }
  for (const mutate of [
    (e) => { e.ids.reverse(); }, (e) => { e.results[0].words = 799; },
    (e) => { e.results[0].words = 2001; }, (e) => { e.results[0].words = 'unknown'; }, (e) => { e.results[0].qa = 'QA PASS BA-0305 score=20'; },
    (e) => { e.results[0].qa += '\nWARN no-duplicate-sentences repeated'; },
    (e) => { e.after.checkpoint = 'changed'; }, (e) => { e.inventory_unchanged = false; },
  ]) { const e = evidence(); mutate(e); assert.throws(() => dryRunEvidence(e, chunk, { checkpoint: 'hash' })); }
  assert.throws(() => dryRunEvidence(evidence(), chunk, { checkpoint: 'changed' }), /production changed/);
});

test('supervisor verifies evidence before consuming the single attempt and owner RESUME refuses active locks', () => {
  const supervisor = readFileSync(new URL('../../.github/workflows/ops-supervisor.yml', import.meta.url), 'utf8');
  assert.ok(supervisor.indexOf('node tools/ops-recovery-evidence.mjs') < supervisor.indexOf('node tools/ops-agent.mjs agent5-begin'));
  const owner = readFileSync(new URL('../../.github/workflows/ops-owner-review.yml', import.meta.url), 'utf8');
  const resume = owner.slice(owner.indexOf('              resume)'), owner.indexOf('              *)'));
  assert.ok(resume.indexOf('cannot RESUME') < resume.indexOf('.production_enabled = true'));
  assert.ok(resume.includes('RESUME state commit failed'));
});
