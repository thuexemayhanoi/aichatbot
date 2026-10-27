# MotoAI complete navigation — maintenance contract

The Agent app (`/agent/`), the homepage `/` and every generated blog/content page share the same menu tree (v76: the full-screen chat moved from `/` to `/agent/`; `/` is a content page).

## Single sources
- `config/navigation.json`: short 2–3-word customer labels, four drawer groups, icon vocabulary and contact intents
- `config/site-pages.json`: every real static Page; pages without `group` are **Trang Web**, pages with `"group": "legal"` are **Pháp Lý** (same registry, same order — there is no second legal list)
- `data/blog/taxonomy.json`: parent cluster -> canonical category -> subtopic hierarchy, and the category labels/URLs (`categoryNav()`; `navigation.json` `categories` only holds order + icon); do not change IDs, slugs or URLs merely to shorten menu labels
- The blog home ("Cẩm nang", `/blog/`) is the `cm` drawer group (`label` + `url`), read through `blogHome()` by the header, the search icon, the drawer's Tìm Bài link, the footer and the breadcrumb (visible + JSON-LD); it is the only key for that URL (`search` has none) and the builder writes that page at `blog/index.html`
- `data/blog/published.json` and the matrix: during a build only subtopic hubs with actually published articles become links; empty topics are not linked

## Runtime
- `tools/taxonomy.mjs` resolves the normalized menu tree
- `tools/app-shell.mjs` `siteNav()` is the ONE desktop menu (Cẩm nang + parent hubs › categories › live subtopics + Trang Web Pages): the website header renders it on every content page from 1200px and `tools/agent-page.mjs` renders it in the Agent header (plus Trang Chủ). On the Agent page it shows only on a real desktop — `(min-width: 1200px) and (min-height: 600px) and (hover: hover) and (pointer: fine)` — because that page loads no dropdown script: tablets, touch laptops and landscape phones keep the finger-sized sidebar with the same links, and the chat keeps its height; hidden in embed. Its CSS is one block in `assets/css/style.css`, shared by both shells
- `footerHtml()` resolves `config/navigation.json` `footer_groups`, which only REFERENCE drawer entries (home, agent, drawer groups) — the footer can no longer drift from the menu; breadcrumbs start at `navigation.home` and the "Cẩm nang" group
- `tools/menu-drawer.mjs` renders the identical chat and content sidebars (`contentLink()` is shared with the footer); `tools/agent-page.mjs` writes the chat sidebar into `agent/index.html` (generated from `data/site/agent.html.tpl`) on rebuild; the homepage `index.html` uses the content sidebar like every content page
- `tools/app-shell.mjs` renders the content sidebar plus scrollable desktop dropdowns
- v79 responsive navigation (the sidebar replaces the v78 bottom tab bar):
  - `tools/menu-drawer.mjs` renders the ONE sidebar (`#motoai-drawer`) from `drawerCore()` without a `hidden` attribute: Trang Chủ, Hỏi Agent, then the groups of `config/navigation.json` in order — Cẩm nang (hub › category › subtopic, nested accordions whose expand/collapse buttons are separate from the links, every level a real `<a href>`), Trang Web, Pháp Lý, Dịch Vụ — then the theme row. `"collapsed": true` on a group keeps it closed until opened (the group holding the current page always opens; the current category's subtopics open). Labels (`Danh mục`, `Mở danh mục`, `Đóng danh mục`, `Thu gọn danh mục`, `Mở rộng {name}`, `Thu gọn {name}`) live in `config/blog-ui.json` → `labels`; glyphs in `config/navigation.json` → `svg_icons` (top level, groups, hubs).
  - `menuButton()` in `tools/app-shell.mjs` is the ONE ☰ Danh mục control, first in the content-site header and first in the Agent header (`data/site/agent.html.tpl` marker), visible on every device; the label hides below 360px. From 360 to 380px the content header drops the brand wordmark (the link keeps its aria-label) so ☰ Danh mục, the mark and the actions stay on one row.
  - Phones (< 768px): the sidebar slides in from the LEFT, 85vw up to 340px. Tablets (768–1199px): 320–380px. The Agent app always uses this overlay so the chat column keeps its width. Open = `.is-open` on the panel and backdrop (`assets/css/style.css`); closed = translated off screen and `visibility: hidden`.
  - Every content page is emitted in reading order: skip link (`Bỏ qua đến nội dung chính`, `labels.skipToContent`), header, sidebar, banner, `<main>`, footer (`appShellPage()`), so the desktop column is the first Tab stop after the header.
  - Desktop content pages (>= 1200px): `body.content-page` becomes a grid (`"header header" "banner banner" "sidebar main" "sidebar footer"`, `assets/css/src/blog.css`); the same element is a sticky in-flow column (`--sidebar-w`) that runs down beside the footer, so it never covers footer links. The header tagline and live status show from 1440px. ☰ and ✕ collapse it (`html[data-motoai-sidebar="closed"]`, saved in `localStorage` and restored by the head script before first paint). Between 1200 and 1399px an article keeps one reading column (mobile TOC) while the sidebar is open; from 1400px the TOC rail returns.
  - `assets/js/drawer.js` is the ONE controller for both shells (`app-shell.js`, `main.js`): overlay open/close (☰, ✕, backdrop, Escape, any link — items close in the capture phase, before their own handler), scroll lock of the document (`html.drawer-lock` + inline top offset, restored on close; position only, so the sticky header stays in view), the rest of the page `inert` while the overlay is open, focus to ✕ on open and back to ☰ on every close (also when the panel disappears on a resize), Tab stepped through the panel items while open, the reading line kept in place when the desktop column collapses or expands, independent accordions (`.motoai-toggle`: aria-expanded + hidden + relabel from the `<nav>` templates), the desktop collapse state, and the breakpoint change between the two modes.
  - The desktop menu (`siteNav()`) shows from 1200px on content pages (icons from 1360px) and on the Agent page only on a real desktop (`(min-width: 1200px) and (min-height: 600px) and (hover: hover) and (pointer: fine)`).
  - The footer keeps every link. Below 900px its groups stay rounded cards, two per row.
- `tools/build-blog.mjs` rebuilds menu across all pages deterministically, with asset-hash cache busting
- `assets/css/style.css` (panel, rows, accordions — both shells) and `assets/css/src/blog.css` (desktop grid, scroll lock, header) support nested links, mobile safe area and light/dark

## QA / publisher
- `node tools/build-blog.mjs`, `node --test`, `node tools/site-audit.mjs`, `node tools/seo-score.mjs`
- The shared build stages the generated `index.html` and `agent/` in addition to its established generated surfaces; the article publisher stages `index.html` (latest/featured articles) — `agent/` does not depend on articles
- `tests/unit/nav-sync-v3.test.js` compares the desktop menu, drawer groups, footer and breadcrumb root across every page group (homepage, blog, hubs, subtopics, articles, Pages, Agent) and checks the current CSS hash in pages + service worker
- `tests/unit/menu-completeness.test.js` rejects missing Page/category/topic URLs, empty-topic destinations, long labels and app/blog divergence
- `tests/unit/nav-responsive-v2.test.js` checks the sidebar: identical markup from the one renderer on 2.000+ pages and the Agent app, ☰ Danh mục first in both headers, the three accordion levels with independent controls, every taxonomy URL present and linked, no tab bar, the CSS for the three modes (left panel, tablet width, desktop grid + collapse), the drawer.js contract and the label source
- Preserve canonical, schema, article body, writer matrix and chatbot engine. Rollback by reverting the feature PR.

## Menu hierarchy
1. **Trang Chủ** — the site homepage
2. **Hỏi Agent** — the Agent app (in the app: the in-app Agent toggle)
3. **Cẩm nang** — three short parent hubs, six canonical categories and all currently nonempty topic hubs (nested accordions), plus Tìm Bài
4. **Trang Web** — non-legal Page registry (Giới Thiệu, Liên Hệ, Giá Thuê, Đối Tác)
5. **Pháp Lý** — the three real legal pages (collapsed until opened)
6. **Dịch Vụ** — contact/address actions and verified call/WhatsApp/map (collapsed until opened)
7. **Chủ đề** — the theme toggle (Auto / Sáng / Tối)

Parent and category links are normal `<a href>` elements; there is no invented route or artificial redirect. Existing blog/footer content and SEO headings keep their long editorial labels; only navigation chrome uses compact labels.
