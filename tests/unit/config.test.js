import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, createConfig } from '../../src/config/defaults.js';
import { PATHS, withBase } from '../../src/config/paths.js';

test('defaults are frozen and Vietnamese-first', () => {
  assert.equal(Object.isFrozen(DEFAULTS), true);
  assert.equal(DEFAULTS.language, 'vi');
});

test('semantic search is disabled by default', () => {
  assert.equal(DEFAULTS.features.semanticSearch, false);
  assert.equal(DEFAULTS.features.hybridSearch, false);
});

test('reply delay preserves the baseline behavior', () => {
  assert.equal(DEFAULTS.replyDelayMs, 300);
});

test('createConfig merges one level deep without mutating defaults', () => {
  const cfg = createConfig({ replyDelayMs: 100, features: { semanticSearch: true } });
  assert.equal(cfg.replyDelayMs, 100);
  assert.equal(cfg.features.semanticSearch, true);
  assert.equal(cfg.features.persistHistory, true);
  assert.equal(DEFAULTS.features.semanticSearch, false);
});

test('paths stay relative for GitHub Pages compatibility', () => {
  assert.equal(PATHS.business, 'data/business/business.json');
  assert.ok(!PATHS.business.startsWith('/'));
});

test('withBase prefixes relative paths and keeps absolute ones', () => {
  const resolved = withBase('https://example.com/x/');
  assert.equal(resolved.business, 'https://example.com/x/data/business/business.json');
  assert.equal(withBase('/root').business, '/root/data/business/business.json');
  assert.equal(withBase().business, './data/business/business.json');
});
