/**
 * Mobile wrapper (Capacitor) foundation tests — docs/MOBILE.md.
 * Wrapper tái sử dụng app canonical; không commit platform dirs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('Capacitor config points at the canonical app (strategy A, bundled)', () => {
  const cfg = read('integrations/mobile/capacitor.config.ts');
  assert.match(cfg, /appId: 'vn\.thuexemaynguyentu\.motoai'/);
  assert.match(cfg, /webDir: 'www'/);
  // strategy B (remote URL) stays commented out for release builds
  assert.match(cfg, /\/\/ server: \{/);
  assert.match(cfg, /\/\/   url: 'https:\/\/thuexemayhanoi\.github\.io\/aichatbot\/'/);
});

test('mobile deps are Capacitor-only, no other runtime dependency', () => {
  const pkg = JSON.parse(read('integrations/mobile/package.json'));
  const deps = Object.keys(pkg.dependencies ?? {});
  assert.equal(deps.length > 0, true);
  for (const d of deps) assert.match(d, /^@capacitor\//);
});

test('sync script copies canonical web app deterministically (no transform)', () => {
  const mjs = read('integrations/mobile/tools-sync-web.mjs');
  assert.match(mjs, /cpSync/);
  assert.match(mjs, /rmSync\(www, \{ recursive: true/);
  assert.equal(/fetch\(|https?:\/\//.test(mjs), false);
});

test('platform dirs and www/ are never committed', () => {
  for (const dir of ['integrations/mobile/www', 'integrations/mobile/android', 'integrations/mobile/ios', 'integrations/mobile/node_modules']) {
    assert.equal(existsSync(join(ROOT, dir)), false, dir + ' must not be committed');
  }
});
