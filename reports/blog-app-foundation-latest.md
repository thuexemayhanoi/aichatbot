# Blog App UX Foundation — Run Report (v54)

**Run ID:** 2026-09-26-blog-app-foundation
**Baseline HEAD:** cf24106 (`feat(ui+engine): v53 quick-tag bar fixed + fresh actions + flat bottom dock`)
**Final HEAD:** see "Final HEAD" below (after push)

## What was built

The Blog / Cẩm nang is now a content application that visually and technically belongs to the same product as the Agent — shared design tokens, verified business data, contact actions, accessibility and app-like UX. Agent root was NOT touched.

### Shell (BLOGUX-0001/0005/0006/0007)
- `blog/index.html` + 6 hubs (`app`, `thue-xe`, `xe-dien`, `huong-dan`, `an-toan`, `dia-phuong`) + 2 pilot articles regenerated with a shared compact app header: `← Agent` back link, `Cẩm nang` brand, theme toggle.
- Category bar: 6 items, one non-wrapping horizontal scroll row (`flex-wrap: nowrap`, `overflow-x: auto`), `aria-current="page"` on the active hub; breadcrumb on hubs and articles.
- Hubs without articles show an honest "Chưa có bài" empty state (no fake content, no doorway pages).

### Theme — Light / Dark / Auto (BLOGUX-0002/0003)
- New `assets/js/theme.js`: `resolveTheme` / `applyTheme` / `readPreference` / `initTheme`; preference in `localStorage('motoai-theme')`; applied via `<html data-motoai-theme="dark">` — the same attribute `style.css` already themes, so tokens are shared with the Agent.
- No-flash: tiny inline head script in every blog page applies saved/system dark theme before first paint.
- Toggle `#blog-theme-toggle` cycles Auto → ☀️ Light → 🌙 Dark; system-pref listener while in Auto.
- Theme on the Agent root: DEFERRED (matrix BLOGUX-0021) — Agent root contract and tests assume current behavior.

### Business open/closed status (BLOGUX-0004)
- New `assets/js/business-status.js`: `computeStatus` (pure) + `renderStatus`. Hours from `business.json` (`09:00–21:00`, `Asia/Ho_Chi_Minh`); time evaluated in the business timezone via `Intl.DateTimeFormat` (ICT = UTC+7, no DST); midnight-wrap windows (close ≤ open) handled; missing/invalid hours → chip hidden, never guessed.
- Verified boundaries: 02:00Z (09:00 ICT) = open; 01:59Z = closed; 14:00Z (21:00 ICT) = closed.

### Contact / conversion (BLOGUX-0009/0020)
- `.blog-contacts` CTA rows: ⚡ Hỏi Agent (primary) + Gọi / Zalo / WhatsApp / Bản đồ.
- hrefs resolved at runtime from `business.json` via `data-contact-ref` (`assets/js/blog-app.js`); `rel="noopener noreferrer"` + `target="_blank"` (except tel:). No hard-coded phone/Zalo/WhatsApp/Maps anywhere in blog runtime UI.

### Article fix (BLOGUX-0008)
- Critical content bug fixed: unrendered `{{ business.policies.deposit.min | vnd }}` placeholders in `thu-tuc-thue-xe-may` replaced with verified "2.000.000đ đến 5.000.000đ" (cross-checked against `business.json` `policies.deposit`).
- Both pilot articles got the app shell + runtime contact CTA. Article + BreadcrumbList JSON-LD preserved.

### Search (BLOGUX-0011)
- Existing `assets/js/blog.js` audited and kept as-is: lazy index load on first query, debounce, empty state, keyboard accessible.

### Version / cache (BLOGUX-0012)
- `service-worker.js` CORE_VERSION v53 → v54; `package.json` 53.0.0 → 54.0.0 (SW must match package major per `pwa.test.js`).

## Matrix

Canonical file: `docs/matrix/blog-app-ux-matrix.csv` (separate from the 2,000-row content matrix).
- Total rows: 24 (BLOGUX-0001..0024)
- DONE/VERIFIED: 20 (0001–0020)
- PLANNED (deferred, with rationale): 4 — Agent-root theme (0021), blog bottom dock (0022), reading progress (0023), full-system audit phase (0024 → v56)

## NO mass generation

`data/blog/content-matrix.csv` unchanged: 2,000 rows, only 2 pilot articles PUBLISHED. Enforced by new test.

## Tests

- New suite: `tests/unit/blog-app-ux.test.js` — 16 tests (theme, business status ICT boundaries + midnight wrap + invalid data, shell contract, category bar CSS contract, status chip hidden-by-default, no template placeholders, no hard-coded contact, data-contact-ref coverage, a11y CSS contracts, no-mass-generation guard).
- Full suite: **525/525 pass** (`node --test`), including all previous Agent regression (ui-brand, pwa, blog-foundation, distribution, etc.).

## Files changed

- `assets/js/theme.js` (new), `assets/js/business-status.js` (new), `assets/js/blog-app.js` (new)
- `assets/css/blog.css` (v54 block appended: header/status/categories/contacts, focus-visible, 40–44px touch targets)
- `blog/index.html`, `blog/{app,thue-xe,xe-dien,huong-dan,an-toan,dia-phuong}/index.html` (regenerated shell)
- `blog/app/app-thue-xe-may-la-gi/index.html`, `blog/huong-dan/thu-tuc-thue-xe-may/index.html` (shell + placeholder fix)
- `tests/unit/blog-app-ux.test.js` (new), `docs/matrix/blog-app-ux-matrix.csv` (new), `README.md` (BLOG APP UX FOUNDATION section)
- `service-worker.js` (v54), `package.json` (54.0.0)
- `reports/blog-app-foundation-latest.md` (this file), `docs/state/active-work.json` (checkpoint)

## CI / Distribution / Pages

Filled after push+deploy verification.

## Known risks / manual visual checks needed

- Theme flash behavior on real iOS Safari (inline script is correct, needs device eyes).
- Category bar horizontal scroll feel at 320px.
- Dark-mode contrast on a real device (both blog and shared tokens).
- Live status chip at ICT open/close boundary times.
- Static CSS tests are structural, not visual — responsive rules rely on the v49 device-class system and need a manual pass at 320/768/1440.
