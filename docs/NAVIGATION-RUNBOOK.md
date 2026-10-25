# MotoAI complete navigation — maintenance contract

The Agent app (`/agent/`), the homepage `/` and every generated blog/content page share the same menu tree (v76: the full-screen chat moved from `/` to `/agent/`; `/` is a content page).

## Single sources
- `config/navigation.json`: short 2–3-word customer labels, four drawer groups, icon vocabulary and contact intents
- `config/site-pages.json`: every real static Page; pages without `group` are **Trang Web**, pages with `"group": "legal"` are **Pháp Lý** (same registry, same order — there is no second legal list)
- `data/blog/taxonomy.json`: parent cluster -> canonical category -> subtopic hierarchy, and the category labels/URLs (`categoryNav()`; `navigation.json` `categories` only holds order + icon); do not change IDs, slugs or URLs merely to shorten menu labels
- The blog home ("Cẩm nang", `/blog/`) is the `cm` drawer group (`label` + `url`), read through `blogHome()` by the header, footer, search link and breadcrumb (visible + JSON-LD)
- `data/blog/published.json` and the matrix: during a build only subtopic hubs with actually published articles become links; empty topics are not linked

## Runtime
- `tools/taxonomy.mjs` resolves the normalized menu tree
- `tools/app-shell.mjs` `siteNav()` is the ONE desktop menu (Cẩm nang + parent hubs › categories › live subtopics + Trang Web Pages): the website header renders it on every content page and `tools/agent-page.mjs` renders it in the Agent header (plus Trang Chủ). On the Agent page it shows only on a real desktop — `(min-width: 900px) and (min-height: 600px) and (hover: hover) and (pointer: fine)` — because that page loads no dropdown script: tablets, touch laptops and landscape phones keep the finger-sized drawer with the same links, and the chat keeps its height; hidden in embed. Its CSS is one block in `assets/css/style.css`, shared by both shells
- `footerHtml()` resolves `config/navigation.json` `footer_groups`, which only REFERENCE drawer entries (home, agent, drawer groups) — the footer can no longer drift from the menu; breadcrumbs start at `navigation.home` and the "Cẩm nang" group
- `tools/menu-drawer.mjs` renders the identical chat and content drawers (`contentLink()` is shared with the footer); `tools/agent-page.mjs` writes the chat drawer into `agent/index.html` (generated from `data/site/agent.html.tpl`) on rebuild; the homepage `index.html` uses the content drawer like every content page
- `tools/app-shell.mjs` renders content drawer plus scrollable desktop dropdowns
- `tools/build-blog.mjs` rebuilds menu across all pages deterministically, with asset-hash cache busting
- `assets/css/style.css` and `assets/css/src/blog.css` support nested links, mobile safe area and light/dark

## QA / publisher
- `node tools/build-blog.mjs`, `node --test`, `node tools/site-audit.mjs`, `node tools/seo-score.mjs`
- The shared build stages the generated `index.html` and `agent/` in addition to its established generated surfaces; the article publisher stages `index.html` (latest/featured articles) — `agent/` does not depend on articles
- `tests/unit/nav-sync-v3.test.js` compares the desktop menu, drawer groups, footer and breadcrumb root across every page group (homepage, blog, hubs, subtopics, articles, Pages, Agent) and checks the current CSS hash in pages + service worker
- `tests/unit/menu-completeness.test.js` rejects missing Page/category/topic URLs, empty-topic destinations, long labels and app/blog divergence
- Preserve canonical, schema, article body, writer matrix and chatbot engine. Rollback by reverting the feature PR.

## Menu hierarchy
1. **Agent Hỗ Trợ** — root chatbot action
2. **Trang Web** — non-legal Page registry
3. **Cẩm nang** — three short parent hubs, six canonical categories and all currently nonempty topic hubs, plus Tìm Bài
4. **Dịch Vụ** — contact/address actions and verified call/WhatsApp/map
5. **Pháp Lý** — the three real legal pages

Parent and category links are normal `<a href>` elements; there is no invented route or artificial redirect. Existing blog/footer content and SEO headings keep their long editorial labels; only navigation chrome uses compact labels.
