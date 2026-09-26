import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MOBILE = join(ROOT, 'integrations', 'mobile');
const pkg = JSON.parse(readFileSync(join(MOBILE, 'package.json'), 'utf8'));
const cap = readFileSync(join(MOBILE, 'capacitor.config.ts'), 'utf8');

test('mobile wrapper foundation exists (Capacitor config + package.json)', () => {
  assert.ok(existsSync(join(MOBILE, 'capacitor.config.ts')));
  assert.ok(existsSync(join(MOBILE, 'package.json')));
  assert.ok(existsSync(join(MOBILE, 'tools-sync-web.mjs')));
  assert.ok(existsSync(join(ROOT, 'docs', 'MOBILE.md')));
});

test('package.json scripts cover the documented capacitor commands', () => {
  assert.equal(pkg.name, 'motoai-mobile');
  const scripts = pkg.scripts;
  for (const key of ['add:android', 'add:ios', 'sync', 'open:android', 'open:ios']) {
    assert.ok(scripts[key], `missing script ${key}`);
  }
  assert.match(scripts.sync, /npx cap sync/);
});

test('dependencies are capacitor-only — no API SDK, no inference client', () => {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of Object.keys(deps)) {
    assert.match(name, /^@capacitor\//, `unexpected dependency: ${name}`);
  }
  // No platform directories committed (spec §15).
  assert.ok(!existsSync(join(MOBILE, 'android')), 'android/ must not be committed');
  assert.ok(!existsSync(join(MOBILE, 'ios')), 'ios/ must not be committed');
  assert.ok(!existsSync(join(MOBILE, 'node_modules')), 'node_modules must not be committed');
});

test('capacitor config: appId, name, bundled www shell (strategy A default)', () => {
  assert.match(cap, /appId:\s*'vn\.thuexemaynguyentu\.motoai'/);
  assert.match(cap, /appName:\s*'MotoAI'/);
  assert.match(cap, /webDir:\s*'www'/);
  // Remote URL mode is documented but disabled by default (safer long-term).
  assert.ok(!/^\s*url:/m.test(cap.replace(/\/\/ url:.*/g, '')), 'server.url must stay commented out');
  assert.match(cap, /androidScheme:\s*'https'/);
  assert.match(cap, /allowMixedContent:\s*false/);
});

test('wrapper reuses the canonical app — never a second engine', () => {
  const sync = readFileSync(join(MOBILE, 'tools-sync-web.mjs'), 'utf8');
  // Copies the same canonical web dirs served by GitHub Pages.
  for (const dir of ['src', 'assets', 'data']) {
    assert.ok(sync.includes(`'${dir}'`), `sync must copy ${dir}`);
  }
  for (const file of ['index.html', 'embed.js', 'manifest.webmanifest', 'service-worker.js']) {
    assert.ok(sync.includes(`'${file}'`), `sync must copy ${file}`);
  }
  assert.ok(!sync.includes('fetch(') && !sync.includes('https://'), 'sync is a pure local copy, no downloads');
});

test('no secrets or API credentials anywhere in the mobile wrapper', () => {
  for (const text of [JSON.stringify(pkg), cap]) {
    for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'MISTRAL_API_KEY', 'keystore', 'signing key']) {
      assert.ok(!text.toUpperCase().includes(key), `mobile wrapper must not contain ${key}`);
    }
  }
});
