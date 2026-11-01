#!/usr/bin/env node
/**
 * Build the blog + legal screens from PUBLISHED article manifests
 * (data/blog/published.json).
 *
 * v57 SINGLE APP SHELL: every generated screen (blog home, category hub,
 * subtopic hub, article, paginated hub pages, privacy, terms) is rendered
 * by tools/app-shell.mjs — the SAME permanent MotoAI shell as the chat
 * homepage (top chrome + main viewport + bottom dock + drawer). Only the
 * CENTER CONTENT changes; no page gets its own blog-style website chrome.
 *
 * Also produces (unchanged contracts):
 *   - blog/search-index.json with cluster/subtopic/location fields
 *   - data/blog/knowledge-index.json (Agent retrieval chunks)
 *   - sitemap.xml + robots.txt
 *   - matrix row sync for published articles
 *
 * Business facts inside article bodies use {{ business.* }} placeholders,
 * resolved from data/business/business.json — articles can never go stale
 * relative to the verified source of truth.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeInternalAnchors } from './site-audit.mjs';
import { BLOG_UI, PRICING, emptyNote, feature, icon, renderSlot, resolveFacts, t } from './blog-components.mjs';
import {
  taxonomy, navigation, CLUSTER_BY_ID, viSlug, deriveSubtopic, clusterNav, categoryNav, blogHome, setMenuSubtopicUrls, drawerCore
} from './taxonomy.mjs';
import {
  SITE, esc, rel, pageHead, askAgentAction, appShellPage, AGENT_URL
} from './app-shell.mjs';
import { loadSeoMeta, assertSeoMeta, applySeoMeta } from './seo-meta.mjs';
import { buildCss, syncChatTokens, syncEmbedTokens } from './css-build.mjs';
import { buildAgent } from './agent-page.mjs';
import { BLOG_HOME, SITE_HOME, SITE_PAGES } from './site-pages.mjs';
import { planLinks } from './seo-links.mjs';
import { loadRegistry, featuredImage } from './article-images.mjs';

export { resolveFacts };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const write = (p, s) => { mkdirSync(dirname(join(ROOT, p)), { recursive: true }); writeFileSync(join(ROOT, p), s, 'utf8'); };

export const PER_PAGE = 24;

/** Blog home "Bài mới" cap (v69.1 lazy-home contract): the home screen must
 *  never render the whole corpus — it holds hub sections + the newest
 *  articles + lazy search (tests/unit/blog-foundation.test.js asserts
 *  < 60 cards). Older articles stay reachable via hub pagination, subtopic
 *  hubs and sitemap.xml. */
export const HOME_LATEST_CARDS = 24;
/** Newest-first slice of a manifest-sorted (oldest-first) list. */
export const newestFirst = (articles, n) => articles.slice(-n).reverse();

/** Canonical category order (IDs never change). */
export const HUBS = Object.freeze(['APP', 'RENT', 'EV', 'GUIDE', 'SAFE', 'LOCAL'].map((id) => ({
  id,
  dir: taxonomy.categories[id].dir,
  name: taxonomy.categories[id].name,          // full H1 / title name
  label: taxonomy.categories[id].label,        // short nav label
  cluster: taxonomy.categories[id].cluster,
  desc: taxonomy.categories[id].desc,
  intro: taxonomy.categories[id].intro,
  meta: taxonomy.categories[id].meta,
  seoTitle: taxonomy.categories[id].seo_title
})));
const HUB_BY_ID = Object.fromEntries(HUBS.map((h) => [h.id, h]));

/** v71: internal links point at the canonical directory URL, never at its
 *  /index.html twin — Google had indexed both forms (zero-data SERP study,
 *  docs/seo/cold-start/visibility-baseline.md). Bodies stay untouched. */
export function canonicalIndexLinks(html) {
  return html.replace(/(<a\b[^>]*?\shref\s*=\s*)(["'])(\/[^"'?#]*?\/)index\.html\2/gi, '$1$2$3$2');
}

/** v76: the chat app moved to /agent/. A body link to "/" whose anchor names
 *  the assistant or the app ("trợ lý MotoAI", "Agent", "ứng dụng web") opens
 *  the Agent; "trang chủ" links keep pointing at the site homepage. Render-time
 *  only — article bodies are never rewritten. */
const AGENT_ANCHOR = /trợ lý|\bagent\b|chatbot|^\s*motoai\s*$|^\s*ứng dụng/i;
export function agentLinks(html) {
  return html.replace(/<a\b([^>]*?)\shref=(["'])\/\2([^>]*)>([\s\S]*?)<\/a>/gi, (m, pre, q, post, text) =>
    (AGENT_ANCHOR.test(text.replace(/<[^>]+>/g, '')) ? `<a${pre} href=${q}${AGENT_URL}${q}${post}>${text}</a>` : m));
}

/** Deterministic reading time: visible words / 200 per minute, min 1. */
export function readingTime(bodyHtml) {
  const words = bodyHtml.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/** One JSON-LD <script> block — every schema on every page goes through here. */
const ldScript = (obj) => `  <script type="application/ld+json">
${jsonLd(obj)}
  </script>
`;
/** The site entity every CollectionPage/WebPage belongs to (config site.name). */
const websiteRef = () => ({ '@type': 'WebSite', name: BLOG_UI.site.name, url: SITE });
/** BreadcrumbList from [{ name, item }] entries (absolute URLs). */
const breadcrumbLd = (entries) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: entries.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: b.item }))
});

/** v80 image registry (data/seo/article-images.json): only QA_PASSED+
 *  entries render. Loaded once per build. */
const IMAGES = loadRegistry(ROOT);

/** Featured image figure — explicit width/height (no layout shift), eager
 *  + high fetch priority (it is the article's LCP candidate), honest caption. */
export function heroFigure(img) {
  return `      <figure class="article-hero">
        <img src="${esc(img.src)}" width="${img.width}" height="${img.height}" alt="${esc(img.alt)}" fetchpriority="high" decoding="async"${img.srcset ? ` srcset="${esc(img.srcset)}" sizes="${esc(img.sizes)}"` : ''}>
${img.caption ? `        <figcaption>${esc(img.caption)}</figcaption>
` : ''}      </figure>
`;
}

/** Reading minutes per article id, filled once per build (cards + byline
 *  share the same number). */
const MINUTES = new Map();

/** Article card (used by every list screen). `level` is the card heading
 *  level: 2 on list screens, 3 inside an article section so card titles
 *  never compete with the article's own H2 outline. Meta row = real
 *  publish date + reading time; `lead` marks the featured story. */
function card(a, hub, level = 2, { lead = false } = {}) {
  return cardHtml({
    href: `/blog/${hub.dir}/${a.slug}/`, cat: hub.label, title: a.title, desc: a.description,
    date: a.published_date, minutes: MINUTES.get(a.article_id)
  }, level, lead);
}
/** The card markup itself — also emitted as <template id="blog-card-tpl">
 *  on the blog home, so client-side search results are the SAME component. */
function cardHtml({ href, cat, title, desc, date, minutes }, level = 2, lead = false) {
  return `      <a class="blog-card${lead ? ' card-lead' : ''}" href="${href}">
        <span class="cat">${esc(cat)}</span>
        <h${level}>${esc(title)}</h${level}>
        <p>${esc(desc)}</p>
        <span class="blog-card-meta"><time datetime="${date}">${date}</time>${minutes != null ? ` · ${esc(t('readingTime', { n: minutes }))}` : ''}${icon('arrow', 'i card-arrow')}</span>
      </a>`;
}

/** Compact screen head: small label + H1 + lead — never a giant hero. */
function screenHead({ label, title, lead }) {
  return `${label ? `      <p class="blog-screen-label">${esc(label)}</p>\n` : ''}      <h1 class="blog-screen-title">${esc(title)}</h1>
      ${lead ? `<p class="blog-screen-lead">${esc(lead)}</p>` : ''}
`;
}

/** Compact breadcrumb (inside the screen, not another site's chrome). */
function breadcrumb(trail) {
  const items = trail.map((c, i) =>
    i === trail.length - 1
      ? `<span>${esc(c.label)}</span>`
      : `<a href="${c.href}">${esc(c.label)}</a>`)
    .join(' › ');
  return `      <nav class="blog-breadcrumb" aria-label="Đường dẫn">${items}</nav>
`;
}

/** Category chips row (inside the screen, under the title). */
function categoryChips({ activeHub }) {
  const items = navigation.categories.map((c) => {
    const { dir, label } = categoryNav(c.id);
    return `        <a class="blog-chip" href="/blog/${dir}/"${dir === activeHub ? ' aria-current="page"' : ''}>${esc(label)}</a>`;
  }).join('\n');
  return `      <div class="blog-chips" aria-label="Danh mục">
${items}
      </div>
`;
}

// Breadcrumb roots come from the navigation source (same labels/URLs as the
// header, drawer and footer): Trang Chủ, then the "Cẩm nang" blog home.
const CRUMB_HOME = { label: navigation.home.label, href: navigation.home.url };
const CRUMB_BLOG = { label: blogHome().label, href: blogHome().url };
/** Absolute schema URL of a root-relative site link (visible trail == JSON-LD). */
const ldUrl = (href) => SITE + href.replace(/^\//, '');
/** Cluster crumb entry (v61: blog home → PARENT HUB → category → article). */
const crumbCluster = (cluster) => ({ label: cluster.name, href: `/blog/${cluster.dir}/` });
/** Visible + JSON-LD breadcrumb trail for any cluster/category/subtopic/article page. */
function clusterTrail(cluster, extra = []) {
  return [CRUMB_HOME, CRUMB_BLOG, crumbCluster(cluster), ...extra];
}
/** Schema trail entries (absolute item URLs) matching clusterTrail exactly. */
function clusterTrailSchema(cluster, extra = []) {
  const entries = [
    { name: CRUMB_HOME.label, item: ldUrl(CRUMB_HOME.href) },
    { name: CRUMB_BLOG.label, item: ldUrl(CRUMB_BLOG.href) },
    { name: cluster.name, item: `${SITE}blog/${cluster.dir}/` }
  ];
  for (const e of extra) entries.push({ name: e.label, item: e.href ? `${SITE}${e.href.replace('/', '')}` : `${SITE}${e.itemPath}` });
  return entries;
}
/** Hub parent block: prominent link UP to the parent SEO hub (v61 §8). */
function hubParentBlock(cluster) {
  return `      <p class="blog-hub-parent">${esc(t('hubParent'))} <a href="/blog/${cluster.dir}/">${esc(cluster.name)}</a></p>\n`;
}
/** Bottom contextual block: explore the whole parent cluster (v61 §8). */
function hubClusterFooter(cluster) {
  const links = cluster.categories.map((id) => {
    const c = taxonomy.categories[id];
    return `<a href="/blog/${c.dir}/">${esc(c.label)}</a>`;
  }).join(' · ');
  return `      <p class="blog-hub-cluster">${esc(t('clusterExplore', { name: cluster.name }))} ${links}</p>\n`;
}

/** Two-digit index numeral ("01") — the editorial wayfinding mark used by
 *  the route board, hub stages, category index and dropdowns. */
const idx = (i) => String(i + 1).padStart(2, '0');
/** Vietnamese thousands grouping for visible counts ("2.006"). */
const count = (n) => n.toLocaleString('vi-VN');

/** Blog home (hub-first): hero (H1, lead, verified facts, route board to
 *  the 3 parent hubs) → search → 3 PARENT HUB stages → Bài mới → the six
 *  child categories → contact band. Users and crawlers see the topical
 *  architecture before any single article. */
function buildHome(published, business) {
  const catCount = (id) => published.filter((a) => a.category === id).length;
  const clusterCount = (c) => published.filter((a) => c.categories.includes(a.category)).length;

  const bai = (n) => esc(t('articleCount', { n: count(n) }));

  // Route board: the three parent hubs as destinations with real counts.
  const routes = taxonomy.clusters.map((c, i) => `          <li><a href="/blog/${c.dir}/"><span class="route-idx">${idx(i)}</span><span class="route-name">${esc(c.name)}</span><span class="route-count">${bai(clusterCount(c))}</span>${icon('arrow', 'i route-arrow')}</a></li>`).join('\n');

  // Verified facts only: counts come from the manifest, hours/address from
  // data/business/business.json.
  const facts = [
    [count(published.length), t('factPublished')],
    [String(navigation.categories.length), t('factCategories')],
    [business.hours.display.replace(' - ', '–'), t('factHours')],
    [business.address.district, business.address.street]
  ].map(([v, l]) => `          <li><strong>${esc(v)}</strong><span>${esc(l)}</span></li>`).join('\n');

  // SUPER HUB stages: semantic <section> with a LINKED H2 (crawlable
  // parent), short description, child-hub pills with counts, the 4 latest
  // articles of the parent (a swipe rail on phones) and a CTA to the hub.
  const hubSections = taxonomy.clusters.map((c, i) => {
    const hub = clusterNav(c.id);
    const pills = hub.children.map((ch) =>
      `            <a class="blog-cluster-link" href="/blog/${ch.dir}/">${esc(ch.label)} <span class="pill-count">${count(catCount(ch.id))}</span></a>`).join('\n');
    const latest = newestFirst(published.filter((a) => c.categories.includes(a.category)), 4);
    const latestCards = latest.map((a) => card(a, HUB_BY_ID[a.category])).join('\n');
    return `      <section class="blog-hub-section" aria-label="${esc(c.name)}">
        <div class="hub-stage-head">
          <p class="hub-stage-idx" aria-hidden="true">${idx(i)}</p>
          <h2><a href="/blog/${c.dir}/">${esc(c.name)}</a></h2>
          <p>${esc(c.desc)}</p>
          <div class="blog-cluster-links">
${pills}
          </div>
          <a class="blog-cluster-more" href="/blog/${c.dir}/">${esc(t('hubAll', { name: c.name }))}</a>
        </div>
${latestCards ? `        <div class="blog-grid blog-rail">
${latestCards}
        </div>
` : ''}      </section>`;
  }).join('\n');

  const categoryCards = navigation.categories.map((c, i) => {
    const navItem = categoryNav(c.id);
    const cat = taxonomy.categories[c.id];
    return `      <a class="blog-cat-card" href="/blog/${cat.dir}/">
        <span class="cat-icon" aria-hidden="true">${idx(i)}</span>
        <strong>${esc(navItem.label)}</strong>
        <span class="cat-count">${bai(catCount(navItem.id))}</span>
        <span>${esc(cat.desc)}</span>
      </a>`;
  }).join('\n');

  // v69.1: cap + newest-first (the section is labelled "Bài mới"); the whole
  // corpus stays discoverable through hub pagination and lazy search.
  const cards = newestFirst(published, HOME_LATEST_CARDS).map((a, i) => card(a, HUB_BY_ID[a.category], 2, { lead: i === 0 })).join('\n');
  // Client search renders results from this template (same card component);
  // its copy (count, empty, error) travels as data attributes from labels.
  const cardTemplate = cardHtml({ href: '#', cat: '', title: '', desc: '', date: '', minutes: 0 }, 3).trim();

  const content = breadcrumb([CRUMB_HOME, { label: CRUMB_BLOG.label, href: null }])
    + `      <section class="home-hero" aria-label="Cẩm nang thuê xe máy">
        <div class="home-hero-copy">
${screenHead({ label: BLOG_UI.site.kicker, title: BLOG_HOME.h1, lead: BLOG_HOME.lead })}          <ul class="home-facts" aria-label="Thông tin nhanh">
${facts}
          </ul>
        </div>
        <nav class="route-board" aria-label="Ba nhóm chủ đề">
          <p class="route-board-title">${esc(t('routeTitle'))}</p>
          <ol>
${routes}
          </ol>
        </nav>
      </section>
      <section class="search-band" aria-label="Tìm bài viết">
        <div class="blog-search" id="blog-search">
          ${icon('search', 'i search-glyph')}
          <input id="blog-search-input" type="search" placeholder="${esc(t('searchPlaceholder'))}" aria-label="Tìm bài viết">
          <select id="blog-search-filter" aria-label="Lọc theo danh mục">
            <option value="">Tất cả danh mục</option>
          </select>
          <button id="blog-search-btn" type="button" onclick="document.getElementById('blog-search-input').dispatchEvent(new Event('input'))">Tìm</button>
          <button id="blog-search-clear" type="button" aria-label="Xóa tìm kiếm" hidden>✕</button>
        </div>
        <p class="blog-search-note">${esc(t('searchNote'))} <span id="blog-search-count" hidden></span></p>
        <div class="blog-grid" id="blog-search-results" data-count="${esc(t('searchCount'))}" data-empty="${esc(t('searchEmpty'))}" data-error="${esc(t('searchError'))}"></div>
        <template id="blog-card-tpl">${cardTemplate}</template>
      </section>
      <section class="blog-hubs" aria-label="${esc(t('hubsTitle'))}">
${hubSections}
      </section>
      <section class="home-latest">
        <div class="lane-head">
          <h2>${esc(t('latestTitle'))}</h2>
          <p>${esc(t('latestNote', { n: Math.min(HOME_LATEST_CARDS, published.length) }))}</p>
        </div>
        <div class="blog-grid">
${cards || `          ${emptyNote('emptyBlog')}`}
        </div>
      </section>
      <section class="home-index" aria-label="Danh mục">
        <div class="lane-head">
          <h2>${esc(t('indexTitle'))}</h2>
          <p>${esc(t('indexNote', { cats: navigation.categories.length, n: count(published.length) }))}</p>
        </div>
        <div class="blog-cat-grid">
${categoryCards}
        </div>
      </section>
${askAgentAction(BLOG_HOME.askTopic)}`;

  const html = appShellPage({
    title: BLOG_HOME.title,
    description: BLOG_HOME.description,
    path: 'blog/',
    screen: 'blog-index',
    activeHub: null,
    contentHtml: content,
    search: true,
    schemaHtml: ldScript({
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: BLOG_HOME.schemaName,
      description: BLOG_HOME.schemaDescription,
      url: `${SITE}blog/`,
      isPartOf: websiteRef(),
      mainEntity: {
        '@type': 'ItemList',
        name: t('hubsTitle'),
        itemListElement: taxonomy.clusters.map((c, i) => ({
          '@type': 'ListItem', position: i + 1, name: c.name, url: `${SITE}blog/${c.dir}/`
        }))
      }
    }) + ldScript(breadcrumbLd([{ name: CRUMB_HOME.label, item: ldUrl(CRUMB_HOME.href) }, { name: CRUMB_BLOG.label, item: ldUrl(CRUMB_BLOG.href) }]))
  });
  write('blog/index.html', html);
}

/** Search Console ownership (HTML-tag method): the tag lives in the Agent
 *  template (the pre-v76 homepage). Google periodically re-checks the tag on the
 *  site's home page, so `/` carries the very same tag — read from that one
 *  source, never typed twice. */
export const SEARCH_CONSOLE_META = (() => {
  const m = readFileSync(join(ROOT, 'data/site/agent.html.tpl'), 'utf8')
    .match(/<meta name="google-site-verification" content="[^"<>]+" \/>/);
  return m ? `  ${m[0]}\n` : '';
})();

/** Legacy chat links (/?ask= /?action= /?embed= /?source= /?lang=, the old
 *  embed iframe and installed PWAs) keep working: the homepage forwards them
 *  to the Agent app before first paint. Plain visits are never redirected. */
const LEGACY_CHAT_REDIRECT = `  <script>/* v76: the chat app moved to ${AGENT_URL} — forward legacy chat parameters */(function(){var q=location.search;if(/[?&](ask|action|embed|source|lang)=/.test(q))location.replace('${AGENT_URL}'+q+location.hash);})();</script>\n`;

/**
 * Site homepage `/` (v76 Apple V3): a real website front page in the shared
 * content shell — hero, services, Agent, guide taxonomy, featured pillars,
 * latest articles and verified shop info. Copy: config/site-pages.json
 * siteHome; facts: business.json; categories: taxonomy + live subtopics;
 * articles: the published manifest (pillars from the link plan, newest
 * first) — nothing is listed by hand, so new articles appear on every build.
 */
function buildSiteHome(published, business, links) {
  const H = SITE_HOME;
  const fact = (s) => resolveFacts(s, business);
  const hubs = (drawerCore().find((e) => e.kind === 'group' && e.id === 'cm')?.children ?? []).filter((x) => x.kind === 'hub');
  const topicCount = hubs.reduce((n, h) => n + h.children.filter((c) => c.level === 'subtopic').length, 0);
  const pageExists = (href) => existsSync(join(ROOT, href.replace(/^\//, ''), 'index.html'));
  const btn = (href, label, { primary = false, glyph = null, after = null, attrs = '' } = {}) =>
    `<a class="v3-btn${primary ? ' v3-btn-primary' : ''}" href="${href}"${attrs}>${glyph ? icon(glyph) : ''}<span>${esc(label)}</span>${after ? icon(after) : ''}</a>`;

  const facts = [
    [count(published.length), t('factPublished')],
    [String(navigation.categories.length), t('factCategories')],
    [business.hours.display.replace(' - ', '–'), t('factHours')],
    [business.address.district, business.address.street]
  ].map(([v, l]) => `          <li><strong>${esc(v)}</strong><span>${esc(l)}</span></li>`).join('\n');

  const services = H.services.items.map((s) => {
    if (!pageExists(s.href)) throw new Error(`siteHome service "${s.label}": ${s.href} has no page`);
    return `          <a class="v3-card v3-service" href="${s.href}">
            <span class="v3-icon" aria-hidden="true">${icon(s.icon)}</span>
            <strong>${esc(s.label)}</strong>
            <span>${esc(fact(s.desc))}</span>
          </a>`;
  }).join('\n');

  const can = H.agent.can.map((c) => `          <li>${icon('check')}<span>${esc(c)}</span></li>`).join('\n');

  const guide = taxonomy.clusters.map((c, i) => {
    const hub = hubs.find((h) => h.url === `/blog/${c.dir}/`);
    if (!hub) throw new Error(`siteHome: navigation missing hub ${c.id}`);
    const cats = hub.children.filter((ch) => ch.level === 'category').map((cat) => {
      const subs = hub.children.filter((ch) => ch.level === 'subtopic' && ch.url.startsWith(cat.url));
      const topics = subs.length
        ? `\n              <ul class="v3-topics">${subs.map((sub) => `<li><a href="${sub.url}">${esc(sub.label)}</a></li>`).join('')}</ul>`
        : '';
      return `            <li><a class="v3-cat" href="${cat.url}">${esc(cat.label)}</a>${topics}</li>`;
    }).join('\n');
    return `        <article class="v3-card v3-guide">
          <p class="hub-stage-idx" aria-hidden="true">${idx(i)}</p>
          <h3><a href="/blog/${c.dir}/">${esc(c.name)}</a></h3>
          <p>${esc(c.desc)}</p>
          <ul class="v3-cats">
${cats}
          </ul>
        </article>`;
  }).join('\n');

  // Featured: the pillar with the largest topic family in each category.
  const featuredList = HUBS.map((hub) => published
    .filter((a) => a.category === hub.id && links.get(a.article_id)?.pillar === a.article_id)
    .sort((x, y) => links.get(y.article_id).family.length - links.get(x.article_id).family.length || x.article_id.localeCompare(y.article_id))[0])
    .filter(Boolean);
  const featuredIds = new Set(featuredList.map((a) => a.article_id));
  const featured = featuredList.map((a) => card(a, HUB_BY_ID[a.category], 3)).join('\n');
  const latestList = newestFirst(published.filter((a) => !featuredIds.has(a.article_id)), H.latest.count);
  const latest = latestList.map((a) => card(a, HUB_BY_ID[a.category], 3)).join('\n');

  const c = business.contact;
  const lane = (title, lead) => `        <div class="lane-head">
          <h2>${esc(title)}</h2>
          <p>${esc(lead)}</p>
        </div>`;
  const content = `      <section class="v3-hero" aria-label="${esc(H.kicker)}">
${screenHead({ label: H.kicker, title: H.h1, lead: fact(H.lead) })}        <div class="v3-actions">
          ${btn('/gia-thue/', H.ctaPrice, { primary: true, glyph: 'tag' })}
          ${btn(AGENT_URL, H.ctaAgent, { glyph: 'chat' })}
        </div>
        <ul class="home-facts" aria-label="Thông tin nhanh">
${facts}
        </ul>
      </section>
      <section class="v3-section" aria-label="${esc(H.services.title)}">
${lane(H.services.title, fact(H.services.lead))}
        <div class="v3-service-grid">
${services}
        </div>
      </section>
      <section class="v3-agent" aria-label="${esc(H.agent.title)}">
        <div class="v3-agent-copy">
          <p class="blog-screen-label">${esc(H.agent.kicker)}</p>
          <h2>${esc(H.agent.title)}</h2>
          <p>${esc(fact(H.agent.lead))}</p>
          ${btn(AGENT_URL, H.agent.cta, { primary: true, glyph: 'chat' })}
          <p class="v3-note">${esc(fact(H.agent.note))}</p>
        </div>
        <ul class="v3-agent-list">
${can}
        </ul>
      </section>
      <section class="v3-section" aria-label="${esc(H.guide.title)}">
${lane(H.guide.title, H.guide.lead.replace('{clusters}', taxonomy.clusters.length).replace('{cats}', navigation.categories.length).replace('{topics}', topicCount))}
        <div class="v3-guide-grid">
${guide}
        </div>
      </section>
${featured ? `      <section class="v3-section" aria-label="${esc(H.featured.title)}">
${lane(H.featured.title, H.featured.lead)}
        <div class="blog-grid">
${featured}
        </div>
      </section>
` : ''}      <section class="v3-section" aria-label="${esc(H.latest.title)}">
${lane(H.latest.title, H.latest.lead.replace('{n}', latestList.length))}
        <div class="blog-grid">
${latest || `          ${emptyNote('emptyBlog')}`}
        </div>
        <p class="v3-more">${btn('/blog/', H.latest.more, { after: 'arrow' })}</p>
      </section>
      <section class="v3-shop" aria-label="${esc(H.shop.title)}">
        <div class="v3-shop-head">
          <h2>${esc(H.shop.title)}</h2>
          <p class="v3-shop-name">${esc(business.display_name)}</p>
          <p>${esc(H.shop.lead)}</p>
        </div>
        <dl class="v3-shop-facts">
          <div><dt>${icon('pin')}${esc(H.shop.address)}</dt><dd>${esc(business.address.full)}, ${esc(business.address.country)}</dd></div>
          <div><dt>${icon('calendar')}${esc(H.shop.hours)}</dt><dd>${esc(business.hours.display)} ${esc(H.shop.daily)}</dd></div>
          <div><dt>${icon('phone')}${esc(H.shop.phone)}</dt><dd><a data-contact-ref="call" href="/lien-he/">${esc(c.phone_display)}</a></dd></div>
        </dl>
        <div class="v3-actions">
          ${btn('/lien-he/', H.shop.call, { primary: true, glyph: 'phone', attrs: ' data-contact-ref="call"' })}
          ${btn('/lien-he/', H.shop.whatsapp, { glyph: 'chat', attrs: ' data-contact-ref="whatsapp"' })}
          ${btn('/lien-he/', H.shop.map, { glyph: 'map', attrs: ' data-contact-ref="map"' })}
          ${btn('/lien-he/', H.shop.contact, { after: 'arrow' })}
        </div>
      </section>`;

  const title = fact(H.title);
  const description = fact(H.description);
  const schemaHtml = ldScript({
    '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${SITE}#website`,
    // Google site name: the concise brand as `name`, the descriptive title as `alternateName`.
    name: BLOG_UI.site.shortName, alternateName: BLOG_UI.site.name,
    url: SITE, inLanguage: 'vi', publisher: { '@id': `${SITE}#organization` }
  }) + ldScript({ '@context': 'https://schema.org', ...publisherSchema(business) })
    + ldScript({
      '@context': 'https://schema.org', '@type': 'WebPage', '@id': `${SITE}#webpage`,
      url: SITE, name: title, description, inLanguage: 'vi',
      isPartOf: { '@id': `${SITE}#website` }, about: { '@id': `${SITE}#organization` },
      // The Agent app is declared once, on its own page (agent/index.html).
      mainEntity: { '@id': `${SITE}${AGENT_URL.replace(/^\//, '')}#app` }
    });
  write('index.html', appShellPage({
    title, description, path: '', screen: 'home', contentHtml: content, schemaHtml, headHtml: SEARCH_CONSOLE_META + LEGACY_CHAT_REDIRECT
  }));
}

/** Crawlable pagination slice. */
export function paginate(list, perPage = PER_PAGE) {
  const pages = [];
  for (let i = 0; i < list.length; i += perPage) pages.push(list.slice(i, i + perPage));
  return pages.length > 0 ? pages : [[]];
}

/** Crawlable numbered pagination for a list screen whose page 1 lives at
 *  `base` (a category hub `/blog/x/` or a subtopic hub `/blog/x/y/`) and
 *  page N at `${base}page/N/` — plain <a href> links, no JS. */
const pageHref = (base, p) => (p === 1 ? base : `${base}page/${p}/`);
function paginationNav(base, page, pages) {
  if (pages.length <= 1) return '';
  const links = [];
  for (let i = 0; i < pages.length; i++) {
    const p = i + 1;
    links.push(p === page ? `      <span class="blog-page-current" aria-current="page">${p}</span>` : `      <a href="${pageHref(base, p)}">${p}</a>`);
  }
  return `      <nav class="blog-pagination" aria-label="Trang">
        ${page > 1 ? `<a href="${pageHref(base, page - 1)}">${esc(t('pagePrev'))}</a>` : ''}
${links.join('\n')}
        ${page < pages.length ? `<a href="${pageHref(base, page + 1)}">${esc(t('pageNext'))}</a>` : ''}
      </nav>
`;
}

/** Category hub screen (real content hub, paginated, subtopic chips). */
function buildHub(hub, published, subtopicMap, pillars = []) {
  const articles = published.filter((a) => a.category === hub.id);
  const pages = paginate(articles);
  const builtPaths = [];

  // Subtopic chips: only subtopics that actually hold a published article.
  const chips = (subtopicMap[hub.id] ?? [])
    .filter((s) => s.count > 0 && s.slug)
    .map((s) => `        <a class="blog-chip" href="/blog/${hub.dir}/${s.slug}/">${esc(s.label)} <span class="blog-chip-count">${s.count}</span></a>`)
    .join('\n');

  // v70 topical architecture: page 1 lists every topic PILLAR of the
  // category (hub → pillar → supporting articles), so no topic cluster is
  // buried behind deep pagination.
  const pillarSection = pillars.length ? `      <section class="blog-pillars" aria-label="${esc(BLOG_UI.pillars.title)}">
        <h2>${esc(BLOG_UI.pillars.title)}</h2>
        <ul class="blog-pillar-list">
${pillars.map((a) => `          <li><a href="/blog/${hub.dir}/${a.slug}/">${esc(a.title)}</a></li>`).join('\n')}
        </ul>
      </section>
` : '';

  // Sibling category in the same cluster (related category).
  const cluster = CLUSTER_BY_ID[hub.cluster];
  const sibling = cluster.categories.map((id) => HUB_BY_ID[id]).find((h) => h.id !== hub.id);

  for (let p = 0; p < pages.length; p++) {
    const pageNo = p + 1;
    const path = pageNo === 1 ? `blog/${hub.dir}/` : `blog/${hub.dir}/page/${pageNo}/`;
    builtPaths.push(path);
    const cards = pages[p].map((a) => card(a, hub)).join('\n')
      || `        ${emptyNote('emptyHub', { scope: t('emptyScopeHub') })}`;
    const nav = paginationNav(`/blog/${hub.dir}/`, pageNo, pages);
    // Page 1 is the hub itself (no "trang 1" in its title); deeper pages say their number.
    // v70: page 1 uses the hub's keyword-led SERP title (taxonomy seo_title).
    const title = pageNo > 1 ? `${hub.name} — trang ${pageNo} — Cẩm nang thuê xe máy` : (hub.seoTitle ?? `${hub.name} — Cẩm nang thuê xe máy & xe điện`);

    const trail = [{ label: hub.label, href: pageNo === 1 ? null : `/blog/${hub.dir}/` },
      ...(pageNo > 1 ? [{ label: t('crumbPage', { n: pageNo }), href: null }] : [])];
    const content = breadcrumb(clusterTrail(cluster, trail))
      + screenHead({ label: t('kickerHub'), title: hub.name, lead: hub.desc })
      + `      <p class="hub-stats">${esc(t('articleCount', { n: count(articles.length) }))}${pages.length > 1 ? ` · ${esc(t('pageOf', { page: pageNo, pages: pages.length }))}` : ''}</p>\n`
      + hubParentBlock(cluster)
      + (hub.intro ? `      <p class="blog-screen-lead">${esc(hub.intro)}</p>\n` : '')
      + categoryChips({ activeHub: hub.dir })
      + (chips ? `      <div class="blog-chips" aria-label="Chủ đề">
${chips}
      </div>
` : '')
      + (pageNo === 1 ? pillarSection : '')
      + `      <div class="blog-grid">
${cards}
      </div>
${nav}${sibling ? `      <p class="blog-hub-sibling">${esc(t('hubSibling'))} <a href="/blog/${sibling.dir}/">${esc(sibling.label)}</a></p>
` : ''}${hubClusterFooter(cluster)}${askAgentAction(hub.name, hub.id)}`;

    // Paginated pages keep a unique meta description (no duplicate meta).
    const description = pageNo === 1 ? hub.meta : `${hub.meta} Trang ${pageNo}.`;
    const html = appShellPage({
      title,
      description,
      path,
      screen: `category-${hub.dir}`,
      activeHub: hub.dir,
      activeCluster: cluster.dir,
      contentHtml: content,
      schemaHtml: ldScript({
        '@context': 'https://schema.org', '@type': 'CollectionPage',
        name: hub.name, description, url: `${SITE}${path}`,
        inLanguage: 'vi-VN',
        isPartOf: websiteRef(),
        mainEntity: {
          '@type': 'ItemList',
          name: `${hub.name} — bài viết`,
          itemListElement: pages[p].map((a, i) => ({ '@type': 'ListItem', position: p * PER_PAGE + i + 1, name: a.title, url: `${SITE}blog/${hub.dir}/${a.slug}/` }))
        }
      }) + ldScript(breadcrumbLd(clusterTrailSchema(cluster, [{ label: hub.label, itemPath: `blog/${hub.dir}/` },
        ...(pageNo > 1 ? [{ label: t('crumbPage', { n: pageNo }), itemPath: path }] : [])])))
    });
    if (pageNo === 1) write(`blog/${hub.dir}/index.html`, html);
    else write(`blog/${hub.dir}/page/${pageNo}/index.html`, html);
  }
  return builtPaths;
}

/** Subtopic hub screen — generated ONLY with >= 1 published article. */
/** Subtopic hub (blog/<category>/<subtopic>/): paginated like a category
 *  hub — PER_PAGE cards per page, page N at …/page/N/ — so a subtopic holding
 *  hundreds of articles never ships one multi-hundred-KB page (lô M3). Page 1
 *  keeps its URL; every page has its own canonical, title and description.
 *  Returns the built paths (page 1 first). */
function buildSubtopic(hub, sub, articles) {
  const cluster = CLUSTER_BY_ID[hub.cluster];
  const base = `/blog/${hub.dir}/${sub.slug}/`;
  const pages = paginate(articles);
  const builtPaths = [];
  const baseDescription = `Tổng hợp ${articles.length} bài về ${sub.label.toLowerCase()} trong chuyên mục ${hub.name.toLowerCase()}: hướng dẫn, kinh nghiệm và lưu ý thực tế khi thuê xe, kèm Agent để hỏi sâu hơn.`;
  for (let p = 0; p < pages.length; p++) {
    const pageNo = p + 1;
    const path = pageHref(base, pageNo).replace(/^\//, '');
    builtPaths.push(path);
    const cards = pages[p].map((a) => card(a, hub)).join('\n');
    const trail = [{ label: hub.label, href: `/blog/${hub.dir}/` }, { label: sub.label, href: pageNo === 1 ? null : base },
      ...(pageNo > 1 ? [{ label: t('crumbPage', { n: pageNo }), href: null }] : [])];
    const content = breadcrumb(clusterTrail(cluster, trail))
      + screenHead({ label: hub.label, title: sub.label, lead: hub.desc })
      + `      <p class="hub-stats">${esc(t('articleCount', { n: count(articles.length) }))}${pages.length > 1 ? ` · ${esc(t('pageOf', { page: pageNo, pages: pages.length }))}` : ''}</p>
      <div class="blog-grid">
${cards}
      </div>
${paginationNav(base, pageNo, pages)}${askAgentAction(`${sub.label} — ${hub.name}`, hub.id)}`;

    // Deeper pages say their number in the title and description (no duplicates).
    const description = pageNo === 1 ? baseDescription : `${baseDescription} Trang ${pageNo}.`;
    const html = appShellPage({
      title: pageNo === 1 ? `${sub.label} — ${hub.name} — Cẩm nang thuê xe máy` : `${sub.label} — ${hub.name} — trang ${pageNo}`,
      // v70: own 120–165 char description (the old "label trong hub: hub.meta"
      // pattern exceeded the SERP length and repeated the hub description).
      description,
      path,
      screen: `subtopic-${sub.slug}`,
      activeHub: hub.dir,
      contentHtml: content,
      // v63.1 hybrid hardening: subtopic schema = CollectionPage + ItemList
      // + BreadcrumbList whose trail EXACTLY matches the visible breadcrumb
      // (Agent › Cẩm nang › parent hub › silo › subtopic [› trang N]), derived
      // from the same clusterTrailSchema helper as hubs/articles — no self-conflict.
      schemaHtml: ldScript({
        '@context': 'https://schema.org', '@type': 'CollectionPage',
        name: sub.label, description: `${sub.label} trong ${hub.name.toLowerCase()}`, url: `${SITE}${path}`,
        isPartOf: websiteRef(),
        mainEntity: {
          '@type': 'ItemList',
          name: `${sub.label} — bài viết`,
          itemListElement: pages[p].map((a, i) => ({ '@type': 'ListItem', position: p * PER_PAGE + i + 1, name: a.title, url: `${SITE}blog/${hub.dir}/${a.slug}/` }))
        }
      }) + ldScript(breadcrumbLd(clusterTrailSchema(cluster, [
        { label: hub.label, itemPath: `blog/${hub.dir}/` },
        { label: sub.label, itemPath: `blog/${hub.dir}/${sub.slug}/` },
        ...(pageNo > 1 ? [{ label: t('crumbPage', { n: pageNo }), itemPath: path }] : [])
      ])))
    });
    write(`${path}index.html`, html);
  }
  return builtPaths;
}

/**
 * Build-time table of contents: deterministic Vietnamese-safe anchor IDs,
 * deduplicated, from the article's H2/H3. No manual TOC maintenance.
 */
export function buildToc(bodyHtml) {
  const used = new Set();
  const items = [];
  const html = bodyHtml.replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/g, (_, lvl, attrs, inner) => {
    const existing = /id="([^"]+)"/.exec(attrs);
    const base = existing ? existing[1] : viSlug(inner.replace(/<[^>]+>/g, ''));
    let id = base || 'muc';
    let i = 2;
    while (used.has(id)) id = `${base || 'muc'}-${i++}`;
    used.add(id);
    const text = inner.replace(/<[^>]+>/g, '').trim();
    items.push({ level: Number(lvl), id, text });
    return `<h${lvl} id="${id}">${inner}</h${lvl}>`;
  });
  return { html, items };
}

function tocHtml(items) {
  if (items.length < 2) return { markup: '', html: items };
  const list = (cls) => `<ol class="${cls}">
${items.map((it) => `        <li class="toc-l${it.level}"><a href="#${it.id}">${esc(it.text)}</a></li>`).join('\n')}
      </ol>`;
  return {
    markup: `      <nav class="blog-toc" aria-label="${esc(t('tocTitle'))}">
        <details class="blog-toc-mobile">
          <summary>${esc(t('tocTitle'))}</summary>
${list('blog-toc-list')}
        </details>
        <div class="blog-toc-desktop">
          <p class="blog-toc-title">${esc(t('tocTitle'))}</p>
${list('blog-toc-list')}
        </div>
      </nav>
`
  };
}

/**
 * Parent cluster hub (/blog/<cluster-dir>/) — a real parent page connecting
 * its two category hubs. Canonical category IDs and dirs are untouched.
 */
function buildClusterHub(cluster, published) {
  // v61: a REAL topical parent hub — H1, intro, child category cards,
  // the strongest/latest articles per child, and the full cluster context.
  const cats = cluster.categories.map((id) => HUB_BY_ID[id]);
  const clusterArticles = published.filter((a) => cluster.categories.includes(a.category));

  const catCards = cats.map((hub, i) => {
    const total = published.filter((a) => a.category === hub.id).length;
    const top = published.filter((a) => a.category === hub.id).slice(0, 3);
    const topCards = top.map((a) => card(a, hub)).join('\n');
    return `      <section class="blog-cluster-child">
        <a class="blog-cat-card" href="/blog/${hub.dir}/">
          <span class="cat-icon" aria-hidden="true">${idx(i)}</span>
          <strong>${esc(hub.label)}</strong>
          <span class="cat-count">${count(total)} bài</span>
          <span>${esc(hub.desc)}</span>
        </a>
${topCards ? `        <div class="blog-grid">
${topCards}
        </div>` : ''}
      </section>`;
  }).join('\n');

  const shown = new Set(clusterArticles.slice(0, 6).map((a) => a.article_id));
  const latestCards = clusterArticles.slice(0, 6).map((a) => card(a, HUB_BY_ID[a.category])).join('\n');
  const path = `blog/${cluster.dir}/`;
  const content = breadcrumb([CRUMB_HOME, CRUMB_BLOG, { label: cluster.name, href: null }])
    + screenHead({ label: t('kickerCluster'), title: cluster.name, lead: cluster.desc })
    + (cluster.intro ? `      <p class="blog-screen-lead">${esc(cluster.intro)}</p>\n` : '')
    + `      <div class="blog-cat-grid">
${catCards}
      </div>
      <section>
        <h2>${esc(t('clusterLatest', { name: cluster.name }))}</h2>
        <div class="blog-grid">
${latestCards || `          ${emptyNote('emptyHub', { scope: t('emptyScopeCluster') })}`}
        </div>
      </section>
${hubClusterFooter(cluster)}${askAgentAction(cluster.name, cluster.categories[0])}`;
  const itemList = [
    ...cats.map((hub) => ({ '@type': 'ListItem', position: cats.indexOf(hub) + 1, name: hub.name, url: `${SITE}blog/${hub.dir}/` })),
    ...clusterArticles.slice(0, 10).map((a, i) => ({ '@type': 'ListItem', position: cats.length + 1 + i, name: a.title, url: `${SITE}blog/${HUB_BY_ID[a.category].dir}/${a.slug}/` }))
  ];
  const html = appShellPage({
    title: cluster.seo_title ?? `${cluster.name} — Cẩm nang thuê xe máy`,
    description: cluster.meta,
    path,
    screen: `cluster-${cluster.dir}`,
    activeCluster: cluster.dir,
    contentHtml: content,
    schemaHtml: ldScript({
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: cluster.name, description: cluster.meta, url: `${SITE}${path}`,
      isPartOf: websiteRef(),
      mainEntity: { '@type': 'ItemList', name: `${cluster.name} — danh mục và bài viết`, itemListElement: itemList }
    }) + ldScript(breadcrumbLd(clusterTrailSchema(cluster)))
  });
  write(`${path}index.html`, html);
}

/**
 * Build the article screen. v58 editorial upgrades: quick-answer summary box,
 * deterministic reading time (words/200, ceil), TOC, related articles.
 */
function buildArticle(a, business, hub, published, row, links, byId, reviews = {}, linkPages, pricing) {
  const bodyRaw = read(a.body);
  const body = agentLinks(canonicalIndexLinks(normalizeInternalAnchors(resolveFacts(bodyRaw, business),
    `blog/${hub.dir}/${a.slug}/index.html`, (path) => linkPages.has(path))));
  const { html: bodyWithIds, items } = buildToc(body);
  const toc = feature('toc') ? tocHtml(items) : { markup: '' };
  const path = `blog/${hub.dir}/${a.slug}/`;
  // v70: a reviewed body (tools/seo-body-review.mjs) carries its review date.
  const modified = reviews[a.article_id]?.reviewed > a.published_date ? reviews[a.article_id].reviewed : null;

  // Deterministic subtopic (from the canonical taxonomy model, not prose).
  const sub = deriveSubtopic(a.category, row ?? {});
  const subHubUrl = sub.fallback ? null : `/blog/${hub.dir}/${sub.slug}/`;

  // v70: related = topically similar articles outside the topic family,
  // planned corpus-wide by tools/seo-links.mjs (inbound-balanced).
  const plan = links.get(a.article_id);
  const cardOf = (id) => { const x = byId.get(id); return card(x, HUB_BY_ID[x.category], 3); };
  const related = feature('related') ? plan.related.map(cardOf).join('\n') : '';
  const relatedSection = related ? `      <section class="blog-related">
        <h2>${esc(BLOG_UI.related.title)}</h2>
        <div class="blog-grid">
${related}
        </div>
      </section>
` : '';
  // v70: the topic family (pillar + supporting articles of the same seed).
  const familySection = plan.family.length && feature('family') ? `      <section class="blog-family" aria-label="${esc(BLOG_UI.family.title)}">
        <h2>${esc(BLOG_UI.family.title)}</h2>
        <ul class="blog-family-list">
${plan.family.map((id) => {
    const x = byId.get(id);
    const tag = id === plan.pillar ? ` <span class="blog-family-tag">${esc(BLOG_UI.family.pillarLabel)}</span>` : '';
    return `          <li><a href="/blog/${HUB_BY_ID[x.category].dir}/${x.slug}/">${esc(x.title)}</a>${tag}</li>`;
  }).join('\n')}
        </ul>
      </section>
` : '';

  const cluster = CLUSTER_BY_ID[hub.cluster];
  const breadcrumbSchema = clusterTrailSchema(cluster, [
    { label: hub.label, itemPath: `blog/${hub.dir}/` },
    ...(subHubUrl ? [{ label: sub.label, itemPath: `blog/${hub.dir}/${sub.slug}/` }] : []),
    { name: a.title, itemPath: path, label: a.title }
  ]);
  const crumbTrail = clusterTrail(cluster, [
    { label: hub.label, href: `/blog/${hub.dir}/` },
    ...(subHubUrl ? [{ label: sub.label, href: subHubUrl }] : []),
    { label: a.title, href: null }
  ]);

  // v61 §8: topic context near the article end — the article states BOTH its
  // parent hub and its child hub as crawlable links.
  const topicContext = feature('topicContext') ? `      <section class="blog-topic-context">
        <h2>${esc(t('topicContext'))}</h2>
        <p>
          <a href="/blog/${cluster.dir}/">${esc(cluster.name)}</a>
          <span aria-hidden="true">→</span>
          <a href="/blog/${hub.dir}/">${esc(hub.label)}</a>
        </p>
      </section>
` : '';
  // The description is shown ONCE — as the standfirst summary card (it used
  // to repeat verbatim as the dek above it).
  const summary = feature('summary') ? `      <div class="blog-summary" role="note">
        <p class="blog-summary-title">${esc(BLOG_UI.summary.title)}</p>
        <p>${esc(a.description)}</p>
      </div>
` : '';
  const slotCtx = { category: a.category, pricing };
  const image = featuredImage(a.article_id, IMAGES);

  // .article-intro groups head + standfirst + slot so the desktop grid can
  // run the TOC rail from the breadcrumb down beside a fixed set of rows.
  const content = breadcrumb(crumbTrail)
    + `      <div class="article-intro">
      <div class="article-head">
      <p class="blog-chips">
        <a class="blog-chip" href="/blog/${hub.dir}/">${esc(hub.label)}</a>${subHubUrl ? `
        <a class="blog-chip" href="${subHubUrl}">${esc(sub.label)}</a>` : ''}
        <a class="blog-chip blog-chip-parent" href="/blog/${cluster.dir}/">${esc(cluster.name)}</a>
      </p>
${screenHead({ label: null, title: a.title, lead: feature('summary') ? null : a.description })}      <p class="byline"><a href="/gioi-thieu/" class="byline-author">${esc(a.author)}</a> · ${a.published_date}${modified ? ` · ${esc(t('updated', { date: modified }))}` : ''} · ${esc(hub.label)} · ${esc(t('readingTime', { n: readingTime(body) }))}</p>
      </div>
${summary}${image ? heroFigure(image) : ''}${renderSlot('article.afterSummary', slotCtx)}      </div>
      <div class="blog-article-layout">
${toc.markup}        <article class="blog-article-body">
  ${bodyWithIds.trim().split('\n').join('\n  ')}
        </article>
      </div>
${renderSlot('article.afterBody', slotCtx)}${topicContext}${familySection}${relatedSection}${hubClusterFooter(cluster)}${askAgentAction(a.title, a.category)}`;

  const html = appShellPage({
    title: a.title,
    description: a.description,
    ogType: 'article',
    path,
    screen: `article-${a.slug}`,
    activeHub: hub.dir,
    activeCluster: cluster.dir,
    contentHtml: content,
    image,
    schemaHtml: ldScript({
      '@context': 'https://schema.org',
      '@type': 'Article',
      url: `${SITE}${path}`,
      headline: a.title,
      description: a.description,
      datePublished: a.published_date,
      dateModified: modified ?? a.published_date,
      inLanguage: 'vi-VN',
      articleSection: hub.name,
      ...(a.seo_keyword ? { keywords: a.seo_keyword } : {}),
      // The featured image when the registry has one (a URL, same contract as before).
      image: image ? image.url : `${SITE}${BLOG_UI.site.ogImage.path}`,
      author: { '@type': 'Organization', name: a.author, url: `${SITE}gioi-thieu/` },
      publisher: publisherSchema(business),
      mainEntityOfPage: `${SITE}${path}`,
      isAccessibleForFree: true
    }) + ldScript(breadcrumbLd(breadcrumbSchema))
  });
  write(`blog/${hub.dir}/${a.slug}/index.html`, html);
}

/** One publisher entity for every Article (same @id site-wide, linked to
 *  the business's main website) — consistent entity for search/AI engines. */
function publisherSchema(business) {
  return {
    '@type': 'Organization',
    '@id': `${SITE}#organization`,
    name: business.display_name,
    url: SITE,
    logo: { '@type': 'ImageObject', url: `${SITE}${BLOG_UI.site.ogImage.path}`, width: BLOG_UI.site.ogImage.width, height: BLOG_UI.site.ogImage.height },
    sameAs: [business.url]
  };
}

/** v70 local SEO: the verified shop as one LocalBusiness entity (contact
 *  page only), built exclusively from data/business/business.json. */
function localBusinessSchema(business) {
  const a = business.address;
  return {
    '@context': 'https://schema.org',
    '@type': 'AutoRental',
    '@id': `${business.url}#localbusiness`,
    name: business.display_name,
    ...(business.gbp_name ? { alternateName: business.gbp_name } : {}),
    url: business.url,
    telephone: business.contact.phone_uri.replace(/^tel:/, ''),
    address: { '@type': 'PostalAddress', streetAddress: a.street, addressLocality: `${a.ward}, ${a.district}`, addressRegion: a.city, addressCountry: 'VN' },
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: business.hours.open, closes: business.hours.close
    }],
    areaServed: business.service_areas,
    hasMap: business.contact.maps
  };
}

/** Static screens (privacy, terms, about, policy, contact, partners) — one
 *  entry each in config/site-pages.json, rendered in the same shell. Text
 *  fields resolve {{ business.* }} from verified business.json. */
function buildLegal(page, business) {
  const fact = (s) => resolveFacts(s, business);
  const { dir, screen } = page;
  const [title, seoTitle, description] = [fact(page.title), fact(page.seoTitle), fact(page.description)];
  const extraSchema = (page.schema ?? []).map((kind) => ({ localBusiness: localBusinessSchema })[kind](business));
  const body = fact(read(page.body));
  const content = breadcrumb([CRUMB_HOME, { label: title, href: null }])
    + screenHead({ label: t('kickerStatic'), title, lead: description })
    + `      <div class="blog-grid blog-legal-grid">
${body.trim().split('\n').join('\n')}
      </div>
${askAgentAction(title)}`;
  const html = appShellPage({
    // v70: a descriptive SERP title (the visible H1/breadcrumb keep `title`).
    title: seoTitle,
    description,
    path: `${dir}/`,
    screen,
    activeHub: dir,
    contentHtml: content,
    schemaHtml: ldScript({
      '@context': 'https://schema.org', '@type': 'WebPage',
      name: title, description, url: `${SITE}${dir}/`,
      isPartOf: websiteRef()
    }) + extraSchema.map(ldScript).join('')
  });
  write(`${dir}/index.html`, html);
}

/** 404.html — GitHub Pages serves it, with status 404, for every missing
 *  URL at any depth: asset links are made root-absolute (the shell writes
 *  them relative to the page), and there is no canonical/og:url (not a page
 *  to index; robots noindex). Same shell, so header, menu and sidebar stay. */
function buildNotFound(business) {
  const title = 'Không tìm thấy trang';
  const description = 'Đường dẫn này không còn hoặc chưa từng tồn tại trên MotoAI. Quay lại trang chủ, mở cẩm nang hoặc hỏi Agent để tìm đúng thông tin.';
  const body = resolveFacts(read('data/site/not-found.body.html'), business);
  const content = breadcrumb([CRUMB_HOME, { label: title, href: null }])
    + screenHead({ label: t('kickerStatic'), title, lead: description })
    + `      <div class="blog-grid blog-legal-grid">
${body.trim().split('\n').join('\n')}
      </div>
`;
  const html = appShellPage({
    title: `${title} — MotoAI`,
    description,
    path: '',
    screen: 'not-found',
    contentHtml: content,
    headHtml: '  <meta name="robots" content="noindex">\n'
  })
    .replace(/  <link rel="canonical"[^\n]*\n/, '')
    .replace(/  <meta property="og:url"[^\n]*\n/, '')
    .replace(/\b(href|src)="(?![a-z][a-z0-9+.-]*:|\/|#)/gi, '$1="/');
  write('404.html', html);
}

/** Parse the matrix CSV into { article_id -> row } (schema untouched). */
function matrixRows() {
  const lines = read('data/blog/content-matrix.csv').split('\n');
  const header = lines[0].split(',');
  const rows = {};
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = lines[i].split(',');
    const row = {};
    header.forEach((h, j) => { row[h] = cells[j] ?? ''; });
    rows[row.article_id] = row;
  }
  return rows;
}

export function build() {
  // Served stylesheets first: every page below links them by content hash.
  buildCss(ROOT);
  syncChatTokens(ROOT);
  syncEmbedTokens(ROOT);
  const business = JSON.parse(read('data/business/business.json'));
  const manifest = JSON.parse(read('data/blog/published.json'));
  const matrix = matrixRows();
  // v66 chunk contract: the MATRIX decides what is published — a manifest
  // draft whose row is not PUBLISHED yet (QA/REPAIR in-flight draft of
  // a chunk, or a backlog draft from a dead workflow) must NOT be built,
  // indexed or matrix-synced by this build. The factory marks rows
  // PUBLISHED before calling build(), so this changes nothing for the
  // happy path.
  // v70 SEO master: reviewed title/description/keyword overrides from
  // data/seo/article-meta.json (validated; published.json stays untouched).
  const seoMeta = loadSeoMeta(ROOT);
  assertSeoMeta(seoMeta, manifest.articles);
  const published = manifest.articles
    .filter((a) => matrix[a.article_id]?.status === 'PUBLISHED')
    .map((a) => applySeoMeta(a, seoMeta))
    // Resolve facts in summaries as well as bodies: article-card excerpts,
    // meta descriptions and search snippets must never expose {{ business.* }}.
    // Keep published.json source untouched; use current verified business data.
    .map((a) => ({ ...a, description: resolveFacts(a.description, business) }));
  // Build menu from *actual PUBLISHED* article topics; no links to empty
  // subtopic hubs. Share it between the root chat and all content pages.
  const liveMenuTopics = new Set();
  for (const article of published) {
    const topic = deriveSubtopic(article.category, matrix[article.article_id] ?? {});
    if (!topic.fallback) {
      liveMenuTopics.add('/blog/' + taxonomy.categories[article.category].dir + '/' + topic.slug + '/');
    }
  }
  setMenuSubtopicUrls(liveMenuTopics);
  const byId = new Map(published.map((a) => [a.article_id, a]));
  const links = planLinks(published, matrix, {
    subtopicOf: deriveSubtopic,
    clusterOf: (cat) => taxonomy.categories[cat].cluster,
    limit: BLOG_UI.related.limit
  });
  const pillarsOf = (cat) => published.filter((a) => a.category === cat && links.get(a.article_id).pillar === a.article_id);
  const updated = published.reduce((m, a) => a.published_date > m ? a.published_date : m, '2026-09-26');

  // Reading time once per article (cards and byline share the number).
  MINUTES.clear();
  for (const a of published) MINUTES.set(a.article_id, readingTime(resolveFacts(read(a.body), business)));
  const linkPages = new Set(published.map((entry) => `blog/${HUB_BY_ID[entry.category].dir}/${entry.slug}/index.html`));
  const pricing = PRICING;

  buildHome(published, business);
  for (const cluster of taxonomy.clusters) buildClusterHub(cluster, published);
  const categoryPages = HUBS.flatMap((hub) => buildHub(hub, published, subtopicCounts(published, matrix), pillarsOf(hub.id)));
  const subtopicPages = [];
  const subtopicPaged = [];
  for (const hub of HUBS) {
    const subs = (taxonomy.subtopics[hub.id] ?? []);
    for (const sub of subs) {
      const arts = published.filter((a) => {
        if (a.category !== hub.id) return false;
        const s = deriveSubtopic(a.category, matrix[a.article_id] ?? {});
        return !s.fallback && s.code === sub.code;
      });
      // No empty SEO hubs: a subtopic page exists only with real content.
      if (arts.length > 0) {
        const [first, ...deeper] = buildSubtopic(hub, sub, arts);
        subtopicPages.push(first);
        subtopicPaged.push(...deeper);
      }
    }
  }
  const reviews = existsSync(join(ROOT, 'data/seo/body-reviews.json')) ? JSON.parse(read('data/seo/body-reviews.json')).reviews : {};
  for (const a of published) buildArticle(a, business, HUB_BY_ID[a.category], published, matrix[a.article_id], links, byId, reviews, linkPages, pricing);

  // Static screens — one registry (config/site-pages.json), same shell,
  // verified facts only.
  const builtPaths = new Set([
    '/', '/blog/', AGENT_URL,
    ...published.map((a) => `/blog/${HUB_BY_ID[a.category].dir}/${a.slug}/`),
    ...subtopicPages.map((p) => `/${p}`),
    ...subtopicPaged.map((p) => `/${p}`),
    ...HUBS.map((h) => `/blog/${h.dir}/`),
    ...taxonomy.clusters.map((c) => `/blog/${c.dir}/`),
    ...SITE_PAGES.map((p) => `/${p.dir}/`)
  ]);
  for (const page of SITE_PAGES) {
    if (page.kind === 'price') buildPrice(page, business, published, builtPaths);
    else buildLegal(page, business);
  }
  buildNotFound(business);

  // Search index (compact; only published; cluster/subtopic/location aware).
  write('blog/search-index.json', JSON.stringify({
    updated,
    articles: published.map((a) => {
      const hub = HUB_BY_ID[a.category];
      const row = matrix[a.article_id] ?? {};
      const sub = deriveSubtopic(a.category, row);
      const cluster = CLUSTER_BY_ID[hub.cluster];
      return {
        title: a.title,
        keywords: [a.title, a.description, sub.fallback ? '' : sub.label, row.local_scope].filter(Boolean).join(' '),
        summary: a.description,
        category: a.category,
        category_name: hub.name,
        cluster: hub.cluster,
        cluster_name: cluster.name,
        subtopic: sub.fallback ? '' : sub.code,
        subtopic_name: sub.fallback ? '' : sub.label,
        location: row.local_scope ?? '',
        url: `/blog/${hub.dir}/${a.slug}/`,
        // Card fields: client results render the same card as the server.
        category_label: hub.label,
        date: a.published_date,
        minutes: MINUTES.get(a.article_id)
      };
    })
  }, null, 2) + '\n');

  // Knowledge index for Agent retrieval (chunks, not full documents). The
  // chat shows a chunk verbatim, so facts resolve HERE from business.json /
  // pricing.json (a raw {{ business.* }} must never reach a customer).
  write('data/blog/knowledge-index.json', JSON.stringify({
    $schema: 'motoai/blog-knowledge@1',
    updated,
    chunks: published.flatMap((a) => a.knowledge_chunks.map((text, i) => ({
      id: `${a.article_id}:c${i + 1}`,
      article_id: a.article_id,
      title: resolveFacts(a.title, business),
      url: `/blog/${HUB_BY_ID[a.category].dir}/${a.slug}/`,
      category: a.category,
      text: resolveFacts(text, business)
    })))
  }, null, 2) + '\n');

  // Sitemap: homepage, blog home, hubs, non-empty subtopic hubs, published articles only.
  // v70: <lastmod> from real dates only — articles use their publish/review
  // date, listing pages the newest article/review date; static pages none.
  const lastmodOf = new Map(published.map((a) => [`${SITE}blog/${HUB_BY_ID[a.category].dir}/${a.slug}/`,
    reviews[a.article_id]?.reviewed > a.published_date ? reviews[a.article_id].reviewed : a.published_date]));
  const listingLastmod = [...lastmodOf.values()].reduce((m, d) => (d > m ? d : m), updated);
  buildSiteHome(published, business, links);
  const urls = [SITE, `${SITE}${AGENT_URL.replace(/^\//, '')}`, `${SITE}blog/`,
    ...taxonomy.clusters.map((c) => `${SITE}blog/${c.dir}/`),
    ...categoryPages.map((p) => `${SITE}${p}`),
    ...subtopicPages.map((p) => `${SITE}${p}`),
    ...subtopicPaged.map((p) => `${SITE}${p}`),
    ...published.map((a) => `${SITE}blog/${HUB_BY_ID[a.category].dir}/${a.slug}/`),
    ...SITE_PAGES.map((p) => `${SITE}${p.dir}/`)];
  // v80: image sitemap extension for articles with a rendered featured image
  // (the namespace appears only once a first image exists).
  const imageOf = new Map(published.map((a) => [`${SITE}blog/${HUB_BY_ID[a.category].dir}/${a.slug}/`, featuredImage(a.article_id, IMAGES)])
    .filter(([, img]) => img));
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${imageOf.size ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : ''}>
${urls.map((u) => {
    const lm = lastmodOf.get(u) ?? (u.startsWith(`${SITE}blog/`) ? listingLastmod : null);
    const img = imageOf.get(u);
    const imgXml = img ? `<image:image><image:loc>${img.url}</image:loc></image:image>` : '';
    return lm ? `  <url><loc>${u}</loc><lastmod>${lm}</lastmod>${imgXml}</url>` : `  <url><loc>${u}</loc>${imgXml}</url>`;
  }).join('\n')}
</urlset>
`);
  write('robots.txt', `User-agent: *
Allow: /
Sitemap: ${SITE}sitemap.xml
`);

  // Sync matrix rows for published articles.
  const csv = read('data/blog/content-matrix.csv').split('\n');
  const ids = new Set(published.map((a) => a.article_id));
  for (let i = 1; i < csv.length; i++) {
    const cols = csv[i].split(',');
    if (ids.has(cols[0])) {
      const a = published.find((x) => x.article_id === cols[0]);
      cols[3] = 'PUBLISHED';
      cols[21] = a.published_date;
      cols[22] = updated;
      // v64: only pilot/fixture articles get the pilot note; factory
      // production articles keep notes empty (they are not fixtures).
      if (cols[23] === '' && a.pilot) cols[23] = 'pilot/fixture';
      csv[i] = cols.join(',');
    }
  }
  write('data/blog/content-matrix.csv', csv.join('\n'));
  buildAgent(ROOT);
  console.log(`blog built: ${published.length} published articles, ${subtopicPages.length} subtopic hubs (+${subtopicPaged.length} pages), ${urls.length} sitemap urls`);
}

/**
 * Price screen (registry entry kind "price", /gia-thue/): renders ONLY verified pricing.json data.
 * No invented prices, no fabricated deposit — unverified cells show the
 * "confirm with the owner" note instead of a number.
 */
const hasRate = (r) => r && (r.min != null || r.max != null);
const rate = (r) => {
  if (!r || (r.min == null && r.max == null)) return null;
  if (r.min != null && r.max != null && r.min !== r.max) return `${r.min.toLocaleString('vi-VN')}đ – ${r.max.toLocaleString('vi-VN')}đ`;
  const v = r.min ?? r.max;
  return `${v.toLocaleString('vi-VN')}đ`;
};

/** Rent catalog for /gia-thue/: one Offer per vehicle with its PUBLISHED
 *  unit prices only (null = not published = no price in the schema). The
 *  deposit is never a price here — it is a separate amount. */
const UNIT_CODES = { day: 'DAY', week: 'WEE', month: 'MON' };
function priceCatalogSchema(pricing, business) {
  return {
    '@type': 'OfferCatalog',
    name: 'Bảng giá thuê xe máy tham khảo',
    // Only vehicles with a published rate: an Offer without a price would be invalid.
    itemListElement: pricing.vehicles.slice().sort((a, b) => (a.order ?? 99) - (b.order ?? 99)).filter((v) => pricing.rental_types.some((rt) => hasRate(v.rates[rt.id]))).map((v) => {
      const specs = pricing.rental_types.filter((rt) => hasRate(v.rates[rt.id])).map((rt) => {
        const { min, max } = v.rates[rt.id];
        return {
          '@type': 'UnitPriceSpecification', priceCurrency: pricing.currency, unitCode: UNIT_CODES[rt.id], unitText: rt.name,
          ...(min != null && max != null && min !== max ? { minPrice: min, maxPrice: max } : { price: min ?? max })
        };
      });
      return {
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: `Thuê ${v.name}`, category: v.category, provider: { '@id': `${business.url}#localbusiness` } },
        priceSpecification: specs
      };
    })
  };
}

/* Lô M2: /gia-thue/ below the table — built ONLY from pricing.json and
 * business.json. Comparisons quote published rates side by side and never
 * derive a new price (a period without a published rate keeps the
 * priceConfirm label);
 * policy answers are the business.json notes verbatim. Plain HTML Q&A: no
 * FAQPage markup (Google stopped showing FAQ rich results in 2026). */
const vnd = (n) => `${n.toLocaleString('vi-VN')}đ`;
const joinVi = (xs) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} và ${xs[xs.length - 1]}`);
/** Generic vehicle names ("Xe máy điện") read lower-case mid-sentence; brands stay as written. */
const midName = (name) => name.replace(/^Xe /, 'xe ');
const byOrder = (vehicles) => vehicles.slice().sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
const lowOf = (r) => r.min ?? r.max;
const highOf = (r) => r.max ?? r.min;

export function priceCompareSection(pricing) {
  const items = [];
  const unpriced = [];
  for (const v of byOrder(pricing.vehicles)) {
    const { day, week, month } = v.rates;
    if (!hasRate(day) && !hasRate(week) && !hasRate(month)) { unpriced.push(unpriced.length ? midName(v.name) : v.name); continue; }
    const parts = [];
    if (hasRate(day) && hasRate(week)) {
      parts.push(`gói tuần ${rate(week)} ${highOf(week) < 7 * lowOf(day) ? 'thấp hơn' : 'không thấp hơn'} 7 ngày thuê lẻ (${rate(day)}/ngày)`);
    } else if (hasRate(day)) {
      parts.push(`mới công bố giá ngày ${rate(day)}; thuê theo tuần, theo tháng cần hỏi cửa hàng`);
    }
    if (hasRate(week) && hasRate(month)) {
      parts.push(`gói tháng ${rate(month)} ${highOf(month) < 4 * lowOf(week) ? 'thấp hơn' : 'không thấp hơn'} 4 gói tuần`);
    }
    const kind = v.category && v.category !== v.name ? ` (${esc(v.category)})` : '';
    items.push(`<li><strong>${esc(v.name)}</strong>${kind}: ${parts.join('; ')}.</li>`);
  }
  if (unpriced.length) items.push(`<li><strong>${esc(joinVi(unpriced))}</strong>: chưa công bố giá tham khảo — hỏi cửa hàng trước khi đặt.</li>`);
  return `<section class="blog-legal-card">
  <h2>Thuê theo ngày, tuần hay tháng</h2>
  <p>So sánh dưới đây chỉ đặt các mức giá đã công bố trong bảng cạnh nhau; kỳ thuê chưa có giá vẫn là “${esc(t('priceConfirm'))}”, không suy ra từ giá ngày.</p>
  <ul>
    ${items.join('\n    ')}
  </ul>
</section>`;
}

export function priceFaqSection(pricing, business) {
  const vehicles = byOrder(pricing.vehicles);
  const qa = [];
  const dayPriced = vehicles.filter((v) => hasRate(v.rates.day));
  if (dayPriced.length) {
    const lo = Math.min(...dayPriced.map((v) => lowOf(v.rates.day)));
    const hi = Math.max(...dayPriced.map((v) => highOf(v.rates.day)));
    const at = (x, pick) => joinVi(dayPriced.filter((v) => pick(v.rates.day) === x).map((v) => midName(v.name)));
    const noDay = vehicles.filter((v) => !hasRate(v.rates.day)).map((v) => midName(v.name));
    qa.push(['Thuê xe máy ở Hà Nội bao nhiêu tiền một ngày?',
      (lo === hi ? `Giá ngày tham khảo tại cửa hàng là ${vnd(lo)}` : `Giá ngày tham khảo tại cửa hàng từ ${vnd(lo)} (${at(lo, lowOf)}) đến ${vnd(hi)} (${at(hi, highOf)})`)
      + (noDay.length ? `; ${joinVi(noDay)} chưa công bố giá tham khảo.` : '.')]);
  }
  const dep = business.policies.deposit;
  if (dep.min != null && dep.max != null) {
    const unknown = vehicles.filter((v) => !hasRate(v.deposit)).map((v) => midName(v.name));
    qa.push(['Tiền cọc là bao nhiêu, có tính vào giá thuê không?',
      `Tiền cọc là khoản riêng, không tính vào giá thuê: từ ${vnd(dep.min)} đến ${vnd(dep.max)} tùy xe, theo cột ${t('priceDeposit')}`
      + (unknown.length ? `; ${joinVi(unknown)} xác nhận mức cọc theo mẫu xe.` : '.')]);
  }
  if (business.policies.delivery?.note) qa.push(['Cửa hàng có giao xe tận nơi không?', business.policies.delivery.note]);
  if (business.policies.insurance?.note) qa.push(['Giá thuê đã gồm bảo hiểm chưa?', business.policies.insurance.note]);
  return `<section class="blog-legal-card">
  <h2>Câu hỏi thường gặp về giá thuê xe máy</h2>
${qa.map(([q, a]) => `  <h3>${esc(q)}</h3>\n  <p>${esc(a)}</p>`).join('\n')}
</section>`;
}

/** "Đọc thêm" for /gia-thue/: config/site-pages.json `related`; an article
 *  link shows the article's SEO title, anything else its configured label.
 *  Only pages this build generates are linked (a factory sandbox or an
 *  unpublished article simply drops the item — never a broken link). */
function priceRelatedSection(page, published, builtPaths) {
  const titles = new Map(published.map((a) => [`/blog/${HUB_BY_ID[a.category].dir}/${a.slug}/`, a.title]));
  const items = (page.related ?? [])
    .filter((r) => builtPaths.has(r.href) && (titles.has(r.href) || r.label))
    .map((r) => `<li><a href="${esc(r.href)}">${esc(titles.get(r.href) ?? r.label)}</a></li>`);
  return items.length ? `<section class="blog-legal-card">
  <h2>Đọc thêm về giá thuê</h2>
  <ul>
    ${items.join('\n    ')}
  </ul>
</section>` : '';
}

function buildPrice(page, business, published = [], builtPaths = new Set()) {
  const fact = (s) => resolveFacts(s, business);
  const pricing = PRICING;
  const rows = pricing.vehicles
    .slice()
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    .map((v) => {
      // data-label powers the phone layout (each row becomes a spec card).
      const cells = pricing.rental_types.map((rt) => {
        const r = rate(v.rates[rt.id]);
        return `<td data-label="${esc(rt.name)}"${r ? '' : ' class="is-confirm"'}>${r ?? esc(t('priceConfirm'))}</td>`;
      }).join('') + (() => {
        // The deposit is its own column: a separate amount, never part of the rent.
        const d = rate(v.deposit);
        return `<td data-label="${esc(t('priceDeposit'))}"${d ? '' : ' class="is-confirm"'}>${d ?? esc(t('depositConfirm'))}</td>`;
      })();
      return `        <tr>
          <th scope="row">${esc(v.name)}<span class="blog-price-note">${esc(v.category)}</span></th>
${cells}
        </tr>`;
    }).join('\n');
  const head = [...pricing.rental_types.map((rt) => rt.name), t('priceDeposit')].map((name) => `              <th scope="col">${esc(name)}</th>`).join('\n');
  const content = breadcrumb([CRUMB_HOME, { label: fact(page.crumb ?? page.title), href: null }])
    + screenHead({ label: fact(page.kicker), title: fact(page.title), lead: fact(page.lead) })
    + `      <div class="table-wrap price-wrap">
        <table class="blog-table price-table">
          <caption class="visually-hidden">Bảng giá thuê xe theo ngày, tuần, tháng và tiền đặt cọc</caption>
          <thead>
            <tr>
              <th scope="col">Xe</th>
${head}
            </tr>
          </thead>
          <tbody>
${rows}
          </tbody>
        </table>
      </div>
      <div class="blog-summary" role="note">
        <p class="blog-summary-title">Lưu ý</p>
        <p>${esc(pricing.disclaimer)}</p>
        <p>${esc(business.policies.deposit.note)}</p>
      </div>
      <div class="blog-grid blog-legal-grid">
${[priceCompareSection(pricing), page.body ? fact(read(page.body)).trim() : '', priceFaqSection(pricing, business), priceRelatedSection(page, published, builtPaths)]
    .filter(Boolean).join('\n').split('\n').map((l) => (l ? `        ${l}` : l)).join('\n')}
      </div>
${askAgentAction(page.askTopic)}`;

  const html = appShellPage({
    title: fact(page.seoTitle),
    description: fact(page.description),
    path: `${page.dir}/`,
    screen: page.screen,
    activeHub: page.dir,
    contentHtml: content,
    schemaHtml: ldScript({
      '@context': 'https://schema.org', '@type': 'WebPage',
      name: fact(page.title), description: pricing.disclaimer, url: `${SITE}${page.dir}/`,
      isPartOf: websiteRef(),
      mainEntity: priceCatalogSchema(pricing, business)
    })
  });
  write(`${page.dir}/index.html`, html);
}

/** Subtopic counts per category for hub chips (only real subtopics counted). */
function subtopicCounts(published, matrix) {
  const map = {};
  for (const hub of HUBS) {
    const counts = new Map();
    for (const a of published.filter((x) => x.category === hub.id)) {
      const s = deriveSubtopic(a.category, matrix[a.article_id] ?? {});
      if (s.fallback) continue;
      counts.set(s.code, (counts.get(s.code) ?? 0) + 1);
    }
    map[hub.id] = (taxonomy.subtopics[hub.id] ?? []).map((sub) => ({
      ...sub,
      count: counts.get(sub.code) ?? 0
    }));
  }
  return map;
}

if (process.argv && process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) build();
