#!/usr/bin/env node
/**
 * Static page registry (config/site-pages.json) — the ONE list of
 * non-article pages. Consumers: tools/build-blog.mjs (render + sitemap),
 * tools/site-audit.mjs (public dirs), tools/seo-score.mjs (audited pages)
 * and the workflows (`node tools/site-pages.mjs --dirs` → generated dirs to
 * commit / diff-check). A page added here can no longer be forgotten by
 * one of them.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = JSON.parse(readFileSync(join(ROOT, 'config/site-pages.json'), 'utf8'));
const SCHEMAS = ['localBusiness'];

const home = REGISTRY.blogHome ?? {};
for (const key of ['title', 'description', 'h1', 'lead', 'schemaName', 'schemaDescription', 'askTopic']) {
  if (typeof home[key] !== 'string' || !home[key]) throw new Error(`site-pages: blogHome.${key} must be a non-empty string`);
}
const seen = new Set();
for (const p of REGISTRY.pages ?? []) {
  if (!/^[a-z0-9-]+$/.test(p.dir ?? '') || seen.has(p.dir)) throw new Error(`site-pages: invalid or duplicate dir ${p.dir}`);
  seen.add(p.dir);
  for (const key of ['screen', 'title', 'seoTitle', 'description']) {
    if (typeof p[key] !== 'string' || !p[key]) throw new Error(`site-pages: ${p.dir}.${key} must be a non-empty string`);
  }
  if (p.kind === 'price') {
    if (!p.lead || !p.kicker || !p.askTopic) throw new Error(`site-pages: price page ${p.dir} needs kicker, lead and askTopic`);
  } else if (!p.body || !existsSync(join(ROOT, p.body))) {
    throw new Error(`site-pages: ${p.dir} body file ${p.body} is missing`);
  }
  for (const s of p.schema ?? []) if (!SCHEMAS.includes(s)) throw new Error(`site-pages: ${p.dir} unknown schema ${s}`);
}

export const BLOG_HOME = Object.freeze(home);
export const SITE_PAGES = Object.freeze(REGISTRY.pages.map((p) => Object.freeze({ ...p })));
/** Generated directories, in sitemap order. */
export const STATIC_DIRS = Object.freeze(SITE_PAGES.map((p) => p.dir));

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href && process.argv.includes('--dirs')) {
  console.log(STATIC_DIRS.join(' '));
}
