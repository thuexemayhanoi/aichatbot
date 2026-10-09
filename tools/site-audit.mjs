#!/usr/bin/env node
/** Hard migration gate: all public runtime/source and every generated page. */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE } from '../src/config/site.js';

const PUBLIC_DIRS = ['assets', 'src', 'data', 'config', 'blog', 'privacy', 'terms', 'gioi-thieu', 'chinh-sach', 'lien-he', 'gia-thue'];
const PUBLIC_ROOTS = ['index.html', 'embed.js', 'manifest.webmanifest', 'service-worker.js', 'robots.txt', 'sitemap.xml', 'CNAME'];
const LEGACY_PATH = /\/aichatbot(?:\/|[?#]|$)/gi;
const LEGACY_ORIGIN = /https?:\/\/thuexemayhanoi\.github\.io\/aichatbot(?:\/|[?#]|$)/gi;

export function createSiteIo(root) {
  const walk = (dir) => existsSync(join(root, dir)) ? readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]) : [];
  return {
    read: (p) => readFileSync(join(root, p), 'utf8'),
    exists: (p) => existsSync(join(root, p)) && statSync(join(root, p)).isFile(),
    size: (p) => statSync(join(root, p)).size,
    files: () => [...PUBLIC_ROOTS, ...PUBLIC_DIRS.flatMap(walk)].sort()
  };
}

/** Resolve root, relative and same-origin absolute links, preserving host boundaries. */
export function resolveInternal(pagePath, href, existsFile = () => false) {
  if (!href || href.startsWith('#') || /^(mailto:|tel:|data:|javascript:|blob:)/i.test(href)) return null;
  let url;
  try { url = new URL(href.replace(/&amp;/g, '&'), SITE + pagePath); } catch { return null; }
  if (url.origin !== new URL(SITE).origin) return null;
  let path;
  try { path = decodeURIComponent(url.pathname).replace(/^\//, ''); } catch { return null; }
  if (!path || path.endsWith('/')) path += 'index.html';
  // Pages serves an extensionless directory URL through its real index.
  // Never infer a page from an arbitrary missing asset or unknown route.
  else if (!/\.[^/]+$/.test(path) && !existsFile(path) && existsFile(`${path}/index.html`)) path += '/index.html';
  return path;
}

/** Canonicalize only anchor URLs backed by an actual directory page. */
export function normalizeInternalAnchors(html, pagePath, existsFile) {
  return html.replace(/(<a\b[^>]*?\shref\s*=\s*)(["'])(.*?)\2/gi, (tag, prefix, quote, href) => {
    if (!href || href !== href.trim() || /[?#]/.test(href)) return tag;
    const target = resolveInternal(pagePath, href, existsFile);
    if (!target?.endsWith('/index.html') || !existsFile(target)) return tag;
    const url = new URL(href.replace(/&amp;/g, '&'), SITE + pagePath);
    if (url.pathname.endsWith('/') || /\.[^/]+$/.test(url.pathname)) return tag;
    return `${prefix}${quote}${href}/${quote}`;
  });
}

const pageUrl = (p) => SITE + p.replace(/index\.html$/, '');
const attr = (html, name) => new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i').exec(html)?.[1];
const canonical = (html) => /<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i.exec(html)?.[1];
const decodeSlashes = (s) => s.replace(/\\\//g, '/').replace(/\\u002f|\\x2f/gi, '/');

export function auditSite(io) {
  const files = io.files();
  const pages = files.filter((p) => p.endsWith('/index.html') || p === 'index.html');
  const issues = [];
  const broken = [];
  let legacyPaths = 0, legacyOrigins = 0, checkedLinks = 0;
  const add = (ok, path, label) => { if (!ok) issues.push(`${path}: ${label}`); };
  const checkLink = (page, href) => {
    const target = resolveInternal(page, href, io.exists);
    if (target === null) return;
    checkedLinks++;
    if (!io.exists(target)) broken.push(`${page}: ${href} -> ${target}`);
  };
  for (const p of files) {
    if (!io.exists(p)) { issues.push(`${p}: missing required public file`); continue; }
    if (!/\.(html|js|json|webmanifest|xml|txt|csv|css|svg)$/.test(p)) continue;
    const content = io.read(p);
    const decoded = decodeSlashes(content);
    const pathCount = [...decoded.matchAll(LEGACY_PATH)].length;
    const originCount = [...decoded.matchAll(LEGACY_ORIGIN)].length;
    legacyPaths += pathCount; legacyOrigins += originCount;
    add(pathCount === 0 && originCount === 0, p, `legacy URL (${pathCount} project paths, ${originCount} old origins)`);
    // Body fragments are rendered at article URLs; their relative links
    // are checked on generated pages, never against data/blog/articles/.
    if (p.endsWith('.html') && !p.endsWith('.body.html')) {
      for (const m of content.matchAll(/\b(?:href|src|poster)\s*=\s*["']([^"']+)["']/gi)) checkLink(p, m[1]);
      for (const m of content.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi)) {
        for (const candidate of m[1].split(',')) checkLink(p, candidate.trim().split(/\s+/)[0]);
      }
    }
    if (p.endsWith('.js')) {
      // Literal module imports are relative to the importing module.
      for (const m of content.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)) {
        if (/^\.{1,2}\//.test(m[1]) || m[1].startsWith('/')) checkLink(p, m[1]);
      }
      for (const m of content.matchAll(/\bfetch\(\s*["'](\/[^"']+)["']/g)) checkLink(p, m[1]);
    }
    if (p.endsWith('.css')) {
      for (const m of content.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) checkLink(p, m[1]);
    }
  }
  const xml = io.read('sitemap.xml');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  add(locs.length > 0 && new Set(locs).size === locs.length, 'sitemap.xml', 'empty or duplicate sitemap');
  for (const url of locs) {
    add(url.startsWith(SITE), 'sitemap.xml', `foreign origin ${url}`);
    checkLink('sitemap.xml', url);
  }
  add(io.read('robots.txt').trim().split(/\r?\n/).includes(`Sitemap: ${SITE}sitemap.xml`), 'robots.txt', 'Sitemap must use canonical domain');
  add(!/^Disallow:\s*\/\s*$/mi.test(io.read('robots.txt')), 'robots.txt', 'site blocks crawling');
  add(io.read('CNAME').trim() === new URL(SITE).hostname, 'CNAME', 'custom domain does not match SITE');
  for (const p of pages) {
    const html = io.read(p), expected = pageUrl(p);
    add(canonical(html) === expected, p, `canonical must be ${expected}`);
    add(attr(html, 'og:url') === expected, p, 'og:url must match canonical');
    for (const name of ['og:image', 'twitter:image']) {
      if (attr(html, name)) checkLink(p, attr(html, name));
    }
    add(!/<meta[^>]+(?:name|property)=["'](?:robots|googlebot)["'][^>]*content=["'][^"']*noindex/i.test(html), p, 'noindex on public page');
    add(locs.includes(expected), p, 'page missing from sitemap');
    let schemaCount = 0;
    for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const block = JSON.parse(m[1]); schemaCount++;
        const visit = (value, key) => {
          if (Array.isArray(value)) return value.forEach((v) => visit(v, key));
          if (value && typeof value === 'object') return Object.entries(value).forEach(([k, v]) => visit(v, k));
          if (typeof value === 'string' && ['url', '@id', 'item', 'mainEntityOfPage'].includes(key)) checkLink(p, value);
        };
        visit(block);
        if (['Article', 'BlogPosting'].includes(block['@type'])) {
          add(block.mainEntityOfPage === expected || block.mainEntityOfPage?.['@id'] === expected, p, 'Article mainEntityOfPage must match canonical');
        }
        if (['CollectionPage', 'WebPage', 'WebApplication'].includes(block['@type'])) add(block.url === expected, p, 'schema URL must be self');
        if (block['@type'] === 'BreadcrumbList') {
          const last = block.itemListElement?.at(-1);
          add(last?.item === expected, p, 'breadcrumb must end at this page');
        }
      } catch { issues.push(`${p}: invalid JSON-LD`); }
    }
    add(schemaCount > 0, p, 'missing structured data');
  }
  const manifest = JSON.parse(io.read('manifest.webmanifest'));
  add(manifest.id === '/' && manifest.scope === '/' && manifest.start_url === '/?source=pwa', 'manifest.webmanifest', 'PWA id/scope/start_url must use root');
  for (const icon of manifest.icons ?? []) checkLink('manifest.webmanifest', icon.src);
  const sw = io.read('service-worker.js');
  const shell = /const SHELL_ASSETS = \[([\s\S]*?)\]/.exec(sw)?.[1] ?? '';
  for (const m of shell.matchAll(/["']([^"']+)["']/g)) checkLink('service-worker.js', m[1]);
  const search = JSON.parse(io.read('blog/search-index.json'));
  const knowledge = JSON.parse(io.read('data/blog/knowledge-index.json'));
  const statuses = new Map(io.read('data/blog/content-matrix.csv').trim().split('\n').slice(1).map((r) => { const c = r.split(','); return [c[0], c[3]]; }));
  const published = JSON.parse(io.read('data/blog/published.json')).articles.filter((a) => statuses.get(a.article_id) === 'PUBLISHED');
  const taxonomy = JSON.parse(io.read('data/blog/taxonomy.json'));
  const publishedUrls = new Set(published.map((a) => `/blog/${taxonomy.categories[a.category].dir}/${a.slug}/`));
  add(statuses.size === 2000, 'data/blog/content-matrix.csv', 'topic matrix must keep 2000 IDs');
  add(search.articles.length === published.length && new Set(search.articles.map((a) => a.url)).size === published.length, 'blog/search-index.json', 'search index must contain each published article once');
  for (const article of search.articles) {
    add(publishedUrls.has(article.url), 'blog/search-index.json', `unpublished or invalid URL ${article.url}`);
    checkLink('blog/search-index.json', article.url);
  }
  for (const chunk of knowledge.chunks) {
    add(statuses.get(chunk.article_id) === 'PUBLISHED' && publishedUrls.has(chunk.url), 'data/blog/knowledge-index.json', `unpublished/invalid chunk ${chunk.id}`);
    checkLink('data/blog/knowledge-index.json', chunk.url);
  }
  add(knowledge.chunks.length === published.reduce((n, a) => n + a.knowledge_chunks.length, 0)
    && new Set(knowledge.chunks.map((c) => c.id)).size === knowledge.chunks.length,
  'data/blog/knowledge-index.json', 'knowledge index must retain every published chunk once');
  for (const url of publishedUrls) add(locs.includes(new URL(url, SITE).href), 'sitemap.xml', `published article missing ${url}`);
  const visitNav = (v) => {
    if (Array.isArray(v)) return v.forEach(visitNav);
    if (v && typeof v === 'object') for (const [key, value] of Object.entries(v)) {
      if (key === 'url' && typeof value === 'string') checkLink('config/navigation.json', value);
      else visitNav(value);
    }
  };
  visitNav(JSON.parse(io.read('config/navigation.json')));
  issues.push(...broken.map((b) => `site: broken internal link ${b}`));
  return { origin: SITE, pass: issues.length === 0, published_articles: published.length, sitemap_urls: locs.length,
    public_files: files.length, generated_pages: pages.length, checked_internal_urls: checkedLinks,
    legacy_project_paths: legacyPaths, legacy_github_urls: legacyOrigins, broken_internal_links: broken.length, issues };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = auditSite(createSiteIo(root));
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
}
