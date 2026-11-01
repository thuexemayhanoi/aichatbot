#!/usr/bin/env node
/**
 * SEO MASTER AUDIT (v70) — deterministic offline crawl of EVERY public page
 * listed in sitemap.xml (homepage, blog home, cluster/category/pagination/
 * subtopic hubs, 2,000 articles, static and legal pages).
 *
 * Per URL it measures title/meta/H1/canonical/robots/schema, the internal
 * link graph (contextual body links, family/related blocks, hub links, click
 * depth from the homepage), body depth, FAQ/table/source coverage, keyword
 * placement and cannibalization, then classifies P0/P1/P2, proposed action
 * and status. Vietnamese-only SEO: English keyword/title fragments are issues.
 *
 * Usage:
 *   node tools/seo-master-audit.mjs              # write docs/seo/seo-master-matrix.{csv,json,md}
 *                                                #   + docs/seo/keyword-cluster-map.md
 *   node tools/seo-master-audit.mjs --baseline   # snapshot docs/seo/baseline-audit.json
 *   node tools/seo-master-audit.mjs --check      # exit 1 when a P0 issue remains
 *
 * Read-only for the site: it never edits pages, bodies, manifest or matrix.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE } from '../src/config/site.js';
import { taxonomy, deriveSubtopic } from './taxonomy.mjs';
import { loadSeoMeta, applySeoMeta, topicFamily, norm, englishTokens, seedTypos, LIMITS } from './seo-meta.mjs';
import { intentGrams } from './seo-links.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = 'docs/seo';
export const BASELINE = `${OUT_DIR}/baseline-audit.json`;

// ---------- issue catalogue (code -> priority, Vietnamese label, action) ----------

export const ISSUES = {
  NOINDEX: ['P0', 'noindex trên trang công khai', 'Gỡ noindex ngoài ý muốn'],
  CANONICAL: ['P0', 'canonical không tự trỏ', 'Đặt canonical tự trỏ đúng URL'],
  SITEMAP: ['P0', 'không có trong sitemap', 'Bổ sung URL vào sitemap.xml'],
  H1: ['P0', 'số H1 khác 1', 'Giữ đúng một H1'],
  'NO-TITLE': ['P0', 'thiếu title', 'Viết title'],
  'NO-DESC': ['P0', 'thiếu meta description', 'Viết meta description'],
  'ATTR-BROKEN': ['P0', 'thuộc tính meta/og vỡ do dấu " không escape', 'Escape dấu " trong thuộc tính HTML'],
  'NO-SCHEMA': ['P1', 'thiếu structured data', 'Bổ sung schema phù hợp'],
  'TITLE-DUP': ['P1', 'title trùng', 'Viết title riêng theo góc nội dung'],
  'DESC-DUP': ['P1', 'meta description trùng', 'Viết meta description riêng'],
  'TITLE-AUTO': ['P1', 'title sinh máy từ slug', 'Viết lại title tiếng Việt theo ý định tìm kiếm'],
  'TITLE-CASE': ['P1', 'title viết hoa/thường sai (Title Case máy)', 'Chuẩn hóa title kiểu câu tiếng Việt'],
  'TITLE-EN': ['P1', 'title lẫn tiếng Anh', 'Việt hóa title (chỉ SEO tiếng Việt)'],
  'TITLE-TYPO': ['P1', 'title sai chính tả/dấu', 'Sửa chính tả title'],
  'TITLE-LEN': ['P1', 'title ngoài 30–65 ký tự', 'Điều chỉnh độ dài title'],
  'DESC-CUT': ['P1', 'meta description cắt giữa câu', 'Viết meta description trọn câu'],
  'DESC-LEN': ['P2', 'meta description ngoài 120–165 ký tự', 'Điều chỉnh độ dài meta description'],
  'KW-EN': ['P1', 'từ khóa ma trận lẫn tiếng Anh', 'Dùng từ khóa chính tiếng Việt (lớp SEO)'],
  'KW-TYPO': ['P1', 'từ khóa ma trận sai chính tả', 'Dùng từ khóa chính đúng chính tả (lớp SEO)'],
  CANNIBAL: ['P1', 'từ khóa trùng/rất gần bài khác ngoài cụm', 'Tách ý định: chỉnh title/keyword, liên kết về pillar'],
  ORPHAN: ['P1', 'không có link bài/hub trỏ vào (chỉ phân trang sâu)', 'Thêm link cụm chủ đề/liên quan trỏ vào'],
  'LOW-INBOUND': ['P2', 'dưới 3 link ngữ cảnh/cụm trỏ vào', 'Tăng link nội bộ theo ngữ cảnh'],
  DEPTH: ['P2', 'độ sâu click > 4 từ trang chủ', 'Rút ngắn đường dẫn qua pillar/hub'],
  'CARD-H2': ['P2', 'thẻ bài liên quan dùng H2 chen vào dàn ý', 'Hạ thẻ bài liên quan xuống H3'],
  'SCHEMA-THIN': ['P2', 'Article schema thiếu inLanguage/image/logo', 'Bổ sung inLanguage, image, publisher logo'],
  'NO-ITEMLIST': ['P2', 'CollectionPage thiếu ItemList', 'Bổ sung ItemList cho trang danh sách']
};
export const GAPS = {
  THIN: ['P2', 'dưới 800 từ', 'Bổ sung nội dung hữu ích (review body)'],
  LONG: ['P2', 'trên 2.000 từ', 'Giữ nguyên có chủ đích (không cắt nội dung có giá trị); chỉ cô đọng qua review biên tập riêng'],
  'NO-FAQ': ['P2', 'thiếu FAQ', 'Thêm FAQ thực sự hữu ích (review body)'],
  'NO-TABLE': ['P2', 'ý định so sánh nhưng thiếu bảng', 'Thêm bảng so sánh (review body)'],
  'NO-SOURCE': ['P1', 'bài pháp lý thiếu nguồn văn bản gốc', 'Trích văn bản gốc + hiệu lực (legal gate)'],
  'NO-CTX-LINK': ['P2', 'body không có link ngữ cảnh tới bài khác', 'Thêm 2–3 link ngữ cảnh trong body (review body)'],
  'INTRO-KW': ['P2', 'đoạn mở chưa trả lời trực tiếp theo từ khóa', 'Viết câu trả lời trực tiếp ở đoạn mở (review body)'],
  'EN-BODY': ['P2', 'body còn cụm tiếng Anh từ ma trận', 'Việt hóa cụm tiếng Anh trong body (review body)'],
  'INTERNAL-NOTE': ['P1', 'ghi chú nội bộ (pilot/fixture) hiển thị công khai', 'Xóa ghi chú nội bộ (review body)']
};
const PRIO = { P0: 0, P1: 1, P2: 2 };

// ---------- HTML helpers ----------

const decode = (s) => String(s ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const textOf = (html) => decode(String(html ?? '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const wordCount = (s) => (s ? s.split(/\s+/).filter(Boolean).length : 0);
const first = (re, s) => { const m = re.exec(s); return m ? m[1] : ''; };
function region(html, open, close) {
  const i = html.indexOf(open);
  if (i < 0) return '';
  const j = html.indexOf(close, i);
  return j < 0 ? html.slice(i) : html.slice(i, j + close.length);
}
/** Internal page targets of every href in a fragment ("/x/y/" form). */
function pageLinks(fragment) {
  const out = [];
  for (const m of String(fragment).matchAll(/href="([^"]+)"/g)) {
    let h = decode(m[1]);
    if (h.startsWith(SITE)) h = `/${h.slice(SITE.length)}`;
    if (!h.startsWith('/') || h.startsWith('//')) continue;
    h = h.replace(/[#?].*$/, '');
    if (!h.endsWith('/')) continue; // assets, files
    out.push(h);
  }
  return out;
}

// Unicode-aware case tests: Vietnamese capitals such as Ứ/Đ/Ẩ sit inside
// the [à-ỹ] code-point range, so regex ranges cannot tell case apart.
const isUpper = (ch) => !!ch && ch !== ch.toLowerCase() && ch === ch.toUpperCase();
const isLower = (ch) => !!ch && ch !== ch.toUpperCase() && ch === ch.toLowerCase();
/** Common (non proper-noun) words that machine Title Case capitalised:
 *  "Nhận xe Thuê Cần gì Cho Gia Đình", "Tràng an Ride Cuối Tuần". Place
 *  names (Hà Nội, Phố Cổ, Mai Châu, Pom Coọng…) are NOT in this list, so
 *  proper-noun-heavy titles are not false positives. */
const COMMON_WORDS = new Set(['thuê', 'xe', 'máy', 'cho', 'và', 'khi', 'giá', 'của', 'trong', 'ngày', 'tuần', 'tháng',
  'buổi', 'cuối', 'người', 'mới', 'qua', 'mùa', 'hai', 'một', 'đêm', 'sáng', 'tối', 'cần', 'gì', 'có', 'không', 'tại',
  'theo', 'bằng', 'đi', 'với', 'các', 'những', 'là', 'hay', 'nên', 'cách', 'nhanh', 'gọn', 'tốt', 'câu', 'hỏi', 'thường',
  'gặp', 'năm', 'du', 'lịch', 'khách', 'nước', 'ngoài', 'gia', 'sinh', 'viên', 'chạy', 'tận', 'nơi', 'điện', 'số', 'ga',
  'ví', 'dụ', 'thực', 'tế', 'tóm', 'tắt', 'kỳ', 'nghỉ', 'nghĩ', 'hè', 'mưa', 'dài', 'hạn', 'ứng', 'dụng', 'từ', 'đến',
  'nhận', 'trả', 'thủ', 'tục', 'lái', 'toàn', 'chi', 'phí', 'ra', 'làm', 'sao', 'bao', 'nhiêu', 'trợ', 'lý', 'pin', 'sạc']);
export function titleCaseBroken(t) {
  const words = t.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter((w) => /\p{L}/u.test(w));
  if (!words.length) return false;
  if (isLower(words[0][0])) return true;
  return words.slice(1).filter((w) => isUpper(w[0]) && COMMON_WORDS.has(w.toLowerCase())).length >= 2;
}

// ---------- data ----------

function readMatrix(read) {
  const lines = read('data/blog/content-matrix.csv').trim().split('\n');
  const header = lines[0].split(',');
  const rows = {};
  for (const l of lines.slice(1)) {
    const cells = l.split(',');
    const row = {};
    header.forEach((h, j) => { row[h] = cells[j] ?? ''; });
    rows[row.article_id] = row;
  }
  return rows;
}

const STATIC = {
  // v76: / is the website homepage; the full-screen chat (WebApplication) moved to /agent/.
  // Owner commercial strategy 2026-10-29 (config/seo-ownership.json v2): / owns the rental head.
  '/': { type: 'Trang chủ (website)', keyword: 'cho thuê xe máy ở Hà Nội', secondary: 'cho thuê xe máy Hà Nội; thuê xe máy Hà Nội; thuê xe máy ở Hà Nội; trợ lý thuê xe máy', intent: 'Thương mại / dịch vụ cho thuê', cluster: 'K02' },
  '/agent/': { type: 'Ứng dụng Agent (chat)', keyword: 'ứng dụng thuê xe máy', secondary: 'app thuê xe máy; app thuê xe điện; ứng dụng thuê xe máy điện; công cụ tính giá thuê xe máy', intent: 'Thông tin sản phẩm / công cụ', cluster: 'K01' },
  '/blog/': { type: 'Blog home', keyword: 'cẩm nang thuê xe máy', secondary: 'kinh nghiệm thuê xe máy; thủ tục thuê xe máy; giá thuê xe máy', intent: 'Thông tin / điều hướng', cluster: '' },
  '/gia-thue/': { type: 'Trang chuyển đổi (giá)', keyword: 'giá thuê xe máy Hà Nội', secondary: 'bảng giá thuê xe máy; giá thuê xe máy theo ngày; giá thuê xe máy theo tháng; giá thuê xe tay ga', intent: 'Thương mại / chuyển đổi', cluster: 'K02' },
  '/lien-he/': { type: 'Trang chuyển đổi (liên hệ)', keyword: 'địa chỉ thuê xe máy Nguyễn Tú', secondary: 'liên hệ thuê xe máy Nguyễn Tú; số điện thoại thuê xe máy; địa chỉ thuê xe máy Long Biên', intent: 'Điều hướng / chuyển đổi', cluster: 'K15' },
  '/chinh-sach/': { type: 'Trang chính sách thuê xe', keyword: 'chính sách thuê xe máy', secondary: 'đặt cọc thuê xe máy; giao xe tận nơi; giấy tờ thuê xe', intent: 'Thông tin - chuyển đổi', cluster: 'K04' },
  '/gioi-thieu/': { type: 'Trang giới thiệu (E-E-A-T)', keyword: 'giới thiệu thuê xe máy Nguyễn Tú', secondary: 'MotoAI; trợ lý thuê xe máy', intent: 'Điều hướng / thương hiệu', cluster: 'K01' },
  '/privacy/': { type: 'Pháp lý', keyword: 'chính sách bảo mật MotoAI', secondary: '', intent: 'Điều hướng', cluster: '' },
  '/terms/': { type: 'Pháp lý', keyword: 'điều khoản sử dụng MotoAI', secondary: '', intent: 'Điều hướng', cluster: '' }
};
const INTENT_VI = {
  'informational-product': 'Thông tin sản phẩm', 'commercial-informational': 'Thương mại – thông tin',
  informational: 'Thông tin / hướng dẫn', 'informational-legal': 'Thông tin pháp lý', 'local-informational': 'Địa phương – thông tin'
};

// ---------- crawl ----------

export function crawl(root = ROOT) {
  const read = (p) => readFileSync(join(root, p), 'utf8');
  const clusters = JSON.parse(read('data/seo/keyword-clusters.json'));
  const matrix = readMatrix(read);
  const manifest = JSON.parse(read('data/blog/published.json')).articles;
  const seoMeta = loadSeoMeta(root);
  const catByDir = Object.fromEntries(Object.entries(taxonomy.categories).map(([id, c]) => [c.dir, id]));
  const clusterDirs = new Set(taxonomy.clusters.map((c) => c.dir));
  const subSlugs = new Set(Object.values(taxonomy.subtopics).flat().map((s) => s.slug));
  const articles = new Map();
  for (const a of manifest) {
    if (matrix[a.article_id]?.status !== 'PUBLISHED') continue;
    const eff = applySeoMeta(a, seoMeta);
    articles.set(`/blog/${taxonomy.categories[a.category].dir}/${a.slug}/`, { ...eff, manifest_title: a.title, manifest_description: a.description, row: matrix[a.article_id] });
  }

  const xml = read('sitemap.xml');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => `/${m[1].slice(SITE.length)}`);
  const pages = new Map();
  for (const url of urls) {
    const file = url === '/' ? 'index.html' : `${url.slice(1)}index.html`;
    if (!existsSync(join(root, file))) { pages.set(url, { url, file, missing: true }); continue; }
    const html = read(file);
    const segs = url.split('/').filter(Boolean);
    let type;
    if (url === '/' || STATIC[url]) type = STATIC[url].type;
    else if (segs.length === 2 && clusterDirs.has(segs[1])) type = 'Hub cụm chủ đề';
    else if (segs.length === 2 && catByDir[segs[1]]) type = 'Hub danh mục';
    else if (segs.length === 4 && segs[2] === 'page') type = 'Hub danh mục (phân trang)';
    // M3: large subtopic hubs are paginated like their category (…/<sub>/page/N/).
    else if (segs.length === 5 && segs[3] === 'page' && subSlugs.has(segs[2])) type = 'Hub chủ đề con (phân trang)';
    else if (segs.length === 3 && articles.has(url)) type = 'Bài viết';
    else if (segs.length === 3 && subSlugs.has(segs[2])) type = 'Hub chủ đề con';
    else type = 'Khác';
    const main = region(html, '<main', '</main>');
    const body = region(html, '<article class="blog-article-body">', '</article>');
    const fam = region(html, '<section class="blog-family"', '</section>');
    const rel = region(html, '<section class="blog-related">', '</section>');
    const schemas = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
    pages.set(url, {
      url, file, type, html,
      title: decode(first(/<title>([\s\S]*?)<\/title>/, html)).trim(),
      desc: decode(first(/<meta name="description" content="([^"]*)"/, html)),
      canonical: first(/<link rel="canonical" href="([^"]+)"/, html),
      noindex: /<meta[^>]+name="(?:robots|googlebot)"[^>]+noindex/i.test(html),
      // Every head meta must be exactly <meta name|property="x" content="...">
      // (v72: theme-color may add a media="(prefers-color-scheme: …)" query).
      attrBroken: [...html.slice(0, html.indexOf('</head>')).matchAll(/<meta [^\n]*/g)]
        .some((m) => /content="/.test(m[0]) && !/^<meta (?:name|property)="[^"]+" content="[^"]*"(?: media="[^"]*")?\s*\/?>$/.test(m[0].trim())),
      h1: [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => textOf(m[1])),
      schemas,
      types: schemas.map((s) => s['@type']),
      allLinks: pageLinks(html),
      mainLinks: pageLinks(main),
      bodyLinks: pageLinks(body),
      clusterLinks: [...pageLinks(fam), ...pageLinks(rel)],
      body, rel,
      relatedCardH2: /<a class="blog-card"[\s\S]*?<h2>/.test(rel)
    });
  }

  // Inbound graph (distinct source pages) + click depth from the homepage.
  const inbound = new Map(urls.map((u) => [u, { ctx: new Set(), cluster: new Set(), hub: new Set() }]));
  for (const p of pages.values()) {
    if (p.missing) continue;
    const isArticle = p.type === 'Bài viết';
    for (const t of new Set(p.bodyLinks)) if (t !== p.url && inbound.has(t)) inbound.get(t).ctx.add(p.url);
    for (const t of new Set(p.clusterLinks)) if (t !== p.url && inbound.has(t)) inbound.get(t).cluster.add(p.url);
    if (!isArticle) {
      // Hub/static content links; deep pagination pages (page >= 2) are not
      // counted as a strong signal — they are what made pages near-orphans.
      if (!p.type.endsWith('(phân trang)')) {
        for (const t of new Set(p.mainLinks)) if (t !== p.url && inbound.has(t)) inbound.get(t).hub.add(p.url);
      }
    }
  }
  const depth = new Map([['/', 0]]);
  const queue = ['/'];
  while (queue.length) {
    const u = queue.shift();
    const p = pages.get(u);
    if (!p || p.missing) continue;
    for (const t of p.allLinks) if (pages.has(t) && !depth.has(t)) { depth.set(t, depth.get(u) + 1); queue.push(t); }
  }
  return { pages, articles, inbound, depth, clusters, matrix, seoMeta, urls };
}

// ---------- classification ----------

export function clusterOf(clusters, category, seed) {
  // Diacritics preserved: "gia" (Gia Lâm, gia đình) must never match "giá".
  const n = ` ${String(seed ?? '').toLowerCase().normalize('NFC').replace(/[^0-9a-zà-ỹđ]+/gu, ' ').trim()} `;
  for (const c of clusters.clusters) {
    if (c.match.some((m) => n.includes(` ${m.toLowerCase().normalize('NFC')}`))) return c;
  }
  return clusters.clusters.find((c) => c.id === clusters.fallback_by_category[category]);
}

export function analyze(c) {
  const { pages, articles, inbound, depth, clusters } = c;
  const clusterById = Object.fromEntries(clusters.clusters.map((k) => [k.id, k]));
  const titleCount = new Map(), descCount = new Map();
  for (const p of pages.values()) {
    if (p.missing) continue;
    titleCount.set(p.title.toLowerCase(), (titleCount.get(p.title.toLowerCase()) ?? 0) + 1);
    descCount.set(p.desc, (descCount.get(p.desc) ?? 0) + 1);
  }

  // Families + keyword collisions (outside the family) on the effective keyword.
  const famOf = new Map(), famMembers = new Map(), kwGrams = new Map();
  for (const [url, a] of articles) {
    const f = topicFamily(a.category, a.row.primary_keyword);
    famOf.set(url, f);
    if (!famMembers.has(f.key)) famMembers.set(f.key, []);
    famMembers.get(f.key).push(url);
    kwGrams.set(url, intentGrams(a.seo_keyword ?? a.row.primary_keyword));
  }
  const kwList = [...kwGrams.entries()];
  const collisions = new Map();
  for (let i = 0; i < kwList.length; i++) {
    const [u, g] = kwList[i];
    for (let j = i + 1; j < kwList.length; j++) {
      const [v, h] = kwList[j];
      if (famOf.get(u).key === famOf.get(v).key || !g.size || !h.size) continue;
      let inter = 0;
      for (const x of g) if (h.has(x)) inter++;
      const sim = inter / Math.sqrt(g.size * h.size);
      if (sim >= 0.9) {
        if (!collisions.has(u)) collisions.set(u, []);
        if (!collisions.has(v)) collisions.set(v, []);
        collisions.get(u).push(articles.get(v).article_id);
        collisions.get(v).push(articles.get(u).article_id);
      }
    }
  }

  const rows = [];
  for (const url of c.urls) {
    const p = pages.get(url);
    const issues = [], gaps = [], ev = [];
    if (p.missing) { rows.push({ url, type: 'Thiếu file', issues: ['SITEMAP'], gaps: [] }); continue; }
    const expected = `${SITE}${url.slice(1)}`;
    if (p.noindex) issues.push('NOINDEX');
    if (p.attrBroken) issues.push('ATTR-BROKEN');
    if (p.canonical !== expected) issues.push('CANONICAL');
    if (p.h1.length !== 1) issues.push('H1');
    if (!p.title) issues.push('NO-TITLE');
    if (!p.desc) issues.push('NO-DESC');
    if (!p.schemas.length) issues.push('NO-SCHEMA');
    if (titleCount.get(p.title.toLowerCase()) > 1) issues.push('TITLE-DUP');
    if (descCount.get(p.desc) > 1) issues.push('DESC-DUP');
    if (p.title && (p.title.length < 30 || p.title.length > 65)) issues.push('TITLE-LEN');
    if (englishTokens(p.title).length) issues.push('TITLE-EN');
    if (seedTypos(p.title).length) issues.push('TITLE-TYPO');
    if (p.desc && !/[.?!…]$/.test(p.desc.trim())) issues.push('DESC-CUT');
    if (p.desc && (p.desc.length < 120 || p.desc.length > LIMITS.descMax)) issues.push('DESC-LEN');
    if (['Hub danh mục', 'Hub danh mục (phân trang)', 'Hub chủ đề con', 'Hub chủ đề con (phân trang)', 'Hub cụm chủ đề', 'Blog home'].includes(p.type)) {
      const cp = p.schemas.find((s) => s['@type'] === 'CollectionPage');
      if (cp && !cp.mainEntity) issues.push('NO-ITEMLIST');
    }
    const inb = inbound.get(url);
    const d = depth.get(url) ?? 99;
    const row = {
      url, type: p.type, title: p.title, keyword: '', secondary: '', intent: '', cluster: '',
      words: '', article_id: '', category: '', original_title: '', issues, gaps,
      links: { outCtx: new Set(p.bodyLinks.filter((t) => articles.has(t) && t !== url)).size, inCtx: inb.ctx.size, inCluster: inb.cluster.size, inHub: inb.hub.size, depth: d },
      cannibal: '', evidence: ev
    };
    if (d > 4) issues.push('DEPTH');

    if (p.type === 'Bài viết') {
      const a = articles.get(url);
      const f = famOf.get(url);
      const members = famMembers.get(f.key);
      const pillarUrl = members.find((m) => famOf.get(m).order === 0);
      const kc = clusterOf(clusters, a.category, f.seed);
      row.article_id = a.article_id;
      row.category = a.category;
      row.original_title = a.manifest_title;
      row.keyword = a.seo_keyword ?? a.row.primary_keyword;
      if (!a.seo_keyword) {
        if (englishTokens(a.row.primary_keyword).length) issues.push('KW-EN');
        if (seedTypos(a.row.primary_keyword).length) issues.push('KW-TYPO');
      }
      if (p.title === a.row.working_title) issues.push('TITLE-AUTO');
      if (titleCaseBroken(p.title)) issues.push('TITLE-CASE');
      const pillar = pillarUrl ? articles.get(pillarUrl) : null;
      const sub = deriveSubtopic(a.category, a.row);
      const sec = [];
      if (pillar && pillarUrl !== url) sec.push(pillar.seo_keyword ?? pillar.row.primary_keyword);
      if (kc?.head?.[0]) sec.push(kc.head[0]);
      if (!sub.fallback) sec.push(sub.label.toLowerCase());
      row.secondary = [...new Set(sec.filter((s) => s && norm(s) !== norm(row.keyword)))].join('; ');
      row.intent = INTENT_VI[a.row.search_intent] ?? a.row.search_intent;
      if (/so sanh| hay |khac gi/.test(` ${norm(row.keyword)} `)) row.intent += ' + so sánh';
      row.cluster = kc ? `${kc.id} ${kc.name}` : '';
      const famLabel = pillar?.seo_keyword ?? f.seed;
      row.cannibal = (pillarUrl === url ? `Pillar cụm "${famLabel}" (${members.length} bài)` : `Hỗ trợ pillar ${pillar?.article_id ?? '—'} ("${famLabel}")`)
        + (collisions.has(url) ? `; trùng ý định với ${collisions.get(url).slice(0, 3).join(', ')}` : '');
      if (collisions.has(url)) issues.push('CANNIBAL');
      if (inb.ctx.size + inb.cluster.size + [...inb.hub].filter((h) => h !== `/blog/${taxonomy.categories[a.category].dir}/`).length === 0) issues.push('ORPHAN');
      if (inb.ctx.size + inb.cluster.size < 3) issues.push('LOW-INBOUND');
      if (p.relatedCardH2) issues.push('CARD-H2');
      const art = p.schemas.find((s) => s['@type'] === 'Article');
      if (art && (!art.inLanguage || !art.image || !art.publisher?.logo)) issues.push('SCHEMA-THIN');
      // Content (body) gaps — fixed only through the separate body review process.
      const bodyText = textOf(p.body);
      const wc = wordCount(bodyText);
      row.words = wc;
      if (wc < 800) gaps.push('THIN');
      if (wc > 2000) gaps.push('LONG');
      if (!/<h[23][^>]*>[^<]*(câu hỏi|hỏi đáp|faq|thắc mắc)/i.test(p.body)) gaps.push('NO-FAQ');
      if (/so sánh| hay |khác gì/i.test(` ${row.keyword} `) && !/<table/.test(p.body)) gaps.push('NO-TABLE');
      const ext = [...p.body.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]).filter((h) => !h.startsWith(SITE) && !h.includes('thuexemaynguyentu.com'));
      if (a.category === 'SAFE' && ext.length === 0) gaps.push('NO-SOURCE');
      if (row.links.outCtx === 0) gaps.push('NO-CTX-LINK');
      const intro = norm(bodyText.split(/\s+/).slice(0, 120).join(' '));
      const kwSyl = norm(row.keyword).split(/[^a-z0-9]+/).filter((s) => s.length > 1);
      const cover = kwSyl.filter((s) => intro.includes(s)).length / Math.max(1, kwSyl.length);
      if (cover < 0.6) gaps.push('INTRO-KW');
      if (/pilot|fixture|chuẩn sản xuất/i.test(bodyText)) gaps.push('INTERNAL-NOTE');
      if (englishTokens(bodyText.replace(/MotoAI|Agent/g, '')).some((w) => ['ride', 'weekend', 'view', 'bike', 'bikes', 'claim'].includes(w.toLowerCase()))) gaps.push('EN-BODY');
      ev.push(`${wc} từ`, `${ext.length} nguồn ngoài`);
      if (/<table/.test(p.body)) ev.push('có bảng');
    } else {
      const st = STATIC[url];
      const segs = url.split('/').filter(Boolean);
      const catId = Object.entries(taxonomy.categories).find(([, cat]) => cat.dir === segs[1])?.[0];
      if (st) Object.assign(row, { keyword: st.keyword, secondary: st.secondary, intent: st.intent, cluster: st.cluster ? `${st.cluster} ${clusterById[st.cluster].name}` : 'Tất cả cụm' });
      else if (catId) {
        const k = clusterById[clusters.fallback_by_category[catId]];
        const seoT = taxonomy.categories[catId].seo_title;
        row.keyword = (seoT ? seoT.split(':')[0] : (p.h1[0] ?? '')).toLowerCase();
        row.intent = 'Điều hướng / danh sách';
        row.cluster = `${k.id} ${k.name}`;
        row.secondary = taxonomy.categories[catId].name.toLowerCase();
      } else if (p.type === 'Hub cụm chủ đề') {
        const seoT = taxonomy.clusters.find((cl) => cl.dir === segs[1])?.seo_title;
        row.keyword = (seoT ? seoT.split(':')[0] : (p.h1[0] ?? '')).toLowerCase();
        row.intent = 'Điều hướng / pillar cụm';
        row.cluster = 'Nhiều cụm';
      }
      row.cannibal = 'Không (trang điều hướng/chuyển đổi duy nhất)';
    }
    ev.unshift(`title ${p.title.length}c`, `desc ${p.desc.length}c`, `H1 ${p.h1.length}`, `schema ${[...new Set(p.types)].join('+') || '—'}`);
    rows.push(row);
  }
  return rows;
}

// ---------- content review: KEEP / FIX / REVIEW / BLOCKED ----------

export const REVIEW_FILE = 'data/seo/content-review.json';
export const REVIEW_STATES = ['KEEP', 'REVIEW', 'BLOCKED', 'FIX'];

/**
 * Content verdict per article, strongest first: FIX (open content flag in
 * config/seo-cold-start.json, or a superseded legal document cited as the
 * rule in force) > BLOCKED (waits on the owner's data or decision, listed in
 * data/seo/content-review.json) > REVIEW (cites a legal document whose full
 * text is not verified yet, or listed with a reason) > KEEP. Every verdict
 * other than KEEP carries its evidence.
 */
export function contentReview(root = ROOT) {
  const readJ = (p) => (existsSync(join(root, p)) ? JSON.parse(readFileSync(join(root, p), 'utf8')) : null);
  const out = new Map();
  const put = (id, status, note) => {
    const cur = out.get(id) ?? { status: 'KEEP', notes: [] };
    if (REVIEW_STATES.indexOf(status) > REVIEW_STATES.indexOf(cur.status)) cur.status = status;
    cur.notes.push(`${status}: ${note}`);
    out.set(id, cur);
  };
  for (const f of readJ('config/seo-cold-start.json')?.content_flags ?? []) if (!f.resolved) put(f.article, 'FIX', f.reason);
  const legal = readJ('docs/seo/legal-citations.json');
  for (const f of legal?.needs_fix ?? []) put(f.article_id, 'FIX', `dẫn ${f.doc} (đã được thay bởi ${f.replaced_by}) như quy định đang áp dụng`);
  for (const d of legal?.documents ?? []) {
    if (d.status === 'replaced' || d.evidence === 'fulltext') continue;
    for (const id of d.articles_current ?? []) put(id, 'REVIEW', `dẫn ${d.id} — văn bản chưa đối chiếu toàn văn (sổ đăng ký: ${d.evidence})`);
  }
  for (const [id, a] of Object.entries(readJ(REVIEW_FILE)?.articles ?? {})) put(id, a.status, a.reason);
  return out;
}

// ---------- matrix assembly ----------

const ACTION_DONE = 'Giữ nguyên; theo dõi Search Console (hiển thị, CTR, truy vấn)';

export function finalize(rows, baseline) {
  const order = (r) => {
    const t = r.type;
    if (t.startsWith('Trang chủ')) return 0;
    if (t.startsWith('Trang chuyển đổi') || t.startsWith('Trang chính sách')) return 1;
    if (t === 'Blog home' || t === 'Hub cụm chủ đề' || t === 'Hub danh mục') return 2;
    if (t === 'Bài viết' && r.cannibal.startsWith('Pillar')) return 3;
    if (t === 'Hub chủ đề con') return 4;
    if (t === 'Bài viết') return 5;
    return 6;
  };
  for (const r of rows) {
    const before = baseline?.issues?.[r.url] ?? [];
    const now = new Set([...r.issues, ...r.gaps]);
    r.fixed = before.filter((code) => !now.has(code));
    const all = [...new Set([...before, ...r.issues, ...r.gaps])];
    let prio = all.reduce((m, code) => Math.min(m, PRIO[(ISSUES[code] ?? GAPS[code] ?? ['P2'])[0]]), 2);
    if (order(r) <= 3) prio = Math.min(prio, 1);
    r.priority = `P${prio}`;
    const remainingTech = r.issues;
    // KEEP = reviewed and deliberately unchanged (only "longer than 2,000 words").
    r.status = remainingTech.length ? 'PLANNED'
      : (r.gaps.length === 0 ? 'DONE' : (r.gaps.every((g) => g === 'LONG') ? 'KEEP' : 'TECH-DONE'));
    const actions = [...remainingTech.map((code) => ISSUES[code][2]), ...r.gaps.map((code) => GAPS[code][2])];
    r.action = actions.length ? [...new Set(actions)].join('; ') : ACTION_DONE;
    if (r.fixed.length) r.evidence.push(`đã sửa: ${r.fixed.join(',')}`);
    r.sortKey = [prio, order(r), r.url];
  }
  rows.sort((a, b) => a.sortKey[0] - b.sortKey[0] || a.sortKey[1] - b.sortKey[1] || a.sortKey[2].localeCompare(b.sortKey[2]));
  rows.forEach((r, i) => { r.batch = `SEO-B${String(Math.floor(i / 20) + 1).padStart(3, '0')}`; });
  return rows;
}

const COLUMNS = ['URL', 'Page Type', 'Current Title', 'Primary Keyword', 'Secondary Keywords', 'Search Intent', 'Topic Cluster',
  'Content Gap', 'Internal Links', 'Cannibalization', 'Technical Issues', 'Priority', 'Proposed Action', 'Status', 'Evidence',
  'Article ID', 'Category', 'Original Title', 'Word Count', 'Batch', 'Content Review', 'Content Review Note'];

function toRecord(r) {
  const L = r.links;
  return {
    'URL': `${SITE}${r.url.slice(1)}`,
    'Page Type': r.type,
    'Current Title': r.title,
    'Primary Keyword': r.keyword,
    'Secondary Keywords': r.secondary,
    'Search Intent': r.intent,
    'Topic Cluster': r.cluster,
    'Content Gap': r.gaps.map((g) => GAPS[g][1]).join('; ') || 'Không',
    'Internal Links': `ra ${L.outCtx} ngữ cảnh | vào: ngữ cảnh ${L.inCtx}, cụm/liên quan ${L.inCluster}, hub ${L.inHub} | độ sâu ${L.depth}`,
    'Cannibalization': r.cannibal,
    'Technical Issues': r.issues.map((i) => ISSUES[i][1]).join('; ') || 'Không',
    'Priority': r.priority,
    'Proposed Action': r.action,
    'Status': r.status,
    'Evidence': r.evidence.join('; '),
    'Article ID': r.article_id,
    'Category': r.category,
    'Original Title': r.original_title && r.original_title !== r.title ? r.original_title : '',
    'Word Count': r.words,
    'Batch': r.batch,
    'Content Review': r.review.status,
    'Content Review Note': r.review.notes.join(' | ')
  };
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function summarize(rows) {
  const count = (f) => rows.filter(f).length;
  const byCode = {};
  for (const r of rows) for (const c of [...r.issues, ...r.gaps]) byCode[c] = (byCode[c] ?? 0) + 1;
  const arts = rows.filter((r) => r.type === 'Bài viết');
  const inb = arts.map((r) => r.links.inCtx + r.links.inCluster).sort((a, b) => a - b);
  const depths = rows.map((r) => r.links.depth).sort((a, b) => a - b);
  return {
    urls: rows.length,
    articles: arts.length,
    by_type: Object.fromEntries([...new Set(rows.map((r) => r.type))].map((t) => [t, count((r) => r.type === t)])),
    by_priority: { P0: count((r) => r.priority === 'P0'), P1: count((r) => r.priority === 'P1'), P2: count((r) => r.priority === 'P2') },
    by_status: { DONE: count((r) => r.status === 'DONE'), KEEP: count((r) => r.status === 'KEEP'), 'TECH-DONE': count((r) => r.status === 'TECH-DONE'), PLANNED: count((r) => r.status === 'PLANNED') },
    by_review: Object.fromEntries(REVIEW_STATES.map((st) => [st, count((r) => r.type === 'Bài viết' && r.review.status === st)])),
    p0_open: count((r) => r.issues.some((i) => ISSUES[i][0] === 'P0')),
    issue_counts: Object.fromEntries(Object.entries(byCode).sort()),
    article_inbound_ctx_cluster: { min: inb[0] ?? 0, median: inb[Math.floor(inb.length / 2)] ?? 0, zero: inb.filter((x) => x === 0).length },
    depth: { max: depths.at(-1) ?? 0, over4: depths.filter((d) => d > 4).length }
  };
}

function renderMd(rows, summary, baseline) {
  const b = baseline?.summary;
  const line = (label, now, before) => `| ${label} | ${before ?? '—'} | ${now} |`;
  const codes = [...new Set([...Object.keys(summary.issue_counts), ...Object.keys(b?.issue_counts ?? {})])].sort();
  const label = (c) => (ISSUES[c] ?? GAPS[c])[1];
  const batches = [...new Set(rows.map((r) => r.batch))];
  const openBatches = batches.filter((bt) => rows.some((r) => r.batch === bt && r.status !== 'DONE'));
  return `# SEO Master Matrix — chatbot.thuexemaynguyentu.com

> Sinh tự động bởi \`node tools/seo-master-audit.mjs\` (offline, deterministic) từ HTML thực tế đã build.
> Dữ liệu đầy đủ từng URL: [seo-master-matrix.csv](seo-master-matrix.csv) · [seo-master-matrix.json](seo-master-matrix.json).
> Phạm vi SEO: **chỉ tiếng Việt**. Không xóa, không noindex, không đổi URL/slug/canonical, không gộp bài.

## Phủ URL

- Tổng URL trong sitemap đã audit: **${summary.urls}** (100%) — trong đó **${summary.articles}** bài viết.
${Object.entries(summary.by_type).map(([t, n]) => `- ${t}: ${n}`).join('\n')}

## Trước / sau

| Chỉ số | Baseline | Hiện tại |
|---|---:|---:|
${line('URL P0 còn mở', summary.p0_open, b?.p0_open)}
${line('Bài có 0 link ngữ cảnh/cụm trỏ vào', summary.article_inbound_ctx_cluster.zero, b?.article_inbound_ctx_cluster?.zero)}
${line('Trung vị link ngữ cảnh/cụm trỏ vào mỗi bài', summary.article_inbound_ctx_cluster.median, b?.article_inbound_ctx_cluster?.median)}
${line('URL có độ sâu click > 4', summary.depth.over4, b?.depth?.over4)}
${line('Độ sâu click lớn nhất', summary.depth.max, b?.depth?.max)}
${codes.map((c) => line(`${c} — ${label(c)}`, summary.issue_counts[c] ?? 0, b?.issue_counts?.[c] ?? 0)).join('\n')}

## Ưu tiên & trạng thái

| Priority | Số URL |
|---|---:|
| P0 — chặn crawl/index/truy cập | ${summary.by_priority.P0} |
| P1 — chuyển đổi/SEO tiềm năng cao | ${summary.by_priority.P1} |
| P2 — semantic/topical/chất lượng nội dung | ${summary.by_priority.P2} |

| Status | Ý nghĩa | Số URL |
|---|---|---:|
| DONE | Không còn vấn đề kỹ thuật lẫn nội dung | ${summary.by_status.DONE} |
| KEEP | Đã xem xét, giữ nguyên có chủ đích (bài > 2.000 từ — không cắt nội dung có giá trị) | ${summary.by_status.KEEP} |
| TECH-DONE | Title/meta/link/schema đã tối ưu; còn khoảng trống nội dung chờ review body (\`tools/seo-body-review.mjs\`) | ${summary.by_status['TECH-DONE']} |
| PLANNED | Còn vấn đề kỹ thuật chưa xử lý | ${summary.by_status.PLANNED} |

## Phân loại nội dung bài viết (KEEP / FIX / REVIEW / BLOCKED)

Độc lập với trạng thái kỹ thuật ở trên: đánh giá độ chính xác nội dung của ${summary.articles} bài, mỗi nhãn khác KEEP kèm bằng chứng ở cột \`Content Review Note\`.

| Nhãn | Ý nghĩa | Số bài |
|---|---|---:|
| KEEP | Không còn lỗi có bằng chứng; giữ nguyên, theo dõi Search Console | ${summary.by_review.KEEP} |
| FIX | Có lỗi nội dung đã xác minh, chờ sửa qua \`tools/seo-body-review.mjs\` (cờ \`content_flags\` còn mở) | ${summary.by_review.FIX} |
| REVIEW | Dẫn văn bản pháp luật chưa đối chiếu toàn văn, hoặc còn dữ kiện chưa có nguồn gốc (\`${REVIEW_FILE}\`) | ${summary.by_review.REVIEW} |
| BLOCKED | Chờ dữ liệu hoặc quyết định của chủ cửa hàng (\`${REVIEW_FILE}\`) | ${summary.by_review.BLOCKED} |

## Batch (20 URL/batch, thứ tự P0 → P1 → P2, trang chuyển đổi/hub/pillar trước)

Tổng ${batches.length} batch; ${openBatches.length} batch còn hạng mục chưa DONE (PLANNED/TECH-DONE/KEEP).

| Batch | URL | DONE | KEEP | TECH-DONE | PLANNED | Ví dụ |
|---|---:|---:|---:|---:|---:|---|
${batches.slice(0, 15).map((bt) => {
    const rs = rows.filter((r) => r.batch === bt);
    return `| ${bt} | ${rs.length} | ${rs.filter((r) => r.status === 'DONE').length} | ${rs.filter((r) => r.status === 'KEEP').length} | ${rs.filter((r) => r.status === 'TECH-DONE').length} | ${rs.filter((r) => r.status === 'PLANNED').length} | ${rs[0].url} |`;
  }).join('\n')}
| … | | | | | | xem CSV cột Batch |

## Định nghĩa mã vấn đề

| Mã | Mức | Vấn đề | Hành động |
|---|---|---|---|
${Object.entries({ ...ISSUES, ...GAPS }).map(([c, [p, l, a]]) => `| ${c} | ${p} | ${l} | ${a} |`).join('\n')}
`;
}

function renderClusterMap(rows, clusters) {
  const arts = rows.filter((r) => r.type === 'Bài viết');
  const sections = clusters.clusters.map((k) => {
    const rs = arts.filter((r) => r.cluster.startsWith(`${k.id} `));
    const pillars = rs.filter((r) => r.cannibal.startsWith('Pillar'));
    return `### ${k.id} — ${k.name}

- **Từ khóa đầu cụm:** ${k.head.join(' · ')}
- **Ý định:** ${k.intent}
- **Trang trụ cột (pillar):** \`${k.pillar}\`${k.support_pillar ? ` · pillar nội dung \`${k.support_pillar}\`` : ''}
- **Bài trong cụm:** ${rs.length} (${pillars.length} pillar họ chủ đề, ${rs.length - pillars.length} bài hỗ trợ)
${pillars.slice(0, 12).map((r) => `  - ${r.title} — \`${r.url.replace(SITE, '/')}\` (từ khóa: ${r.keyword})`).join('\n')}${pillars.length > 12 ? `\n  - … và ${pillars.length - 12} pillar khác (xem CSV, cột Topic Cluster)` : ''}`;
  }).join('\n\n');
  return `# Keyword Cluster Map — SEO tiếng Việt

> Sinh tự động bởi \`node tools/seo-master-audit.mjs\` từ \`data/seo/keyword-clusters.json\` + ma trận đã audit.
> **Chỉ SEO tiếng Việt**: các cụm tiếng Anh (motorbike rental Hanoi, Hanoi motorbike rental) bị loại khỏi phạm vi theo yêu cầu.

## Kiến trúc

\`\`\`
Trang chủ (thương mại + Agent, chuyển đổi) ─┬─ /gia-thue/ · /lien-he/ · /chinh-sach/   (trang chuyển đổi)
                               └─ /blog/ → 3 hub cụm → 6 hub danh mục → pillar họ chủ đề → bài hỗ trợ
Bài hỗ trợ ↔ pillar ↔ các bài cùng họ  (khối "Cùng chủ đề")
Bài ↔ bài gần nghĩa ngoài họ            (khối "Bài viết liên quan", cân bằng inbound)
\`\`\`

## Chiến lược cạnh tranh thương mại được chủ sở hữu cho phép

- **cho thuê xe máy ở Hà Nội** — trang chủ / (URL sở hữu intent chính).\n- **cho thuê xe máy Hà Nội / thuê xe máy Hà Nội** — biến thể cùng intent, không lập thêm landing giống nhau.\n- **giá thuê xe máy Hà Nội** — /gia-thue/.\n- **ứng dụng thuê xe máy** — /agent/ và bài app liên quan.\n- Các cụm dài hạn, xe 50cc, điện và địa phương: xem docs/seo/commercial/SEO-COMMERCIAL-TARGETS.csv.

Quyết định 29/10/2026: chủ sở hữu **không dành riêng từ khóa thương mại cho các domain khác**. MotoAI có quyền cạnh tranh, song vẫn cần tránh cannibalization **bên trong** repo (một search intent có một URL chủ lực). Ma trận cụ thể: docs/seo/commercial/README.md.

## Dữ liệu volume thật (không ước đoán)

${clusters.volume_evidence ? `Nguồn: ${clusters.volume_evidence.source} · lấy ngày ${clusters.volume_evidence.retrieved}. ${clusters.volume_evidence.note}

| Từ khóa | Volume/tháng | SD | Cụm / chủ sở hữu | Ghi chú |
|---|---:|---:|---|---|
${clusters.volume_evidence.rows.map((r) => `| ${r.keyword} | ${r.volume ?? '—'} | ${r.sd ?? '—'} | ${r.owner === 'sister-site' ? 'site chị em' : r.cluster} | ${r.note ?? ''} |`).join('\n')}

Kết luận: từ khóa thương mại Hà Nội (bao gồm head, giá, xe điện, xe dài hạn) đều đủ điều kiện triển khai trên MotoAI. Volume lịch sử từ bên thứ ba chỉ dùng để ưu tiên nghiên cứu, không chứng minh vị trí hiện tại. Xem ma trận thương mại 2.006 URL và xác minh bằng Google Search Console khi có kết nối.` : 'Chưa có dữ liệu volume.'}

## Dịch vụ cần kiểm chứng trước khi tối ưu thương mại

- **Xe 50cc, xe máy điện, xe đạp điện**: có trong \`data/business/pricing.json\` nhưng **chưa có giá xác minh** → chỉ viết nội dung thông tin, không hứa giá.
- **Xe điện VinFast**: chưa có xác minh dòng xe/hãng trong dữ liệu doanh nghiệp → **cần kiểm chứng**.
- **"Không cần bằng lái"**: là nhận định pháp lý (xe gắn máy dưới 50 cm³) → chỉ viết qua legal gate, đối chiếu văn bản gốc và ngày hiệu lực.
- **Giao xe tận nơi/khách sạn**: có (\`policies.delivery.available=true\`) nhưng phí/thời gian **xác nhận trước khi đặt**.

## Các cụm

${sections}
`;
}

// ---------- main ----------

export function runAudit(root = ROOT) {
  const c = crawl(root);
  const rows = analyze(c);
  const review = contentReview(root);
  for (const r of rows) r.review = review.get(r.article_id) ?? { status: 'KEEP', notes: [] };
  return { rows, clusters: c.clusters };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  // --root <dir>: audit another checkout (e.g. the pre-change commit for the
  // baseline snapshot); outputs are always written into THIS repository.
  const rootArg = process.argv.indexOf('--root');
  const { rows, clusters } = runAudit(rootArg > 0 ? process.argv[rootArg + 1] : ROOT);
  const write = (p, s) => { mkdirSync(dirname(join(ROOT, p)), { recursive: true }); writeFileSync(join(ROOT, p), s, 'utf8'); };
  if (process.argv.includes('--baseline')) {
    const fin = finalize(rows, null);
    write(BASELINE, JSON.stringify({
      $schema: 'motoai/seo-baseline@1',
      note: 'Baseline audit before the v70 SEO master changes. Codes: see docs/seo/seo-master-matrix.md.',
      summary: summarize(fin),
      issues: Object.fromEntries(fin.map((r) => [r.url, [...r.issues, ...r.gaps]])),
      titles: Object.fromEntries(fin.filter((r) => r.type === 'Bài viết').map((r) => [r.url, r.title]))
    }) + '\n');
    console.log(`baseline: ${fin.length} URLs -> ${BASELINE}`);
  } else {
    const baseline = existsSync(join(ROOT, BASELINE)) ? JSON.parse(readFileSync(join(ROOT, BASELINE), 'utf8')) : null;
    const fin = finalize(rows, baseline);
    const summary = summarize(fin);
    if (process.argv.includes('--check')) {
      console.log(JSON.stringify(summary, null, 2));
      if (summary.p0_open > 0) process.exitCode = 1;
    } else {
      const records = fin.map(toRecord);
      write(`${OUT_DIR}/seo-master-matrix.csv`, [COLUMNS.join(','), ...records.map((r) => COLUMNS.map((k) => csvCell(r[k])).join(','))].join('\n') + '\n');
      // One row per line: readable diffs between audit runs.
      write(`${OUT_DIR}/seo-master-matrix.json`, `{"$schema":"motoai/seo-master-matrix@1",\n"summary":${JSON.stringify(summary)},\n"columns":${JSON.stringify(COLUMNS)},\n"rows":[\n${records.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`);
      write(`${OUT_DIR}/seo-master-matrix.md`, renderMd(fin, summary, baseline));
      write(`${OUT_DIR}/keyword-cluster-map.md`, renderClusterMap(fin, clusters));
      console.log(JSON.stringify(summary, null, 2));
    }
  }
}
