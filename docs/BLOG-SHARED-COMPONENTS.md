# Blog shared presentation — "sửa 1 chỗ, toàn site đồng bộ" (v72)

Static blog: 2,000+ bodies in `data/blog/articles` + `data/blog/published.json`, rendered by `tools/build-blog.mjs`. Article bodies hold prose only; every piece of chrome, CTA, schema, icon and style comes from the shared sources below. Change one source, rebuild, and all generated pages follow. Never edit generated HTML or a single article for a site-wide change.

## Where to change what

| Muốn đổi | Sửa đúng 1 nơi | Ghi chú |
|---|---|---|
| Màu, font, cỡ chữ, khoảng cách, bo góc, bóng, tốc độ motion | `assets/css/src/blog.css` → khối **TOKENS** (`:root` + `html[data-motoai-theme="dark"]`) | Test chặn mã màu nằm ngoài khối token |
| Kiểu nhãn, link gạch chân, nút pill, số tabular | `assets/css/src/blog.css` → khối **TRAITS** | Mỗi đặc điểm định nghĩa một lần |
| Tên site, tagline, kicker, theme-color, ảnh OG | `config/blog-ui.json` → `site` | Dùng cho `<head>`, header, footer, schema WebSite/Article |
| Bật/tắt mục lục, tóm tắt, bài liên quan, cùng chủ đề, ngữ cảnh chủ đề, contact band, thanh tiến độ đọc, motion | `config/blog-ui.json` → `features` | Thiếu cờ = bật (không bao giờ ẩn nhầm UI) |
| CTA cuối trang (tiêu đề, câu chữ, nút gọi) và nút ngữ cảnh theo chuyên mục | `config/blog-ui.json` → `cta.band`, `cta.byCategory`, `cta.default` | Câu chữ được phép dùng `{{ business.* }}` |
| Banner toàn site | `config/blog-ui.json` → `banner` | Chỉ link nội bộ |
| Cắm khối mới vào vị trí cố định | `config/blog-ui.json` → `slots` (`article.afterSummary`, `article.afterBody`, `page.beforeContactBand`) | Kiểu: `notice` (text + link nội bộ), `price-glance` (giá thấp nhất ĐÃ XÁC MINH trong `pricing.json` + disclaimer); lọc theo `categories` |
| Tiêu đề khối Tóm tắt / Liên quan / Cùng chủ đề, số bài liên quan | `config/blog-ui.json` → `summary`, `related`, `family`, `pillars` | |
| Mọi chữ giao diện: breadcrumb, nhãn hub/cluster, "Bài mới", "phút đọc", câu tìm kiếm, phân trang, mô tả footer | `config/blog-ui.json` → `labels` | `{n}`, `{name}`… là biến; `{{ business.* }}` lấy từ business.json. Builder và blog.js không còn chuỗi giao diện riêng |
| Thêm/sửa trang tĩnh (bảo mật, điều khoản, giới thiệu, chính sách, liên hệ, bảng giá, đối tác) + tiêu đề/mô tả trang chủ blog | `config/site-pages.json` | Một danh sách duy nhất: builder, sitemap, site-audit, seo-score và workflow (`node tools/site-pages.mjs --dirs`) cùng đọc |
| NAP, giờ mở cửa, điện thoại, WhatsApp, bản đồ, chính sách cọc | `data/business/business.json` | Bài viết dùng `{{ business.* }}`; link liên hệ gắn lúc chạy qua `data-contact-ref` |
| Bảng giá | `data/business/pricing.json` | Ô chưa xác minh hiển thị "Xác nhận trực tiếp" |
| Menu header/drawer/footer | `config/navigation.json` + `data/blog/taxonomy.json` | |
| Title/H1/meta SEO của bài đã đăng | `data/seo/article-meta.json` | Không sửa `published.json` |
| Bài liên quan / cùng chủ đề | Tự sinh bởi `tools/seo-links.mjs` | Không chèn link thủ công hàng loạt |
| Icon (mũi tên, tìm kiếm, điện thoại, bản đồ…) và logo | `tools/blog-components.mjs` → `icon()`, `brandMark()` | SVG inline, không emoji ở chrome |
| Card bài viết (danh sách, liên quan, kết quả tìm kiếm) | `tools/build-blog.mjs` → `cardHtml()` | Trang chủ blog phát `<template id="blog-card-tpl">`; `assets/js/blog.js` chỉ clone template, không tự dựng card |
| Header, footer, `<head>`, drawer | `tools/app-shell.mjs` | |
| Schema (CollectionPage, Article, BreadcrumbList, WebPage, AutoRental) | `tools/build-blog.mjs` qua `ldScript()`, `websiteRef()`, `breadcrumbLd()` | Một thực thể WebSite cho mọi trang |

## Build pipeline

`node tools/build-blog.mjs` does, in order:

1. `tools/css-build.mjs` minifies `assets/css/src/blog.css` → `assets/css/blog.css` (served file, marked *generated*). Never edit the served file.
2. Every page links `style.css`, `blog.css` and the scripts with a **content hash** (`?v=<digits>` from `assetVersion()`): editing a stylesheet changes the URL on every page, so browsers and the service worker can never keep a stale skin. No manual version bump.
3. Pages, `blog/search-index.json`, `data/blog/knowledge-index.json`, `sitemap.xml`, `robots.txt`.

Fonts: Be Vietnam Pro (designed for Vietnamese diacritics), self-hosted Latin + Vietnamese subset in `assets/fonts/` (~14 KB per weight, SIL OFL in `assets/fonts/OFL.txt`), `font-display: swap` with a metric-matched fallback so text never jumps.

## Gates

- `.github/workflows/blog-shared-rebuild.yml` rebuilds on any change to the sources above (config, tools, CSS source, scripts, business data, static page bodies), runs `node --test`, `site-audit` and `seo-score`, then commits the generated output (blog, static pages incl. `doi-tac`, served CSS).
- `.github/workflows/ci.yml` rebuilds and fails on any diff (`git diff --exit-code`), so a forgotten rebuild cannot ship.
- `tests/unit/blog-design-system.test.js` locks the single-source contract: no raw colors outside tokens, served CSS = fresh build, content-hash URLs, font + fallback, sticky-safe overflow, motion flags, CTA per category, slots, no duplicate dek, SVG-only chrome icons, workflow coverage, one static-page registry (build = sitemap = site-audit = seo-score), no UI copy in the builder or blog.js, search results = the builder's card.
- Budgets: total CSS (`style.css` + served `blog.css`) < 64 KB raw (`tools/seo-score.mjs`), base JS < 232 KB (CI).

Local QA: `node tools/build-blog.mjs && node --test && node tools/site-audit.mjs && node tools/seo-score.mjs`.

All customizations must retain URLs, prose, NAP and verified business data.
