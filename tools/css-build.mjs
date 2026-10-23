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

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const out = buildCss();
  console.log(`${CSS_OUTPUT}: ${out.length} bytes`);
}
