import { test } from 'node:test';import assert from 'node:assert/strict';import { execFileSync } from 'node:child_process';import { fileURLToPath } from 'node:url';import { dirname, join } from 'node:path';

/**
 * SEO scoring tool contract: deterministic, offline, no network, no API key.
 * `node tools/seo-score.mjs --json` must emit a valid weighted score with
 * the agreed group weights, and the site must stay above the SEO floor.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function runTool(args = []) {
  return execFileSync('node', [join(ROOT, 'tools', 'seo-score.mjs'), ...args], { encoding: 'utf8' });}

const WEIGHTS = {
  TECHNICAL: 25,
  CONTENT: 25,
  STRUCTURED: 15,
  LINKS: 10,
  CRAWL: 10,
  UX: 10,
  AIGEO: 5};

test('seo-score tool runs offline and returns a weighted JSON score', () => {
  const result = JSON.parse(runTool(['--json']));
  assert.equal(result.tool, 'tools/seo-score.mjs');
  assert.equal(result.max, 100);
  assert.ok(Number.isFinite(result.total));
  assert.ok(result.total >= 80, `SEO floor breached: ${result.total}/100`);
  for (const [id, weight] of Object.entries(WEIGHTS)) {
    assert.equal(result.subscores[id].weight, weight, `${id} keeps its weight`);
    assert.ok(result.subscores[id].raw <= weight);
  }});

test('seo-score is deterministic across runs', () => {
  const a = JSON.parse(runTool(['--json']));
  const b = JSON.parse(runTool(['--json']));
  assert.equal(a.total, b.total);
  assert.deepEqual(a.issues, b.issues);});

test('every audited page exists and every issue names a page or site', () => {
  const result = JSON.parse(runTool(['--json']));
  assert.ok(result.pages.length >= 11, 'home + blog + 6 hubs + articles + legal');
  assert.ok(result.pages.every((p) => p.endsWith('index.html')));
  for (const issue of result.issues) {
    assert.match(issue, /^(index\.html|blog\/[\w./-]*|privacy\/index\.html|terms\/index\.html|site): /, `unattributed issue: ${issue}`);
  }});
