/**
 * Lô M5 (Master SEO 2026): hub guides (data/blog/hub-guides.json) give a
 * category or subtopic hub its own answer-first copy instead of a bare card
 * list. Guarded here: page 1 only, facts and prices only via placeholders,
 * every internal link reaches a generated page, its own SERP title/H1/meta,
 * no head keyword of another owner URL, and the price claims in the copy
 * still hold for data/business/pricing.json.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIMITS } from '../../tools/seo-meta.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const { hubs } = JSON.parse(read('data/blog/hub-guides.json'));
const pricing = JSON.parse(read('data/business/pricing.json'));
const ownership = JSON.parse(read('config/seo-ownership.json')).commercial_owner_policy;
const page = (url) => read(`${url.replace(/^\//, '')}index.html`);
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const words = (html) => text(html).split(' ').filter(Boolean).length;
const GUIDE_MORE = '<!-- hub-guide:more -->';
const answerOf = (html) => /<div class="blog-article-body hub-guide hub-guide-answer">([\s\S]*?)<\/div>/.exec(html)?.[1];
const moreOf = (html) => /<section class="blog-article-body hub-guide hub-guide-more">([\s\S]*?)<\/section>/.exec(html)?.[1];

test('every hub guide renders on page 1 of its hub, never on deeper pages', () => {
  assert.ok(Object.keys(hubs).length >= 1);
  for (const [url, g] of Object.entries(hubs)) {
    assert.ok(g.body && existsSync(join(ROOT, g.body)), `${url}: body file`);
    assert.ok(g.keyword && g.batch && g.reviewed, `${url}: keyword, batch and review date recorded`);
    const html = page(url);
    assert.ok(answerOf(html), `${url}: answer block on page 1`);
    assert.ok(moreOf(html), `${url}: topic map below the cards`);
    assert.ok(html.indexOf('hub-guide-answer') < html.indexOf('class="blog-grid"'), `${url}: answer comes before the cards`);
    assert.ok(html.indexOf('hub-guide-more') > html.lastIndexOf('class="blog-card"'), `${url}: topic map comes after the cards`);
    for (let n = 2; existsSync(join(ROOT, `${url.slice(1)}page/${n}/index.html`)); n++) {
      assert.ok(!page(`${url}page/${n}/`).includes('hub-guide'), `${url}page/${n}/: guide stays on page 1`);
    }
  }
});

test('guide copy: answer first, real depth, no hard-coded money, allowed markup only', () => {
  for (const [url, g] of Object.entries(hubs)) {
    const src = read(g.body);
    assert.equal(src.split(GUIDE_MORE).length, 2, `${url}: exactly one ${GUIDE_MORE} split`);
    const [answer, more] = src.split(GUIDE_MORE);
    const a = words(answer.replace(/\{\{[^}]+\}\}/g, 'X'));
    assert.ok(a >= 35 && a <= 120, `${url}: answer block ${a} words (35–120)`);
    const total = words(src.replace(/\{\{[^}]+\}\}/g, 'X'));
    assert.ok(total >= 150 && total <= 700, `${url}: guide ${total} words (150–700)`);
    assert.ok(/<h2>/.test(more), `${url}: the part below the cards has its own H2 sections`);
    assert.ok(!/<h1|<script|<style|style=|<img|onclick=/i.test(src), `${url}: no H1, script, style or images in a guide`);
    const plain = src.replace(/\{\{[^}]+\}\}/g, '');
    assert.ok(!/\d{1,3}(?:[.,]\d{3})+\s*(?:đ|đồng|vnđ)|\d+\s*(?:k|nghìn|ngàn|triệu)\b/i.test(plain), `${url}: money only via {{ price.* }} / {{ business.* }}`);
    assert.ok(!/(?:0|\+84)\s?9\d{2}[\s.]?\d{3}[\s.]?\d{3}/.test(plain), `${url}: phone only via {{ business.contact.* }}`);
  }
});

test('guide links reach generated pages; each guide links its silo and a conversion page', () => {
  for (const [url, g] of Object.entries(hubs)) {
    const html = page(url);
    const block = `${answerOf(html)}${moreOf(html)}`;
    const hrefs = [...block.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const internal = hrefs.filter((h) => h.startsWith('/'));
    assert.ok(internal.length >= 4, `${url}: at least 4 internal links (${internal.length})`);
    for (const h of internal) assert.ok(existsSync(join(ROOT, h.replace(/^\//, ''), 'index.html')), `${url} → ${h}: page exists`);
    assert.ok(internal.some((h) => /^\/blog\/[a-z-]+\/[a-z0-9-]+\/$/.test(h)), `${url}: links into its articles or subtopics`);
    assert.ok(internal.some((h) => ['/gia-thue/', '/lien-he/', '/agent/', '/chinh-sach/'].includes(h)), `${url}: links a conversion page`);
    assert.ok(!block.includes('{{'), `${url}: every placeholder resolved`);
  }
});

test('subtopic guides own their SERP title, H1 and description; no head keyword of another owner', () => {
  const heads = [ownership.target_head, ...ownership.head_variants, 'giá thuê xe máy Hà Nội', 'bảng giá thuê xe máy'].map((s) => s.toLowerCase());
  const titles = new Set();
  for (const [url, g] of Object.entries(hubs)) {
    assert.ok(!heads.includes(g.keyword.toLowerCase()), `${url}: keyword "${g.keyword}" belongs to another owner URL`);
    if (!g.seo_title) continue;
    const html = page(url);
    const title = /<title>([^<]*)<\/title>/.exec(html)[1];
    const desc = /<meta name="description" content="([^"]*)"/.exec(html)[1];
    const h1 = /<h1 class="blog-screen-title">([^<]*)<\/h1>/.exec(html)[1];
    assert.ok(title.length >= LIMITS.titleMin && title.length <= LIMITS.titleMax, `${url}: title ${title.length} chars`);
    assert.ok(desc.length >= LIMITS.descMin && desc.length <= LIMITS.descMax, `${url}: description ${desc.length} chars`);
    assert.equal(h1, g.h1, `${url}: H1 from the guide`);
    assert.ok(!titles.has(title), `${url}: unique title`);
    titles.add(title);
    for (const head of heads) assert.ok(!title.toLowerCase().startsWith(head), `${url}: title does not lead with "${head}"`);
  }
});

test('a hub never competes with an article: different keyword and title lead', () => {
  const meta = JSON.parse(read('data/seo/article-meta.json'));
  const metaById = meta.articles ?? meta;
  const lines = read('data/blog/content-matrix.csv').trim().split('\n');
  const head = lines[0].split(',');
  const col = (name) => head.indexOf(name);
  const lead = (s) => s.split(':')[0].trim().toLowerCase();
  const articleKeywords = new Set();
  const articleLeads = new Set();
  const published = JSON.parse(read('data/blog/published.json')).articles;
  const titleById = Object.fromEntries(published.map((a) => [a.article_id, a.title]));
  for (const l of lines.slice(1)) {
    const c = l.split(',');
    if (c[col('status')] !== 'PUBLISHED') continue;
    const id = c[col('article_id')];
    articleKeywords.add((metaById[id]?.keyword || c[col('primary_keyword')]).toLowerCase());
    articleLeads.add(lead(metaById[id]?.title || titleById[id] || ''));
  }
  for (const [url, g] of Object.entries(hubs)) {
    assert.ok(!articleKeywords.has(g.keyword.toLowerCase()), `${url}: keyword "${g.keyword}" is already an article's primary keyword`);
    if (g.seo_title) assert.ok(!articleLeads.has(lead(g.seo_title)), `${url}: title lead "${lead(g.seo_title)}" repeats an article title`);
  }
});

test('price claims in the guides still hold for pricing.json', () => {
  const all = Object.values(hubs).map((g) => read(g.body)).join('\n');
  for (const v of pricing.vehicles) {
    const { day, week, month } = v.rates;
    if (/thấp hơn bảy ngày thuê lẻ/.test(all) && Number.isFinite(day.min) && Number.isFinite(week.max)) {
      assert.ok(week.max < 7 * day.min, `${v.id}: a week costs less than seven single days`);
    }
    if (/càng dài thì càng rẻ|thấp hơn nhiều so với thuê lẻ/.test(all) && Number.isFinite(week.min) && Number.isFinite(month.max)) {
      assert.ok(month.max / 30 < week.min / 7, `${v.id}: per day, a month costs less than a week`);
      assert.ok(month.max / 30 < day.min, `${v.id}: per day, a month costs less than a single day`);
    }
  }
});
