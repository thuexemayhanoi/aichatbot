/**
 * Search Console ownership: the HTML-tag verification must stay on the site
 * homepage. The v76 homepage rebuild (271e48e8) moved the tag to /agent/ only;
 * Google re-checks the tag on `/`, so losing it there can revoke ownership.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const TAG = /<meta name="google-site-verification" content="([^"<>]+)" \/>/;

test('the homepage <head> carries the same Search Console verification tag as the Agent template', () => {
  const source = read('data/site/agent.html.tpl').match(TAG);
  assert.ok(source, 'the verification tag is defined once, in data/site/agent.html.tpl');
  const home = read('index.html');
  const head = home.slice(0, home.indexOf('</head>'));
  const onHome = head.match(TAG);
  assert.ok(onHome, 'index.html <head> has the verification tag');
  assert.equal(onHome[1], source[1], 'same token as the source template');
  assert.equal(home.split('google-site-verification').length - 1, 1, 'declared once on the homepage');
  assert.ok(read('agent/index.html').match(TAG), '/agent/ keeps its tag');
});
