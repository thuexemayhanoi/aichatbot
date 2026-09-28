# Báo cáo v58 — Chat Home + Content Site + Factory Production Loop (2026-09-28)

## Mô hình đã triển khai

- `/aichatbot/` = MÀN HÌNH CHAT: giữ app shell (header + messages + quick actions + composer + dock + drawer), KHÔNG footer website, KHÔNG blog feed/landing dưới chat. Menu ở PHẢI (Auto → Menu là hai control cuối header).
- Mọi trang khác = trang content website chuyên nghiệp dùng chung shell (`tools/app-shell.mjs`): `.site-header` sticky (identity trái, nav danh mục giữa ≥900px, search/theme/Menu PHẢI), `.site-main` một hệ cột, footer thật sinh từ `config/navigation.json`. Không dock chat trên trang content.

## Thay đổi chính

1. `tools/app-shell.mjs` — content-site shell v58 (siteHeader/siteDrawer/footerHtml/appShellPage).
2. `assets/css/blog.css` — `.site-*`, footer full-width, `.blog-summary`, `.table-wrap`/`.blog-table`, `.blog-cluster-more`, article type scale, search controls; giữ nguyên chips rail ngang mobile.
3. `assets/css/style.css` — nút `.motoai-theme` (Auto/Sáng/Tối) cho homepage; `index.html` + `assets/js/main.js` wire `initTheme`.
4. `tools/build-blog.mjs` — buildClusterHub cho 3 cụm cha; trang tĩnh gioi-thieu/chinh-sach/lien-he (body tại `data/site/`); `buildPrice` chỉ render số từ `pricing.json` (đơn giá tháng/tuần thiếu → "Xác nhận trực tiếp"); sitemap 20 URL; `resolveFacts` hỗ trợ `| list`.
5. `data/legal/privacy.body.html`, `terms.body.html` — thay liên kết tel cứng bằng `data-contact-ref`; thêm anchor WhatsApp data-contact-ref.
6. `assets/js/blog.js` — tìm kiếm v58: lọc danh mục, nút xóa, số kết quả, empty state.
7. `tools/blog-factory.mjs` — claim [≤10] / finish-chunk / abandon-chunk / checkpoint + `MOTOAI_FACTORY_ROOT` sandbox.
8. `tools/seo-score.mjs` — pageSet + 3 cụm + 4 trang tĩnh; tap-target check → `.screen-ask-btn`.
9. `index.html` drawer — Giới Thiệu, Giá Thuê (link thật `/gia-thue/`), Chính Sách.
10. Test: blog-app-ux (v58 shell contract, homepage no-footer/Menu-right), blog-foundation (cụm cha, trang tĩnh + pricing verification, Zalo walk toàn site, Menu-right), blog-factory.test.js (9 test sandbox), seo-score.test mở rộng.

## Kết quả

- Suite: 498/498 PASS. seo-score: 100/100.
- Matrix: 2.000 dòng giữ nguyên (2 PUBLISHED pilot, 1.998 PLANNED) — byte-identical so với baseline trừ 2 dòng pilot đã PUBLISHED trước đó. KHÔNG sinh bài trong run này.
- Zalo public: 0. Sitemap: 20 URL (không PLANNED). Sitemap/schema/canonical/link scan: 0 lỗi.
- Mobile contract (CSS test): 320/375/390/430 PASS; 768/1024+ PASS.

## Sẵn sàng sản xuất

Factory sẵn sàng cho vòng `claim → write → QA → publish` liên tục theo chunk 10 bài (xem `docs/BLOG-FACTORY.md`). Việc sản xuất 2.000 bài được kích hoạt riêng.
