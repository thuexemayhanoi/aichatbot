# Single source — đổi gì, sửa ở đâu

Nguyên tắc: **sửa 1 chỗ → chạy build → toàn site đồng bộ**. Không sửa tay từng bài, không sửa file sinh ra (`blog/`, các trang tĩnh, `index.html`, `agent/index.html`, `llms.txt`, `assets/css/blog.css`, khối token trong `assets/css/style.css`, màu launcher trong `embed.js`). CI build lại và báo lỗi nếu file sinh ra lệch nguồn.

Sau khi sửa nguồn: `node tools/build-blog.mjs`. Cách khác: push lên `main`, workflow **Blog Shared Rebuild** sẽ tự build, test và commit phần sinh ra.

| Muốn đổi | Sửa ở (nguồn duy nhất) | Tự cập nhật |
|---|---|---|
| Số điện thoại, WhatsApp, link bản đồ, email | `data/business/business.json` → `contact` | Bài viết, trang tĩnh, trang chủ (khối Thông tin cửa hàng + JSON-LD), trang Agent `/agent/`, `llms.txt`, footer, contact band, schema AutoRental, câu trả lời blog của Agent |
| Địa chỉ, giờ mở cửa, khu vực phục vụ, chính sách cọc/giao xe/bảo hiểm | `data/business/business.json` | Như trên |
| Giá thuê và tiền cọc theo xe | `data/business/pricing.json`. Giá chưa công bố để `null`, hiển thị "Liên hệ" | Bảng `/gia-thue/` (cột Tiền cọc riêng, OfferCatalog schema), chatbot (giá, máy tính tiền thuê, câu hỏi cọc), slot `price-glance`, giá trong bài (placeholder `{{ price.* }}`; khoảng min = max tự gộp thành một giá), "giá từ …" và Offer schema trên trang Agent `/agent/` |
| Sidebar danh mục (mobile/tablet trượt từ trái, desktop cột trái thu gọn được, Agent dạng overlay) | `config/navigation.json` → `drawer.groups` (thứ tự, `collapsed`, `url`), `svg_icons` (biểu tượng); nhãn `Danh mục`/`Mở danh mục`/… ở `config/blog-ui.json` → `labels` | Mọi trang và trang Agent (`renderDrawer()` + `menuButton()`); hành vi: `assets/js/drawer.js`; bố cục: `style.css` (panel) + `src/blog.css` (lưới desktop) |
| Màu, chữ, khoảng cách, bo góc, bóng, chuyển động | `assets/css/src/blog.css` → khối TOKENS | `blog.css` (gồm trang chủ V3), token của trang Agent (`style.css`), màu nút launcher `embed.js` |
| Tên site, tagline, theme-color, ảnh OG | `config/blog-ui.json` → `site` | Mọi trang, trang chủ, manifest theme-color qua test |
| CTA trong bài (theo danh mục), contact band, banner, slot nội dung | `config/blog-ui.json` → `cta`, `banner`, `slots` | Mọi bài/hub theo danh mục |
| Bật/tắt tóm tắt, mục lục, bài liên quan, contact band, motion… | `config/blog-ui.json` → `features` | Mọi trang |
| Số bài liên quan, tiêu đề khối, nhãn giao diện | `config/blog-ui.json` → `related`, `labels` | Mọi trang |
| Menu ngang desktop, drawer, footer, gốc breadcrumb | `config/navigation.json` (+ `config/site-pages.json`, `data/blog/taxonomy.json`); footer chỉ tham chiếu mục của drawer | Mọi trang, trang chủ và trang Agent `/agent/` (menu ngang ≥ 1200px; riêng Agent chỉ trên máy có chuột/trackpad, màn hình cao ≥ 600px — máy cảm ứng dùng sidebar) |
| Trang tĩnh (giới thiệu, chính sách, liên hệ, đối tác, bảo mật, điều khoản, giá thuê) | `config/site-pages.json` + `data/site/*.body.html`, `data/legal/*.body.html`; `"group": "legal"` xếp trang vào nhóm Pháp Lý | Trang tương ứng, sitemap, menu Trang Web / Pháp Lý, footer |
| Tên + URL danh mục trong menu, footer, chip, breadcrumb | `data/blog/taxonomy.json` (`categories.*.label`, `dir`) | Mọi trang |
| Trang chủ `/` (chữ hero, dịch vụ, khối Agent, tiêu đề các phần, số bài mới) | `config/site-pages.json` → `siteHome` | `index.html` (danh mục từ taxonomy, bài nổi bật/bài mới từ manifest, cửa hàng từ `business.json`) |
| Trang Agent `/agent/` (khung chat, SEO copy, FAQ, JSON-LD WebApplication) | `data/site/agent.html.tpl` | `agent/index.html` |
| Đường dẫn Agent (nút "Hỏi Agent", contact band, menu, embed) | `config/navigation.json` → `agent.url` | Mọi trang |
| `llms.txt` | `data/site/llms.txt.tpl` | `llms.txt` |
| Title / meta / H1 SEO của bài đã đăng | `data/seo/article-meta.json` | Bài tương ứng |
| Liên kết nội bộ, bài liên quan | Tự sinh (`tools/seo-links.mjs`) | Không chèn tay |
| Schema (Article, BreadcrumbList, CollectionPage, Organization, AutoRental) | Tự sinh trong `tools/build-blog.mjs` từ dữ liệu trên | Mọi trang |

## Placeholder trong nội dung

- Dữ kiện cửa hàng: `{{ business.contact.phone_display }}`, `{{ business.address.full }}`, `{{ business.hours.display }}`, `{{ business.policies.deposit.min | vnd }}`…
- Giá thuê: `{{ price.<id-xe>.<day|week|month>.<min|max> }}`, ví dụ `{{ price.honda-vision.day.min }}/ngày`. Giá thấp nhất theo đơn vị: `{{ price.from.day }}`. Xe chưa có giá công bố (null) **không resolve**, build báo lỗi, nên không thể tự đặt giá.
- Bộ lọc: `| vnd` (mặc định với số: "2.000.000đ"), `| list`, `| raw` (số trần cho JSON-LD), `| tel` (bỏ `tel:`), `| intl` ("+84 942 467 674"). Bộ lọc lạ → build báo lỗi.
- `node tools/fact-bind.mjs check|apply`: đổi bản sao chữ của dữ kiện/giá **hiện hành** thành placeholder, chỉ khi nội dung hiển thị giống hệt từng byte. Thao tác này không đổi ngày sửa bài. Bài mới còn ghi số trực tiếp bị QA cảnh báo `facts-as-placeholders` (−5, không chặn publish).

## Hàng rào tự động

- `tests/unit/single-source.test.js`:
  - placeholder giá;
  - binding không đoán giá;
  - trang Agent/`llms.txt` không lệch template và không chứa dữ kiện ghi cứng;
  - FAQ schema (trang Agent) khớp FAQ hiển thị;
  - tri thức Agent không lộ placeholder;
  - màu launcher theo token;
  - nhãn UI lấy từ config.
- `tests/unit/home-design-v2.test.js`: token, logo, icon, theme-color và precache của trang Agent.
- `tests/unit/site-home-v3.test.js`: trang chủ V3 — thứ tự phần, nguồn dữ liệu từng phần, link thật, không giá/cọc tự đặt, schema, chuyển hướng `/?ask=` cũ sang `/agent/`.
- `tests/unit/blog-design-system.test.js`: màu chỉ nằm trong TOKENS; CI gate bao phủ mọi file sinh ra.
- CI (`ci.yml`): build lại + `git diff --exit-code`, chạy `site-audit` và `seo-score`.

## Audit 2026-10-24 — kết quả

Đã có từ trước: design tokens, `config/blog-ui.json` (site, CTA theo danh mục, banner, slot, feature flags, nhãn), shell/component dùng chung, registry trang tĩnh với placeholder, schema sinh tự động, SEO meta layer, liên kết nội bộ tự động, hash tài nguyên, QA lúc build.

Đã xử lý trong vòng này:

1. **Lỗi khách thấy:** 213 đoạn tri thức blog chứa placeholder thô, nên Agent hiển thị `{{ business… }}` cho khách (22/60 câu hỏi thử). Nay resolve khi build; test chặn tái phát.
2. **Giá thuê trong bài:** 2.664 chỗ giá giờ đi theo `pricing.json` qua placeholder.
3. **Dữ kiện ghi cứng trong bài:** điện thoại, địa chỉ, giờ mở cửa và khoảng cọc ghi cứng trong 860 bài đã đổi sang placeholder. Kiểm chứng: 2.137 trang build lại không đổi byte nào, 860/860 bài PASS QA.
4. **Trang chủ và `llms.txt`:** sinh từ template + dữ liệu. Gồm JSON-LD WebApplication/Organization/FAQPage, FAQ hiển thị, noscript, meta.
5. **Màu launcher `embed.js`:** lấy từ token V2, không còn màu tím cũ.
6. **Nhãn UI:** 3 nhóm chuỗi giao diện còn cứng trong `tools/build-blog.mjs` đã chuyển vào `labels`.

Còn lại, cần chủ cửa hàng hoặc review quyết định:

- **228 giá kèm đơn vị vẫn ghi số:** câu không nêu tên xe, hoặc là tổng tính toán (ví dụ "hai chiếc Vision… 400.000đ/ngày"). Các số này sẽ không tự đổi khi giá đổi. `node tools/fact-bind.mjs check` liệt kê 12 chỗ nêu rõ xe nhưng số khác `pricing.json`, phần lớn là tổng tính toán.
- ~~`pricing.json` khác bảng giá chuẩn của chủ~~ — đã xử lý 2026-10-25 (v78): `pricing.json` = bảng giá + tiền cọc chuẩn (test `tests/unit/pricing-owner-table.test.js`). Giá ghi cứng trong 285 bài đã sửa qua quy trình review body (`docs/seo/price-review-2026-10-25.md`).
- **Địa chỉ dạng rút gọn:** 25 chỗ (24 bài) viết "{số nhà + đường}, Long Biên" thiếu "Bồ Đề". Phần số nhà/đường đã theo dữ liệu, còn phần quận viết chữ. Muốn NAP đầy đủ thì sửa qua quy trình review body.
- **`knowledge_chunks` trong `data/blog/published.json`:** do factory sở hữu, có thể chứa dữ kiện ghi chữ. Agent hiển thị bản đã resolve placeholder, nhưng chữ số ghi cứng không tự đổi.
- ~~Tên thương hiệu~~ — đã chốt 2026-10-25: `display_name` = "Cho Thuê Xe Máy Nguyễn Tú", `gbp_name` = "Thuê xe máy ở Hà Nội - Nguyễn Tú" (alternateName trong schema), `brand` = "Nguyễn Tú" (tên ngắn trong câu); bản đồ = `https://maps.google.com/maps?cid=7448790013669858019`.
