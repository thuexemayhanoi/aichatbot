import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fetchItems = (stdin) => {
  const out = mkdtempSync(join(tmpdir(), 'motoai-ingest-'));
  const r = spawnSync('python3', ['tools/image-ingest.py', 'fetch', '--out', out], { cwd: ROOT, input: stdin, encoding: 'utf8' });
  return { ...r, out };
};

test('image ingest refuses anything but "BA-XXXX https://<generator host>/…" lines before downloading', () => {
  const cases = [
    ['BA-0013 https://evil.example.com/a.jpg', /host 'evil\.example\.com' is not an image generator host/],
    ['BA-0013 http://www.figma.com/api/mcp/asset/x.jpg', /not an image generator host/],
    ['BA-13 https://www.figma.com/api/mcp/asset/x.jpg', /expected "BA-XXXX URL"/],
    ['BA-0013 https://www.figma.com/a.jpg extra', /expected "BA-XXXX URL"/],
    ['BA-0013 https://www.figma.com/a.jpg\nBA-0013 https://www.figma.com/b.jpg', /appears twice/],
    [Array.from({ length: 21 }, (_, i) => `BA-${String(i + 1).padStart(4, '0')} https://www.figma.com/${i}.jpg`).join('\n'), /at most 20/],
    ['# only a comment\n', /no items/]
  ];
  for (const [stdin, msg] of cases) {
    const r = fetchItems(stdin);
    assert.notEqual(r.status, 0, stdin);
    assert.match(r.stderr, msg, stdin);
    assert.equal(existsSync(join(r.out, 'manifest.json')), false, 'nothing is written when the input is rejected');
  }
});

test('the ingest workflow is manual-only, passes inputs through env and never touches main', () => {
  const wf = readFileSync(join(ROOT, '.github/workflows/image-ingest.yml'), 'utf8');
  assert.match(wf, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(wf, /^\s+(push|pull_request|schedule):/m);
  assert.match(wf, /^permissions:\n  contents: write\n\n/m);
  // No ${{ … }} expression is expanded inside a shell script (injection).
  for (const block of wf.split(/\n\s+run: /).slice(1)) assert.doesNotMatch(block.split(/\n\s+- /)[0], /\$\{\{/);
  assert.match(wf, /BRANCH: image-ingest\/run-\$\{\{ github\.run_id \}\}/);
  assert.match(wf, /git init -q -b "\$BRANCH"/);
  assert.doesNotMatch(wf, /refs\/heads\/main|--force|\bpush\b[^\n]*-f\b/);
});
