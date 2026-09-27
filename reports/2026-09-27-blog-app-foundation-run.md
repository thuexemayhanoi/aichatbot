# Blog App Foundation Run — 2026-09-27 (v56)

Feature: BLOG-APP-FOUNDATION — parent/child taxonomy + premium app-like blog UX + shared footer + local Hanoi scale foundation.

## Pre-state (resumed, not restarted)

- START HEAD: b712eeb (v55.1). Last checkpoint COMPLETED, no active writer lock.
- Baseline `node --test`: 528/528 pass.
- content-matrix.csv: 2,000 rows (40×50), 2 PUBLISHED pilots (BA-0001, BA-0004), distribution APP350/RENT400/EV300/GUIDE300/SAFE250/LOCAL400 — untouched.

## Delivered

1. Taxonomy (Level 0–5): `data/blog/taxonomy.json` + `tools/taxonomy.mjs`.
   3 clusters (Ứng Dụng, Thuê Xe, Khám Phá) → 6 canonical categories (IDs unchanged) → subtopics → articles.
   Derived fields (parent_cluster, subtopic_code/label, hub_url) computed deterministically per matrix row; CSV schema and article IDs untouched.
2. Navigation source of truth: `config/navigation.json` — menu + footer share one vocabulary (short 1–2 word labels, one stable label per URL).
3. Menu (index.html drawer): Cẩm nang group now carries all six categories + Tìm Bài; Dịch vụ group carries price/address/contact/call/Zalo/WhatsApp/map; legal group; Xóa chat. IDs preserved for main.js wiring; dock "Liên hệ" opens the Dịch vụ group.
4. Shared footer: generated from navigation.json on blog home, 6 hubs, subtopic hubs, articles, privacy, terms. Chatbot homepage keeps NO footer inside the chat viewport (decision §75 recorded in docs/UI-UX.md).
5. Blog home: compact hero, search, 3 cluster cards, 6 category cards, published list, Agent CTA, footer.
6. Category hubs: honest intro, subtopic chips (only with published articles), crawlable pagination (24/page, real hrefs at blog/<cat>/page/N/), sibling category link, CollectionPage + BreadcrumbList.
7. Subtopic hubs: generated ONLY for subtopics with ≥ 1 published article (currently 1: blog/huong-dan/thu-tuc/). No empty hubs.
8. Articles: category/subtopic chips, dek, build-time TOC (Vietnamese-safe deduped anchors; mobile accordion, desktop sticky rail 230px + 720px content), related (same subtopic → same category), breadcrumb matching BreadcrumbList exactly, Agent CTA, footer.
9. Search index: + cluster/cluster_name/subtopic/subtopic_name/location fields (still compact, lazy).
10. Local Hanoi foundation: `data/local/hanoi.json` verified against Nghị quyết 1656/NQ-UBTVQH15 (effective 2025-07-01): 51 phường + 75 xã, no district level. LOCAL quality gate: published LOCAL content may only reference verified locality units; no fabricated branches.
11. seo-score.mjs: resolveHref now strips query strings (link audit fix); heading-hierarchy fix (footer titles are not H3).
12. Tests: new tests/unit/blog-app-foundation.test.js (24 tests). Updated ui-brand (drawer labels, 3 groups) and blog-app-ux (shell/list vs article classification). Docs updated: README v56 section, docs/BLOG.md, docs/UI-UX.md.

## Factory safety

- NO article generation. content-matrix.csv: 2,000 rows, 2 PUBLISHED, no ID/slug changed, no batch reset.
- No changes to blog-factory procedure, transaction model or lock state.

## Verification (all green before push)

- node --test: 552/552 pass.
- node tools/blog-factory.mjs validate: matrix OK (2000 rows, 40×50, distribution exact, unique ids/slugs/paths).
- node tools/seo-score.mjs: 100/100, 0 issues.
- node tools/build-blog.mjs: deterministic — 2 articles, 1 subtopic hub, 13 sitemap URLs; sitemap URLs all exist on disk, no duplicates.
- Static responsive review: layouts are pure CSS grid with 320px-safe minmax columns, touch targets ≥44px (chips/toggles/pagination), TOC accordion on mobile / sticky rail ≥1024px, article content capped at 720px on desktop, container ≤1180px. No framework added; no new runtime dependency; assets/js unchanged in behavior (blog.js untouched).

## Known deferred (REVIEW, no action)

- hanoi.json xã list holds 51 of 75 official communes (verified subset); complete before generating LOCAL content for the remaining communes.
- Matrix rows for LOCAL still carry legacy district labels in local_scope from the original generation; new LOCAL content must use the 2025 ward/commune units from data/local/hanoi.json (guard tested).
- Quick chips remain Agent actions only (unchanged, per §36).
