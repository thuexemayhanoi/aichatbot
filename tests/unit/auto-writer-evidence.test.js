import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { renderWriterEvidence } from '../../tools/auto-writer-evidence.mjs';

test('evidence review retains the actual refused candidate and cannot emit Actions workflow commands', () => {
  const dir = mkdtempSync(join(tmpdir(), 'writer-review-'));
  try {
    mkdirSync(join(dir, 'candidates')); mkdirSync(join(dir, 'components'));
    writeFileSync(join(dir, 'candidates', 'BA-0305-attempt-2.json'), '{"body_html":"actual refused prose"}');
    writeFileSync(join(dir, 'components', 'outline.json'), '::error::untrusted model text\nactual outline');
    const log = renderWriterEvidence(dir).join('\n');
    assert.match(log, /actual refused prose/);
    assert.match(log, /actual outline/);
    assert.match(log, /REVIEW ONLY/);
    assert.ok(log.split('\n').every((line) => line.startsWith('EVIDENCE | ')));
    assert.ok(!/^::/m.test(log));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('successful evidence shows real bodies and QA inventory equality without inventing a passing result', () => {
  const dir = mkdtempSync(join(tmpdir(), 'writer-review-'));
  try {
    writeFileSync(join(dir, 'qa.json'), JSON.stringify({ before: { checkpoint: 'one' }, after: { checkpoint: 'two' },
      inventory_unchanged: false, results: [{ article_id: 'BA-0305', qa: 'QA FAIL BA-0305', words: 1800 }] }));
    writeFileSync(join(dir, 'article.body.html'), '<p>original AI prose</p>');
    const log = renderWriterEvidence(dir).join('\n');
    assert.match(log, /"snapshots_equal": false/);
    assert.match(log, /QA FAIL BA-0305/);
    assert.match(log, /original AI prose/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('diagnostic logs are bounded, explicitly report truncation and tolerate absent generation evidence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'writer-review-'));
  try {
    writeFileSync(join(dir, 'article.body.html'), 'x'.repeat(1000));
    const log = renderWriterEvidence(dir, 100).join('\n');
    assert.ok(log.length < 600); assert.match(log, /TRUNCATED/);
    assert.match(renderWriterEvidence(join(dir, 'absent')).join('\n'), /No generation files/);
    assert.throws(() => renderWriterEvidence(dir, 0), /invalid/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
