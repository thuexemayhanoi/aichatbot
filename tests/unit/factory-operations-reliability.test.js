import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writerQualityWarnings } from '../../tools/auto-writer.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflow = (name) => readFileSync(join(ROOT, '.github/workflows', name), 'utf8');

test('auto writer treats factual QA PASS with duplicate or filler prose as a regeneration request', () => {
  const output = [
    'QA PASS BA-0335 score=90 warnings=2',
    'WARN no-duplicate-paragraphs — repeated paragraph',
    'WARN no-cross-article-duplicate — paragraph already used',
    'WARN local-angle — optional local context',
  ].join('\n');
  assert.deepEqual(writerQualityWarnings(output).map((s) => s.split(' ')[1]),
    ['no-duplicate-paragraphs', 'no-cross-article-duplicate']);
  assert.deepEqual(writerQualityWarnings('QA PASS BA-0332 score=100 warnings=0'), []);
  const source = readFileSync(join(ROOT, 'tools/auto-writer.mjs'), 'utf8');
  assert.match(source, /priorDrafts: drafts, priorBodies: bodies/);
  assert.match(source, /qa\.pass && writerQualityWarnings\(qa\.out\)\.length === 0/);
});

test('publication verification retries only eventual Pages consistency, keeping evidence mandatory', () => {
  const source = workflow('blog-factory-publish.yml');
  assert.match(source, /for attempt in \$\(seq 1 12\)/);
  assert.match(source, /production manifest\/matrix mismatch/);
  assert.match(source, /Non-transient production verification failure; refusing retry/);
  assert.match(source, /Production stayed inconsistent after 12 checks; receipts NOT written/);
  assert.match(source, /node tools\/factory-verification\.mjs --published-from/);
  assert.match(source, /node tools\/factory-verification\.mjs --published-from[\s\S]*git add docs\/state\/publication-receipts\.json/);
});

test('version tags build distribution artifacts without mutating detached tag state', () => {
  const source = workflow('distribution.yml');
  assert.match(source, /tags: \['v\*'\]/);
  assert.match(source, /if: github\.ref_type != 'tag'/);
  assert.match(source, /if: startsWith\(github\.ref, 'refs\/tags\/v'\)/);
});

test('diagnostic workflows cannot report a false-green on failed pushes or QA', () => {
  const source = workflow('ops-qa-runner.yml');
  assert.doesNotMatch(source, /git (?:push|pull --rebase) \|\|/);
  assert.match(source, /Surface diagnostic failures in Actions status/);
  assert.match(source, /QA_FAILED_\|SELECT_PUBLISH_FAILED/);
  assert.match(source, /TESTS_EXIT=\[1-9\]/);
});
