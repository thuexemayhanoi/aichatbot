# Apple-inspired Blog V2 — Design contract

Scope: **content/blog experience only** at `/blog/`, its hubs, topic clusters, articles, search results and other generated content screens. The conversation engine is not redesigned in this change. (v76: the chat app moved to `/agent/`; `/` is the V3 homepage — see `docs/HOMEPAGE-V3.md`.)

## Intent

Build a clean, premium, Apple-inspired editorial reading experience without copying Apple branding, assets, logos or interface components. The site remains **MotoAI / Nguyễn Tú** with its own identity.

- Generous whitespace, calm surfaces, balanced typography, clear information hierarchy.
- Light: soft porcelain `#f5f5f7`, white cards, charcoal text, deep blue actions.
- Dark: near-black `#08080a`, graphite cards, readable copy, accessible blue actions.
- System font stack first, with licensed self-hosted Vietnamese font as fallback.
- Card radii 18–28px, hairline borders, restrained shadows and hover motion.
- Larger title and comfortable article column; contextual recommendations and persistent topic breadcrumbs.
- Accessible tap targets, responsive cards, reduced motion, sticky reading TOC where supported.
- No heavy UI framework and no new external runtime dependencies.

## Single-source design

`assets/css/src/blog.css` is the editable source. `tools/css-build.mjs` generates `assets/css/blog.css` deterministically. Tokens are in `:root` and dark-mode token block; the V2 layer remains at the end to override legacy visual presentation while keeping behavioral layout contracts. `config/blog-ui.json` supplies theme colors and shared copy. `tools/app-shell.mjs` and `tools/build-blog.mjs` remain the canonical content renderers.

### Agent app `/agent/` (v74; moved from `/` in v76)

The Agent app page loads only `assets/css/style.css`, so the build copies the V2 tokens it needs from the TOKENS of `assets/css/src/blog.css` into the marked `@generated chat-tokens` block (`syncChatTokens` in `tools/css-build.mjs`, list `CHAT_TOKENS`). `tools/agent-page.mjs` generates `agent/index.html` from `data/site/agent.html.tpl` and writes the drawer (`renderDrawer` in `tools/menu-drawer.mjs`), the brand mark, the dock/send icons (`icon()` set in `tools/blog-components.mjs`), the light/dark `theme-color` from `config/blog-ui.json`, the build marker and the service-worker precache URLs into `agent/index.html`. Edit those sources, never the generated block or markup; `tests/unit/home-design-v2.test.js` fails on drift. The drawer, Menu button, brand mark, two-line menu glyph and (v77) the desktop menu `.site-nav` are one implementation in `style.css`, shared by the Agent app and every content page. Hover styles live only under `(hover: hover) and (pointer: fine)` so a tapped control never stays highlighted on iPhone.

## Non-negotiable preservation

Do **not** change or reset:
- `data/blog/content-matrix.csv`, `data/blog/published.json` or any `data/blog/articles/*.body.html`.
- Existing slugs, URLs, canonical links, schema, titles, H1, meta descriptions, Article and BreadcrumbList markup.
- `data/business/*.json` or prices/policies; chatbot business rule engine, NLU or storage.
- Writer/factory workflows or SEO quality gates.
- Embed, WordPress loader, PWA/Capacitor behavior unless a verified UI regression demands it.

## Branch build and QA

1. Stay on `design/apple-inspired-blog-v2`; never merge automatically.
2. Run `node tools/build-blog.mjs` then `node --test`, `node tools/site-audit.mjs` and `node tools/seo-score.mjs`.
3. Commit generated content HTML and CSS **only to the design branch**, not to `main`.
4. Compare a sample of all screen types on iPhone portrait/landscape, Android, tablet, desktop in both light/dark modes. Validate focus, contrast, screen reader labels, tap targets, search, long titles and article tables.
5. Check original and generated canonical/schema, route paths, article counts and manifest identity.
6. Approve the preview PR before merge. A normal `main` rebuild can be used after approval; avoid manually republishing individual article bodies.

## Rollback

The original blog remains intact on `main`. Revert the design PR or restore the pre-merge commit if visual QA or SEO checks regress; do not delete articles, reset matrices or redirect paths.

### CI sequencing note — 24 October 2026

The first PR CI run checked out the branch before the isolated branch-only generator committed refreshed HTML asset hashes and theme-color metadata. Its two initial failures were stale generated HTML assertions. The V2 branch generation job subsequently completed successfully and committed refreshed content pages. A new PR synchronization run must pass on the refreshed branch before merge; do not bypass these assertions or weaken QA.
