# SEO Audit + Optimize — Run Report (RUN 06:00)

**Run ID:** 2026-09-27-seo-run
**Baseline HEAD:** ff2ce41 (v54 Blog App UX Foundation — CI/Distribution/Pages all green before this run)
**Scope:** existing pages only — Agent root, blog home, 6 category hubs, 2 pilot articles, sitemap. NO mass article generation.

## Scoring tool

New `tools/seo-score.mjs` — deterministic, offline, no API keys, no network.
Audits the 13 indexable pages + robots.txt + sitemap.xml with concrete named checks and a weighted total:

| Group | Weight |
|---|---|
| Technical SEO | 25 |
| Content / On-page | 25 |
| Structured Data | 15 |
| Internal Linking | 10 |
| Crawl / Indexability | 10 |
| UX / Performance Structure | 10 |
| AI Search / GEO Readiness | 5 |

## Score: BEFORE 89.8/100 → AFTER 99.7/100 (DELTA +9.9)

| Group | Before | After |
|---|---|---|
| Technical SEO | 18.9/25 | 24.7/25 |
| Content / On-page | 24.1/25 | 25/25 |
| Structured Data | 13.4/15 | 15/15 |
| Internal Linking | 8.7/10 | 10/10 |
| Crawl / Indexability | 10/10 | 10/10 |
| UX / Performance Structure | 10/10 | 10/10 |
| AI Search / GEO Readiness | 4.7/5 | 5/5 |

Baseline caveat: the BEFORE run was scored on best-available remote copies; the fetch pipeline inserts occasional stray newlines in large files, so TECHNICAL/STRUCTURED before-scores may be under-reported by up to ~2 points. Every fix below was independently verified against the live site or the repo source, not only by the scorer. Full issue lists: `reports/seo-score-before.json`, `reports/seo-score-after.json`.

## Real bugs found and fixed (highest value)

1. **P1 — entire blog served unstyled on GitHub Pages.** Blog home used `assets/css/style.css` (resolves to `/aichatbot/blog/assets/...` = 404), hubs used `../assets/...` (404), articles used `../../assets/...` (404). Verified live: all three asset paths returned GitHub Pages 404 before the fix. Root cause: the old builder's `rel()` computed the wrong prefix for every depth. Fixed in `tools/build-blog.mjs` (`../` × directory depth) and all 9 blog pages regenerated.
2. **Sitemap regression guard.** The old builder's sitemap omitted `privacy/` and `terms/` (present in the committed sitemap only via a manual edit). Builder now emits them, so the next build cannot silently drop legal pages.

## Pages optimized (existing pages only)

- `index.html` (Agent root): title 71 → 62 chars (intent keywords kept, per `config/seo-ownership.json`); SEO copy now links the two pilot articles (internal links, no keyword stuffing).
- `blog/index.html`: correct stylesheet prefix; og:locale + og:site_name.
- 6 category hubs: correct stylesheet prefix; aria-current kept; honest intro paragraph added (no fake articles); meta descriptions brought into the 50–165 range (`dia-phuong` was 47 chars).
- 2 pilot articles: correct stylesheet prefix; "Bài viết liên quan" related-article section; og:locale + og:site_name; `thu-tuc-thue-xe-may` gained a "Câu hỏi thường gặp" Q&A section and a check-list for vehicle handover (all values still resolve from `business.json` via `{{ business.* }}` placeholders — the builder now also supports the `| vnd` filter form that previously never resolved).
- `published.json`: BA-0001 title shortened 77 → 62 chars (kept in sync across page, schema, cards, search index).
- Article bodies: cleaned prose typos; the app article no longer names "App Store / Google Play" (native-app wording rule).

## Deliberately NOT done

- No new articles (content matrix untouched: 2,000 rows, 2 PUBLISHED — enforced by tests).
- No edits to `privacy/` and `terms/` in the 06:00 run (og:locale was DEFERRED to the next run). **Update 2026-09-27 03:00 run: fixed** — `og:locale vi_VN` added to both pages (byte-exact edit, same format as other pages); `tools/seo-score.mjs` now returns **100/100, 0 issues**; matrix row SEO-008 → DONE.

## Tests

- New `tests/unit/seo-score.test.js` (3 tests): tool runs offline, deterministic, weights correct, floor ≥ 80, issues attributed.
- All blog shell/foundation contract assertions (from `blog-foundation.test.js` + `blog-app-ux.test.js`) were re-verified against every generated page before push: one H1, canonical, no-flash theme script, category bar + aria-current, hidden status chip, no template placeholders, no hard-coded contact values, Article + BreadcrumbList JSON-LD, sitemap/file consistency, homepage ownership rules.
- `data/blog/content-matrix.csv` was NOT modified (the local run suppressed the builder's CSV sync; the committed file stays untouched).

## CI / Distribution / Pages

- Initial push d5c62ba: CI + Distribution both FAILED at `node --test` — root cause: `tests/unit/seo-score.test.js` issue-attribution regex `^(index\.html|blog\/|privacy\/|terms\/|site): ` did not match the scorer's real attribution format `privacy/index.html: ...` (the `privacy\/` alternative demanded `: ` immediately after the prefix). The 2 remaining issues (privacy/terms og:locale) therefore failed the regex.
- Fix 07d5836 (`fix(test): seo-score issue-attribution regex must match real page paths`) — CI: SUCCESS, Distribution: SUCCESS.
- Commit check-runs on 07d5836: test=success, build=success (CI), build=success (Distribution), deploy=success, report-build-status=success.
- Pages live verification: root (`MotoAI — Ứng dụng thuê xe máy & xe điện`), blog home (`Cẩm nang thuê xe máy...`), all 6 hubs, both pilot articles serve the new build.
- P1 fix verified live: `https://thuexemayhanoi.github.io/aichatbot/assets/css/blog.css` returns the stylesheet (200); the old broken hrefs (`/blog/assets/css/blog.css`, `/blog/app/assets/css/blog.css`) return GitHub Pages 404 as expected.
- Final HEAD: 07d5836.

## Next recommendation

1. ~~Byte-exact edit of `privacy/` + `terms/` (og:locale)~~ DONE by the 2026-09-27 03:00 run (100/100).
2. Manual visual pass on mobile at 320px: blog now actually styled — check theme toggle, category bar, status chip.
3. Next production batch should come from the existing content matrix pipeline (per-article legal gate for SAFE rows).
