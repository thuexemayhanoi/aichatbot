# Homepage Apple V3 — trang chủ website + Agent tách riêng (v76)

## Cấu trúc URL

| URL | Vai trò | Sinh từ |
|---|---|---|
| `/` | Trang chủ website, shell nội dung chung (header, drawer, footer, token V2) | `buildSiteHome()` trong `tools/build-blog.mjs` |
| `/agent/` | Ứng dụng Agent — khung chat toàn màn hình (giữ nguyên ID, JS, phiên, dữ liệu) | `data/site/agent.html.tpl` → `tools/agent-page.mjs` |
| `/blog/…` | Cẩm nang — không đổi URL, canonical, nội dung | như cũ |

Đường dẫn Agent chỉ khai báo một lần, ở `config/navigation.json` → `agent.url`. Nút "Hỏi Agent" trên header mọi trang, contact band, menu, footer và embed đều đọc giá trị này.

## Các phần của trang chủ và nguồn dữ liệu

| Phần | Nguồn |
|---|---|
| Hero (kicker, H1, lead, 2 CTA) | `config/site-pages.json` → `siteHome` |
| Số liệu nhanh (số bài, chuyên mục, giờ, khu vực) | manifest + `config/navigation.json` + `business.json` |
| Dịch vụ (6 thẻ) | `siteHome.services.items`. Build báo lỗi nếu link không có trang |
| Giới thiệu Agent | `siteHome.agent`. Chỉ có nút mở `/agent/`, không nhúng khung chat |
| Cẩm nang theo chủ đề | `data/blog/taxonomy.json` + `drawerCore()`: 3 nhóm, 6 danh mục, chỉ các chủ đề con đã có bài |
| Bài nổi bật | Mỗi danh mục 1 bài trụ cột (pillar) có họ chủ đề lớn nhất, theo `tools/seo-links.mjs` |
| Bài mới | `siteHome.latest.count` bài mới nhất trong manifest, trừ bài nổi bật. Tự cập nhật mỗi lần build/publish |
| Thông tin cửa hàng | `data/business/business.json`. Gọi, WhatsApp, bản đồ resolve lúc chạy qua `data-contact-ref` |
| Footer | `footerHtml()` dùng chung |

Trang chủ không có giá, tiền cọc hay chính sách nào ngoài dữ liệu đã xác minh. Giá xe điện ghi "liên hệ cửa hàng".

## SEO

- Trang chủ: title/description/H1 lấy từ `siteHome`. H1 "Trợ lý thuê xe máy Hà Nội" nhắm từ khóa sở hữu "trợ lý thuê xe máy". H1 này không trùng nguyên văn từ khóa thương mại được bảo vệ, và `tests/unit/seo-ownership.test.js` kiểm tra điều đó. Schema gồm WebSite + Organization + WebPage. `WebPage.mainEntity` trỏ tới `…/agent/#app`.
- Trang Agent: giữ title ứng dụng, FAQ hiển thị, `WebApplication` + `FAQPage`. WebApplication chỉ khai báo một lần.
- Sitemap có `/` và `/agent/`. Canonical bài viết và danh mục không đổi. Breadcrumb bắt đầu bằng "Trang chủ" (`/`).

## Tương thích ngược

- `/?ask=`, `/?action=`, `/?embed=`, `/?source=`, `/?lang=`: script nhỏ trong `<head>` của `/` chuyển sang `/agent/` và giữ nguyên query + hash. Không dùng chuyển hướng hàng loạt. Đường dẫn khác và tham số `utm_*` vẫn ở lại trang chủ.
- `embed.js` (WordPress plugin và đối tác) mở iframe `…/agent/?embed=1…`, kể cả khi cài dưới thư mục con.
- PWA: `start_url` là `/agent/?source=pwa`, scope vẫn `/`. Service worker đăng ký bằng URL tuyệt đối, scope `/`. Cache `v67` precache cả `/` và `/agent/`.

## Kiểm tra

`node tools/build-blog.mjs` → `node --test` (có `tests/unit/site-home-v3.test.js`) → `node tools/site-audit.mjs` → `node tools/seo-score.mjs`. CI so sánh lại `index.html` và `agent/` sau khi build.

## Rollback

1. Revert merge commit của PR V3 trên `main`. Workflow Blog Shared Rebuild sẽ build lại. Không xóa bài, không reset matrix.
2. Nếu chỉ cần đưa khung chat về `/`: đổi `config/navigation.json` → `agent.url` về `/` và revert `buildSiteHome`. Các link Agent đọc cùng một nguồn nên tự đổi theo.
3. Người dùng có service worker cũ: `CORE_VERSION` đổi sẽ xóa cache cũ khi activate.
