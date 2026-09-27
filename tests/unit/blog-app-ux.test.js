import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Blog App UX Foundation (v54) spec:
 * - theme.js: Light / Dark / Auto with persistence + no-flash inline script
 * - business-status.js: verified open/closed in the business timezone
 * - shell contract: compact header, category bar, back-to-Agent, contact refs
 * - NO hard-coded contact values in blog runtime UI (business.json is truth)
 * - NO mass article generation (content matrix rows stay PLANNED)
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const HUBS = ['app', 'thue-xe', 'xe-dien', 'huong-dan', 'an-toan', 'dia-phuong'];

// ---------- Theme (Light / Dark / Auto) ----------

test('resolveTheme: explicit choices win; auto follows system preference', async () => {
  const { resolveTheme } = await import(join(ROOT, 'assets/js/theme.js'));
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('auto', true), 'dark');
  assert.equal(resolveTheme('auto', false), 'light');
  assert.equal(resolveTheme('garbage', false), 'light'); // unknown -> auto -> light
});

test('readPreference: invalid or missing values fall back to auto', async () => {
  const { readPreference } = await import(join(ROOT, 'assets/js/theme.js'));
  const storage = {
    store: { 'motoai-theme': 'dark' },
    getItem(k) { return this.store[k] ?? null; }
  };
  assert.equal(readPreference(storage), 'dark');
  assert.equal(readPreference({ getItem: () => 'neon-pink' }), 'auto');
  assert.equal(readPreference({ getItem: () => null }), 'auto');
  assert.equal(readPreference(null), 'auto'); // storage unavailable
});

test('applyTheme: sets/removes the shared data-motoai-theme attribute', async () => {
  const { applyTheme } = await import(join(ROOT, 'assets/js/theme.js'));
  const attrs = new Map();
  const doc = { documentElement: {
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: (k) => attrs.delete(k)
  } };
  applyTheme('dark', doc, false);
  assert.equal(attrs.get('data-motoai-theme'), 'dark');
  applyTheme('light', doc, true);
  assert.equal(attrs.get('data-motoai-theme'), undefined);
  applyTheme('auto', doc, true);
  assert.equal(attrs.get('data-motoai-theme'), 'dark');
});

// ---------- Business open/closed status (verified hours, business timezone) ----------

const HOURS = JSON.parse(read('data/business/business.json')).hours;

test('business hours are verified data with the Vietnam timezone', () => {
  assert.equal(HOURS.timeZone, 'Asia/Ho_Chi_Minh');
  assert.match(HOURS.open, /^\d{2}:\d{2}$/);
  assert.match(HOURS.close, /^\d{2}:\d{2}$/);
});

test('computeStatus: ICT boundaries (no DST, UTC+7)', async () => {
  const { computeStatus } = await import(join(ROOT, 'assets/js/business-status.js'));
  // 02:00Z == 09:00 ICT -> exactly at open
  assert.equal(computeStatus({ now: new Date('2026-09-26T02:00:00Z'), hours: HOURS }).open, true);
  // 01:59Z == 08:59 ICT -> before opening
  assert.equal(computeStatus({ now: new Date('2026-09-26T01:59:00Z'), hours: HOURS }).open, false);
  // 13:59Z == 20:59 ICT -> still open
  assert.equal(computeStatus({ now: new Date('2026-09-26T13:59:00Z'), hours: HOURS }).open, true);
  // 14:00Z == 21:00 ICT -> exactly at close -> closed
  assert.equal(computeStatus({ now: new Date('2026-09-26T14:00:00Z'), hours: HOURS }).open, false);
});

test('computeStatus: midnight-wrap window (close <= open) and invalid data', async () => {
  const { computeStatus } = await import(join(ROOT, 'assets/js/business-status.js'));
  const wrap = { open: '21:00', close: '02:00', display: '21:00–02:00', timeZone: 'Asia/Ho_Chi_Minh' };
  // 16:00Z == 23:00 ICT -> inside the wrap window
  assert.equal(computeStatus({ now: new Date('2026-09-26T16:00:00Z'), hours: wrap }).open, true);
  // 20:00Z == 03:00 ICT -> after wrap close, before next open
  assert.equal(computeStatus({ now: new Date('2026-09-26T20:00:00Z'), hours: wrap }).open, false);
  // Missing / malformed hours -> null so the UI hides the chip (never guesses)
  assert.equal(computeStatus({ now: new Date(), hours: null }), null);
  assert.equal(computeStatus({ now: new Date(), hours: { open: '9', close: '21:00', timeZone: 'Asia/Ho_Chi_Minh' } }), null);
  assert.equal(computeStatus({ now: new Date(), hours: { open: '09:00', close: '21:00', timeZone: 'Not/AZone' } }), null);
});

test('renderStatus: open/closed copy and hidden fallback', async () => {
  const { renderStatus } = await import(join(ROOT, 'assets/js/business-status.js'));
  const el = { dataset: {} };
  renderStatus(el, null);
  assert.equal(el.hidden, true);
  renderStatus(el, { open: true, opensAt: '09:00', closesAt: '21:00', display: '09:00 - 21:00' });
  assert.equal(el.hidden, false);
  assert.equal(el.dataset.state, 'open');
  assert.ok(el.textContent.includes('Đang mở'));
  renderStatus(el, { open: false, opensAt: '09:00', closesAt: '21:00', display: '09:00 - 21:00' });
  assert.equal(el.dataset.state, 'closed');
  assert.ok(el.textContent.includes('Đã đóng'));
  assert.ok(el.textContent.includes('09:00'));
});

// ---------- Blog shell contract (home + 6 hubs + articles) ----------

function blogPages() {
  const pages = ['blog/index.html', ...HUBS.map((h) => `blog/${h}/index.html`)];
  const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  pages.push(...walk('blog/app').filter((p) => p.endsWith('index.html') && p !== 'blog/app/index.html'));
  pages.push(...walk('blog/huong-dan').filter((p) => p.endsWith('index.html') && p !== 'blog/huong-dan/index.html'));
  return pages;
}

test('v57 single app shell: every content screen keeps the MotoAI chrome', () => {
  for (const page of [...blogPages(), 'privacy/index.html', 'terms/index.html']) {
    const html = read(page);
    // ONE permanent app shell: top chrome + main viewport + bottom dock + drawer.
    assert.match(html, /class="motoai-app motoai-screen"/, `${page}: renders inside the app shell`);
    assert.ok(html.includes('Hỗ trợ Agent'), `${page}: Agent identity in the top chrome`);
    assert.ok(html.includes('id="motoai-menu-btn"'), `${page}: Menu button`);
    assert.ok(html.includes('id="blog-theme-toggle"'), `${page}: theme control`);
    assert.ok((html.match(/<nav class="motoai-dock"/g) ?? []).length === 1, `${page}: bottom dock`);
    assert.ok(html.includes('id="motoai-drawer"'), `${page}: shared menu drawer`);
    assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${page}: exactly one H1`);
    assert.ok(html.includes('<link rel="canonical"'), `${page}: canonical`);
    assert.match(html, /motoai-theme/, `${page}: no-flash theme script`);
    assert.ok(html.includes('app-shell.js'), `${page}: app shell runtime`);
    // Legacy standalone blog chrome must be gone.
    for (const legacy of ['class="blog-back"', 'class="blog-header"', 'class="blog-hero"', 'class="blog-cta"', 'class="blog-contact"', 'id="motoai-menu-zalo"']) {
      assert.ok(!html.includes(legacy), `${page}: legacy chrome "${legacy}" removed`);
    }
    // Ask Agent is a native action that returns to the HOME chat screen.
    assert.ok(html.includes('/aichatbot/?ask='), `${page}: Ask Agent action`);
  }
});

test('hub screens mark their own category with aria-current and keep a breadcrumb', () => {
  for (const hub of HUBS) {
    const html = read(`blog/${hub}/index.html`);
    const links = [...html.matchAll(/href="\/aichatbot\/blog\/([a-z-]+)\/"[^>]*aria-current="page"/g)].map((m) => m[1]);
    assert.ok(links.includes(hub), `${hub}: active category marked`);
    assert.ok(html.includes('blog-breadcrumb'), `${hub}: breadcrumb present`);
    // Category chips live INSIDE the screen body, not as a second top nav.
    assert.match(html, /<div class="blog-chips" aria-label="Danh mục">/);
  }
});

test('category chips are one non-wrapping horizontal row on mobile (CSS contract)', () => {
  const css = read('assets/css/blog.css');
  assert.match(css, /\.blog-chips\s*\{[^}]*flex-wrap:\s*nowrap/);
  assert.match(css, /\.blog-chips\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.blog-chip\s*\{[^}]*flex:\s*0 0 auto/);
});

test('business status line exists on every screen and starts hidden (never guesses)', () => {
  for (const page of [...blogPages(), 'privacy/index.html', 'terms/index.html']) {
    const html = read(page);
    assert.ok(html.includes('id="blog-business-status"'), `${page}: status element`);
    assert.match(html, /id="blog-business-status"[^>]*hidden/, `${page}: hidden until data loads`);
  }
});

test('no unrendered template placeholders anywhere in blog HTML', () => {
  const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  for (const p of walk('blog').filter((p) => p.endsWith('.html'))) {
    assert.ok(!read(p).includes('{{'), `${p}: no template placeholders`);
  }
});

test('articles resolve contact CTA hrefs at runtime — no hard-coded contact values', () => {
  const business = JSON.parse(read('data/business/business.json'));
  const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  for (const p of walk('blog').filter((p) => p.endsWith('.html'))) {
    const html = read(p);
    // No hard-coded verified contact values in the runtime UI shell.
    assert.ok(!/zalo/i.test(html), `${p}: no Zalo anywhere in the public UI`);
    assert.ok(!html.includes(business.contact.whatsapp), `${p}: WhatsApp URL must come from business.json`);
    assert.ok(!html.includes(business.contact.maps), `${p}: Maps URL must come from business.json`);
    assert.ok(!html.includes(business.contact.phone_uri), `${p}: phone URI must come from business.json`);
    assert.ok(!/href="tel:\+/.test(html), `${p}: no tel: href`);
    assert.ok(!/href="https:\/\/(zalo\.me|wa\.me|maps\.app\.goo\.gl)/.test(html), `${p}: no hard-coded contact hrefs`);
  }
});

test('contact mechanism: data-contact-ref anchors cover whatsapp, call and map (no Zalo)', () => {
  const refs = new Set();
  const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  for (const p of [...walk('blog'), 'privacy', 'terms'].filter((p) => p.endsWith('.html'))) {
    for (const m of read(p).matchAll(/data-contact-ref="([a-z]+)"/g)) refs.add(m[1]);
  }
  for (const ref of ['whatsapp', 'call', 'map']) {
    assert.ok(refs.has(ref), `contact ref "${ref}" used somewhere in the app UI`);
  }
  assert.ok(!refs.has('zalo'), 'Zalo is not a contact ref anymore');
  const app = read('assets/js/app-shell.js');
  assert.ok(app.includes("phone_uri"), 'call ref maps to verified phone_uri');
  assert.ok(app.includes('noopener noreferrer'), 'external links are safe');
});

test('theme styles: shared data-motoai-theme tokens + focus-visible + touch targets', () => {
  const css = read('assets/css/blog.css');
  assert.ok(css.includes('data-motoai-theme="dark"]') || /html\[data-motoai-theme="dark"\]/.test(read('assets/css/style.css')), 'dark theme reuses shared tokens');
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.blog-theme-toggle\s*\{[^}]*min-height:\s*4\dpx/);
  assert.match(css, /\.screen-ask-btn\s*\{[^}]*min-height:\s*4\dpx/);
});

// ---------- Content factory safety ----------

test('NO mass article generation: content matrix stays 2,000 rows, all PLANNED', () => {
  const lines = read('data/blog/content-matrix.csv').trim().split('\n');
  assert.equal(lines.length - 1, 2000);
  const statuses = lines.slice(1).map((l) => l.split(',')[3]);
  const published = statuses.filter((s) => s === 'PUBLISHED').length;
  assert.equal(published, 2, 'only the two pilot articles are published');
});
