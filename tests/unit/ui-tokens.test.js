import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const css = readFileSync(join(ROOT, 'assets/css/style.css'), 'utf8');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const embedJs = readFileSync(join(ROOT, 'embed.js'), 'utf8');

/** Design-token regression: the calm palette must stay in place. */
test('UI theme tokens exist (semantic design-token system)', () => {
  for (const token of [
    '--color-bg',
    '--color-surface',
    '--color-surface-elevated',
    '--color-primary',
    '--color-primary-hover',
    '--color-primary-soft',
    '--color-text',
    '--color-text-muted',
    '--color-border',
    '--color-success',
    '--color-warning',
    '--color-error'
  ]) {
    assert.ok(css.includes(token), `missing token ${token}`);
  }
});

test('primary action never uses error-red as the brand color', () => {
  // The old aggressive red must not appear anywhere as a primary/background.
  assert.ok(!css.includes('#c8102e'), 'old harsh red #c8102e must be gone from the chat UI');
  assert.ok(!embedJs.includes('#c8102e'), 'old harsh red must be gone from the embed launcher');
  // Primary is a calm indigo, clearly distinct from the error red.
  assert.match(css, /--color-primary:\s*#4f46e5/);
  assert.match(css, /--color-error:\s*#d2193c/);
});

test('dark mode token override exists', () => {
  assert.match(css, /html\[data-motoai-theme="dark"\]/);
  // Dark mode must re-map the core tokens, not just the background.
  const darkBlock = css.split('html[data-motoai-theme="dark"]').pop();
  for (const token of ['--color-primary', '--color-text', '--color-error']) {
    assert.ok(darkBlock.includes(token), `dark theme missing ${token}`);
  }
});

test('accessibility: focus-visible states and reduced motion are handled', () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});

test('mobile: input font >= 16px (no iOS focus zoom) and touch targets are sensible', () => {
  const inputBlock = css.split('.motoai-input {').pop().split('}')[0];
  const size = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(inputBlock);
  assert.ok(size, 'motoai-input font-size missing');
  assert.ok(Number(size[1]) >= 16, `input font-size ${size[1]}px must be >= 16px`);
  assert.match(css, /min-height:\s*4[4-9]px/, 'send/composer touch targets should be >= 44px');
});

test('quick chips wrap responsively instead of clipping', () => {
  const quickBlock = css.split('.motoai-quick').shift(); // block before .motoai-quick def
  void quickBlock;
  assert.match(css, /\.motoai-quick\s*\{[^}]*flex-wrap:\s*wrap/, 'chips must wrap');
  assert.ok(!/\.motoai-quick\s*\{[^}]*overflow-x:\s*auto/.test(css), 'no horizontal scroll-only chips');
});

test('safe-area handling present for iPhone', () => {
  assert.match(css, /env\(safe-area-inset-top/);
  assert.match(css, /env\(safe-area-inset-bottom/);
});

test('index.html keeps aria labels and the two-step Local AI consent flow', () => {
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="motoai-ai-explain"/, 'Local AI must explain before download');
  assert.match(html, /id="motoai-ai-confirm"/, 'Local AI needs an explicit confirm action');
  assert.match(html, /Không gửi hội thoại đi đâu|không gửi hội thoại đi đâu/);
});

test('UI strings never expose technical internals to users', () => {
  // Friendly Vietnamese lines instead of raw WebLLM errors.
  assert.ok(!html.includes('Cannot find model record'));
  assert.ok(!html.includes('appConfig'));
  assert.match(html, /AI tại chỗ/);
});
