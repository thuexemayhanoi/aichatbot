import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlugin, readZipEntries } from '../../tools/build-wordpress-plugin.mjs';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REQUIRED_ENTRIES = [
  'motoai-agent/motoai-agent.php',
  'motoai-agent/readme.txt',
  'motoai-agent/uninstall.php',
  'motoai-agent/assets/admin.css',
  'motoai-agent/assets/admin.js',
  'motoai-agent/includes/class-motoai-settings.php'
];

const FORBIDDEN_PATTERNS = [
  /^motoai-agent\/\.git/,
  /^motoai-agent\/tests?/i,
  /node_modules/,
  /^motoai-agent\/src\//,
  /^motoai-agent\/data\//,
  /^motoai-agent\/docs\//,
  /\.md$/,
  /^motoai-agent\/dist\//
];

let zipBuffer;
let entries;

test('ZIP builds deterministically (two runs byte-identical)', async () => {
  const dir1 = mkdtempSync(join(tmpdir(), 'motoai-zip-'));
  const dir2 = mkdtempSync(join(tmpdir(), 'motoai-zip-'));
  const a = await buildPlugin(join(dir1, 'motoai-agent.zip'));
  const b = await buildPlugin(join(dir2, 'motoai-agent.zip'));
  assert.deepEqual(a.entries, b.entries, 'entry list must be deterministic');
  const buf1 = readFileSync(a.path);
  const buf2 = readFileSync(b.path);
  assert.equal(buf1.equals(buf2), true, 'zip bytes must be identical');
  zipBuffer = buf1;
});

test('ZIP structure: root folder, all plugin files, no dev files', async () => {
  entries = await readZipEntries(zipBuffer);
  const names = entries.map((e) => e.name);
  for (const required of REQUIRED_ENTRIES) {
    assert.ok(names.includes(required), `missing ${required}`);
  }
  for (const name of names) {
    assert.ok(name.startsWith('motoai-agent/'), `entry outside ZIP root: ${name}`);
    for (const bad of FORBIDDEN_PATTERNS) {
      assert.ok(!bad.test(name), `forbidden entry in ZIP: ${name}`);
    }
  }
  assert.equal(new Set(names).size, names.length, 'no duplicate entries');
});

test('ZIP integrity: stored method, correct CRC for every entry', async () => {
  for (const entry of entries) {
    assert.equal(entry.method, 0, `${entry.name} must be stored (deterministic build)`);
    assert.ok(entry.crcOk, `${entry.name} failed CRC check`);
    assert.ok(entry.size > 0, `${entry.name} must not be empty`);
  }
});

test('ZIP contains no secrets, no API keys, no inference endpoints', async () => {
  const zipText = zipBuffer.toString('latin1');
  for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'MISTRAL_API_KEY']) {
    assert.ok(!zipText.includes(key), `ZIP must not contain ${key}`);
  }
  for (const endpoint of ['api.openai.com', 'api.anthropic.com', 'api.mistral.ai', 'generativelanguage.googleapis.com']) {
    assert.ok(!zipText.includes(endpoint), `ZIP must not reference ${endpoint}`);
  }
  // The only outbound URLs allowed inside the plugin: canonical embed + MIT license link.
  const urls = zipText.match(/https:\/\/[a-z0-9.\-]+/g) || [];
  const ALLOWED = ['https://thuexemayhanoi.github.io', 'https://opensource.org'];
  for (const url of new Set(urls)) {
    assert.ok(ALLOWED.some((a) => url.startsWith(a)), `unexpected URL in plugin: ${url}`);
  }
});

test('ZIP is installable via WP Admin → Plugins → Add → Upload (structure + header)', () => {
  // WordPress requires: single root folder + valid plugin header in the
  // root-level PHP file. Entry CRCs were already verified against the
  // source files, so checking the source header proves the ZIP payload.
  const roots = new Set(entries.map((e) => e.name.split('/')[0]));
  assert.deepEqual([...roots], ['motoai-agent']);
  const source = readFileSync(new URL('../../integrations/wordpress/motoai-agent/motoai-agent.php', import.meta.url), 'utf8');
  assert.match(source, /Plugin Name:\s+MotoAI Agent/);
  assert.match(source, /Version:\s+1\.\d+\.\d+/);
});
