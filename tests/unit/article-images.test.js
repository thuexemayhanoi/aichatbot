import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  webpInfo, hamming, altProblems, featuredImage, auditRegistry, loadRegistry, SPEC, STATUSES, atLeast
} from '../../tools/article-images.mjs';
import { buildPlan, loadPlan, sceneFor, imageFilename, PLAN_CSV, PLAN_COLUMNS, toCsv } from '../../tools/image-briefs.mjs';
import { pageHead } from '../../tools/app-shell.mjs';
import { heroFigure } from '../../tools/build-blog.mjs';
import { SITE } from '../../src/config/site.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = join(ROOT, 'tests/fixtures/images');
const fixture = (name) => readFileSync(join(FIX, name));
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const published = JSON.parse(readFileSync(join(ROOT, 'data/blog/published.json'), 'utf8')).articles;

// ---------- WebP header parser ----------

test('webpInfo reads VP8 (lossy), VP8L (lossless) and VP8X (extended) dimensions', () => {
  assert.deepEqual(webpInfo(fixture('lossy-1200x800.webp')), { chunk: 'VP8 ', width: 1200, height: 800 });
  assert.deepEqual(webpInfo(fixture('lossless-3x2.webp')), { chunk: 'VP8L', width: 3, height: 2 });
  assert.deepEqual(webpInfo(fixture('alpha-640x480.webp')), { chunk: 'VP8X', width: 640, height: 480 });
});

test('webpInfo rejects non-WebP and truncated files', () => {
  assert.throws(() => webpInfo(Buffer.from('not an image at all, just text bytes')), /RIFF\/WEBP/);
  const buf = fixture('lossy-1200x800.webp');
  assert.throws(() => webpInfo(buf.subarray(0, buf.length - 10)), /truncated/);
});

test('hamming counts differing bits of 64-bit dHash values', () => {
  assert.equal(hamming('0000000000000000', '0000000000000000'), 0);
  assert.equal(hamming('0000000000000000', 'ffffffffffffffff'), 64);
  assert.equal(hamming('00000000000000ff', '0000000000000000'), 8);
});

// ---------- ALT rules ----------

test('ALT must describe the scene in natural Vietnamese, without stuffing', () => {
  assert.deepEqual(altProblems('Xe tay ga Honda Vision màu trắng đỗ trên đường phố Hà Nội'), []);
  assert.ok(altProblems('thuê xe máy Hà Nội giá rẻ thuê xe máy gần đây tốt nhất').length >= 2);
  assert.ok(altProblems('Scooter parked in Hanoi old quarter street').some((p) => /Vietnamese/.test(p)));
  assert.ok(altProblems('Hình ảnh xe máy điện đang sạc ở bãi xe').some((p) => /ảnh\/hình/.test(p)));
  assert.ok(altProblems('Xe').length > 0);
  assert.ok(altProblems('xe máy, giá thuê, thủ tục, đặt cọc, giao xe, Hà Nội').some((p) => /keyword list/.test(p)));
});

// ---------- registry gate ----------

function tempRegistry(entries) {
  const root = mkdtempSync(join(tmpdir(), 'motoai-img-'));
  mkdirSync(join(root, SPEC.dir), { recursive: true });
  for (const [name, src] of Object.entries(entries.files ?? {})) copyFileSync(join(FIX, src), join(root, SPEC.dir, name));
  return root;
}
const gen = { tool: 'figma-mcp generate_image', generated_at: '2026-10-28' };

test('a QA_PASSED entry with a valid 1200×800 WebP, hashes and reviewed ALT passes the gate', () => {
  const root = tempRegistry({ files: { 'a-ba-0001.webp': 'ai-1200x800.webp' } });
  const buf = fixture('ai-1200x800.webp');
  const reg = { images: { 'BA-0001': {
    status: 'QA_PASSED', file: `${SPEC.dir}a-ba-0001.webp`, source: 'ai', generator: gen,
    width: 1200, height: 800, bytes: buf.length, sha256: sha(buf), dhash: '0f0f0f0f0f0f0f0f', dhash_of: sha(buf),
    alt: 'Xe tay ga đỗ trong ngõ nhỏ có chậu cây ở Hà Nội', alt_reviewed: true
  } } };
  const r = auditRegistry(reg, { root, articles: new Set(['BA-0001']) });
  assert.deepEqual(r.errors, []);
  assert.equal(r.counts.QA_PASSED, 1);
});

test('the gate rejects wrong size, stale hashes, unreviewed ALT, shared files and near-duplicates', () => {
  const root = tempRegistry({ files: { 'b-ba-0002.webp': 'alpha-640x480.webp', 'c-ba-0003.webp': 'lossy-1200x800.webp', 'd-ba-0004.webp': 'lossy-1200x800.webp' } });
  const small = fixture('alpha-640x480.webp');
  const ok = fixture('lossy-1200x800.webp');
  const base = { source: 'ai', generator: gen, width: 1200, height: 800 };
  const reg = { images: {
    'BA-0002': { ...base, status: 'IMAGE_OPTIMIZED', file: `${SPEC.dir}b-ba-0002.webp`, bytes: small.length, sha256: sha(small), dhash: 'ffffffffffffffff', dhash_of: sha(small) },
    'BA-0003': { ...base, status: 'IMAGE_ATTACHED', file: `${SPEC.dir}c-ba-0003.webp`, bytes: ok.length, sha256: 'deadbeef', dhash: '0000000000000000', dhash_of: 'deadbeef', alt: 'Người đi xe máy dừng chờ đèn đỏ tại nút giao ở Hà Nội' },
    'BA-0004': { ...base, status: 'IMAGE_OPTIMIZED', file: `${SPEC.dir}d-ba-0004.webp`, bytes: ok.length, sha256: sha(ok), dhash: '0000000000000001', dhash_of: sha(ok) },
    'BA-0005': { ...base, status: 'IMAGE_GENERATED', file: `${SPEC.dir}d-ba-0004.webp` }
  } };
  const msg = auditRegistry(reg, { root }).errors.join('\n');
  assert.match(msg, /BA-0002: size 640×480/);
  assert.match(msg, /BA-0003: sha256 differs/);
  assert.match(msg, /BA-0003: ALT not marked as written from the actual image/);
  assert.match(msg, /BA-0005: file shared with BA-0004/);
  // BA-0003 is excluded from the dHash comparison (stale hash), so plant a
  // near-duplicate pair explicitly.
  const dup = auditRegistry({ images: {
    'BA-0006': { ...reg.images['BA-0004'], file: `${SPEC.dir}d-ba-0004.webp` },
    'BA-0007': { ...reg.images['BA-0004'], file: `${SPEC.dir}c-ba-0003.webp`, dhash: '0000000000000003' }
  } }, { root }).errors.join('\n');
  assert.match(dup, /identical bytes to BA-0006/);
  assert.match(dup, /near-duplicate \(dHash distance 1/);
});

test('an AI image must carry the IPTC trainedAlgorithmicMedia XMP label; a real photo need not', () => {
  const root = tempRegistry({ files: { 'x-ba-0020.webp': 'lossy-1200x800.webp', 'y-ba-0021.webp': 'ai-1200x800.webp' } });
  assert.deepEqual(webpInfo(fixture('ai-1200x800.webp')), { chunk: 'VP8X', width: 1200, height: 800 });
  const plain = fixture('lossy-1200x800.webp');
  const base = { status: 'IMAGE_OPTIMIZED', generator: gen, width: 1200, height: 800, bytes: plain.length, sha256: sha(plain), dhash_of: sha(plain) };
  const reg = { images: {
    'BA-0020': { ...base, file: `${SPEC.dir}x-ba-0020.webp`, source: 'ai', dhash: '00000000ffffffff' },
    'BA-0021': { ...base, file: `${SPEC.dir}x-ba-0020.webp`.replace('x-ba-0020', 'y-ba-0021'), source: 'photo', dhash: 'ffffffff00000000',
      bytes: fixture('ai-1200x800.webp').length, sha256: sha(fixture('ai-1200x800.webp')), dhash_of: sha(fixture('ai-1200x800.webp')) }
  } };
  const errors = auditRegistry(reg, { root }).errors;
  assert.deepEqual(errors, ['BA-0020: AI image without IPTC trainedAlgorithmicMedia XMP']);
});

// A copy of `buf` grown to exactly `total` bytes with an extra RIFF chunk —
// still a valid WebP to the parser, so only the byte size changes.
function padded(buf, total) {
  const pad = total - buf.length - 8;
  const out = Buffer.concat([buf, Buffer.from('PAD '), Buffer.alloc(4), Buffer.alloc(pad)]);
  out.writeUInt32LE(pad, buf.length + 4);
  out.writeUInt32LE(out.length - 8, 4);
  return out;
}

test('Image SEO V2: files up to 300 KB pass, heavier ones fail, light sharp files are not rejected', () => {
  assert.equal(SPEC.maxBytes, 300 * 1024);
  assert.deepEqual(SPEC.preferredBytes, [120 * 1024, 220 * 1024]);
  const root = mkdtempSync(join(tmpdir(), 'motoai-img-'));
  mkdirSync(join(root, SPEC.dir), { recursive: true });
  const ai = fixture('ai-1200x800.webp');
  const sizes = { 'BA-0031': ai.length, 'BA-0032': 250 * 1024, 'BA-0033': 300 * 1024, 'BA-0034': 300 * 1024 + 2, 'BA-0035': 310 * 1024 };
  const dhashes = ['0000000000000000', 'ffffffffffffffff', '00000000ffffffff', 'ffffffff00000000', '0f0f0f0f0f0f0f0f'];
  const images = {};
  Object.entries(sizes).forEach(([id, total], i) => {
    const buf = total === ai.length ? ai : padded(ai, total);
    const file = `${SPEC.dir}v2-${id.toLowerCase()}.webp`;
    writeFileSync(join(root, file), buf);
    images[id] = { status: 'IMAGE_OPTIMIZED', file, source: 'ai', generator: gen, width: 1200, height: 800,
      bytes: buf.length, sha256: sha(buf), dhash: dhashes[i], dhash_of: sha(buf) };
  });
  assert.ok(ai.length < 100 * 1024, 'the fixture stands in for a sharp file under 100 KB');
  assert.deepEqual(auditRegistry({ images }, { root }).errors, [
    `BA-0034: ${300 * 1024 + 2} bytes exceeds the 300 KB cap`,
    `BA-0035: ${310 * 1024} bytes exceeds the 300 KB cap`
  ]);
});

test('only QA_PASSED or later entries whose file exists are rendered', () => {
  const reg = { images: {
    'BA-0010': { status: 'IMAGE_ATTACHED', file: 'assets/images/blog/x-ba-0010.webp', width: 1200, height: 800, alt: 'Xe máy điện cắm sạc', source: 'ai' },
    'BA-0011': { status: 'QA_PASSED', file: 'assets/images/blog/x-ba-0011.webp', width: 1200, height: 800, alt: 'Xe máy điện cắm sạc ở bãi xe', source: 'ai' },
    'BA-0012': { status: 'LIVE_VERIFIED', file: 'assets/images/blog/missing.webp', width: 1200, height: 800, alt: 'Xe số đỗ', source: 'ai' }
  } };
  const exists = (p) => p !== 'assets/images/blog/missing.webp';
  assert.equal(featuredImage('BA-0010', reg, { exists }), null);
  assert.equal(featuredImage('BA-0012', reg, { exists }), null);
  assert.equal(featuredImage('BA-9999', reg, { exists }), null);
  assert.deepEqual(featuredImage('BA-0011', reg, { exists }), {
    src: '/assets/images/blog/x-ba-0011.webp', url: `${SITE}assets/images/blog/x-ba-0011.webp`,
    width: 1200, height: 800, alt: 'Xe máy điện cắm sạc ở bãi xe', caption: 'Ảnh minh họa tạo bằng AI'
  });
  assert.ok(atLeast('LIVE_VERIFIED', 'QA_PASSED') && !atLeast('IMAGE_ATTACHED', 'QA_PASSED'));
  assert.equal(STATUSES.length, 6);
});

test('the committed registry passes the image QA gate against the plan and the manifest', () => {
  const reg = loadRegistry();
  const r = auditRegistry(reg, { plan: loadPlan(), articles: new Set(published.map((a) => a.article_id)) });
  assert.deepEqual(r.errors, []);
});

// ---------- briefs / plan ----------

test('image-plan.csv is generated from the current sources (node tools/image-briefs.mjs)', () => {
  const plan = buildPlan();
  assert.equal(readFileSync(join(ROOT, PLAN_CSV), 'utf8'), toCsv(PLAN_COLUMNS, plan));
});

test('the plan gives every published article one unique brief, filename and prompt', () => {
  const plan = loadPlan();
  assert.equal(plan.length, published.length);
  assert.equal(plan.filter((r) => r.scope === 'TARGET').length, 2000);
  for (const key of ['article_id', 'filename', 'prompt_en']) {
    assert.equal(new Set(plan.map((r) => r[key])).size, plan.length, `${key} must be unique`);
  }
  for (const r of plan) {
    assert.match(r.filename, /^[a-z0-9-]+-ba-\d{4}\.webp$/, r.article_id);
    assert.ok(r.filename.length <= 80, r.filename);
    assert.match(r.prompt_en, /No text, no captions, no watermark, no logos/);
    assert.ok(r.alt_plan.length <= 140, `${r.article_id} planned ALT too long`);
  }
});

test('Vietnamese words that fold to the same ASCII are not confused', () => {
  // "cho thuê" (for rent) is not "chợ" (market); "gia đình" is not "giá".
  const rent = sceneFor({ category: 'RENT', title: 'So sánh giá các loại xe máy cho thuê', keyword: 'so sánh giá xe máy cho thuê', slug: 'so-sanh-gia-cac-loai-xe-may-cho-thue' });
  assert.notEqual(rent.place.id, 'market');
  assert.equal(rent.theme.id, 'compare');
  const family = sceneFor({ category: 'RENT', title: 'Thuê Honda Vision cho gia đình: chở trẻ an toàn', keyword: 'thuê honda vision cho gia đình', slug: 'thue-honda-vision-cho-gia-dinh' });
  assert.equal(family.vehicle.id, 'vision');
  assert.notEqual(family.theme?.id, 'price');
  assert.equal(family.people.id, 'family');
});

test('briefs never ask for scenes that fail image QA: EVs at a petrol pump, readable sums, chat text, badges or key logos', () => {
  const ev = sceneFor({ category: 'EV', title: 'Khác biệt xe điện và xe xăng', keyword: 'khác biệt xe điện và xe xăng', slug: 'khac-biet-xe-dien-va-xe-xang' });
  assert.equal(ev.vehicle.id, 'ev');
  assert.notEqual(ev.theme?.id, 'fuel');
  for (const r of loadPlan()) {
    assert.ok(!(/electric/.test(r.prompt_en) && /refuel/.test(r.prompt_en)), `${r.article_id}: electric vehicle at a petrol pump`);
    assert.doesNotMatch(r.prompt_en, /handwritten|generic chat screen/, r.article_id);
    if (/certificate/.test(r.prompt_en)) assert.match(r.prompt_en, /no emblems, stamps or seals/, r.article_id);
    assert.match(r.prompt_en, /badges, lettering or decals; keys plain with logo-free fobs/, r.article_id);
  }
});

test('a named model stays the hero of its own article image', () => {
  const s = sceneFor({ category: 'RENT', title: 'Thuê Wave Alpha: xe số tiết kiệm, giá và thủ tục nhận xe', keyword: 'thuê wave alpha', slug: 'thue-wave-alpha' });
  assert.equal(s.vehicle.id, 'wave');
  assert.ok(s.hero, 'paperwork theme becomes a prop next to the model');
  assert.equal(imageFilename('a'.repeat(70).replace(/a{10}/g, 'abcdefghi-'), 'BA-0007').endsWith('-ba-0007.webp'), true);
});

// ---------- rendering ----------

test('the featured figure reserves its box and loads eagerly as the LCP candidate', () => {
  const html = heroFigure({ src: '/assets/images/blog/x.webp', width: 1200, height: 800, alt: 'Xe số "Wave" đỗ', caption: 'Ảnh minh họa tạo bằng AI' });
  assert.match(html, /<img src="\/assets\/images\/blog\/x\.webp" width="1200" height="800" alt="Xe số &quot;Wave&quot; đỗ" fetchpriority="high" decoding="async">/);
  assert.doesNotMatch(html, /loading="lazy"/);
  assert.match(html, /<figcaption>Ảnh minh họa tạo bằng AI<\/figcaption>/);
});

test('an article image replaces the site icon in og/twitter tags; pages without one keep the default', () => {
  const img = { url: `${SITE}assets/images/blog/x.webp`, width: 1200, height: 800, alt: 'Xe máy điện cắm sạc' };
  const withImg = pageHead({ title: 'T', description: 'D', path: 'blog/xe-dien/x/', ogType: 'article', image: img });
  assert.match(withImg, new RegExp(`<meta property="og:image" content="${SITE}assets/images/blog/x\\.webp">`));
  assert.match(withImg, /<meta property="og:image:width" content="1200">/);
  assert.match(withImg, /<meta property="og:image:alt" content="Xe máy điện cắm sạc">/);
  assert.match(withImg, /<meta name="twitter:card" content="summary_large_image">/);
  const plain = pageHead({ title: 'T', description: 'D', path: 'blog/' });
  assert.match(plain, /<meta name="twitter:card" content="summary">/);
  assert.match(plain, /og:image" content="[^"]*icon-512\.png"/);
});

test('built articles without a QA_PASSED image carry no featured figure; the service worker skips article images', () => {
  const reg = loadRegistry();
  const shown = new Set(Object.entries(reg.images).filter(([, e]) => atLeast(e.status, 'QA_PASSED')).map(([id]) => id));
  const a = published.find((x) => !shown.has(x.article_id));
  const dir = { APP: 'app', RENT: 'thue-xe', EV: 'xe-dien', GUIDE: 'huong-dan', SAFE: 'an-toan', LOCAL: 'dia-phuong' }[a.category];
  const html = readFileSync(join(ROOT, `blog/${dir}/${a.slug}/index.html`), 'utf8');
  assert.doesNotMatch(html, /class="article-hero"/);
  const sw = readFileSync(join(ROOT, 'service-worker.js'), 'utf8');
  assert.match(sw, /startsWith\(new URL\('assets\/images\/', self\.location\.href\)\.pathname\)\) return;/);
});

test('every QA_PASSED image is rendered on its article: figure, og:image, Article.image and image sitemap', () => {
  const reg = loadRegistry();
  const shown = Object.entries(reg.images).filter(([, e]) => atLeast(e.status, 'QA_PASSED'));
  const dirs = { APP: 'app', RENT: 'thue-xe', EV: 'xe-dien', GUIDE: 'huong-dan', SAFE: 'an-toan', LOCAL: 'dia-phuong' };
  const sitemap = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (const [id, e] of shown) {
    const a = published.find((x) => x.article_id === id);
    const page = `blog/${dirs[a.category]}/${a.slug}/`;
    const html = readFileSync(join(ROOT, page, 'index.html'), 'utf8');
    const url = `${SITE}${e.file}`;
    assert.ok(html.includes(`<img src="/${e.file}" width="1200" height="800" alt="${esc(e.alt)}" fetchpriority="high"`), `${id}: featured figure`);
    assert.ok(html.includes(`<meta property="og:image" content="${url}">`), `${id}: og:image`);
    assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), `${id}: twitter card`);
    const art = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((o) => o['@type'] === 'Article');
    assert.equal(art.image, url, `${id}: Article.image`);
    assert.ok(sitemap.includes(`<loc>${SITE}${page}</loc>`) && sitemap.includes(`<image:loc>${url}</image:loc>`), `${id}: image sitemap`);
  }
});
