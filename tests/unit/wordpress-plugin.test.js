import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLUGIN = join(ROOT, 'integrations', 'wordpress', 'motoai-agent');
const read = (rel) => readFileSync(join(PLUGIN, rel), 'utf8');

const MAIN = read('motoai-agent.php');
const SETTINGS = read('includes/class-motoai-settings.php');
const ALL_PHP = MAIN + SETTINGS + read('uninstall.php');
const ALL_PLUGIN_TEXT = ALL_PHP + read('assets/admin.js') + read('assets/admin.css');

/** Required plugin structure (spec §3). */
test('wordpress plugin structure: required files exist', () => {
  for (const rel of [
    'motoai-agent.php',
    'readme.txt',
    'uninstall.php',
    'assets/admin.css',
    'assets/admin.js',
    'includes/class-motoai-settings.php'
  ]) {
    assert.ok(existsSync(join(PLUGIN, rel)), `missing ${rel}`);
  }
});

test('wordpress plugin header is valid (name, version, requires)', () => {
  assert.match(MAIN, /Plugin Name:\s+MotoAI Agent/);
  assert.match(MAIN, /Version:\s+1\.\d+\.\d+/);
  assert.match(MAIN, /Requires at least:\s*5\.8/);
  assert.match(MAIN, /Requires PHP:/);
  assert.match(read('readme.txt'), /Stable tag:\s*1\.\d+\.\d+/);
});

test('plugin is a loader, not a bundled engine (no chat logic duplication)', () => {
  // The engine must NOT be vendored into the plugin.
  assert.ok(!existsSync(join(PLUGIN, 'src')), 'plugin must not bundle src/');
  assert.ok(!existsSync(join(PLUGIN, 'data')), 'plugin must not bundle data/business');
  const scriptCount = (ALL_PHP.match(/<script/g) || []).length;
  assert.ok(scriptCount <= 4, 'plugin must stay a thin loader');
});

/** Security requirements (spec §4). */
test('settings page enforces capability + nonce via Settings API', () => {
  assert.match(SETTINGS, /current_user_can\(\s*'manage_options'\s*\)/);
  assert.match(SETTINGS, /register_setting\(\s*self::GROUP,\s*MOTOAI_AGENT_OPTION,\s*array\(\s*'type'\s*=>\s*'array'/s);
  assert.match(SETTINGS, /'sanitize_callback'\s*=>\s*'motoai_agent_sanitize_settings'/);
  assert.match(SETTINGS, /settings_fields\(\s*self::GROUP\s*\)/); // nonce field
  assert.match(SETTINGS, /'show_in_rest'\s*=>\s*false/);
});

test('all settings inputs sanitized, all outputs escaped', () => {
  assert.ok((ALL_PHP.match(/sanitize_text_field|sanitize_key|absint/g) || []).length >= 8, 'sanitization on every input');
  assert.ok((ALL_PHP.match(/esc_attr|esc_html|esc_url/g) || []).length >= 20, 'escaping on every output');
  // No raw echo of user-controlled settings.
  assert.ok(!/echo\s+\$s\[/.test(ALL_PHP), 'raw settings echo forbidden');
});

test('no eval, no dynamic execution, no remote code writes, no secrets', () => {
  for (const bad of [/eval\s*\(/, /assert\s*\(/, /system\s*\(/, /exec\s*\(/, /file_put_contents/, /fopen\s*\(/, /curl_exec/, /base64_decode\s*\(/]) {
    assert.ok(!bad.test(ALL_PHP), `forbidden pattern in plugin: ${bad}`);
  }
  for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'MISTRAL_API_KEY', 'api_key']) {
    assert.ok(!ALL_PLUGIN_TEXT.includes(key), `plugin must not contain ${key}`);
  }
});

/** Loader contract (spec §5). */
test('loader uses the canonical embed URL over https', () => {
  assert.match(MAIN, /define\(\s*'MOTOAI_AGENT_EMBED_URL',\s*'https:\/\/thuexemayhanoi\.github\.io\/aichatbot\/embed\.js'/);
  assert.match(MAIN, /esc_url\(\s*MOTOAI_AGENT_EMBED_URL,\s*array\(\s*'https'\s*\)\s*\)/);
});

test('loader is async, footer-placed, injected at most once', () => {
  assert.match(MAIN, /add_action\(\s*'wp_enqueue_scripts',\s*'motoai_agent_frontend_loader'\s*\)/);
  assert.match(MAIN, /add_action\(\s*'wp_footer',\s*'motoai_agent_print_loader',\s*99\s*\)/);
  assert.match(MAIN, /<script src="%s" async/);
  const staticGuard = MAIN.match(/static \$printed = false/);
  assert.ok(staticGuard, 'static once-per-request guard required');
  assert.match(MAIN, /if \(\s*\$printed\s*\)\s*\{\s*return;.*?\}/s);
});

test('loader outputs the full data-attribute set from sanitized settings', () => {
  for (const attr of [
    'data-motoai', 'data-lang', 'data-theme', 'data-position',
    'data-title', 'data-source', 'data-open', 'data-open-delay'
  ]) {
    assert.ok(MAIN.includes(`'${attr}'`), `loader must emit ${attr}`);
  }
  assert.match(MAIN, /esc_attr\( \$attr \), esc_attr\( \$value \)/);
});

test('visibility rules: device classes + include/exclude pages', () => {
  assert.match(MAIN, /function motoai_agent_is_visible\(\)/);
  assert.match(MAIN, /wp_is_mobile\(\)/);
  assert.match(MAIN, /\$include/);
  assert.match(MAIN, /\$exclude/);
  assert.match(MAIN, /in_array\( \$page_id, \$exclude, true \)/);
});

test('page-list sanitizer keeps only numeric ids (no slugs, no injection)', () => {
  const fn = MAIN.match(/function motoai_agent_sanitize_page_list\( \$raw \) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.ok(fn.includes('absint'), 'absint required');
  assert.ok(fn.includes('sanitize_text_field'), 'text sanitize required');
  assert.ok(!fn.includes('query'), 'no DB queries in sanitizer');
});

/** Shortcode (spec §6). */
test('shortcode [motoai_agent] registers with sanitized attributes', () => {
  assert.match(MAIN, /add_shortcode\(\s*'motoai_agent',\s*'motoai_agent_shortcode'\s*\)/);
  assert.match(MAIN, /shortcode_atts\(/);
  for (const attr of ['lang', 'theme', 'source', 'open']) {
    assert.ok(MAIN.includes(`'${attr}'`), `shortcode attribute ${attr}`);
  }
  // Shortcode values are validated against whitelists, never echoed raw.
  assert.match(MAIN, /shortcode_atts/);
  assert.ok(!/return\s+\$atts/.test(MAIN), 'shortcode must not echo raw atts');
});

test('uninstall.php removes only the plugin option and guards direct access', () => {
  const un = read('uninstall.php');
  assert.match(un, /WP_UNINSTALL_PLUGIN/);
  assert.match(un, /delete_option\(\s*'motoai_agent_settings'\s*\)/);
  // Deletes exactly one known option — nothing else.
  const deletes = un.match(/delete_option\(\s*'[^']+'\s*\)/g) || [];
  assert.deepEqual(deletes, ["delete_option( 'motoai_agent_settings' )"]);
});

test('plugin contains no API keys or inference endpoints (no-API guarantee)', () => {
  for (const endpoint of ['api.openai.com', 'api.anthropic.com', 'generativelanguage', 'api.mistral.ai', 'api.groq.com', 'api.deepseek.com']) {
    assert.ok(!ALL_PLUGIN_TEXT.includes(endpoint), `endpoint in plugin: ${endpoint}`);
  }
});
