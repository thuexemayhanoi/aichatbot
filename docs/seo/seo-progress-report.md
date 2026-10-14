# Báo cáo tiến độ SEO — 14/10/2026 (hoàn tất vòng 1)

> Phạm vi: **chỉ SEO tiếng Việt** cho `https://chatbot.thuexemaynguyentu.com/` (2.000 bài + homepage, hub, trang chuyển đổi, sitemap).
> Ma trận đầy đủ từng URL: [seo-master-matrix.csv](seo-master-matrix.csv) · tổng hợp: [seo-master-matrix.md](seo-master-matrix.md) · cụm từ khóa: [keyword-cluster-map.md](keyword-cluster-map.md).
> Tái tạo số liệu: `node tools/seo-master-audit.mjs` (baseline: `node tools/seo-master-audit.mjs --baseline --root <checkout commit 533aef2>`).

## 1. Kết quả tổng

| Trạng thái | Số URL | Ý nghĩa |
|---|---:|---|
| DONE | **2.120** | Không còn vấn đề kỹ thuật lẫn nội dung |
| KEEP | 9 | Bài > 2.000 từ, giữ nguyên có chủ đích (không cắt nội dung có giá trị) |
| TECH-DONE | 0 | — |
| PLANNED | 0 | — |

**2.129/2.129 URL đã audit (100%)**, 0 URL còn vấn đề P0, 0 bài mồ côi, 0 trùng ý định từ khóa.

## 2. Tuân thủ quy tắc bắt buộc

| Quy tắc | Kết quả | Bằng chứng |
|---|---|---|
| Không xóa bài/trang | Đạt — 2.129 URL sitemap trước = sau | `node tools/site-audit.mjs` → `sitemap_urls: 2129`, `published_articles: 2000` |
| Không noindex trang công khai | Đạt — 0 noindex | mã `NOINDEX` = 0 |
| Không đổi URL/slug/permalink; canonical tự trỏ | Đạt | `site-audit` kiểm canonical + og:url từng trang |
| Không gộp/redirect | Đạt — trùng ý định được tách bằng title/keyword | `CANNIBAL` 22 → 0 |
| Không sửa `published.json`, sửa body PUBLISHED chỉ qua quy trình review riêng | Đạt — metadata ở `data/seo/article-meta.json`; body chỉ đổi qua `tools/seo-body-review.mjs` (patch có cấu trúc, giữ prose cũ, QA trước/sau, nhật ký `data/seo/body-reviews.json`) | `git diff 533aef2 -- data/blog/published.json` rỗng |
| Không bịa giá/dịch vụ/số liệu | Đạt — số mới trong title/meta/body phải có sẵn trong bài; dữ kiện kinh doanh lấy từ `business.json` | validator + `seo-body-review.test.js` |
| Rollback được | Đạt — xóa entry metadata / `git revert` các commit `content(seo)` | `tools/seo-meta.mjs`, nhật ký review |
| Chỉ SEO tiếng Việt | Đạt — 0 title/keyword tiếng Anh; nhãn pháp lý Việt hóa; loại cụm "motorbike rental Hanoi" | test Vietnamese-only + body hygiene |

## 3. Các batch đã triển khai

| Batch | Phạm vi | Nội dung | Kết quả đo |
|---|---|---|---|
| T1 — P0 kỹ thuật | 133 URL | `esc()` không escape dấu `"` làm vỡ `<meta name="description">` (14 trang mất hẳn description) | `ATTR-BROKEN` 133 → 0 |
| T2 — Schema & heading | 2.086 URL | Article: `inLanguage`, `image`, `keywords`, publisher `@id` + logo + `sameAs`; `dateModified` theo ngày review; CollectionPage `ItemList`; thẻ liên quan H3; LocalBusiness (AutoRental) cho trang Liên hệ từ `business.json`; sitemap `<lastmod>` theo ngày thật | `SCHEMA-THIN` 2.000 → 0, `NO-ITEMLIST` 86 → 0, `CARD-H2` 2.000 → 0 |
| T3 — Hub & trang chuyển đổi | 129 URL | Title theo từ khóa cho 9 hub (`seo_title`, H1/menu giữ nguyên), meta 130–150 ký tự, phân trang có description riêng, title/description trang Liên hệ/Giới thiệu/Chính sách/Bảng giá/Bảo mật/Điều khoản | 129/129 trang 0 vấn đề |
| L1 — Liên kết nội bộ | 2.000 bài | Khối **Cùng chủ đề** (pillar ↔ bài cùng họ) + **Bài viết liên quan** theo độ gần chủ đề (trần 8 inbound, ≤2 bài/họ); hub trang 1 liệt kê mọi pillar | bài 0 link vào 524 → 0; trung vị 2 → 14; `ORPHAN` 141 → 0 |
| M01–M20 — Metadata | 2.000 bài | Từ khóa chính + title + meta description tiếng Việt viết từ dàn ý thực của từng bài; sửa dấu, Việt hóa Weekend/Ride/View… | `TITLE-AUTO` 1.856 → 0, `TITLE-CASE` 1.720 → 0, `DESC-CUT` 1.612 → 0, `TITLE-EN` 97 → 0 |
| C1 — Cannibalization | 22 cặp | Tách ý định theo dàn ý thực | `CANNIBAL` 22 → 0 |
| K1 — Từ khóa thật | 10 từ khóa | Volume Ubersuggest (VN/vi): "thuê xe máy điện" 1.000, "thuê xe máy điện hà nội" 260 → hub `/blog/xe-dien/` nhắm "Thuê xe máy điện Hà Nội" | `data/seo/keyword-clusters.json` |
| B01–B22 + P1 — Review body | 468 bài | 695 link ngữ cảnh; 74 bảng so sánh (chỉ dữ kiện có trong bài); FAQ cho 60 bài (280 câu hỏi); 16 đoạn trả lời trực tiếp đầu bài; 38 mục mới cho 13 bài mỏng (2 pillar BA-0001, BA-0004: 473 → 885, 508 → 861 từ) | `NO-CTX-LINK` 242 → 0, `NO-TABLE` 69 → 0, `NO-FAQ` 60 → 0, `THIN` 13 → 0, `INTRO-KW` 11 → 0 |
| H1 — Vệ sinh nội dung | 41 bài | Xóa ghi chú nội bộ lộ ra (pilot/fixture, "Hmm … typo"); sửa chữ Kirin lẫn trong câu ("rối распис", "sự cố механиch"…), từ Indonesia "lebih", lỗi gõ "cợa"; Việt hóa nhãn khung pháp lý (Nhận định / Đối tượng / Điều kiện / Quy định / Văn bản và hiệu lực / Nguồn gốc) ở 33 bài SAFE | `INTERNAL-NOTE` 2 → 0, `EN-BODY` 72 → 0; test hygiene |

Cổng chất lượng của review body: mỗi patch chỉ thêm/bọc/thay đoạn văn bản (không xóa prose, trừ ghi chú nội bộ); chặn số liệu mới, tiếng Anh, markup, cam kết cấm, link tới URL không tồn tại/tự link/link trùng; không đẩy bài quá 2.000 từ; **QA factory (`tools/article-qa.mjs`) chạy trước và sau từng bài** — 468/468 bài giữ nguyên hoặc tăng điểm (16 bài tăng), chạy lại toàn bộ trong tiến trình mới: 0 suy giảm.

## 4. Trước / sau (đo trên HTML đã build)

| Chỉ số | Baseline (533aef2) | Hiện tại |
|---|---:|---:|
| URL có vấn đề P0 | 133 | **0** |
| Title sinh máy / Title Case sai | 1.856 / 1.720 | **0 / 0** |
| Meta description cắt giữa câu | 1.612 | **0** |
| Bài không có link ngữ cảnh/cụm trỏ vào | 524 | **0** |
| Trung vị link ngữ cảnh/cụm trỏ vào mỗi bài | 2 | **14** |
| Body không có link ngữ cảnh ra bài khác | 242 | **0** |
| Bài ý định so sánh thiếu bảng / thiếu FAQ | 69 / 60 | **0 / 0** |
| Bài dưới 800 từ | 13 | **0** |
| Trùng ý định từ khóa | 22 | **0** |
| Link nội bộ hỏng | 0 | 0 |
| Tổng số từ 468 bài được review | 586.129 | 617.254 |

Không có chỉ số nào ở đây là xếp hạng Google; không cam kết Top 1 hay xuất hiện trong AI Overviews. Hiệu quả thật cần đo bằng Search Console sau khi Google thu thập lại.

## 5. Từ khóa / cụm đã xử lý

20 cụm K01–K20 (xem [keyword-cluster-map.md](keyword-cluster-map.md)), 340 họ chủ đề có pillar rõ ràng. Không nhắm trực tiếp các cụm do website chính/site chị em sở hữu: "thuê xe máy Hà Nội" (8.100/tháng), "cho thuê xe máy Hà Nội" (1.600), "dịch vụ cho thuê xe máy Hà Nội", "thuê xe máy uy tín Hà Nội" (`config/seo-ownership.json`).

## 6. Còn tồn tại / theo dõi

| Hạng mục | Ghi chú |
|---|---|
| 9 bài > 2.000 từ (KEEP) | Giữ nguyên để không cắt nội dung có giá trị; cô đọng chỉ qua review biên tập riêng |
| Câu mẫu tiếng Anh trong bài "cho khách nước ngoài" | Giữ lại ở nơi bài dạy khách hỏi bằng tiếng Anh (nội dung có chủ đích, không phải từ khóa SEO) |
| Volume từ khóa | Gói Ubersuggest miễn phí giới hạn lượt/ngày; nên kết nối Search Console để lấy truy vấn thật cho vòng 2 |
| Xe VinFast, xe 50cc, xe đạp điện | Chưa có giá/dòng xe xác minh trong `data/business/` — chỉ viết nội dung thông tin |
| Ảnh minh họa | Bài chưa có ảnh riêng; không tạo ảnh/số liệu giả. Bổ sung khi có ảnh thật kèm ALT |
| H1 homepage "Hỗ trợ Agent" | Thiết kế chatbot-first có test bảo vệ; title/schema mang từ khóa chính |

## 7. Vòng tiếp theo (khi có dữ liệu Search Console)

1. Lấy truy vấn/CTR thật theo URL → điều chỉnh title/meta cho trang có hiển thị cao nhưng CTR thấp (qua `data/seo/article-meta.json`).
2. Ưu tiên cụm K08 (xe máy điện) và K02 (giá thuê) — có volume đo được và chưa thuộc site chị em.
3. Mọi sửa body tiếp tục qua `tools/seo-body-review.mjs`.

## 8. Rollback

- Metadata một bài: xóa entry trong `data/seo/article-meta.json` → `node tools/build-blog.mjs`.
- Body một bài: `git revert` commit `content(seo): body review …` chứa ID bài (mỗi commit ≤ 10 body) rồi build.
- Toàn bộ: `git revert` các commit v70 (không có thay đổi dữ liệu nào ngoài repo).
