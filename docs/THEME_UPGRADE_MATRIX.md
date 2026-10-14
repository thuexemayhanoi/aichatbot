# THEME UPGRADE MATRIX — Premium Publishing Theme (`theme/premium-upgrade`)

Checkpoint document for the content-site theme upgrade. Resume from the **Next steps from checkpoint** section at the bottom.

- Branch: `theme/premium-upgrade` (created from `origin/main` @ `521d13fe`; remote `main` keeps moving as the publisher runs — do not rebase mid-batch, see TH-900).
- Scope: `tools/app-shell.mjs`, `tools/build-blog.mjs`, `assets/css/*.css`, `assets/js/app-shell.js|blog.js|theme.js`, `index.html` cache-bust only, tests that pin shell contracts, regenerated output.
- Out of scope (owner mandate): `data/blog/**`, workflows, `docs/state/**`, `reports/**`, factory/writer/ops tools, `src/ai/**`, `data/business/**`, `config/seo-ownership.json`; URLs/slugs/canonicals/titles/meta/H1/heading structure/schema semantics/sitemap+robots contracts/NAP.
- Loop per batch: AUDIT → MATRIX → FIX → `node --test` → `node tools/build-blog.mjs` → `node tools/site-audit.mjs` → `node tools/seo-score.mjs` → responsive sanity (375/768/1280) → COMMIT → PUSH → matrix evidence.

## Audit summary (read-only pass, main HEAD `521d13fe`)

Hard budgets discovered (both enforced by CI):

| Budget | Where | Baseline | Headroom |
|---|---|---|---|
| Base JS (`src/**/*.js` + `assets/**/*.js` + `embed.js`) < 232,000 B | `.github/workflows/ci.yml` | 231,930 B | **70 B** — any JS feature must be paid for by trimming `app-shell.js` (comments + v60 console diagnostic ≈ 2.3 KB) |
| Total CSS (`style.css` + `blog.css`) < 64 KB | `tools/seo-score.mjs` `checkUxPerformance` | 64,298 B | **1,238 B** — duplicates in `blog.css` (base + glass layer re-declare the same surfaces) must be consolidated; budget raised with documented reason if still short (precedent: v62 bump) |
| ≤ 2 stylesheets in `<head>`, no webfonts/`@font-face`, no external script in `<head>` | `tools/seo-score.mjs` | OK | Keep system font stack; no third CSS file |
| Build output deterministic (`git diff --exit-code` on `blog/**`, sitemap, legal pages, matrix) | `ci.yml` | OK | Footer year must derive from data, never `Date.now()` |

Baseline measurements: `node tools/build-blog.mjs` = **78 s** for 1,704 articles (1,821 sitemap URLs); `node --test` green; `site-audit` pass; `seo-score` pass.

Findings (grouped; each maps to an item below):

1. **Tokens** — colours/radius/space/shadow live in `style.css :root`; glass tokens live separately on `body.content-page` in `blog.css`; no typography scale, no spacing above 20 px, no z-index scale, no measure token. `blog.css` has duplicate rule blocks (`.blog-article-body h2` ×2, `.blog-legal-grid` ×2, base card/summary/toc/footer rules fully overridden by the v61 glass layer).
2. **Contrast (WCAG 2.2 AA)** — dark mode `--color-primary: #7c7cf4` is used BOTH as text on dark surfaces (4.8:1 OK) and as the fill under white button text (`.screen-ask-btn`, `.blog-search button`, active chips, current page) → **3.6:1 fail**. Needs a separate fill token (`--color-primary-fill`) for filled controls.
3. **Header** — sticky and glass, but: no skip link; parent-hub dropdown is `<a aria-haspopup>` with `aria-expanded` set by JS on a link (invalid pattern); first tap on touch is swallowed to open the panel; the business status chip pops in after fetch on its own row on mobile → **CLS in the sticky header**; dropdown only lists 2 child categories (no subtopics, no featured content).
4. **Drawer** — accordion is ARIA-backed and Escape closes, but focus is not moved into the drawer on open nor returned on close, and Tab leaves the drawer while it is open (behind the backdrop).
5. **Footer** — has brand/hub columns/legal and a verified bottom bar, but no phone (NAP incomplete: name+address+hours only), no back-to-top, no copyright/year, no landmark hierarchy for the secondary row, columns collapse to `auto-fit 150px` without a mobile grid.
6. **Article page** — reading surface is good (clamp 16.6–18 px, lh 1.78) but: H1 is 1.45 rem (small for a publishing page); byline is a plain `<p>` with ISO date (no `<time>`, no author block); related = 5 cards chosen by an **O(n²)-per-article scorer** (`published.find` inside the candidate loop → ~78 s build; at 10–40k articles this is hours) and the scorer derives subtopics from manifest fields (slug only) while hubs use matrix rows → inconsistent "same subtopic" matching; no prev/next; TOC exists (mobile `<details>` + desktop sticky rail) but has no current-section state and no reading progress.
7. **Hubs / home** — card grid is fine but cards lack a date/meta line; pagination renders **every** page number (`thue-xe` = 15 links; 40k scale → hundreds of links per page); hub pages render `hub.desc` and `hub.intro` as two identical-looking `.blog-screen-lead` paragraphs.
8. **404 / search** — no `404.html` (GitHub Pages serves a default page without the shell); search lives on `/blog/#blog-search`, `blog.js` fetches `search-index.json` **relatively** (breaks from any other path), result list has no heading/status region and the empty state has no way forward.
9. **CWV** — no webfonts (system stack) → `font-display` N/A; article bodies contain **zero** `<img>/<table>/<figure>/<iframe>` (grep over 1,704 bodies) → `loading="lazy"` N/A today (rule added defensively in the builder for future images); long pages (hub grids, footer, related) have no `content-visibility`; header status row causes CLS (see 3).
10. **Mobile/iPhone** — safe-area insets present on header/main/footer; chips rail scrolls horizontally; breadcrumb can overflow at 375 px with long titles (wraps, OK but dense); tap targets ≥ 44 px on controls, but footer links are 44 px tall with 2 px gaps (OK) and TOC links are text-only (no min-height).
11. **Tests** — shell contracts are regex-pinned (`tests/unit/blog-app-ux`, `blog-hub-nav`, `content-scroll`, `global-menu`, `blog-app-foundation`, `seo-hub-architecture`, `ui-tokens`, `ui-brand`). Notable pins: `.site-nav-drop` must not contain nested `<div>` before child links; `:focus-within`/`.open` open rules; `[hidden]{display:none !important}`; footer link set identical on every page and ≤ 22 links; `html[data-motoai-theme="dark"]` must be the last such selector in `style.css`.

## Items

Legend — Status: `TODO` · `DOING` · `DONE` · `N/A (evidence)` · `DEFERRED`. Risk: L/M/H (regression risk for CI/SEO contracts).

### P0 — batch A: tokens, typography, dark mode

| ID | Area | Problem | Fix | Files | Risk | Status | Evidence |
|---|---|---|---|---|---|---|---|
| TH-001 | Tokens | No typography/spacing/z-index/measure scale; glass tokens split from the main token block | One `:root` block (colour, fill, text scale `--text-*`, leading, `--space-1..8`, radius, shadow, motion, `--z-*`, `--measure`, `--glass-*`) + one dark block in `style.css`; `blog.css` only consumes tokens | `assets/css/style.css`, `assets/css/blog.css` | M (ui-tokens test: dark block must stay the last `html[data-motoai-theme="dark"]` in style.css) | DONE | batch A. `style.css` `:root` (L8–98) + single dark block (L100); every `var(--*)` in `blog.css` is defined in `style.css` (comm diff = 0 missing); `html[data-motoai-theme="dark"]` occurs once in `style.css`; `.visually-hidden` (used by the price-table caption, never styled before) added |
| TH-002 | A11y contrast | White text on dark-mode primary fill = 3.6:1 | `--color-primary-fill` (light `#4f46e5`, dark `#5a56e0` → 5.5:1 with white); all filled controls on content pages use it; content-page override for `.motoai-menu` | `style.css`, `blog.css` | L | DONE | batch A. Fill token consumed by `.screen-ask-btn`, `.blog-search button`, `.blog-chip[aria-current]`, `.blog-page-current`, `body.content-page .motoai-menu` (chat home keeps the test-pinned `--color-primary` rule, TH-200) |
| TH-003 | Cache | CSS/JS change must bust iOS Safari caches | `BUILD_VERSION` v66→v67, `?v=` templated from it; `index.html` + `service-worker.js` bumped in lockstep | `tools/app-shell.mjs`, `index.html`, `service-worker.js`, `package.json` | L | DONE | batch A. `?v=${V}` derived from `BUILD_VERSION`; 1,814 generated pages carry `v67`. Lockstep gap found: `tests/unit/pwa.test.js` derives the SW version from `package.json` major → `package.json` 66.0.0→67.0.0 is part of every bump |
| TH-004 | CSS budget | `blog.css` duplicates (base vs glass layer) | Consolidate to one rule per surface; keep regex-pinned contract blocks verbatim; raise `seo-score` CSS budget only if still needed, with reason | `blog.css`, `tools/seo-score.mjs` | M | DONE | batch A. `blog.css` 35,882 → 27,053 B; total CSS 64,298 → 57,808 B (budget 65,536 unchanged, headroom 7.7 KB); contract regexes (v60 scroll, v61 glass, v63 header) verified by `node --test` |

### P0 — batch B: sticky header, accessible mega menu, drawer

| ID | Area | Problem | Fix | Files | Risk | Status | Evidence |
|---|---|---|---|---|---|---|---|
| TH-010 | Header | No skip link; status chip CLS; `aria-haspopup` on a plain link | Skip link → `#site-main` (`tabindex="-1"`); status rendered inside a reserved `.site-status-slot` (no layout shift on mobile or desktop); drop `aria-haspopup` | `tools/app-shell.mjs`, `blog.css` | M (content-scroll regexes on status rules) | DONE | batch B. Skip link is the first `<body>` child on all 1,821 pages; `<main tabindex="-1">`; status in `.site-status-slot` (mobile: fixed 18 px row; 768–899 + ≥1280: `flex: 0 1 176px` with ellipsis, so the chip's arrival never moves anything); `aria-haspopup` removed. Pinned by `tests/unit/theme-premium.test.js` |
| TH-011 | Mega menu | Dropdown = 2 links, hover-first, touch swallows first tap | APG "disclosure navigation with top-level links": parent `<a>` navigates, sibling `<button aria-expanded aria-controls>` toggles; CSS hover/focus-within still open; Escape closes + refocuses; outside click closes; panel = per child category column (label + up to 4 subtopic hubs with ≥1 article) + "Bài mới" column (3 newest cluster articles); model computed once per build (`setBuildContext`) | `tools/app-shell.mjs`, `tools/build-blog.mjs`, `assets/js/app-shell.js`, `blog.css` | M (blog-hub-nav regexes; no nested `<div>` inside `.site-nav-drop`) | DONE | batch B. Panel = `<ul class="site-mega">` per cluster, one column per child category: category link, ≤3 subtopic hubs with ≥1 article (same rule that generates subtopic pages → no empty/fake links), 2 **cornerstone** guides (first published per category — chosen over "newest" because newest would rewrite the header of every page on every publish: 1.8k-file diffs today, 40k at target scale). Panel anchored to `.site-header-inner` and centred (`width: min(720px,100%)`) → cannot overflow at 900 px; `::before` bridges the hover gap. `aria-expanded` mirrors computed visibility (correct on iOS where buttons do not take focus). Narrow desktop 900–1099: hub emoji, Menu label and header search icon drop (search stays in the drawer); width measured with DejaVu Sans/Inter metrics ≈ 824/868 px worst case. Model built once per build (`setBuildContext`), panels cached per cluster+active hub. `seo-score` prose heuristics now read `<main>` only (menu labels like "Đặt Cọc" are chrome) — score unchanged 99.5, 623 notes |
| TH-012 | Drawer | No focus management | Focus close button on open, return focus to Menu on close, Tab wraps inside the open drawer | `assets/js/app-shell.js` | L | DONE | batch B. `setDrawer` moves focus (close ↔ Menu); Tab/Shift+Tab wrap over visible focusables; Escape/backdrop/link close |
| TH-013 | JS budget | 70 B headroom | Rewrite `app-shell.js` compactly (drop v60 console diagnostic, terse comments); measure after every batch | `assets/js/app-shell.js` | L | DONE | batch B. Base JS 231,930 → 231,702 B (headroom 298 B) despite the new focus trap + mega-menu sync |

### P0 — batch C: mega footer

| ID | Area | Problem | Fix | Files | Risk | Status | Evidence |
|---|---|---|---|---|---|---|---|
| TH-020 | Footer | Incomplete NAP, no back-to-top, no year, weak column grid | Brand block + verified NAP (name, address, phone via `data-contact-ref="call"` resolved at runtime, hours) + hub columns + Dịch vụ/Pháp lý + back-to-top + `© <year>` where year = newest `published_date` year (deterministic; `2026–YYYY` when it advances); 2-col mobile / 4-col desktop grid | `tools/app-shell.mjs`, `tools/build-blog.mjs`, `blog.css` | M (footer link set must stay identical on every page and ≤ 22 links; no hard-coded contact hrefs) | TODO | |

### P0 — batch D: article page

| ID | Area | Problem | Fix | Files | Risk | Status | Evidence |
|---|---|---|---|---|---|---|---|
| TH-030 | Article typography | H1 small; measure not tokenised | Article H1 `clamp(1.6rem…2.2rem)`, body column `max-width: var(--measure)` (72ch ≈ 65–75ch), heading rhythm, list/blockquote polish | `blog.css` | L | TODO | |
| TH-031 | TOC | No current-section state; links not 44 px | Scrollspy via `IntersectionObserver` (tiny) sets `aria-current="location"`; 44 px rows; sticky offset below header | `assets/js/app-shell.js`, `blog.css` | L | TODO | |
| TH-032 | Reading progress | None | 3 px bar under the sticky header driven by scroll (passive listener, rAF-throttled, `prefers-reduced-motion` safe) | `tools/app-shell.mjs`, `app-shell.js`, `blog.css` | L | TODO | |
| TH-033 | Author/date | Plain byline, ISO date | `.blog-meta` block: avatar initial, author, `<time datetime>` localised `dd/mm/yyyy`, category, reading time | `tools/build-blog.mjs`, `blog.css` | L (H1/title/schema untouched) | TODO | |
| TH-034 | Related | O(n²)/article; subtopic mismatch | Precompute subtopic per article from matrix rows once; buckets per subtopic/category/cluster; deterministic ring selection (next N after self, cyclic) → 4 cards; O(n) total | `tools/build-blog.mjs` | M (changes related sets on all articles — allowed) | TODO | |
| TH-035 | Prev/next | None | `<nav class="blog-prevnext">` within the same category by manifest order (older / newer) | `tools/build-blog.mjs`, `blog.css` | L | TODO | |

### P0 — batch E: hub/home cards + pagination

| ID | Area | Problem | Fix | Files | Risk | Status | Evidence |
|---|---|---|---|---|---|---|---|
| TH-040 | Cards | No meta line, no clamping | Card: category tag, title (3-line clamp), excerpt (3-line clamp), `<time>` date; consistent hover/focus; 1/2/3 columns at 375/768/1280 | `tools/build-blog.mjs`, `blog.css` | L | TODO | |
| TH-041 | Pagination | Every page number rendered | Windowed pagination: first, last, current ±2, ellipses, prev/next; 44 px targets | `tools/build-blog.mjs`, `blog.css` | L (test only checks presence) | TODO | |
| TH-042 | Hub head | `desc` + `intro` both rendered as leads | `intro` becomes a distinct `.blog-screen-intro` paragraph | `tools/build-blog.mjs`, `blog.css` | L | TODO | |

### P0 — batch F: 404 + search

| ID | Area | Problem | Fix | Files | Risk | Status | Evidence |
|---|---|---|---|---|---|---|---|
| TH-050 | 404 | No branded 404 | Build `404.html` (root, absolute asset URLs, `noindex`, no canonical): H1, explanation, search box, 6 category cards, Ask Agent | `tools/build-blog.mjs`, `tools/app-shell.mjs` | L (not audited/sitemapped by design) | TODO | |
| TH-051 | Search | Relative index fetch; weak results UI | `blog.js` fetches `/blog/search-index.json`; results get a heading + `role="status"` count, richer empty state with hub links | `assets/js/blog.js`, `tools/build-blog.mjs`, `blog.css` | L | TODO | |

### P0 — batch G: CWV

| ID | Area | Problem | Fix | Files | Risk | Status | Evidence |
|---|---|---|---|---|---|---|---|
| TH-060 | Rendering | Long pages fully laid out | `content-visibility: auto` + `contain-intrinsic-size` on footer, related, prev/next, hub grids below the first | `blog.css` | L | TODO | |
| TH-061 | CLS | Status chip pops in | Covered by TH-010 reserved slot | — | — | DONE | batch B (TH-010) |
| TH-062 | Fonts | — | System font stack, no `@font-face` → `font-display` not applicable (seo-score forbids webfonts) | — | — | N/A (evidence: `seo-score.mjs` `external webfont / font-face risk` check; `style.css` `font-family: system-ui…`) | |
| TH-063 | Images | — | 1,704 bodies contain 0 `<img>`; builder adds `loading="lazy" decoding="async"` to any future body image lacking it | `tools/build-blog.mjs` | L | TODO | |
| TH-064 | Build time | 78 s, superlinear | Covered by TH-034; re-benchmark | — | — | TODO | |

### P1

| ID | Area | Problem | Fix | Files | Risk | Status |
|---|---|---|---|---|---|---|
| TH-100 | Print | No print styles | `@media print`: hide chrome, show URLs | `blog.css` | L | TODO |
| TH-101 | Forced colours | No `forced-colors` handling for custom chips/progress | `@media (forced-colors: active)` outlines | `blog.css` | L | TODO |
| TH-102 | Breadcrumb | Dense wrap at 375 px | Single-line scrollable rail with fade, `aria-current` on last crumb | `build-blog.mjs`, `blog.css` | L | TODO |
| TH-103 | Hub cards | Category cards show no counts | Add article count per category (deterministic) | `build-blog.mjs` | L | TODO |
| TH-104 | Home | Hero/search block could be more editorial | Two-column intro (lead + search) on ≥ 1024 | `build-blog.mjs`, `blog.css` | L | TODO |
| TH-105 | Drawer | Group headers could show counts/icons | Presentational only | `app-shell.mjs` | L | TODO |

### P2

| ID | Area | Problem | Fix | Risk | Status |
|---|---|---|---|---|---|
| TH-200 | Chat home | `.motoai-menu` white-on-`#7c7cf4` in dark mode (3.6:1) — rule is test-pinned to `var(--color-primary)` | Needs test contract change (owner decision) | M | DEFERRED |
| TH-201 | OG image | Single 512 px icon for every page | 1200×630 brand image (asset needed from owner) | L | DEFERRED |
| TH-202 | Search URL | Search has no own URL | `/tim-kiem/` page would be a new indexable URL — owner decision | M | DEFERRED |

### P3

| ID | Area | Idea |
|---|---|---|
| TH-300 | View transitions | `@view-transition { navigation: auto }` for same-origin MPA fades (progressive) |
| TH-301 | Author pages | Only if more than one author exists in the manifest |
| TH-302 | RSS | `feed.xml` from the newest 50 articles (contract change: new root file) |

### Process / repo

| ID | Note |
|---|---|
| TH-900 | `origin/main` moved ahead while working (8 commits at audit, 30 at batch B; publisher). **Output must be regenerated after merging `main`.** Merge guidance: merge `main` into this branch, take `main`'s `data/blog/**`, then re-run `node tools/build-blog.mjs` and commit the regenerated output — never hand-resolve `blog/**` conflicts. |

## Batch log

| Batch | Commit | Tests | Build | site-audit | seo-score | Notes |
|---|---|---|---|---|---|---|
| matrix | `3b7c0cc6` | — | — | — | — | audit only |
| A (TH-001..004) | `934faa9b` | `node --test` 1003/1003 pass (238 s) | 75 s wall, 1,704 articles, 32 subtopic hubs, 1,821 sitemap URLs; `data/blog/**` unchanged | 174,480 internal URLs, 0 broken, 0 issues | 99.5/100 (623 pre-existing per-page notes, UX 10/10) | CSS 57,808 B / 65,536; JS 231,930 B / 232,000 (unchanged). Found + fixed: `package.json` major must track `BUILD_VERSION` (`pwa.test.js`) |

| B (TH-010..013, TH-061) | (SHA recorded in the batch-C commit) | `node --test` 1008/1008 pass (incl. new `tests/unit/theme-premium.test.js`) | 78 s wall, 1,704 articles, 32 subtopic hubs, 1,821 sitemap URLs; second build = byte-identical (determinism) | pass, 223,620 internal URLs checked (menu adds links), 0 broken | 99.5/100, 623 notes (unchanged), UX 10/10 | CSS 60,906 B / 65,536; JS 231,702 B / 232,000. Also: `tools/__pycache__/*.pyc` untracked + `__pycache__/`, `*.pyc` in `.gitignore`. `origin/main` is 30 commits ahead — not merged (TH-900) |

## Next steps from checkpoint

1. Batches A, B done → next C (TH-020), then D, E, F, G in order.
2. After each batch: run the loop, record commit SHA + results in **Batch log**, flip item status with evidence.
3. If the JS guard or CSS budget blocks a batch, trim first (TH-013 / TH-004), bump only with a documented reason.
4. Every `BUILD_VERSION` bump = 4 files in lockstep: `tools/app-shell.mjs`, `index.html`, `service-worker.js`, `package.json` (major).
