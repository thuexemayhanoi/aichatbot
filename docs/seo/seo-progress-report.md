# Báo cáo tiến độ SEO — 14/10/2026

> Phạm vi: **chỉ SEO tiếng Việt** cho `https://chatbot.thuexemaynguyentu.com/` (2.000 bài + homepage, hub, trang chuyển đổi, sitemap).
> Ma trận đầy đủ từng URL: [seo-master-matrix.csv](seo-master-matrix.csv) · tổng hợp: [seo-master-matrix.md](seo-master-matrix.md) · cụm từ khóa: [keyword-cluster-map.md](keyword-cluster-map.md).
> Tái tạo số liệu: `node tools/seo-master-audit.mjs` (baseline: `node tools/seo-master-audit.mjs --baseline --root <checkout commit 533aef2>`).

## 1. Tuân thủ quy tắc bắt buộc

| Quy tắc | Kết quả | Bằng chứng |
|---|---|---|
| Không xóa bài/trang | Đạt — 2.129 URL sitemap trước = sau | `node tools/site-audit.mjs` → `sitemap_urls: 2129`, `published_articles: 2000` |
| Không noindex trang công khai | Đạt — 0 noindex | mã `NOINDEX` = 0 (baseline 0) |
| Không đổi URL/slug/permalink, canonical tự trỏ | Đạt | `site-audit` kiểm canonical + og:url từng trang; `CANONICAL` = 0 |
| Không gộp/redirect | Đạt — 21 cặp trùng ý định được **tách bằng title/keyword**, không gộp | mã `CANNIBAL` 22 → 0 |
| Không sửa `published.json`, không ghi đè body PUBLISHED (AGENTS.md) | Đạt — metadata mới nằm ở `data/seo/article-meta.json` | `git diff --stat data/blog/published.json data/blog/articles` rỗng |
| Không bịa giá/dịch vụ/số liệu | Đạt — mọi con số trong title/meta phải có trong body (kiểm tự động); dữ kiện kinh doanh lấy từ `business.json` | validator metadata + `seo-master.test.js` |
| Rollback được | Đạt — xóa entry/tệp `data/seo/article-meta.json` hoặc `git revert` | `tools/seo-meta.mjs` |
| Chỉ SEO tiếng Việt | Đạt — 0 title/keyword chứa tiếng Anh; loại cụm "motorbike rental Hanoi" | mã `TITLE-EN`, `KW-EN` = 0; test Vietnamese-only |

## 2. Đã audit

**2.129/2.129 URL (100%)**: 2.000 bài, homepage, blog home, 3 hub cụm, 6 hub danh mục, 80 trang phân trang, 32 hub chủ đề con, 6 trang tĩnh/chuyển đổi. Mỗi URL được đo: title, meta, H1, canonical, robots, schema, link vào/ra (ngữ cảnh, cụm, hub), độ sâu click, số từ, FAQ, bảng, nguồn pháp lý, vị trí từ khóa, trùng ý định.

## 3. Đã tối ưu (theo batch)

| Batch | Phạm vi | Nội dung | Kiểm chứng |
|---|---|---|---|
| T1 — Kỹ thuật (P0) | 133 URL | `esc()` không escape dấu `"` → `<meta name="description" content=""Trong phố…">` vỡ (14 trang mất hẳn description, 119 bị cắt). Sửa tận gốc trong `tools/app-shell.mjs` | `ATTR-BROKEN` 133 → 0; test "well-formed head meta" quét mọi trang |
| T2 — Schema & heading | 2.000 bài + 86 trang danh sách | Article schema thêm `inLanguage vi-VN`, `image`, `keywords`, một thực thể `publisher` (`@id`, logo, `sameAs` website chính); CollectionPage thêm `ItemList`; thẻ bài liên quan hạ H2 → H3 | `SCHEMA-THIN` 2.000 → 0, `NO-ITEMLIST` 86 → 0, `CARD-H2` 2.000 → 0 |
| T3 — Hub & trang chuyển đổi | 129 URL không phải bài | Title hub trang 1 bỏ "— trang 1 —"; meta 9 hub viết lại 130–150 ký tự; phân trang có description riêng; title/description trang Liên hệ, Giới thiệu, Chính sách, Bảng giá, Bảo mật, Điều khoản (16–27 ký tự → 51–62) lấy dữ kiện từ `business.json`; `seo_title` theo từ khóa cho 9 hub (H1/menu không đổi) | 129/129 trang 0 vấn đề kỹ thuật |
| L1 — Liên kết nội bộ | 2.000 bài | Thay khối "liên quan" xếp theo ID (1.912 bài không bao giờ được liên kết, 5 bài nhận ~400 link) bằng `tools/seo-links.mjs`: khối **Cùng chủ đề** (pillar ↔ bài hỗ trợ cùng họ) + **Bài viết liên quan** theo độ gần chủ đề, trần 8 inbound, tối đa 2 bài/họ; hub trang 1 liệt kê toàn bộ pillar | bài 0 link vào 524 → 0; trung vị 2 → 13; `ORPHAN` 141 → 0; `LOW-INBOUND` 1.127 → 0 |
| M01–M20 — Metadata | 2.000 bài (20 nhóm × ~100) | Viết lại keyword chính + title + meta description tiếng Việt từ đoạn mở và dàn ý H2 của từng bài; sửa dấu (Chủ tịch, phường, Mai Châu, Sóc Sơn, Cổ Loa, Hà Giang, khiếu nại, kỳ nghỉ lễ), Việt hóa Weekend/Ride/View/by bike/EV | `TITLE-AUTO` 1.856 → 0, `TITLE-CASE` 1.720 → 0, `TITLE-EN` 97 → 0, `TITLE-TYPO` 102 → 0, `TITLE-LEN` 550 → 0, `DESC-CUT` 1.612 → 0, `DESC-LEN` 217 → 0 |
| C1 — Cannibalization | 21 cặp | Tách ý định theo dàn ý thực tế (vd. "trợ lý thuê xe khác nhân viên tư vấn" vs "trợ lý thuê xe máy là gì"; "lịch ăn uống phố cổ hai ngày một đêm" vs "đi phố cổ…") | `CANNIBAL` 22 → 0 |
| K1 — Từ khóa thật | 10 từ khóa | Volume Ubersuggest (Việt Nam, tiếng Việt): "thuê xe máy điện" 1.000, "thuê xe máy điện hà nội" 260 → hub `/blog/xe-dien/` nhắm "Thuê xe máy điện Hà Nội" | `data/seo/keyword-clusters.json` → `volume_evidence` |

Kiểm tra tự động cho mỗi entry metadata (validator + `assertSeoMeta` khi build + `tests/unit/seo-master.test.js`): title 35–65 ký tự, description 120–165 ký tự kết thúc trọn câu, ≥75% âm tiết từ khóa có trong title, không tiếng Anh, không `{{…}}`, không cam kết cấm (miễn cọc, rẻ nhất, toàn quốc, App Store…), số liệu phải có trong body, duy nhất toàn site.

## 4. Trước / sau (đo trên HTML đã build)

| Chỉ số | Baseline (533aef2) | Hiện tại |
|---|---:|---:|
| URL có vấn đề P0 | 133 | **0** |
| Title sinh máy / Title Case sai | 1.856 / 1.720 | **0 / 0** |
| Meta description cắt giữa câu | 1.612 | **0** |
| Bài không có link ngữ cảnh/cụm trỏ vào | 524 | **0** |
| Trung vị link ngữ cảnh/cụm trỏ vào mỗi bài | 2 | **13** |
| Trùng ý định từ khóa | 22 | **0** |
| Link nội bộ hỏng | 0 | 0 (221.143 URL kiểm) |
| Điểm `tools/seo-score.mjs` (heuristic nội bộ) | 99,5 | 99,7 |

Điểm heuristic cũ gần như không đổi vì công cụ cũ không đo các lỗi lớn ở trên (thuộc tính vỡ, Title Case máy, bài mồ côi) — đó là lý do bổ sung `tools/seo-master-audit.mjs`. Không có điểm nào ở đây là xếp hạng Google; không cam kết Top 1 hay xuất hiện trong AI Overviews.

## 5. Từ khóa / cụm đã xử lý

20 cụm K01–K20 (xem [keyword-cluster-map.md](keyword-cluster-map.md)): ứng dụng & Agent, giá thuê, thuê theo ngày/tuần/tháng, thủ tục & đặt cọc, nhận/trả xe, giao tận nơi, chọn loại xe (xe số, tay ga, 50cc), xe máy điện, bằng lái & luật, an toàn, bảo hiểm & quyền lợi, Phố Cổ – Hoàn Kiếm, Ba Đình, Tây Hồ, Long Biên – Gia Lâm, Cầu Giấy – Đống Đa…, ngoại thành, xuyên Việt, kinh nghiệm cho khách du lịch, sự cố & bảo dưỡng. 340 họ chủ đề có pillar rõ ràng.

Không nhắm trực tiếp: "thuê xe máy Hà Nội" (8.100/tháng), "cho thuê xe máy Hà Nội" (1.600), "dịch vụ cho thuê xe máy Hà Nội", "thuê xe máy uy tín Hà Nội" — thuộc website chính/site chị em theo `config/seo-ownership.json`.

## 6. Vấn đề còn tồn tại

| Hạng mục | Số bài | Vì sao chưa xử lý | Đề xuất |
|---|---:|---|---|
| Body không có link ngữ cảnh | 242 | Cần sửa body; AGENTS.md cấm ghi đè body PUBLISHED nếu không có quy trình review riêng | Builder đã bù bằng khối Cùng chủ đề/Liên quan; thêm 2–3 link ngữ cảnh khi review body |
| Ý định so sánh nhưng thiếu bảng | 74 | Như trên; `docs/ARTICLE-RULES.md` hiện chỉ cho thẻ h2/p/ul/li | Owner duyệt cho phép `<table>` trong body trước |
| Body còn cụm tiếng Anh từ ma trận (ride, weekend, view…) | 72 | Cần sửa body | Việt hóa khi review body |
| Thiếu FAQ | 60 | Cần sửa body | Thêm FAQ thật sự hữu ích, không nhân bản |
| Đoạn mở chưa trả lời trực tiếp theo từ khóa | 14 | Cần sửa body | Viết câu trả lời 1–2 câu ở đầu bài |
| Dưới 800 từ / trên 2.000 từ | 13 / 9 | Cần sửa body | Bổ sung/cô đọng có kiểm chứng |
| Volume từ khóa | — | Gói Ubersuggest miễn phí còn 1 lượt/ngày; chưa có dữ liệu Search Console | Kết nối GSC để lấy truy vấn thật trước khi tối ưu vòng 2 |
| Xe VinFast, xe 50cc, xe đạp điện | — | Chưa có giá/dòng xe xác minh trong `data/business/` | Owner xác nhận rồi mới viết nội dung thương mại |
| H1 homepage "Hỗ trợ Agent" | 1 | Thiết kế chatbot-first có test bảo vệ; title/schema đã mang từ khóa chính | Giữ nguyên |
| Kiểm tra live sau deploy | — | Chờ GitHub Pages | Chạy `tools/seo-live-monitor.mjs` sau khi Pages cập nhật |

451 URL có trạng thái `TECH-DONE` (kỹ thuật xong, còn khoảng trống body) — lọc cột **Status** trong CSV.

## 7. Batch tiếp theo (cần owner duyệt quy trình review body)

Thứ tự đề xuất: pillar trước, rồi bài mỏng, rồi ý định so sánh. 20 URL đầu tiên:

| Article | URL | Từ khóa chính | Khoảng trống | Batch |
|---|---|---|---|---|
| BA-0001 | /blog/app/app-thue-xe-may-la-gi/ | app thuê xe máy là gì | dưới 800 từ; không link ngữ cảnh | SEO-B011 |
| BA-0004 | /blog/huong-dan/thu-tuc-thue-xe-may/ | thủ tục thuê xe máy | dưới 800 từ; không link ngữ cảnh | SEO-B018 |
| BA-0110 | /blog/thue-xe/dieu-kien-thue-xe-may-o-ha-noi/ | điều kiện thuê xe máy ở Hà Nội | dưới 800 từ; không link ngữ cảnh | SEO-B019 |
| BA-0111 | /blog/xe-dien/di-xe-dien-duong-dai/ | đi xe điện đường dài | dưới 800 từ | SEO-B022 |
| BA-0112 | /blog/huong-dan/ung-dung-ban-do-cho-nguoi-thue-xe/ | ứng dụng bản đồ cho người thuê xe | dưới 800 từ | SEO-B019 |
| BA-0114 | /blog/dia-phuong/pho-sach-ha-noi/ | đi Phố Sách Hà Nội bằng xe máy | dưới 800 từ | SEO-B015 |
| BA-0115 | /blog/app/tinh-chi-phi-thue-xe-theo-ngay-tuan-thang/ | tính chi phí thuê xe theo ngày tuần tháng | dưới 800 từ | SEO-B012 |
| BA-0116 | /blog/thue-xe/thue-xe-khong-bang-lai-duoc-khong/ | thuê xe không bằng lái được không | dưới 800 từ (legal gate) | SEO-B021 |
| BA-0117 | /blog/xe-dien/xe-dien-trong-pho/ | đi xe điện trong phố Hà Nội | dưới 800 từ | SEO-B024 |
| BA-0118 | /blog/huong-dan/ky-nang-lai-xe-an-toan-co-ban/ | kỹ năng lái xe máy an toàn cơ bản | dưới 800 từ | SEO-B018 |
| BA-0119 | /blog/an-toan/xe-co-phia-truoc-va-khoang-cach-an-toan/ | khoảng cách an toàn với xe phía trước | dưới 800 từ | SEO-B010 |
| BA-0120 | /blog/dia-phuong/nha-tho-lon-ha-noi/ | đi Nhà Thờ Lớn Hà Nội bằng xe máy | dưới 800 từ | SEO-B015 |
| BA-0216 | /blog/dia-phuong/cau-nhat-tan-hoang-hon/ | ngắm hoàng hôn cầu Nhật Tân bằng xe máy | dưới 800 từ; không link ngữ cảnh; cụm tiếng Anh | SEO-B014 |
| BA-0035 | /blog/an-toan/bang-lai-a1-a2-khac-gi/ | bằng lái a1 a2 khác gì | thiếu bảng so sánh (legal gate) | SEO-B008 |
| BA-0037 | /blog/app/web-app-va-app-native-khac-gi-nhau/ | ứng dụng web và ứng dụng gốc khác gì nhau | thiếu bảng so sánh | SEO-B013 |
| BA-0074 | /blog/thue-xe/so-sanh-gia-cac-loai-xe-may-cho-thue/ | so sánh giá các loại xe máy cho thuê | thiếu FAQ; thiếu bảng | SEO-B020 |
| BA-0079 | /blog/app/so-sanh-cach-thue-xe-truyen-thong-va-qua-app/ | so sánh cách thuê xe truyền thống và qua app | thiếu FAQ; thiếu bảng | SEO-B012 |
| BA-0144 | /blog/dia-phuong/van-giang-ev-and-bikes/ | đi Văn Giang bằng xe điện hay xe máy | thiếu bảng | SEO-B016 |
| BA-0147 | /blog/xe-dien/so-sanh-cac-dong-xe-dien-cho-thue/ | so sánh các dòng xe điện cho thuê | thiếu bảng | SEO-B023 |
| BA-0157 | /blog/app/so-sanh-ung-dung-thue-xe-may-dien-va-xe-xang/ | so sánh thuê xe điện và xe xăng qua app | thiếu bảng | SEO-B012 |

## 8. Rollback

- Một bài: xóa entry của bài trong `data/seo/article-meta.json` → `node tools/build-blog.mjs`.
- Toàn bộ metadata: xóa `data/seo/article-meta.json` → build (builder dùng lại metadata manifest).
- Toàn bộ thay đổi: `git revert <commit>` (không có thay đổi dữ liệu nào ngoài repo).
