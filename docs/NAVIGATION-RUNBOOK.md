# MotoAI complete navigation — maintenance contract

The Agent app (`/agent/`), the homepage `/` and every generated blog/content page share the same menu tree (v76: the full-screen chat moved from `/` to `/agent/`; `/` is a content page).

## Single sources
- `config/navigation.json`: short 2–3-word customer labels, four drawer groups, icon vocabulary and contact intents
- `config/site-pages.json`: every real static Page; the renderer automatically includes non-legal pages in **Trang Web** and legal pages stay in **Pháp Lý**
- `data/blog/taxonomy.json`: parent cluster -> canonical category -> subtopic hierarchy; do not change IDs, slugs or URLs merely to shorten menu labels
- `data/blog/published.json` and the matrix: during a build only subtopic hubs with actually published articles become links; empty topics are not linked

## Runtime
- `tools/taxonomy.mjs` resolves the normalized menu tree
- `tools/menu-drawer.mjs` renders the identical chat and content drawers; `tools/agent-page.mjs` writes the chat drawer into `agent/index.html` (generated from `data/site/agent.html.tpl`) on rebuild; the homepage `index.html` uses the content drawer like every content page
- `tools/app-shell.mjs` renders content drawer plus scrollable desktop dropdowns
- `tools/build-blog.mjs` rebuilds menu across all pages deterministically, with asset-hash cache busting
- `assets/css/style.css` and `assets/css/src/blog.css` support nested links, mobile safe area and light/dark

## QA / publisher
- `node tools/build-blog.mjs`, `node --test`, `node tools/site-audit.mjs`, `node tools/seo-score.mjs`
- The shared build stages the generated `index.html` and `agent/` in addition to its established generated surfaces; the article publisher stages `index.html` (latest/featured articles) — `agent/` does not depend on articles
- `tests/unit/menu-completeness.test.js` rejects missing Page/category/topic URLs, empty-topic destinations, long labels and app/blog divergence
- Preserve canonical, schema, article body, writer matrix and chatbot engine. Rollback by reverting the feature PR.

## Menu hierarchy
1. **Agent Hỗ Trợ** — root chatbot action
2. **Trang Web** — non-legal Page registry
3. **Cẩm nang** — three short parent hubs, six canonical categories and all currently nonempty topic hubs, plus Tìm Bài
4. **Dịch Vụ** — contact/address actions and verified call/WhatsApp/map
5. **Pháp Lý** — the three real legal pages

Parent and category links are normal `<a href>` elements; there is no invented route or artificial redirect. Existing blog/footer content and SEO headings keep their long editorial labels; only navigation chrome uses compact labels.
