/**
 * Distribution surface tests (PWA + WordPress plugin + icon tooling).
 * No network, no python: these verify the committed text surface that CI
 * (distribution.yml) turns into binary artifacts deterministically.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('manifest.webmanifest is valid JSON with the full icon set', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.scope, '/aichatbot/');
  assert.equal(manifest.start_url.includes('/aichatbot/'), true);
  assert.equal(manifest.lang, 'vi');
  const sizes = manifest.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192'));
  assert.ok(sizes.some((s) => s === '512x512'));
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
});

test('service worker uses versioned caches and never precaches models', () => {
  const sw = read('service-worker.js');
  assert.match(sw, /motoai-shell-/);
  assert.match(sw, /motoai-data-/);
  // model shards are deliberately excluded from any precache list
  const shell = sw.match(/SHELL_ASSETS = \[([\s\S]*?)\]/)[1];
  assert.equal(/model|\.gguf|webllm|transformers/i.test(shell), false);
});

test('pwa.js never registers the service worker in embed mode', () => {
  const pwa = read('assets/js/pwa.js');
  assert.match(pwa, /if \(config\?\.embed\) return;?/);
  assert.match(pwa, /navigator\.serviceWorker\.register\('\.\/service-worker\.js'\)/);
});

test('index.html wires the manifest, theme color and install pill', () => {
  const html = read('index.html');
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /name="theme-color"/);
  assert.match(html, /id="motoai-install"/);
});

test('main.js registers PWA only in direct mode and labels wrapper source', () => {
  const main = read('assets/js/main.js');
  assert.match(main, /import \{ initPwa \} from '\.\/pwa\.js';/);
  assert.match(main, /initPwa\(config\)/);
  assert.match(main, /Capacitor\?\.isNativePlatform\?\.\(\)/);
});

test('gen-icons.py is stdlib-only and deterministic by construction', () => {
  const py = read('tools/gen-icons.py');
  const imports = py.split('\n').filter((l) => l.startsWith('import ') || l.startsWith('from ')).join('\n');
  assert.equal(/PIL|cairo|requests|urllib|socket/.test(imports), false);
  assert.match(py, /import zlib/);
  // the three PWA rasters the workflow expects
  for (const name of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
    assert.match(py, new RegExp(name.replace('.', '\\.')));
  }
});

test('distribution workflow runs icons + plugin zip after the test gate', () => {
  const wf = read('.github/workflows/distribution.yml');
  assert.match(wf, /node --test/);
  assert.match(wf, /python3 tools\/gen-icons\.py/);
  assert.match(wf, /node tools\/build-wordpress-plugin\.mjs/);
  assert.match(wf, /if-no-files-found: error/);
});

test('WordPress plugin loader: thin, canonical URL, guards, no second engine', () => {
  const php = read('integrations/wordpress/motoai-agent/motoai-agent.php');
  assert.match(php, /MOTOAI_AGENT_EMBED_URL', 'https:\/\/thuexemayhanoi\.github\.io\/aichatbot\/embed\.js'/);
  assert.match(php, /defined\('ABSPATH'\) \|\| exit/);
  assert.match(php, /static \$printed = false;/); // never inject twice
  assert.match(php, /add_shortcode\('motoai_agent'/);
  assert.match(php, /wp_footer/);
  assert.equal(/eval\(|base64_decode|system\(|exec\(/.test(php), false);
});

test('WordPress settings: capability + Settings API + sanitize whitelist', () => {
  const php = read('integrations/wordpress/motoai-agent/includes/class-motoai-settings.php');
  assert.match(php, /current_user_can\('manage_options'\)/);
  assert.match(php, /register_setting/);
  assert.match(php, /sanitize/);
  assert.match(php, /absint/);
});

test('WordPress uninstall removes only the plugin option', () => {
  const php = read('integrations/wordpress/motoai-agent/uninstall.php');
  assert.match(php, /WP_UNINSTALL_PLUGIN/);
  assert.match(php, /delete_option\('motoai_agent_settings'\)/);
  assert.equal((php.match(/delete_option/g) ?? []).length, 1);
});

test('plugin readme declares standard WordPress.org metadata', () => {
  const txt = read('integrations/wordpress/motoai-agent/readme.txt');
  assert.match(txt, /=== MotoAI Agent ===/);
  assert.match(txt, /Stable tag: 1\.0\.0/);
  assert.match(txt, /GPL-2\.0-or-later/);
});

test('build-wordpress-plugin.mjs is dependency-free and deterministic', () => {
  const mjs = read('tools/build-wordpress-plugin.mjs');
  assert.match(mjs, /DOS_DATE = 0x21/); // fixed 1980 timestamp → byte-stable
  assert.match(mjs, /crc32/);
  assert.equal(/npm install|require\(|fetch\(/.test(mjs), false);
});

test('embed widget supports data-open-delay (v1.1.0)', () => {
  const js = read('embed.js');
  assert.match(js, /data-open-delay/);
  assert.match(js, /version: '1\.1\.0'/);
  assert.match(js, /Math\.max\(0, Math\.min\(10000/);
});
