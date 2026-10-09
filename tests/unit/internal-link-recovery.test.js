import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveInternal, normalizeInternalAnchors, auditSite, createSiteIo } from '../../tools/site-audit.mjs';
import { recoveryChecksReady, recoveryCodeUnchanged } from '../../tools/factory-recovery.mjs';
import { SITE } from '../../src/config/site.js';

const root = new URL('../../', import.meta.url).pathname;
const page = 'blog/an-toan/di-xe-khong-giay-phep-cho-du-khach/index.html';
const links = [
  '/blog/an-toan/luat-giao-thong-duong-bo-co-ban-cho-du-khach',
  '/blog/an-toan/nong-do-con-khi-lai-xe-cho-du-khach',
];
const files = new Set(links.map((href) => href.slice(1) + '/index.html'));
const exists = (path) => files.has(path);

test('BA-0311 incident URLs resolve and canonicalize only with real directory-page evidence', () => {
  for (const href of links) {
    assert.equal(resolveInternal(page, href, exists), href.slice(1) + '/index.html');
    assert.equal(normalizeInternalAnchors(`<a class="ref" href='${href}'>Luật</a>`, page, exists),
      `<a class="ref" href='${href}/'>Luật</a>`);
    assert.equal(normalizeInternalAnchors(`<a href="${href}">Luật</a>`, page, () => false),
      `<a href="${href}">Luật</a>`);
  }
  const absolute = SITE + links[0].slice(1);
  assert.equal(normalizeInternalAnchors(`<a href="${absolute}">Luật</a>`, page, exists),
    `<a href="${absolute}/">Luật</a>`);
  assert.equal(normalizeInternalAnchors('<a href="../nong-do-con-khi-lai-xe-cho-du-khach">Luật</a>', page, exists),
    '<a href="../nong-do-con-khi-lai-xe-cho-du-khach/">Luật</a>');
});

test('normalization preserves query/hash URLs, assets, files, external hosts and unknown routes', () => {
  for (const href of [links[0] + '/', links[0] + '?from=blog', links[0] + '#rule',
    '/assets/icon.png', '/assets/js/main.js', '/data/blog/published.json', '/robots.txt',
    '/static/no-extension', '/blog/missing', 'https://example.com' + links[0],
    '#rule', 'mailto:editor@example.com', '/blog/page.html', ' ' + links[0] + ' ']) {
    const html = `<a href="${href}">Text</a><img src="${links[0]}">`;
    assert.equal(normalizeInternalAnchors(html, page, exists), html, href);
  }
  assert.equal(normalizeInternalAnchors(`<a href="${links[0]}">Text</a>`, page, exists),
    normalizeInternalAnchors(normalizeInternalAnchors(`<a href="${links[0]}">Text</a>`, page, exists), page, exists));
  const realFile = (path) => exists(path) || path === links[0].slice(1);
  assert.equal(resolveInternal(page, links[0], realFile), links[0].slice(1), 'an actual extensionless file wins over a directory');
  const dataHref = `<a data-href="${links[0]}">Text</a>`;
  assert.equal(normalizeInternalAnchors(dataHref, page, exists), dataHref);
});

test('site audit accepts the two recorded incident URLs but still rejects missing directories and assets', () => {
  const io = createSiteIo(root);
  const injected = (hrefs) => ({ ...io, read: (path) => io.read(path) + (path === 'index.html'
    ? hrefs.map((href) => `<a href="${href}">Regression</a>`).join('') : '') });
  const good = auditSite(injected(links));
  assert.equal(good.pass, true, good.issues.join('\n'));
  const bad = auditSite(injected(['/blog/missing-directory', '/assets/missing.js', '/assets/js']));
  assert.equal(bad.pass, false);
  assert.equal(bad.broken_internal_links, 3);
});

test('backlog recovery requires completed CI and Distribution on the same main push and unchanged code', () => {
  const sha = 'a'.repeat(40);
  const runs = ['ci', 'distribution'].map((name, i) => ({ id: i + 1, path: `.github/workflows/${name}.yml`,
    head_sha: sha, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success' }));
  assert.equal(recoveryChecksReady(runs, sha), true);
  assert.equal(recoveryChecksReady(runs.slice(0, 1), sha), false);
  for (const replacement of [{ head_sha: 'b'.repeat(40) }, { head_branch: 'writer/test' },
    { event: 'pull_request' }, { status: 'in_progress' }, { conclusion: 'failure' }]) {
    assert.equal(recoveryChecksReady([runs[0], { ...runs[1], ...replacement }], sha), false);
  }
  assert.equal(recoveryChecksReady([...runs, { ...runs[0], id: 3, conclusion: 'failure' }], sha), false);
  assert.equal(recoveryCodeUnchanged(['data/blog/articles/test.body.html', 'docs/state/writer-assignments.json', 'blog/test/index.html']), true);
  assert.equal(recoveryCodeUnchanged(['tools/site-audit.mjs']), false);
  assert.equal(recoveryCodeUnchanged(['.github/workflows/ci.yml']), false);
  const workflow = readFileSync(root + '.github/workflows/blog-factory-publish.yml', 'utf8');
  assert.match(workflow, /needs: recovery-checks\n    if: needs.recovery-checks.outputs.ready == 'true'/);
  assert.ok(workflow.indexOf('Request and verify Pages') < workflow.indexOf('Reconcile recovered chunks'));
});
