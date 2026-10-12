#!/usr/bin/env node
/**
 * MotoAI independent, read-only LIVE SEO smoke monitor.
 * Offline/full-site checks remain owned by tools/site-audit.mjs and seo-score.mjs.
 * Does not claim that a crawled page is indexed by Google, or measure field CWV.
 */
import { fileURLToPath } from 'node:url';
import { SITE } from '../src/config/site.js';

const BASE = SITE.endsWith('/') ? SITE : SITE + '/';
const ORIGIN = new URL(BASE).origin;
const TIMEOUT_MS = 15000;
const CATEGORY_DIRS = ['app', 'thue-xe', 'xe-dien', 'huong-dan', 'an-toan', 'dia-phuong'];

export function sitemapLocations(xml) {
  return [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) =>
    match[1].replace(/&amp;/g, '&'));
}

export function inspectHtml(html, expectedUrl) {
  const issues = [];
  const links = [...String(html).matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);
  const canonicalTag = links.find((tag) => /\brel\s*=\s*["']canonical["']/i.test(tag));
  const canonical = canonicalTag?.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? null;
  if (canonical !== expectedUrl) issues.push('canonical does not equal the sampled sitemap URL');
  if (/<meta\b[^>]*name\s*=\s*["'](?:robots|googlebot)["'][^>]*content\s*=\s*["'][^"']*noindex/i.test(html)) {
    issues.push('noindex meta detected');
  }
  if (!/<html\b[^>]*\blang\s*=\s*["']vi(?:-VN)?["']/i.test(html)) issues.push('HTML language is not vi');
  if ((String(html).match(/<h1\b/gi) || []).length !== 1) issues.push('HTML must have exactly one H1');

  const blocks = [...String(html).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  if (!blocks.length) issues.push('missing JSON-LD structured data');
  for (const block of blocks) {
    try { JSON.parse(block[1]); }
    catch { issues.push('invalid JSON-LD structured data'); }
  }
  return { canonical, jsonLdBlocks: blocks.length, issues };
}

function siteUrl(path) { return new URL(path, BASE).href; }
function sameOrigin(url) {
  try { return new URL(url).origin === ORIGIN; } catch { return false; }
}
async function fetchText(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
    headers: { 'user-agent': 'MotoAI-ReadOnly-SEO-Monitor/1.0' }
  });
  return { status: response.status, finalUrl: response.url, text: await response.text() };
}

function selectSamples(locs) {
  const out = [BASE, siteUrl('blog/'), siteUrl('gia-thue/'), siteUrl('lien-he/')];
  for (const category of CATEGORY_DIRS) {
    const found = locs.find((url) => {
      if (!sameOrigin(url)) return false;
      const parts = new URL(url).pathname.split('/').filter(Boolean);
      return parts.length === 3 && parts[0] === 'blog' && parts[1] === category;
    });
    if (found) out.push(found);
  }
  return [...new Set(out)];
}

export async function runLiveSeoAudit() {
  const report = {
    tool: 'tools/seo-live-monitor.mjs',
    site: BASE,
    checkedAt: new Date().toISOString(),
    limitations: [
      'HTTP and HTML checks do not prove Google/Bing indexing.',
      'Real user LCP/INP/CLS and GSC/Bing performance require separate authorized data sources.',
      'This checks a live URL sample, not every URL in the sitemap.'
    ],
    checks: [],
    sitemapUrls: 0,
    sampledPages: 0
  };
  const check = (name, passed, detail = '') =>
    report.checks.push({ check: name, status: passed ? 'PASS' : 'FAIL', detail });

  let robots;
  try {
    robots = await fetchText(siteUrl('robots.txt'));
    check('robots HTTP', robots.status === 200, 'HTTP ' + robots.status);
    check('robots sitemap reference', robots.text.includes('Sitemap: ' + siteUrl('sitemap.xml')));
    check('robots sitewide access', !/^Disallow:\s*\/\s*$/mi.test(robots.text));
  } catch (error) { check('robots reachability', false, String(error)); }

  let locs = [];
  try {
    const response = await fetchText(siteUrl('sitemap.xml'));
    check('sitemap HTTP', response.status === 200, 'HTTP ' + response.status);
    locs = sitemapLocations(response.text);
    report.sitemapUrls = locs.length;
    check('sitemap not empty', locs.length > 0, String(locs.length) + ' URLs');
    check('sitemap URLs unique', locs.length === new Set(locs).size);
    check('sitemap URLs own origin', locs.every(sameOrigin));
    check('homepage in sitemap', locs.includes(BASE));
  } catch (error) { check('sitemap reachability', false, String(error)); }

  const samples = selectSamples(locs);
  report.sampledPages = samples.length;
  const pages = await Promise.all(samples.map(async (url) => {
    try {
      const response = await fetchText(url);
      const statusOk = response.status === 200;
      const finalUrl = new URL(response.finalUrl);
      const expected = new URL(url);
      const redirectOk = finalUrl.origin === expected.origin && finalUrl.pathname === expected.pathname;
      const meta = statusOk ? inspectHtml(response.text, url) : { canonical: null, jsonLdBlocks: 0, issues: [] };
      return { url, http: response.status, finalUrl: response.finalUrl, canonical: meta.canonical, jsonLdBlocks: meta.jsonLdBlocks,
        issues: [...(!statusOk ? ['unexpected HTTP status'] : []), ...(!redirectOk ? ['redirected away from canonical URL'] : []), ...meta.issues] };
    } catch (error) { return { url, issues: ['request failed: ' + String(error)] }; }
  }));
  report.pages = pages;
  for (const page of pages) check('sample ' + new URL(page.url).pathname,
    page.issues.length === 0, page.issues.join('; ') || 'HTTP 200, canonical, language, H1 and JSON-LD verified');
  report.failed = report.checks.filter((item) => item.status === 'FAIL').length;
  report.passed = report.checks.length - report.failed;
  report.pass = report.failed === 0;
  return report;
}

const isCli = process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href;
if (isCli) {
  runLiveSeoAudit().then((report) => {
    if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else {
      console.log('MotoAI Live SEO audit: ' + (report.pass ? 'PASS' : 'FAIL'));
      for (const item of report.checks) console.log(item.status + ' ' + item.check + ': ' + item.detail);
    }
    if (!report.pass) process.exitCode = 1;
  }).catch((error) => { console.error(error); process.exitCode = 1; });
}
