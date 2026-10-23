# Báo cáo tiến độ SEO — 14/10/2026 (hoàn tất toàn bộ ma trận)

> Phạm vi: **chỉ SEO tiếng Việt** cho `https://chatbot.thuexemaynguyentu.com/` (2.000 bài + homepage, hub, trang chuyển đổi, sitemap).
> Ma trận đầy đủ từng URL: [seo-master-matrix.csv](seo-master-matrix.csv) · tổng hợp: [seo-master-matrix.md](seo-master-matrix.md) · cụm từ khóa: [keyword-cluster-map.md](keyword-cluster-map.md).
> Tái tạo số liệu: `node tools/seo-master-audit.mjs` (baseline: `node tools/seo-master-audit.mjs --baseline --root <checkout commit 533aef2>`).

## 1. Kết quả tổng

| Trạng thái | Số URL | Ý nghĩa |
|---|---:|---|
| DONE | **2.129** | Không còn vấn đề kỹ thuật lẫn nội dung |
| KEEP | 0 | 9 bài > 2.000 từ đã được cô đọng qua review (batch D1) |
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
| D1 — Cô đọng bài dài | 9 bài | Thao tác `condense`: viết gọn câu thừa, giữ mọi con số/dữ kiện của đoạn cũ; đồng thời sửa 3 điểm pháp lý lỗi thời đã đối chiếu văn bản gốc: hạng A1 theo khoản 1 Điều 57 Luật 36/2024/QH15 (bằng cấp từ 01/01/2025: đến 125 cm³/11 kW; bằng cấp trước đó vẫn lái xe 50 đến dưới 175 cm³) ở BA-0010; cơ chế phục hồi điểm theo Điều 58 (bị trừ hết điểm: chờ ít nhất 6 tháng rồi kiểm tra kiến thức) ở BA-0005, BA-0011; bỏ "B1" khỏi ví dụ bằng ô tô (B1 mới là hạng mô tô ba bánh) | `LONG` 9 → 0 (2.005–2.491 → 1.952–1.986 từ hiển thị); QA 95 → 100 ở cả 9 bài |
| H2 — Nhãn pháp lý còn sót | 31 bài SAFE | 60 nhãn "Claim:" → "Nhận định:"; audit `EN-BODY` và test hygiene bắt thêm nhãn tiếng Anh dạng thường | 0 nhãn tiếng Anh |
| H1 — Vệ sinh nội dung | 41 bài | Xóa ghi chú nội bộ lộ ra (pilot/fixture, "Hmm … typo"); sửa chữ Kirin lẫn trong câu ("rối распис", "sự cố механиch"…), từ Indonesia "lebih", lỗi gõ "cợa"; Việt hóa nhãn khung pháp lý (Nhận định / Đối tượng / Điều kiện / Quy định / Văn bản và hiệu lực / Nguồn gốc) ở 33 bài SAFE | `INTERNAL-NOTE` 2 → 0, `EN-BODY` 72 → 0; test hygiene |

Cổng chất lượng của review body: mỗi patch chỉ thêm/bọc/thay đoạn văn bản (không xóa prose, trừ ghi chú nội bộ và thao tác `condense` cho bài > 2.000 từ — mọi con số của đoạn cũ phải còn trong bài, kết quả 1.800–2.000 từ); chặn số liệu mới, tiếng Anh, markup, cam kết cấm, link tới URL không tồn tại/tự link/link trùng; không đẩy bài quá 2.000 từ; **QA factory (`tools/article-qa.mjs`) chạy trước và sau từng bài** — 506/506 bài giữ nguyên hoặc tăng điểm (27 bài tăng), 0 suy giảm.

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
| Bài dưới 800 từ / trên 2.000 từ | 13 / 9 | **0 / 0** |
| Trùng ý định từ khóa | 22 | **0** |
| Link nội bộ hỏng | 0 | 0 |
| Tổng số từ 506 bài được review | 647.760 | 677.368 |

Không có chỉ số nào ở đây là xếp hạng Google; không cam kết Top 1 hay xuất hiện trong AI Overviews. Hiệu quả thật cần đo bằng Search Console sau khi Google thu thập lại.

## 5. Từ khóa / cụm đã xử lý

20 cụm K01–K20 (xem [keyword-cluster-map.md](keyword-cluster-map.md)), 340 họ chủ đề có pillar rõ ràng. Không nhắm trực tiếp các cụm do website chính/site chị em sở hữu: "thuê xe máy Hà Nội" (8.100/tháng), "cho thuê xe máy Hà Nội" (1.600), "dịch vụ cho thuê xe máy Hà Nội", "thuê xe máy uy tín Hà Nội" (`config/seo-ownership.json`).

## 6. Còn tồn tại / theo dõi

| Hạng mục | Ghi chú |
|---|---|
| BA-0122 (bằng lái A1 và thuê xe máy) | Đã sửa trong vòng 3 (mục 8): nội dung theo Điều 57 và quy định chuyển tiếp Điều 89 Luật 36/2024/QH15, cùng 9 bài có lỗi pháp lý tương tự |
| Câu mẫu tiếng Anh trong bài "cho khách nước ngoài" | Giữ lại ở nơi bài dạy khách hỏi bằng tiếng Anh (nội dung có chủ đích, không phải từ khóa SEO) |
| Volume từ khóa | Gói Ubersuggest miễn phí giới hạn lượt/ngày; nên kết nối Search Console để lấy truy vấn thật cho vòng 2 |
| Xe VinFast, xe 50cc, xe đạp điện | Chưa có giá/dòng xe xác minh trong `data/business/` — chỉ viết nội dung thông tin |
| Ảnh minh họa | Bài chưa có ảnh riêng; không tạo ảnh/số liệu giả. Bổ sung khi có ảnh thật kèm ALT |
| H1 homepage "Hỗ trợ Agent" | Thiết kế chatbot-first có test bảo vệ; title/schema mang từ khóa chính |

## 7. Vòng 2 — ZERO-DATA / cold start (14/10/2026)

Website chưa có Search Console/GA4/thứ hạng thật (kiểm tra kết nối: không có). Mọi quyết định vòng này dựa trên dữ liệu công khai đo được, có ghi nguồn và ngày — chi tiết tại [cold-start/README.md](cold-start/README.md).

| Hạng mục | Nội dung | Bằng chứng / kết quả |
|---|---|---|
| Nghiên cứu SERP | 55 truy vấn tiếng Việt, Google Việt Nam, top 10–20 (`data/seo/serp-snapshots/2026-10-14.json`) | AI Overview 46/55 SERP; local pack 13/55; website xuất hiện 4/55 (top 10: "app thuê xe máy" #7, #9) |
| Nhu cầu từ khóa | 713 từ khóa có volume do công cụ trả về (`data/seo/keyword-demand.json`) | 192 trong phạm vi; còn lại là thành phố khác, ý định khác (thi bằng, mua xe, ô tô), từ khóa site chị em, "gần tôi" |
| Đối thủ & ý định | [competitor-map.md](cold-start/competitor-map.md), [serp-intent.md](cold-start/serp-intent.md) | Nhóm Facebook có mặt ở 53/55 SERP; truy vấn pháp lý do trang hỏi đáp pháp luật nắm; truy vấn quận/khu vực có local pack |
| Topical map & content gap | [topical-map.md](cold-start/topical-map.md), [content-gap.md](cold-start/content-gap.md) | Đề xuất bài mới (cần owner thêm ID vào ma trận): "Xe máy điện: có cần bằng lái, bao nhiêu tuổi được đi" (6.350 lượt/tháng đo được, chưa có bài riêng); "Vùng phát thải thấp Vành đai 1 và người thuê xe máy xăng" (thí điểm từ 1/7/2026 tại phường Hoàn Kiếm — cần đối chiếu văn bản gốc) |
| Kỹ thuật: URL trùng | Google hiển thị 2 URL dạng `/…/index.html`; 226 trang có link nội bộ dạng này (từ body) | Builder chuẩn hóa link nội bộ về URL thư mục (`canonicalIndexLinks`), body giữ nguyên → 0 trang còn link `/index.html` |
| Khám phá URL không cần GSC | IndexNow: khóa công khai `config/indexnow.json` + `/<key>.txt`, workflow `indexnow.yml` (hằng ngày, URL có lastmod 2 ngày gần nhất; chạy tay `all` cho lần đầu) | Gửi lần đầu 14/10/2026: 2.129 URL, HTTP 200 (lần thử trước đó nhận 403 SiteVerificationNotCompleted khi khóa mới đang được xác minh). Bing/Yandex/Seznam/Naver; Google vẫn đọc `sitemap.xml` |
| Title/meta theo nhu cầu đo được | BA-0029 → "không có bằng lái xe máy phạt bao nhiêu" (5.400; các biến thể "không bằng lái…" 6.600, 1.000, 880…); BA-0011 → "mức phạt nồng độ cồn xe máy" (5.400) | Bài đã trả lời đúng câu hỏi; chỉ đổi lớp `data/seo/article-meta.json` (rollback = xóa entry) |
| Công tắc DATA-DRIVEN | `data/seo/performance/` trống → ZERO-DATA; đặt tệp xuất Search Console vào đó → công cụ tự sinh `data-driven.md` | Test chặn tệp xuất giả; workflow giám sát SEO kiểm tra báo cáo luôn khớp dữ liệu (`--check`) |

Chưa làm được trong phiên (cần owner, không tự quyết): xác minh Google Search Console/Bing Webmaster Tools; Google Business Profile cho truy vấn local pack; thêm ID bài mới vào ma trận 2.000 bài.

## 8. Vòng 3 — SEO Engine 06 (14/10/2026, ZERO-DATA)

`node tools/seo-engine.mjs` chạy cả vòng nghiên cứu → quyết định trên 5 công cụ sẵn có (site-audit, seo-score, seo-master-audit, seo-index-coverage, seo-cold-start + IndexNow) và chỉ bổ sung phần còn thiếu. Kết quả ở [engine/README.md](engine/README.md).

| Hạng mục | Nội dung | Kết quả |
|---|---|---|
| Audit repo | Công cụ hiện có, gom vào README của engine | 0 link nội bộ hỏng; SEO score 99,7/100; 2.129 URL DONE, P0 mở = 0; sitemap ↔ ma trận PASS; khóa IndexNow có trên site |
| Nghiên cứu SERP + volume | Hàng đợi nghiên cứu của engine (nhóm có nhu cầu mà chưa có SERP; nhóm chưa đo volume) | +17 SERP Google Việt Nam (OpenSEO, tín dụng miễn phí) → 72 SERP; đo volume 33 từ khóa trong hàng đợi: 12 có số (ví dụ "mũ bảo hiểm đạt chuẩn" 590, "pin xe máy điện" 590, "thuê xe máy cầu giấy"/"hà đông" 110), 21 công cụ không trả số (ghi riêng, không coi là 0). Hàng đợi SERP và volume còn 0 |
| Keyword clustering | Gộp khi top 10 trùng ≥ 3 URL hoặc cùng bộ từ lõi (chính tả, "k/không", năm) | 183 từ khóa trong phạm vi → 117 nhóm (14 cặp trùng SERP) → [keyword-groups.md](engine/keyword-groups.md) |
| SEO matrix theo nhóm | Volume đo được, cụm, ý định SERP, trang đích, độ phủ, hành động, điểm ưu tiên (công thức ghi trong báo cáo) | [seo-engine-matrix.csv](engine/seo-engine-matrix.csv); trang chỉ khớp từ ngữ nhưng khác chủ đề không bao giờ được đề xuất đổi title |
| SERP giao dịch – địa phương | "bằng lái xe máy" (8.100/tháng), "dịch vụ cho thuê xe máy" (690), "thuê xe máy hà đông" (110), "thuê xe máy hoàng mai" (40), "thuê xe máy điện theo tháng" (50) có local pack hoặc toàn trang bán hàng | Không tạo trang blog/trang cửa ngõ theo quận: trang bán hàng và Google Business Profile phục vụ |
| Content gap → đề xuất bài mới | [proposed-matrix-rows.csv](engine/proposed-matrix-rows.csv) (owner duyệt, ma trận 2.000 bài không bị sửa) | "Xe máy điện: bằng lái và độ tuổi" (6.350/tháng); "Các loại bằng lái xe máy theo Luật 36/2024/QH15" (2.270); "Lỗi không gương xe máy" (2.400, đang là một mục trong bài gương chiếu hậu); "Vùng phát thải thấp Vành đai 1" (thêm "cấm xe máy" 1.000/tháng — cả 10 kết quả đầu nói về lộ trình hạn chế xe máy xăng) |
| Sửa nội dung pháp lý lỗi thời (ưu tiên trước khi đẩy từ khóa) | Đối chiếu toàn văn Luật 36/2024/QH15 (Điều 34, 56, 57, 59, 88, 89) ngày 14/10/2026 → `data/seo/legal-facts.json`; sửa qua `tools/seo-body-review.mjs` (thao tác `facts` mới: chỉ số của dữ kiện đã đối chiếu được thêm) | 10 bài: BA-0122 (A1 cũ mô tả như hiện hành), BA-0317 (A2 "175–300 cc", thông tư không tồn tại, mức phạt không căn cứ), BA-0035 và BA-0599 (sai lịch sử "Thông tư 46/2015 gộp A2"), BA-0190 và BA-0496 (ghi bằng A1 cấp từ 16 tuổi), BA-0044 và BA-0764 (xe đúng 50 cm³ không phải mô tô), BA-0010 và BA-0015 (xe đạp máy/xe đạp điện là xe thô sơ, không phải xe gắn máy). QA giữ 100 điểm; prose cũ được giữ, chỉ thay câu sai |
| Title/meta theo nhu cầu đo được | BA-0122 → "Bằng lái xe máy A1 lái được xe gì? Thuê xe máy với bằng A1" (sau khi nội dung đã đúng luật); BA-0017 → "Mũ bảo hiểm đạt chuẩn: cách nhận biết dấu CR và cài quai đúng" | "bằng lái xe máy a1" (1.000/tháng) + "bằng a1 lái được xe gì"; "mũ bảo hiểm đạt chuẩn" (590/tháng, SERP hỏi định nghĩa và cách nhận biết tem CR — đúng nội dung bài). Chỉ lớp `data/seo/article-meta.json` |
| Sổ quyết định | `data/seo/engine-decisions.json` | 4 đã làm (BA-0029, BA-0011, BA-0122, BA-0017), 1 hoãn (từ đồng nghĩa "sử dụng/dùng điện thoại"), 2 từ chối (biến thể "phượt" đã có bài Hà Giang, Tam Đảo) |
| Giám sát | Workflow SEO monitor chạy test engine + `seo-engine.mjs --check` (báo cũ = cảnh báo, không đỏ) | — |

Cần owner: thêm ID cho 4 bài đề xuất vào ma trận (bài pháp lý viết theo dữ kiện đã đối chiếu, kiểm tra lại văn bản sửa đổi nếu có); xác minh Search Console/Bing Webmaster Tools để chuyển DATA-DRIVEN.

## 9. Vòng 4 — SEO Master Battle Matrix, 10 vũ khí (15/10/2026, ZERO-DATA)

`node tools/seo-battle-matrix.mjs` → [battle/README.md](battle/README.md). Mười ma trận chạy nối tiếp (đầu ra vũ khí trước là đầu vào vũ khí sau), chỉ dùng dữ liệu quan sát/đo được đã cam kết trong `data/seo/battle/`; nhãn độ tin cậy ghi ở từng hàng.

| Vũ khí | Dữ liệu thật đã dùng | Kết quả chính |
|---|---|---|
| W1 Tình báo đối thủ | 72 SERP Google Việt Nam đã chụp + DataForSEO Labs (OpenSEO `find_serp_competitors`, 20 từ khóa, 8 có dữ liệu Labs) | 258 miền; 30 đối thủ nội dung được chọn; 10 mạnh nhất: motogo.vn, thuvienphapluat.vn, hanoibiker.com, justfly.vn, otosaigon.com, thuexemayhaiphong.com, vinwonders.com, vexere.com, vinfastauto.com, laodong.vn |
| W2 Từ khóa tổng | keyword-demand.json (OpenRush) + OpenSEO `get_keyword_metrics` 79 từ khóa (volume, KD, ý định) — hai nguồn giữ riêng | 791 từ khóa, 723 có volume đo được (79 bởi cả hai công cụ), 59 có KD; mỗi hàng có URL tham chiếu top 1 và nhãn độ tin cậy |
| W3 Điểm yếu đối thủ | Firecrawl audit 127 trang top 10 (122 tải được, 5 chặn/lỗi ghi lý do): từ, H2, FAQ, bảng, schema, văn bản luật, ngày, năm trong tiêu đề | 189 lượt trang chấm theo 15 điểm yếu quan sát được; mỗi truy vấn có "trang tốt hơn cần có" (viết từ nguồn gốc, không sao chép) |
| W4 Khoảng trống & cơ hội | Nhóm từ khóa engine 06 + điểm yếu W3 + 10 đối thủ mạnh nhất | Điểm cơ hội = điểm engine × (1 + điểm yếu TB/5): P0 6 ("bao nhiêu tuổi được đi xe máy điện", "xe máy điện có cần bằng lái không", "các loại bằng lái xe máy", "lỗi không gương xe máy", "cấm xe máy", "bằng lái xe máy là hạng gì"), P1 1, P2 2; khoảng trống theo từng đối thủ, từ khóa website chị em sở hữu được đánh dấu không nhắm |
| W5 Cụm chủ đề | 20 cụm K01–K20, ma trận URL, nhóm engine, PAA | Pillar đủ 20/20; 8 trang đang nhận nhóm khác ý định SERP (ghi rõ, không tự gộp); câu hỏi PAA theo cụm làm FAQ |
| W6 SERP benchmark | Trung vị cấu trúc top 10 đã audit vs. trang đích của website (đọc HTML đã build) | 60 truy vấn; 42 có trang của ta để so; khoảng cách phổ biến: ít ảnh, thiếu bảng số liệu, ít từ hơn trung vị |
| W7 Tìm kiếm AI | AI Overview + nguồn Google hiển thị lúc chụp, PAA, đoạn mở đầu trang đích | 60 truy vấn dạng câu hỏi (AI Overview xuất hiện ở 60/72 SERP, website chưa được trích); dạng trả lời cần có theo loại câu hỏi; thực thể pháp lý (Luật 36/2024, NĐ 168/2024) |
| W8 Liên kết & thẩm quyền | OpenSEO `get_backlinks_overview` motogo.vn (746 miền giới thiệu, 100 miền đầu phân loại) + 88 trang danh sách/địa chỉ đang xếp hạng | Nguồn nên theo: website chị em, hồ sơ NAP/danh bạ, bài danh sách OTA/du lịch (xevietanh.com đã nhắc "Thuê xe máy Nguyễn Tú" không kèm liên kết), đối tác tour, báo chí; từ chối mua link/PBN (10/100 miền giới thiệu của đối thủ có spam score ≥ 30) |
| W9 Kiến trúc URL | 2.129 URL của ma trận tổng + đề xuất engine | Mỗi URL: từ khóa, ý định, vị trí (trang chủ/hub/pillar/supporting/chuyển đổi), mục tiêu chuyển đổi; 4 URL đề xuất mới chờ owner thêm ID |
| W10 Master Battle Matrix | Gộp W1–W9 | 57 việc: P0 8, P1 12, P2 37; lộ trình 30/60/90 ngày; KPI đo được không cần Search Console (bài P0 đã đăng, nhóm ưu tiên vào top 20 ở lần chụp SERP sau, gap cấu trúc W6 = 0, answerFirst W7, coverage PASS, IndexNow) |

Nguồn không dùng được trong vòng này: OpenRush hết tín dụng (402) — chỉ dùng dữ liệu đã lấy trước; Ubersuggest MCP chưa được ủy quyền. Không có số liệu traffic/xếp hạng của website (chưa có Search Console) — KPI ghi "chưa có dữ liệu".

### 9.1 Thực thi Master Battle Matrix (15/10/2026)

Mọi việc trong W10 mà repo tự làm được đã làm xong; phần còn lại là việc ngoài trang (off-page) của owner. Ma trận sinh lại sau khi thực thi chỉ còn 6 việc W8 (P0 2, P1 4); 2.006 bài PUBLISHED (2.000 nền + 6 hàng SEO).

| Việc trong W10 | Đã làm | Bằng chứng |
|---|---|---|
| W4 P0 — 4 bài pháp lý mới (legal gate) | BA-2001 xe máy điện có cần bằng lái không; BA-2002 các loại bằng lái xe máy; BA-2003 lỗi không gương xe máy; BA-2004 cấm xe máy xăng Vành đai 1 — PUBLISHED qua Blog Factory, QA 100, mọi con số từ `data/seo/legal-facts.json` (Luật 36/2024/QH15, NĐ 168/2024/NĐ-CP, Chỉ thị 20/CT-TTg, NQ 57/2025/NQ-HĐND) | `data/blog/content-matrix.csv` hàng BA-2001…2004; commit `content(seo): BA-2001 BA-2002 BA-2003 BA-2004` |
| W4 P1/P2 — 2 bài hướng dẫn phượt | BA-2005 đi phượt bằng xe máy, BA-2006 đồ đi phượt xe máy (GUIDE, bảng + FAQ) — PUBLISHED qua Blog Factory (run 38739992809), QA 100/100; link chéo hai bài + 6 link ngữ cảnh từ bài cung đường/chạy phố | hàng BA-2005…2006; `tools/matrix-size.mjs` SEO_ROWS = 6; commit `content(seo): BA-2005 BA-2006` |
| W6 — gap cấu trúc trang đích | 11 bảng benchmark + 1 đoạn mở đầu trả lời thẳng (kinh nghiệm thuê xe máy Hà Nội) + 1 mục pháp lý trích Luật 36/2024 cho bài app người nước ngoài; gap "ít từ"/"không ảnh" chuyển thành quan sát (không viết dài, site không dùng ảnh) | 13 bài review qua `tools/seo-body-review.mjs`, log `data/seo/body-reviews.json`; W10 không còn việc W6 |
| W5/W9 — link nội bộ và meta cho bài mới | 17 link ngữ cảnh (9 tới hai bài pháp lý, 8 tới hai bài phượt) → không còn LOW-INBOUND; meta tiếng Việt cho 6 bài mới (hết TITLE-AUTO/DESC-CUT) | `data/seo/article-meta.json` BA-2001…2006; audit toàn site 0 lỗi, 2.136 URL sitemap |
| W8 P0 — liên kết chéo website chị em (phần trong repo) | Trang `/lien-he/` có mục "Website cửa hàng" liên kết ngữ cảnh tới thuexemaynguyentu.com | `data/site/lien-he.body.html` |
| Engine 06 — chốt chủ đề | 12 quyết định done trỏ tới BA-2001…2006; 3 chủ đề curated COVERED; nhóm có quyết định done được đánh giá theo bài đã đăng (KEEP); engine không còn NEW_ARTICLE | `data/seo/engine-decisions.json`, `config/seo-cold-start.json` |
| Công cụ | KPI battle đếm bài SEO đã đăng thật và gap có thể hành động; mục tiêu đăng của factory = số hàng ma trận; 1054/1054 test | `tools/seo-battle-matrix.mjs`, `tools/factory-target.mjs` |

Việc còn lại trong W10 (chỉ owner làm được, không có trong repo): hồ sơ Google Business Profile + danh bạ với NAP đồng nhất trỏ về `/lien-he/` và `/gia-thue/`; đặt liên kết từ thuexemaynguyentu.com (và blog./wiki.) tới các bài hướng dẫn/pháp lý; đề nghị các bài danh sách "địa chỉ thuê xe máy Hà Nội" trên OTA/du lịch bổ sung cửa hàng; trang đối tác tour; PR báo chí chỉ khi có số liệu thật; trả lời diễn đàn đúng chủ đề. Không mua link, không PBN.

### 9.2 Vòng 5 — Rà soát hiệu lực văn bản pháp luật (16/10/2026)

Lý do: Nghị định 168/2024/NĐ-CP (507 lượt dẫn trong 227 bài) đã được sửa đổi, bổ sung bởi **Nghị định 238/2026/NĐ-CP** (ban hành 26/6/2026, hiệu lực 15/8/2026 — số hiệu và ngày xác nhận qua tiêu đề văn bản trên Cổng TTĐT Chính phủ và Công báo). Mở rộng ra toàn bộ văn bản bài dẫn.

Công cụ mới: `node tools/seo-legal-citations.mjs` → [legal-citations.md](legal-citations.md). Sổ đăng ký `data/seo/legal-documents.json` (29 văn bản, mỗi văn bản ghi trạng thái, mức bằng chứng, nguồn, việc chờ đối chiếu); công cụ quét 317 bài có trích dẫn, phân loại từng trích dẫn theo câu ("đang áp dụng" / "nhắc quy định cũ"), chạy trong SEO monitor; test fail khi bài dẫn văn bản ngoài sổ.

| Phát hiện | Số | Xử lý trong vòng này |
|---|---:|---|
| Bài dẫn văn bản đã bị thay thế như quy định đang áp dụng | 10 | Cờ `content_flags` (engine 06 → FIX_FIRST, ngừng đẩy từ khóa): Thông tư 29/2015/TT-BGTVT về giấy phép lái xe quốc tế (BA-0041, BA-0047, BA-0605, BA-0611 → nay Thông tư 35/2024/TT-BGTVT rồi Thông tư 12/2025/TT-BCA); Thông tư 24/2023/TT-BCA về đăng ký xe (BA-0227, BA-0509 → Thông tư 79/2024/TT-BCA từ 01/01/2025); Nghị định 13/2023/NĐ-CP về dữ liệu cá nhân (BA-0275, BA-0557, BA-1121, BA-1373 → Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 + Nghị định 356/2025/NĐ-CP từ 01/01/2026). 4 bài khác về dữ liệu cá nhân đã viết đúng mốc 01/01/2026. |
| Trích dẫn sai ký hiệu | 1 | BA-0323 ghi "Thông tư 38/2024/TB-BGTVT" và gán 40 km/h cho mọi xe trên đường phố → cờ, sửa sau khi đối chiếu toàn văn Thông tư 38/2024/TT-BGTVT. |
| Văn bản được sửa đổi sau khi bài đăng | 1 | Nghị định 168/2024 ← Nghị định 238/2026: theo các cổng công an tỉnh và bản tin pháp luật, các điều khoản được sửa (Điều 3, 6, 13, 14 khoản 3 điểm b và khoản 6 điểm a, Điều 18 khoản 4 điểm a — người 16–18 tuổi đi xe mô tô, Điều 20) không trùng các khung phạt bài đang dẫn (điện thoại, đèn tín hiệu, mũ bảo hiểm, nồng độ cồn, không giấy phép, giao xe, gương). Không sửa bài khi chưa đọc toàn văn; không gắn cờ vì chưa có mâu thuẫn. |
| Văn bản dẫn như hiện hành nhưng chưa đối chiếu toàn văn | 15 | Hàng đợi đối chiếu trong báo cáo (Bộ luật Dân sự, Nghị định 67/2023, Thông tư 38/2024, Quyết định 13/2026/QĐ-TTg về lộ trình khí thải, …). |

Việc bị chặn trong phiên này: môi trường chạy không truy cập được các máy chủ văn bản chính thức (congbao.chinhphu.vn, vanban.chinhphu.vn, datafiles.chinhphu.vn, thuvienphapluat.vn, bocongan.gov.vn, vbpl.vn — proxy trả 403), nên chưa đối chiếu toàn văn Nghị định 238/2026, Nghị định 356/2025, Thông tư 12/2025/TT-BCA, Thông tư 79/2024/TT-BCA. Khi mở mạng: (1) đọc toàn văn, ghi dữ kiện vào `data/seo/legal-facts.json`; (2) sửa 11 bài có cờ qua `tools/seo-body-review.mjs` (patch.facts), đóng cờ (`resolved`, `fix`); (3) thêm câu "được sửa đổi, bổ sung bởi Nghị định 238/2026/NĐ-CP" vào các trang đích pháp lý K09/K10 nếu khung phạt không đổi; (4) chạy lại công cụ và engine.

### 9.3 Vòng 6 — Tín hiệu E-E-A-T trong repo (16/10/2026)

Nguồn luật chính thức vẫn bị chặn và không còn nhóm từ khóa đo được nào chưa có trang, nên vòng này làm phần tin cậy (trust) mà repo tự làm được:

- `/gioi-thieu/` viết lại từ 173 lên ~520 từ, chỉ dữ kiện thật: cửa hàng đứng sau (địa chỉ, giờ, phạm vi, website chính), nguồn số liệu, và **quy trình kiểm chứng nội dung pháp lý** đang vận hành (dẫn số hiệu + ngày hiệu lực, chỉ đưa con số sau khi đối chiếu toàn văn với nguồn chính thức, sổ đăng ký hiệu lực văn bản rà định kỳ, bài dẫn văn bản hết hiệu lực bị đánh dấu, ngày "cập nhật" hiển thị), giới hạn (tham khảo, không thay tư vấn pháp lý) và kênh báo lỗi.
- Mọi bài: byline "MotoAI Editorial" liên kết tới `/gioi-thieu/`; schema Article.author có `url` trỏ tới trang đó (thực thể chịu trách nhiệm nội dung). Publisher/LocalBusiness (AutoRental tại `/lien-he/`) giữ nguyên.
- Sitemap không đổi (lastmod theo nội dung), audit toàn site 0 lỗi, 1058/1058 test.

### 9.4 Vòng 7 — Việc chưa làm được (ghi chú) và phần AI chuẩn bị cho việc của owner (16/10/2026)

**Chưa làm được trong môi trường này — ghi chú để làm tiếp khi mở khóa:**

| Việc | Vì sao chưa làm | Mở khóa bằng |
|---|---|---|
| Đối chiếu toàn văn Nghị định 238/2026/NĐ-CP, Nghị định 356/2025/NĐ-CP, Thông tư 12/2025/TT-BCA, Thông tư 79/2024/TT-BCA; sửa 11 bài có cờ; thêm câu "được sửa đổi bởi NĐ 238/2026" vào trang đích pháp lý | Mạng của môi trường chặn mọi máy chủ văn bản chính thức (proxy 403); Firecrawl hết tín dụng; WebFetch không phân giải được tên miền | Thêm congbao.chinhphu.vn, vanban.chinhphu.vn, datafiles.chinhphu.vn, thuvienphapluat.vn, bocongan.gov.vn, vbpl.vn vào Allowed domains của environment (hoặc mức truy cập rộng hơn) |
| 15 văn bản "chưa đối chiếu toàn văn" trong `docs/seo/legal-citations.md` | Cùng lý do | Cùng cách |
| Mở rộng từ khóa cho cụm K02/K08 (nghiên cứu từ khóa mới) | OpenSEO còn 27 tín dụng, nghiên cứu từ khóa tốn ~54/seed; OpenRush hết tín dụng | Nạp tín dụng OpenSEO hoặc OpenRush |
| KPI "nhóm ưu tiên vào top 20" (chụp lại SERP sau khi đăng) | Mới đăng 1–2 ngày, chưa đủ thời gian lập chỉ mục; chụp SERP cần tín dụng | Chụp lại sau 2–4 tuần (OpenSEO get_serp_results ~5 tín dụng/truy vấn) |
| Chuyển DATA-DRIVEN | Search Console chưa kết nối (OpenSEO báo not_connected) | Xác minh Search Console cho `https://chatbot.thuexemaynguyentu.com/`, đặt tệp xuất vào `data/seo/performance/` hoặc kết nối vào dự án OpenSEO |
| ADD_SECTION "lỗi sử dụng điện thoại" (480/tháng) | Bài BA-0989 đã nêu mức phạt và trừ điểm; khác biệt chỉ là từ đồng nghĩa (deferred 14/10) | Xem lại khi có dữ liệu Search Console |
| BM-007 PR báo chí | Chưa có số liệu thật của cửa hàng | Owner thu thập số liệu theo danh sách trong `docs/seo/owner-kit.md` mục 5 |

**Làm tiếp theo ma trận (W10 còn 6 việc W8 của owner + 2 việc P2 chờ luật):**

- `/doi-tac/` — trang đối tác mới (BM-006): cách gửi lịch đoàn, giao xe trong giờ, cọc/bảo hiểm theo `business.json`, bộ bài hướng dẫn gửi khách; liên kết từ `/gioi-thieu/` và `/lien-he/`; trong sitemap.
- `docs/seo/owner-kit.md` — phần "AI chuẩn bị" cho BM-003…BM-008: khối NAP chuẩn + checklist Google Business Profile + danh bạ (từ hồ sơ đối thủ); kế hoạch liên kết chéo từ site chị em (18 trang đích, anchor gợi ý, chỗ đặt); danh sách trang "địa chỉ thuê xe máy Hà Nội" đang xếp hạng kèm mẫu tin nhắn; mẫu email hợp tác tour; danh sách số liệu cần có trước khi làm PR; 29 chủ đề diễn đàn trong SERP kèm 5 bản nháp trả lời có nguồn.

## 10. Vòng tiếp theo (khi có dữ liệu Search Console)

0. ~~Hoàn tất vòng 5 (đối chiếu toàn văn, sửa bài có cờ, đóng cờ)~~ — xong 23/10/2026, xem mục 12; còn 10 văn bản chưa đọc toàn văn (56 bài REVIEW).
1. Lấy truy vấn/CTR thật theo URL → điều chỉnh title/meta cho trang có hiển thị cao nhưng CTR thấp (qua `data/seo/article-meta.json`).
2. Ưu tiên cụm K08 (xe máy điện) và K02 (giá thuê) — có volume đo được và chưa thuộc site chị em.
3. Mọi sửa body tiếp tục qua `tools/seo-body-review.mjs`.

## 11. Rollback

- Metadata một bài: xóa entry trong `data/seo/article-meta.json` → `node tools/build-blog.mjs`.
- Body một bài: `git revert` commit `content(seo): body review …` chứa ID bài (mỗi commit ≤ 10 body) rồi build.
- Toàn bộ: `git revert` các commit v70/v71 (không có thay đổi dữ liệu nào ngoài repo).
- IndexNow: tắt workflow `indexnow.yml`; xóa `config/indexnow.json` và tệp khóa `<key>.txt` ở gốc.
- Engine 06: báo cáo `docs/seo/engine/` chỉ là đầu ra (xóa được); quyết định ở `data/seo/engine-decisions.json`; bản sửa pháp lý 10 bài: `git revert` commit `content(seo): legal accuracy …` rồi build.
- Battle matrix: `docs/seo/battle/` là đầu ra sinh lại được; dữ liệu nghiên cứu `data/seo/battle/` chỉ là bằng chứng (xóa không ảnh hưởng trang); việc thực thi từ ma trận đi qua các lớp có rollback ở trên.

## 12. Vòng 5 — MASTER WORK A–Z: đối chiếu toàn văn pháp luật, sửa có chọn lọc, phân loại nội dung (23/10/2026)

**Phương pháp.** Audit thật trên 2.006 bài PUBLISHED (matrix = manifest = sitemap: 2.006 bài, 2.137 URL), đối chiếu từng con số/điều khoản với **toàn văn chính thức** (Công báo, Cổng TTĐT Chính phủ — bản có lớp chữ, hoặc PDF ký số đọc từng trang), không dùng bản tin. Chỉ sửa câu sai có bằng chứng, qua `tools/seo-body-review.mjs` (cổng: không số mới ngoài dữ kiện đã xác minh, không giảm số từ, QA nhà máy không giảm điểm). Không đổi URL/slug/canonical/title/H1.

**Văn bản đã đọc toàn văn** (dữ kiện trích nguyên văn trong `data/seo/legal-facts.json`, sổ `data/seo/legal-documents.json`): Nghị định 168/2024/NĐ-CP (Điều 7, 14, 18, 32, 53), Nghị định 238/2026/NĐ-CP (hiệu lực 15/8/2026), Thông tư 38/2024/TT-BGTVT, Thông tư 79/2024/TT-BCA, Thông tư 12/2025/TT-BCA và **Thông tư 108/2026/TT-BCA (thay Thông tư 12/2025 từ 01/7/2026)**, Luật 91/2025/QH15, Nghị định 356/2025/NĐ-CP.

| Nhóm lỗi đã xác minh | Bài | Sửa |
|---|---:|---|
| Mức phạt sai so với toàn văn (chuyển làn 600–800k → 200–400k; điện thoại 400–600k → 800k–1tr + trừ 4 điểm; cồn mức 1 2–4tr → 2–3tr; tốc độ 100–300k; không bằng lái 10–30tr; 40 km/h cho mọi xe; TT 38 gán cho IDP; "chỉ áp dụng khi có biển") | 10 | lô `legal-1` |
| "Quên mang bằng lái/bảo hiểm bị phạt 200–300k" áp cho mọi người lái — điểm a, c, d khoản 2 Điều 18 chỉ áp với xe **kinh doanh vận tải**; người dùng IDP thiếu bằng quốc gia là điểm b khoản 5 (2–4tr) | 54 | lô `gplx-1…6` |
| Phạt kiểm định khí thải gán cho người lái — điểm b khoản 1 Điều 32 phạt **chủ xe**, hiệu lực theo lộ trình (Điều 53) | 3 | lô `gplx` |
| Dẫn văn bản hết hiệu lực như hiện hành (TT 29/2015, TT 12/2025 → TT 108/2026; TT 24/2023 → TT 79/2024; NĐ 13/2023 → Luật 91/2025 + NĐ 356/2025), kể cả thủ tục cấp IDP đã đổi (bỏ điều kiện PET, bỏ mốc 5 ngày), IDP do Việt Nam cấp không dùng trong nước, thời hạn xóa dữ liệu 72 giờ → 02 ngày làm việc/20 ngày | 13 | lô `legal-2`, `legal-3` |
| Nghị định 238/2026 chưa phản ánh (gương: buộc thay thế/khôi phục từ 15/8/2026) | 1 | BA-2003 |
| Giá xe máy điện bịa "90.000–300.000đ/ngày theo bảng giá" (bảng giá: giá liên hệ) | 4 | BA-0777 BA-0780 BA-1131 BA-1137 |
| Anchor "Ứng dụng thuê xe không cần tài sản đảm bảo" trỏ bài "không cần tải app", quảng cáo không cọc | 2 | BA-0181 BA-0196 |

Không lỗi: trùng lặp nội dung (shingle 8 từ, cặp chứa nhau lớn nhất 0,17 < 0,2), tiền cọc ghi số (chỉ qua `{{ business.* }}`), các khung phạt còn lại (mũ, đèn đỏ, ngược chiều, cồn mức 2–3, không bằng lái 2–4tr/6–8tr, gương) khớp toàn văn; Nghị định 238/2026 không đổi mức tiền nào bài đang dẫn.

**Kết quả.** 83 bài đã sửa (77 pháp lý + 6 chính xác thương mại), mỗi bài qua cổng review và QA nhà máy không giảm điểm; 83 bài này có `dateModified` 23/10/2026. Báo cáo hiệu lực văn bản (`docs/seo/legal-citations.md`): bài dẫn văn bản hết hiệu lực như hiện hành **15 → 0**, sai ký hiệu **1 → 0**, văn bản sửa đổi chờ đối chiếu **1 → 0** (NĐ 168 ↔ NĐ 238 đã đối chiếu), chưa đối chiếu toàn văn **15 → 10 văn bản**. Cờ `content_flags`: 66 cờ mới mở rồi đóng hết theo từng lô (còn mở: 0).

**Phân loại nội dung 2.006 bài** — cột `Content Review` trong [seo-master-matrix.csv](seo-master-matrix.csv), luật trong `tools/seo-master-audit.mjs → contentReview()`:

| Nhãn | Số bài | Căn cứ |
|---|---:|---|
| KEEP | 1.684 | Không còn lỗi có bằng chứng |
| FIX | 0 | = cờ `content_flags` còn mở (đã đóng hết) |
| REVIEW | 56 | Dẫn 10 văn bản chưa đọc toàn văn (Bộ luật Dân sự 2015, NĐ 67/2023, QĐ 13/2026/QĐ-TTg, TT 60/2023, NĐ 96/2016, TT 04/2021, NQ 202/2025, Luật 39/2024, Luật 08/2022, NĐ 10/2022) + BA-0047 (lệ phí IDP chưa đối chiếu thông tư lệ phí) |
| BLOCKED | 266 | Ghi cứng giá tuần/tháng theo `data/business/pricing.json` (Vision tuần 800.000đ; Air Blade tuần 800.000đ, tháng 1.400.000đ; Click/Mio tuần 600.000đ, tháng từ 1.000.000đ) khác bảng giá chuẩn chủ cửa hàng gửi 23/10/2026 — chờ chủ cửa hàng chốt bảng hiện hành (`data/seo/content-review.json`) |

Kỹ thuật: 2.137/2.137 URL DONE, 0 P0, 0 link nội bộ hỏng, SEO score 99.7/100 (không đổi), 1.075/1.075 test.

**Cần chủ cửa hàng quyết định / cung cấp:**
1. Bảng giá hiện hành: `pricing.json` (đang dùng cho chatbot + 266 bài) hay bảng giá chuẩn gửi 23/10/2026 (khác ở Wave tuần/tháng, Vision tuần, Air Blade tuần/tháng, Click/Mio tuần/tháng, xe 50cc theo ngày). Sau khi chốt: cập nhật `pricing.json` một nơi, thay số cứng trong bài bằng dữ liệu dùng chung, mở khóa BLOCKED.
2. Tên thương hiệu trong `business.json` ("Nguyễn Tú") so với chuẩn NAP "Cho Thuê Xe Máy Nguyễn Tú" / GBP "Thuê xe máy ở Hà Nội - Nguyễn Tú".
3. Search Console cho `https://chatbot.thuexemaynguyentu.com/` — vẫn **NO DATA** (không khẳng định index/thứ hạng).

**Ghi chú quy trình.** Commit `9000bcd` chứa 19 body (lô 4 + 5) do một bài lô 4 bị QA hoàn tác làm script dừng giữa chừng; đã đẩy lên, không viết lại lịch sử. Bộ test rò thư mục tạm (~135 MB mỗi lần) đã được vá (`tests/unit/factory-progress.test.js`, `tests/helpers/factory-sandbox.mjs`).

**Rollback vòng 5.** Mỗi lô là cặp commit `content(seo)` + `build(blog)`: `545f11f/157d2ec`, `8c150df/cdc8a83`, `568c5f9/4038334`, `042d5cc/f9a8099`, `92a5251/2f57d16`, `69fa0bb/9e3f45d`, `b25076c/471dbb5`, `9000bcd/9f2a846` — `git revert` cặp tương ứng (hoặc chỉ commit content rồi `node tools/build-blog.mjs`). Dữ kiện pháp lý và sổ đăng ký là dữ liệu, revert không ảnh hưởng trang.
