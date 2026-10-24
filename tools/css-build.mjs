#!/usr/bin/env node
/**
 * Content-site stylesheet build (v72). The design system is authored in ONE
 * readable source — assets/css/src/blog.css (tokens + components + motion) —
 * and served as assets/css/blog.css: comments stripped, whitespace collapsed.
 * No dependency; deterministic bytes, so the content-hash URL that
 * tools/app-shell.mjs puts on every page only changes when the source does.
 * Runs at the start of tools/build-blog.mjs; CI fails if the served file is
 * stale (`git diff --exit-code` after a rebuild).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CSS_SOURCE = 'assets/css/src/blog.css';
export const CSS_OUTPUT = 'assets/css/blog.css';
const BANNER = `/* generated from ${CSS_SOURCE} — do not edit */\n`;

/** The minifier collapses `; , { }` everywhere, so a quoted string holding
 *  one of them would be altered: refuse such a source instead of mangling. */
export function assertMinifiable(css) {
  const strings = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/"[^"]*"|'[^']*'/g) ?? [];
  const bad = strings.find((s) => /[;,{}]/.test(s));
  if (bad) throw new Error(`css-build: quoted string ${bad} contains ; , { or } — use a CSS escape (\\3b, \\2c)`);
  return css;
}

/** Conservative minifier for our own stylesheet: never touches spaces that
 *  carry meaning (descendant combinators, calc() operators). */
export function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,])\s*/g, '$1')
    // "prop: value" → "prop:value" only where a declaration starts (after
    // { or ;) — selectors never have whitespace right after a pseudo colon.
    .replace(/([{;])([a-z0-9-]+):\s+/g, '$1$2:')
    // 0.75rem → .75rem (a leading zero never follows a digit, dot or letter).
    .replace(/(^|[^\w.#-])0\.(\d)/g, '$1.$2')
    .replace(/;}/g, '}')
    .trim() + '\n';
}

export function buildCss(root = ROOT) {
  const out = BANNER + minifyCss(assertMinifiable(readFileSync(join(root, CSS_SOURCE), 'utf8')));
  writeFileSync(join(root, CSS_OUTPUT), out, 'utf8');
  return out;
}

/* Chat homepage tokens (v74). The homepage loads only assets/css/style.css
   (hand-written, readable), so it receives the V2 design tokens as a marked
   block COPIED from the TOKENS of CSS_SOURCE: one place re-skins blog AND
   chat. Only the tokens the chat UI uses are copied (keeps style.css small). */
export const CHAT_CSS = 'assets/css/style.css';
export const CHAT_TOKENS = [
  'paper', 'paper-2', 'surface', 'ink', 'ink-2', 'ink-3', 'line', 'line-strong',
  'signal', 'signal-ink', 'signal-soft', 'on-signal', 'solid', 'on-solid', 'ok', 'scrim', 'shadow-color',
  'font', 'r-md', 'r-lg', 'r-pill', 'shadow-2', 'ease', 't1', 't2', 't3',
  'color-bg', 'color-surface', 'color-surface-elevated', 'color-surface-soft',
  'color-primary', 'color-primary-hover', 'color-primary-soft', 'color-on-primary',
  'color-text', 'color-text-muted', 'color-border', 'color-border-strong', 'color-success'
];
const TOKENS_START = `/* @generated chat-tokens: copied from the TOKENS of ${CSS_SOURCE} by tools/css-build.mjs — edit there, then node tools/build-blog.mjs */`;
const TOKENS_END = '/* @end chat-tokens */';

function declarations(block) {
  return block.replace(/\/\*[\s\S]*?\*\//g, '').split(';').map((d) => d.trim()).filter(Boolean)
    .map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]);
}

export function chatTokenBlock(source) {
  const light = /:root\s*\{([^}]*)\}/.exec(source)?.[1];
  const dark = /html\[data-motoai-theme="dark"\]\s*\{([^}]*)\}/.exec(source)?.[1];
  if (!light || !dark) throw new Error('css-build: TOKENS :root / dark blocks missing in ' + CSS_SOURCE);
  const pick = (block, extra = []) => declarations(block)
    .filter(([name]) => CHAT_TOKENS.includes(name.replace(/^--/, '')) || extra.includes(name))
    .map(([name, value]) => `  ${name}: ${value};`).join('\n');
  const root = pick(light);
  for (const name of CHAT_TOKENS) {
    if (!root.includes(`--${name}:`)) throw new Error(`css-build: chat token --${name} missing in ${CSS_SOURCE}`);
  }
  // A copied token may only reference copied tokens (no dangling var()).
  for (const [, ref] of root.matchAll(/var\(--([\w-]+)/g)) {
    if (!CHAT_TOKENS.includes(ref)) throw new Error(`css-build: chat token references --${ref}; add it to CHAT_TOKENS`);
  }
  return `${TOKENS_START}\n:root {\n${root}\n}\nhtml[data-motoai-theme="dark"] {\n${pick(dark, ['color-scheme'])}\n}\n${TOKENS_END}`;
}

/** Rewrites the marked token block inside style.css; returns the new CSS. */
export function syncChatTokens(root = ROOT) {
  const path = join(root, CHAT_CSS);
  const css = readFileSync(path, 'utf8');
  const start = css.indexOf('/* @generated chat-tokens');
  const end = css.indexOf(TOKENS_END);
  if (start === -1 || end === -1 || end < start) throw new Error(`css-build: chat-tokens markers missing in ${CHAT_CSS}`);
  const out = css.slice(0, start) + chatTokenBlock(readFileSync(join(root, CSS_SOURCE), 'utf8')) + css.slice(end + TOKENS_END.length);
  if (out !== css) writeFileSync(path, out, 'utf8');
  return out;
}

/* The embed launcher (embed.js, loaded by partner sites and the WordPress
   plugin) takes its fill and glyph colors from the same light TOKENS. The
   marker in embed.js is a bare comment: that file counts against CI's
   base-JS byte budget. */
export const EMBED_JS = 'embed.js';
export const EMBED_TOKENS = ['--signal-ink', '--on-signal'];
const EMBED_MARK = /background: '#[0-9a-f]{3,8}', color: '#[0-9a-f]{3,8}', \/\*@tokens\*\//i;

export function syncEmbedTokens(root = ROOT) {
  const path = join(root, EMBED_JS);
  const js = readFileSync(path, 'utf8');
  if (!EMBED_MARK.test(js)) throw new Error(`css-build: /*@tokens*/ marker missing in ${EMBED_JS}`);
  const light = /:root\s*\{([^}]*)\}/.exec(readFileSync(join(root, CSS_SOURCE), 'utf8'))?.[1] ?? '';
  const [fill, glyph] = EMBED_TOKENS.map((name) => {
    const v = declarations(light).find(([n]) => n === name)?.[1];
    if (!/^#[0-9a-f]{3,8}$/i.test(v ?? '')) throw new Error(`css-build: ${name} must be a hex color in ${CSS_SOURCE}`);
    return v;
  });
  const out = js.replace(EMBED_MARK, `background: '${fill}', color: '${glyph}', /*@tokens*/`);
  if (out !== js) writeFileSync(path, out, 'utf8');
  return out;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const out = buildCss();
  syncChatTokens();
  syncEmbedTokens();
  console.log(`${CSS_OUTPUT}: ${out.length} bytes; ${CHAT_CSS}: chat tokens synchronized`);
}
