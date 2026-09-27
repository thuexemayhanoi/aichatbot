# 2026-09-27 — v57 SINGLE APP SHELL (UI architecture correction)

## Problem
Content pages (category hubs, articles, legal) rendered as standalone blog-style
websites: separate "Cẩm nang" header, "← Agent" back link, a category-bar top nav,
a giant CTA box and a detached footer. Users felt they LEFT MotoAI.

## Decision
The chat app shell IS the whole website shell. URLs stay crawlable; every route
renders inside the SAME MotoAI chrome. Only the center content area changes:

- `/aichatbot/`            → chat (HOME screen, unchanged)
- `/aichatbot/blog/…`      → Cẩm nang / category / subtopic / article screens
- `/aichatbot/privacy|terms/` → legal screens

## Implementation
- `tools/app-shell.mjs` (NEW): ONE reusable app-shell source of truth —
  top chrome (Hỗ trợ Agent identity + address + status + theme + Menu),
  main viewport slot, 4-item bottom dock, shared drawer, compact SEO footer,
  native Ask Agent action. Consumed by the builder for every screen.
- `tools/build-blog.mjs`: rewritten to compose every page via `appShellPage()`;
  blog-back/blog-brand/blog-hero/CTA-box chrome removed; legal screens now
  generated from `data/legal/*.body.html` through the same shell.
- `assets/js/app-shell.js` (NEW): content-screen runtime (theme, drawer +
  accordion, verified open/closed status, runtime contact refs).
  `assets/js/blog-app.js` removed (blog.js stays, search-only).
- `assets/css/blog.css`: screen-body/screen-title/screen-lead/screen-ask styles;
  removed standalone `.blog-page/.blog-header/.blog-back/.blog-hero/.blog-cta`
  rules. Same tokens, radius, spacing, dark/light theme as the chat app.
- `assets/js/main.js`: `?ask=` prefills the composer (Ask Agent returns HOME);
  `?action=price|contact|address` runs the same deterministic flows as the
  dock/drawer buttons. Dock/menu on content screens deep-link with these params.
- Zalo removed from the entire customer surface: `business.json`, `navigation.json`,
  `faq.json`, drawer, chips, contact rule, retrievers, corpus, LLM grounding,
  NLU phrases, article bodies, privacy/terms. Phone kept; WhatsApp kept
  (still in canonical business data).

## Factory safety
- Matrix untouched: 2,000 rows, 2 published pilots, no articles generated.
- Sitemap/robots/schema/search-index contracts unchanged (13 URLs).
- Service-worker cache bumped v54 → v57 (stale shell invalidation).

## Tests
553/553 green (`node --test`). Shell contract tests rewritten to enforce the
single-app-shell spec and zero Zalo in public UI.
