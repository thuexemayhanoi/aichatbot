import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertPagesSource, rebuildPages } from '../../tools/factory-pages.mjs';

const sha = 'a'.repeat(40);
const domain = 'chatbot.thuexemaynguyentu.com';
const site = { build_type: 'legacy', source: { branch: 'main', path: '/' }, cname: domain };

test('Pages refuses an unexpected publishing source or custom domain without changing any settings', () => {
  assert.doesNotThrow(() => assertPagesSource(site, domain));
  for (const changed of [{ ...site, build_type: 'workflow' }, { ...site, cname: 'other.example' },
    { ...site, source: { branch: 'old', path: '/' } }]) {
    assert.throws(() => assertPagesSource(changed, domain));
  }
});

test('Pages does not trust an unrelated GREEN build and requests only the existing build endpoint', async () => {
  const calls = [];
  const builds = [{ commit: 'b'.repeat(40), status: 'built' }, { commit: sha, status: 'building' }, { commit: sha, status: 'built' }];
  const result = await rebuildPages({ sha, domain, log: () => {}, pause: async () => {},
    api: async (path, method) => { calls.push([path, method]); return path === '' ? site : method === 'POST' ? {} : builds.shift(); } });
  assert.equal(result.commit, sha);
  assert.deepEqual(calls.filter((c) => c[1] === 'POST'), [['/builds', 'POST']]);
});

test('Pages observation errors, a matching failed build and a bounded timeout fail closed', async () => {
  for (const build of [{ commit: sha, status: 'errored', error: { message: 'build failed' } }, { commit: 'b'.repeat(40), status: 'built' }]) {
    await assert.rejects(() => rebuildPages({ sha, domain, polls: 2, log: () => {}, pause: async () => {},
      api: async (p, m) => p === '' ? site : m === 'POST' ? {} : build }), /failed|bounded/);
  }
  await assert.rejects(() => rebuildPages({ sha, domain, api: async () => { throw new Error('HTTP 403'); } }), /403/);
});

test('Factory requests and verifies Pages after clean publication with scoped authentication', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/blog-factory-publish.yml', import.meta.url), 'utf8');
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.ok(workflow.indexOf('node tools/factory-pages.mjs') > workflow.indexOf('Assert clean state; report QA failures'));
  assert.match(workflow, /steps\.derived\.outcome == 'success'/);
  assert.match(workflow, /success\(\) && inputs\.article_ids != ''/);
  assert.match(workflow, /steps\.deploy\.outcome == 'success'/);
});
