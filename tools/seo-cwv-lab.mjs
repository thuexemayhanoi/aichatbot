#!/usr/bin/env node
/**
 * Lab Core Web Vitals for the built site (Master SEO 2026, lô M1).
 *
 * Serves the repository root the way GitHub Pages serves it (gzip, a
 * directory URL answers with its index.html, unknown paths get 404.html with
 * status 404) on 127.0.0.1, loads one page per template in headless Chromium
 * with mobile throttling, and writes docs/seo/master-2026/cwv-lab.json.
 *
 * LAB, NOT FIELD. These figures come from one container, a local server and
 * simulated throttling (150 ms RTT, 1.6 Mbps down, 750 kbps up, CPU 4x — the
 * Lighthouse mobile profile). Google's Core Web Vitals assessment uses field
 * data (Chrome UX Report, 75th percentile of real visits over 28 days). This
 * site has no CrUX / Search Console data in the repository, so field CWV stay
 * N/A and these numbers only catch regressions between builds.
 *
 * INP needs real interactions. The lab proxy is `interaction_ms`: the longest
 * Event Timing entry (duration ≥ 16 ms is recorded; shorter means "< 16") for
 * one scripted tap on the menu button, plus Total Blocking Time (`tbt_ms`).
 *
 * Usage: node tools/seo-cwv-lab.mjs [--runs 3] [--out docs/seo/master-2026/cwv-lab.json]
 * Needs Playwright + Chromium (local only; not part of CI).
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const RUNS = Number(arg('runs', 3));
const OUT = arg('out', 'docs/seo/master-2026/cwv-lab.json');

export const THRESHOLDS = { lcp_ms: [2500, 4000], cls: [0.1, 0.25], inp_ms: [200, 500], tbt_ms: [200, 600] };
export const rate = (metric, v) => {
  if (v === null || v === undefined) return 'N/A';
  const [good, poor] = THRESHOLDS[metric];
  return v <= good ? 'GOOD' : v <= poor ? 'NEEDS IMPROVEMENT' : 'POOR';
};

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8'
};
const COMPRESS = /^(text\/|application\/(json|xml|manifest)|image\/svg)/;

function serve() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    let status = 200;
    if (!existsSync(file)) { file = join(ROOT, '404.html'); status = 404; }
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    let body = readFileSync(file);
    const headers = { 'content-type': type, 'cache-control': 'max-age=600' };
    if (COMPRESS.test(type) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
      body = gzipSync(body);
      headers['content-encoding'] = 'gzip';
    }
    res.writeHead(status, headers).end(body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Observers installed before any page script runs. */
const OBSERVE = () => {
  const m = { lcp: null, lcpEl: '', cls: 0, longTasks: [], events: [] };
  window.__cwv = m;
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        m.lcp = e.startTime;
        const el = e.element;
        m.lcpEl = el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList?.[0] ? `.${el.classList[0]}` : ''}` : (e.url || '');
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    let win = 0; let first = 0; let last = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.hadRecentInput) continue;
        if (win && e.startTime - last < 1000 && e.startTime - first < 5000) { win += e.value; last = e.startTime; }
        else { win = e.value; first = last = e.startTime; }
        if (win > m.cls) m.cls = win;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) m.longTasks.push([e.startTime, e.duration]); })
      .observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.interactionId) m.events.push([e.name, e.duration]); })
      .observe({ type: 'event', durationThreshold: 16, buffered: true });
  } catch { /* metric unsupported: stays null */ }
};

const median = (xs) => {
  const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};
const round = (x, d = 0) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);

/** One template each; articles picked from the repository so the list never goes stale. */
export function pickPages() {
  const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
  const images = json('data/seo/article-images.json').images;
  const dirOf = Object.fromEntries(Object.entries(json('data/blog/taxonomy.json').categories).map(([k, v]) => [k, v.dir]));
  const withImage = json('data/blog/published.json').articles
    .filter((a) => images[a.article_id]?.status === 'LIVE_VERIFIED')
    .sort((a, b) => a.article_id.localeCompare(b.article_id))[0];
  const urlOf = (a) => `/blog/${dirOf[a.category]}/${a.slug}/`;
  const pages = [
    ['/', 'Trang chủ'], ['/gia-thue/', 'Trang giá (chuyển đổi)'], ['/lien-he/', 'Trang liên hệ (chuyển đổi)'],
    ['/agent/', 'Ứng dụng Agent'], ['/blog/', 'Blog home'], ['/blog/thue-xe/', 'Hub danh mục'],
    ['/blog/thue-xe/gia-thue/', 'Hub chủ đề con'], ['/blog/an-toan/cam-xe-may-xang-vanh-dai-1/', 'Bài viết (không ảnh)']
  ];
  if (withImage) pages.push([urlOf(withImage), 'Bài viết (có ảnh đại diện)']);
  return pages.filter(([u]) => existsSync(join(ROOT, u, 'index.html')));
}

async function measure(browser, base, url) {
  const context = await browser.newContext({
    viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, locale: 'vi-VN',
    userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
  });
  const page = await context.newPage();
  await page.addInitScript(OBSERVE);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const response = await page.goto(base + url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(3000);
  const before = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
    const res = performance.getEntriesByType('resource');
    const m = window.__cwv;
    const tbt = m.longTasks.filter(([s]) => fcp === null || s >= fcp).reduce((t, [, d]) => t + Math.max(0, d - 50), 0);
    return {
      ttfb: nav ? nav.responseStart : null, fcp, lcp: m.lcp, lcpEl: m.lcpEl, cls: m.cls, tbt,
      load: nav ? nav.loadEventEnd : null,
      requests: res.length + 1,
      domNodes: document.getElementsByTagName('*').length,
      transferKb: Math.round(((nav?.transferSize ?? 0) + res.reduce((t, r) => t + (r.transferSize || 0), 0)) / 1024)
    };
  });
  let interaction = null;
  const target = (await page.$('#motoai-menu-btn')) ? '#motoai-menu-btn' : 'body';
  try {
    await page.tap(target, { timeout: 10000 });
    await page.waitForTimeout(1500);
    interaction = await page.evaluate(() => {
      const d = window.__cwv.events.map(([, dur]) => dur);
      return d.length ? Math.max(...d) : 0;
    });
  } catch { interaction = null; }
  await context.close();
  return { status: response?.status() ?? null, ...before, interaction, tapTarget: target };
}

async function main() {
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const pages = [];
  try {
    for (const [url, template] of pickPages()) {
      const runs = [];
      for (let i = 0; i < RUNS; i++) runs.push(await measure(browser, base, url));
      const med = (k) => median(runs.map((r) => r[k]));
      const interactionRaw = median(runs.map((r) => r.interaction));
      const row = {
        url, template, status: runs[0].status,
        median: {
          ttfb_ms: round(med('ttfb')), fcp_ms: round(med('fcp')), lcp_ms: round(med('lcp')), cls: round(med('cls'), 3),
          tbt_ms: round(med('tbt')), interaction_ms: interactionRaw === 0 ? '< 16' : round(interactionRaw),
          load_ms: round(med('load')), transfer_kb: med('transferKb'), requests: med('requests'), dom_nodes: med('domNodes')
        },
        lcp_element: runs.map((r) => r.lcpEl).find(Boolean) ?? '',
        tap_target: runs[0].tapTarget,
        runs: runs.map((r) => ({ lcp_ms: round(r.lcp), cls: round(r.cls, 3), tbt_ms: round(r.tbt), interaction_ms: r.interaction === null ? null : round(r.interaction) }))
      };
      const inter = typeof row.median.interaction_ms === 'number' ? row.median.interaction_ms : (row.median.interaction_ms ? 0 : null);
      row.lab_rating = {
        lcp: rate('lcp_ms', row.median.lcp_ms), cls: rate('cls', row.median.cls),
        tbt: rate('tbt_ms', row.median.tbt_ms), interaction: rate('inp_ms', inter)
      };
      pages.push(row);
      console.log(`${url}  LCP ${row.median.lcp_ms} ms  CLS ${row.median.cls}  TBT ${row.median.tbt_ms} ms  tap ${row.median.interaction_ms}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
  const out = {
    $schema: 'motoai/cwv-lab@1',
    generated: new Date().toISOString(),
    kind: 'LAB',
    method: {
      tool: 'tools/seo-cwv-lab.mjs (Playwright Chromium headless)',
      server: 'local static server mirroring GitHub Pages (gzip, index.html, 404.html)',
      device: 'mobile 412×823 @1.75x, touch',
      throttling: { rtt_ms: 150, down_kbps: 1638, up_kbps: 750, cpu_slowdown: 4 },
      runs_per_url: RUNS,
      cache: 'disabled (cold load)',
      inp_proxy: 'longest Event Timing entry for one tap on #motoai-menu-btn; < 16 ms is not recorded by the browser'
    },
    thresholds: { lcp_ms: 2500, inp_ms: 200, cls: 0.1, note: 'Core Web Vitals "good" thresholds (web.dev/articles/vitals, 75th percentile of field data)' },
    field: {
      status: 'N/A',
      missing_source: 'Chrome UX Report / Search Console Core Web Vitals report — Search Console not connected, PageSpeed Insights API without key answered 429'
    },
    pages
  };
  const target = resolve(ROOT, OUT);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${OUT} (${pages.length} pages × ${RUNS} runs)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
