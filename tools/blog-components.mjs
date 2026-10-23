/**
 * Shared presentation components for every generated content page.
 * One edit here (or in config/blog-ui.json) updates all pages on the next
 * build — articles never carry their own chrome, CTA, schema or icons.
 * No browser runtime dependency; pure string builders + config validation.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BLOG_UI = Object.freeze(JSON.parse(readFileSync(join(ROOT, 'config/blog-ui.json'), 'utf8')));

const CATEGORY_IDS = ['APP', 'RENT', 'EV', 'GUIDE', 'SAFE', 'LOCAL'];
const CONTACT_REFS = ['call', 'whatsapp', 'map'];
const SLOT_NAMES = ['article.afterSummary', 'article.afterBody', 'page.beforeContactBand'];
const SLOT_TYPES = ['notice', 'price-glance'];
const isInternal = (href) => /^\/(?!\/)/.test(href || '');

if (!BLOG_UI.summary?.title || !BLOG_UI.related?.title || !BLOG_UI.cta?.articleLabel || !BLOG_UI.cta?.footerLabel) {
  throw new Error('blog-ui: component labels must be present');
}
if (!BLOG_UI.family?.title || !BLOG_UI.family?.pillarLabel || !BLOG_UI.pillars?.title) {
  throw new Error('blog-ui: family/pillar section labels must be present');
}
if (!Number.isInteger(BLOG_UI.related.limit) || BLOG_UI.related.limit < 1 || BLOG_UI.related.limit > 8) {
  throw new Error('blog-ui: related.limit must be from 1 to 8');
}
if (BLOG_UI.banner.enabled && (!BLOG_UI.banner.text || !isInternal(BLOG_UI.banner.href))) {
  throw new Error('blog-ui: enabled banner requires text and safe internal href');
}
if (!BLOG_UI.site?.name || !BLOG_UI.site?.shortName || !BLOG_UI.site?.tagline || !BLOG_UI.site?.ogImage?.path) {
  throw new Error('blog-ui: site identity (name, shortName, tagline, ogImage) must be present');
}
for (const mode of ['light', 'dark']) {
  if (!/^#[0-9a-f]{6}$/i.test(BLOG_UI.site.themeColor?.[mode] ?? '')) throw new Error(`blog-ui: site.themeColor.${mode} must be #rrggbb`);
}
for (const [key, value] of Object.entries(BLOG_UI.features ?? {})) {
  if (typeof value !== 'boolean') throw new Error(`blog-ui: features.${key} must be true/false`);
}
for (const [cat, action] of Object.entries({ ...BLOG_UI.cta.byCategory, default: BLOG_UI.cta.default })) {
  if (cat !== 'default' && !CATEGORY_IDS.includes(cat)) throw new Error(`blog-ui: cta.byCategory.${cat} is not a category id`);
  if (!action?.label) throw new Error(`blog-ui: cta action ${cat} needs a label`);
  if (Boolean(action.href) === Boolean(action.contactRef)) throw new Error(`blog-ui: cta action ${cat} needs exactly one of href / contactRef`);
  if (action.href && !isInternal(action.href)) throw new Error(`blog-ui: cta action ${cat} href must be internal`);
  if (action.contactRef && !CONTACT_REFS.includes(action.contactRef)) throw new Error(`blog-ui: cta action ${cat} contactRef must be ${CONTACT_REFS.join('/')}`);
}
for (const [name, items] of Object.entries(BLOG_UI.slots ?? {})) {
  if (!SLOT_NAMES.includes(name)) throw new Error(`blog-ui: unknown slot ${name}`);
  for (const item of items) {
    if (!SLOT_TYPES.includes(item.type)) throw new Error(`blog-ui: slot ${name} has unknown component type ${item.type}`);
    if (item.type === 'notice' && (!item.text || !isInternal(item.href))) throw new Error(`blog-ui: notice in ${name} needs text + internal href`);
    for (const c of item.categories ?? []) if (!CATEGORY_IDS.includes(c)) throw new Error(`blog-ui: slot ${name} category ${c} is unknown`);
  }
}

/** Feature flag lookup: a missing flag means ON (defaults never hide UI). */
export const feature = (name) => BLOG_UI.features?.[name] !== false;

/** Escape for HTML text AND double-quoted attribute contexts. v70: also
 *  escapes `"` — manifest descriptions quote questions and an unescaped
 *  quote silently broke <meta name="description" content="…">. */
export const esc = (s) => String(s)
  .replace(/&(?![a-z]+;|#)/gi, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/** Resolve {{ business.x.y }} / {{ business.x.y | vnd }} placeholders from
 *  verified data/business/business.json. {{ business.array | list }} joins
 *  arrays with ", ". Unknown paths throw — copy can never go stale. */
export function resolveFacts(html, business) {
  return html.replace(/\{\{\s*business\.([a-z0-9_.]+)(?:\s*\|\s*(\w+))?\s*\}\}/gi, (_, path, filter) => {
    const value = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), business);
    if (value === undefined) throw new Error(`unresolved business fact: business.${path}`);
    if (filter === 'list' && Array.isArray(value)) return value.join(', ');
    return typeof value === 'number' ? value.toLocaleString('vi-VN') + 'đ' : String(value);
  });
}

/** Inline SVG icon set — one place for every glyph the shell draws.
 *  Stroke icons inherit currentColor; all are decorative (aria-hidden). */
const ICON_PATHS = {
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  phone: '<path d="M6.6 3.5h3l1.5 4.2-2.2 1.4a11 11 0 0 0 6 6l1.4-2.2 4.2 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  caret: '<path d="m7 10 5 5 5-5"/>',
  doc: '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M10 12.5h5M10 16h5"/>'
};
export function icon(name, cls = 'i') {
  const paths = ICON_PATHS[name];
  if (!paths) throw new Error(`unknown icon ${name}`);
  return `<svg class="${cls} i-${name}" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">${paths}</svg>`;
}

/** Brand mark: a road in perspective on an ink tile — the same motif as
 *  the dashed lane rules that separate sections across the site. */
export function brandMark() {
  return '<svg class="brand-mark" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false">'
    + '<rect class="brand-mark-tile" width="32" height="32" rx="9"/>'
    + '<path class="brand-mark-road" d="M7.5 26.5 14 5.5M24.5 26.5 18 5.5"/>'
    + '<path class="brand-mark-lane" d="M16 25.5v-3.6M16 18.6v-2.8M16 12.9V11"/>'
    + '</svg>';
}

/** Optional site banner slot: enabled from config, internal link only. */
export function bannerSlot(escape = esc) {
  if (!BLOG_UI.banner.enabled) return '';
  return '    <aside class="blog-global-banner" aria-label="Thông báo">\n' +
    '      <a href="' + escape(BLOG_UI.banner.href) + '">' + escape(BLOG_UI.banner.text) + '</a>\n' +
    '    </aside>\n';
}

/** Contextual secondary action for a category (config cta.byCategory). */
export function categoryAction(category) {
  return BLOG_UI.cta.byCategory?.[category] ?? BLOG_UI.cta.default;
}

/** Contact refs are resolved at runtime from verified business.json by
 *  assets/js/app-shell.js; without JS they fall back to the contact page. */
function actionLink(action, cls) {
  if (action.contactRef) {
    const glyph = action.contactRef === 'call' ? icon('phone') : icon('pin');
    return `<a class="${cls}" data-contact-ref="${esc(action.contactRef)}" href="/lien-he/">${glyph}<span>${esc(action.label)}</span></a>`;
  }
  return `<a class="${cls}" href="${esc(action.href)}">${icon('doc')}<span>${esc(action.label)}</span></a>`;
}

/**
 * Page-ending contact band (replaces the slim Ask-Agent row): ONE Ask Agent
 * action back to the chat home (/?ask=topic), the verified call action and
 * one contextual action chosen by category from config. Business facts in
 * the copy come from business.json via resolveFacts.
 */
export function contactBand({ topic, category = null, business }) {
  const ask = `<a class="screen-ask-btn" href="/?ask=${encodeURIComponent(topic)}">${esc(BLOG_UI.cta.articleLabel)}</a>`;
  if (!feature('contactBand')) {
    return `    <div class="screen-ask">
      ${ask}
    </div>
`;
  }
  const band = BLOG_UI.cta.band;
  const call = { label: resolveFacts(band.callLabel, business), contactRef: 'call' };
  const context = categoryAction(category);
  return `    <section class="contact-band screen-ask" aria-label="Hỗ trợ">
      <div class="contact-band-copy">
        <p class="contact-band-title">${esc(band.title)}</p>
        <p class="contact-band-text">${esc(resolveFacts(band.text, business))}</p>
      </div>
      <div class="contact-band-actions">
        ${ask}
        ${actionLink(call, 'band-action')}
        ${actionLink(context, 'band-action')}
      </div>
    </section>
`;
}

const vnd = (n) => `${n.toLocaleString('vi-VN')}đ`;

/** Config slots: page regions any component can be plugged into without
 *  touching a template. Empty slots render nothing (byte-stable output). */
export function renderSlot(name, { category = null, pricing = null } = {}, configured = BLOG_UI.slots?.[name] ?? []) {
  const items = configured.filter((it) => !it.categories || it.categories.includes(category));
  return items.map((it) => {
    if (it.type === 'notice') {
      return `      <aside class="slot-notice" data-slot="${esc(name)}"><a href="${esc(it.href)}">${esc(it.text)}</a></aside>\n`;
    }
    // price-glance: the lowest VERIFIED day rate per vehicle class from
    // data/business/pricing.json — never a guessed number.
    const rows = (pricing?.vehicles ?? []).filter((v) => v.rates?.day?.min != null);
    if (!rows.length) return '';
    const from = Math.min(...rows.map((v) => v.rates.day.min));
    return `      <aside class="slot-price" data-slot="${esc(name)}">
        <p class="slot-price-figure"><span>Giá tham khảo từ</span> <strong>${vnd(from)}</strong><span>/ngày</span></p>
        <p class="slot-price-note">${esc(pricing.disclaimer)}</p>
        <a href="/gia-thue/">Xem bảng giá ${icon('arrow')}</a>
      </aside>
`;
  }).join('');
}
