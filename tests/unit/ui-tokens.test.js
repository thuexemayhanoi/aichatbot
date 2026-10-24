import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const css = readFileSync(join(ROOT, 'assets/css/style.css'), 'utf8');
const html = readFileSync(join(ROOT, 'agent/index.html'), 'utf8'); // v76: the chat app lives at /agent/
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
  // v74: primary is the V2 blue wayfinding token, clearly distinct from the error red.
  assert.match(css, /--color-primary:\s*var\(--signal-ink\)/);
  assert.match(css, /--signal-ink:\s*#0066cc/);
  assert.match(css, /--color-error:\s*#d2193c/);
});

test('dark mode token override exists', () => {
  assert.match(css, /html\[data-motoai-theme="dark"\]/);
  // Dark mode must re-map the core tokens, not just the background. v74: the
  // semantic --color-* names resolve through the V2 primitives (var()), so the
  // dark blocks re-map the primitives plus the chat-only error red.
  const darkBlocks = css.split('html[data-motoai-theme="dark"]').slice(1).map((b) => b.slice(0, b.indexOf('}'))).join('\n');
  for (const token of ['--paper', '--surface', '--ink', '--signal', '--signal-ink', '--line', '--color-error']) {
    assert.ok(darkBlocks.includes(token + ':'), `dark theme missing ${token}`);
  }
  for (const [semantic, primitive] of [['--color-primary', '--signal-ink'], ['--color-text', '--ink'], ['--color-bg', '--paper']]) {
    assert.match(css, new RegExp(`${semantic}:\\s*var\\(${primitive}\\)`), `${semantic} follows ${primitive} in both themes`);
  }
});

test('accessibility: focus-visible states and reduced motion are handled', () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});

test('mobile: input font >= 16px (no iOS focus zoom) and touch targets are sensible', () => {
  // The BASE rule (first occurrence) must keep font-size >= 16px; later
  // responsive overrides adjust padding only, never the font size.
  const inputBlock = css.split('.motoai-input {').slice(1).shift();
  const size = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(inputBlock);
  assert.ok(size, 'motoai-input font-size missing');
  assert.ok(Number(size[1]) >= 16, `input font-size ${size[1]}px must be >= 16px`);
  assert.match(css, /min-height:\s*4[4-9]px/, 'send/composer touch targets should be >= 44px');
});

test('quick chips render one compact horizontally scrollable row (max 4)', () => {
  // New v45 spec: single row, no wrap, no partial clipping — chips stay whole
  // and the row scrolls horizontally on narrow screens.
  assert.match(css, /\.motoai-quick\s*\{[^}]*flex-wrap:\s*nowrap/, 'chips stay on one row');
  assert.match(css, /\.motoai-quick\s*\{[^}]*overflow-x:\s*auto/, 'row scrolls horizontally');
  assert.match(css, /\.motoai-chip\s*\{[^}]*flex:\s*0 0 auto/, 'chips are never squashed or half-clipped');
  assert.match(css, /\.motoai-chip\s*\{[^}]*white-space:\s*nowrap/);
});

test('safe-area handling present for iPhone', () => {
  assert.match(css, /env\(safe-area-inset-top/);
  assert.match(css, /env\(safe-area-inset-bottom/);
});

test('agent/index.html keeps aria labels and the two-step Local AI consent flow', () => {
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
  // v45: customers see "Agent", never the old "AI tại chỗ" label.
  assert.match(html, /Agent/);
  assert.ok(!/AI tại chỗ/.test(html), 'old customer-facing "AI tại chỗ" label must be gone');
});
