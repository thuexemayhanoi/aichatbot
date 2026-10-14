# SEO Master Matrix — chatbot.thuexemaynguyentu.com

> Sinh tự động bởi `node tools/seo-master-audit.mjs` (offline, deterministic) từ HTML thực tế đã build.
> Dữ liệu đầy đủ từng URL: [seo-master-matrix.csv](seo-master-matrix.csv) · [seo-master-matrix.json](seo-master-matrix.json).
> Phạm vi SEO: **chỉ tiếng Việt**. Không xóa, không noindex, không đổi URL/slug/canonical, không gộp bài.

## Phủ URL

- Tổng URL trong sitemap đã audit: **2129** (100%) — trong đó **2000** bài viết.
- Bài viết: 2000
- Trang chủ (Agent): 1
- Trang chính sách thuê xe: 1
- Trang chuyển đổi (giá): 1
- Trang chuyển đổi (liên hệ): 1
- Blog home: 1
- Hub danh mục: 6
- Hub cụm chủ đề: 3
- Hub danh mục (phân trang): 80
- Trang giới thiệu (E-E-A-T): 1
- Pháp lý: 2
- Hub chủ đề con: 32

## Trước / sau

| Chỉ số | Baseline | Hiện tại |
|---|---:|---:|
| URL P0 còn mở | 133 | 0 |
| Bài có 0 link ngữ cảnh/cụm trỏ vào | 524 | 0 |
| Trung vị link ngữ cảnh/cụm trỏ vào mỗi bài | 2 | 13 |
| URL có độ sâu click > 4 | 0 | 0 |
| Độ sâu click lớn nhất | 3 | 3 |
| ATTR-BROKEN — thuộc tính meta/og vỡ do dấu " không escape | 133 | 0 |
| CANNIBAL — từ khóa trùng/rất gần bài khác ngoài cụm | 22 | 0 |
| CARD-H2 — thẻ bài liên quan dùng H2 chen vào dàn ý | 2000 | 0 |
| DESC-CUT — meta description cắt giữa câu | 1612 | 0 |
| DESC-DUP — meta description trùng | 113 | 0 |
| DESC-LEN — meta description ngoài 120–165 ký tự | 217 | 0 |
| EN-BODY — body còn cụm tiếng Anh từ ma trận | 72 | 72 |
| INTRO-KW — đoạn mở chưa trả lời trực tiếp theo từ khóa | 11 | 14 |
| KW-EN — từ khóa ma trận lẫn tiếng Anh | 95 | 0 |
| KW-TYPO — từ khóa ma trận sai chính tả | 104 | 0 |
| LONG — trên 2.000 từ | 9 | 9 |
| LOW-INBOUND — dưới 3 link ngữ cảnh/cụm trỏ vào | 1127 | 0 |
| NO-CTX-LINK — body không có link ngữ cảnh tới bài khác | 242 | 242 |
| NO-DESC — thiếu meta description | 14 | 0 |
| NO-FAQ — thiếu FAQ | 60 | 60 |
| NO-ITEMLIST — CollectionPage thiếu ItemList | 86 | 0 |
| NO-TABLE — ý định so sánh nhưng thiếu bảng | 69 | 74 |
| ORPHAN — không có link bài/hub trỏ vào (chỉ phân trang sâu) | 141 | 0 |
| SCHEMA-THIN — Article schema thiếu inLanguage/image/logo | 2000 | 0 |
| THIN — dưới 800 từ | 13 | 13 |
| TITLE-AUTO — title sinh máy từ slug | 1856 | 0 |
| TITLE-CASE — title viết hoa/thường sai (Title Case máy) | 1720 | 0 |
| TITLE-EN — title lẫn tiếng Anh | 97 | 0 |
| TITLE-LEN — title ngoài 30–65 ký tự | 550 | 0 |
| TITLE-TYPO — title sai chính tả/dấu | 102 | 0 |

## Ưu tiên & trạng thái

| Priority | Số URL |
|---|---:|
| P0 — chặn crawl/index/truy cập | 133 |
| P1 — chuyển đổi/SEO tiềm năng cao | 1962 |
| P2 — semantic/topical/chất lượng nội dung | 34 |

| Status | Ý nghĩa | Số URL |
|---|---|---:|
| DONE | Không còn vấn đề kỹ thuật lẫn nội dung | 1678 |
| TECH-DONE | Title/meta/link/schema đã tối ưu; còn khoảng trống nội dung cần **quy trình review body riêng** (AGENTS.md cấm ghi đè body PUBLISHED) | 451 |
| PLANNED | Còn vấn đề kỹ thuật chưa xử lý | 0 |

## Batch (20 URL/batch, thứ tự P0 → P1 → P2, trang chuyển đổi/hub/pillar trước)

Tổng 107 batch; 89 batch còn hạng mục mở (PLANNED/TECH-DONE).

| Batch | URL | DONE | TECH-DONE | PLANNED | Ví dụ |
|---|---:|---:|---:|---:|---|
| SEO-B001 | 20 | 20 | 0 | 0 | /blog/an-toan/an-toan-khi-thanh-toan-coc-vi-du-thuc-te/ |
| SEO-B002 | 20 | 17 | 3 | 0 | /blog/app/app-ho-tro-thu-tuc-thue-xe-cau-hoi-thuong-gap/ |
| SEO-B003 | 20 | 16 | 4 | 0 | /blog/app/tim-hieu-hybrid-search-trong-ung-dung-thue-xe-cau-hoi-thuong-gap/ |
| SEO-B004 | 20 | 18 | 2 | 0 | /blog/dia-phuong/cho-hoa-quan-tam-buoi-toi/ |
| SEO-B005 | 20 | 17 | 3 | 0 | /blog/huong-dan/thue-xe-can-nguoi-bao-lanh-khong-checklist/ |
| SEO-B006 | 20 | 18 | 2 | 0 | /blog/thue-xe/thue-xe-50cc-gia-tot-nhat/ |
| SEO-B007 | 20 | 20 | 0 | 0 | /blog/xe-dien/cach-giu-pin-ben-khi-thue-xe-dien-dai-han/ |
| SEO-B008 | 20 | 10 | 10 | 0 | /blog/cong-cu-huong-dan/ |
| SEO-B009 | 20 | 5 | 15 | 0 | /blog/an-toan/di-nhom-an-toan/ |
| SEO-B010 | 20 | 5 | 15 | 0 | /blog/an-toan/nong-do-con-khi-lai-xe/ |
| SEO-B011 | 20 | 11 | 9 | 0 | /blog/app/app-thue-xe-may-la-gi/ |
| SEO-B012 | 20 | 6 | 14 | 0 | /blog/app/hoi-dap-voi-agent-thue-xe/ |
| SEO-B013 | 20 | 10 | 10 | 0 | /blog/app/tro-ly-thue-xe-may-la-gi/ |
| SEO-B014 | 20 | 6 | 14 | 0 | /blog/dia-phuong/ca-phe-trung-va-xe-may/ |
| SEO-B015 | 20 | 4 | 16 | 0 | /blog/dia-phuong/gia-lam-va-long-bien/ |
| … | | | | | xem CSV cột Batch |

## Định nghĩa mã vấn đề

| Mã | Mức | Vấn đề | Hành động |
|---|---|---|---|
| NOINDEX | P0 | noindex trên trang công khai | Gỡ noindex ngoài ý muốn |
| CANONICAL | P0 | canonical không tự trỏ | Đặt canonical tự trỏ đúng URL |
| SITEMAP | P0 | không có trong sitemap | Bổ sung URL vào sitemap.xml |
| H1 | P0 | số H1 khác 1 | Giữ đúng một H1 |
| NO-TITLE | P0 | thiếu title | Viết title |
| NO-DESC | P0 | thiếu meta description | Viết meta description |
| ATTR-BROKEN | P0 | thuộc tính meta/og vỡ do dấu " không escape | Escape dấu " trong thuộc tính HTML |
| NO-SCHEMA | P1 | thiếu structured data | Bổ sung schema phù hợp |
| TITLE-DUP | P1 | title trùng | Viết title riêng theo góc nội dung |
| DESC-DUP | P1 | meta description trùng | Viết meta description riêng |
| TITLE-AUTO | P1 | title sinh máy từ slug | Viết lại title tiếng Việt theo ý định tìm kiếm |
| TITLE-CASE | P1 | title viết hoa/thường sai (Title Case máy) | Chuẩn hóa title kiểu câu tiếng Việt |
| TITLE-EN | P1 | title lẫn tiếng Anh | Việt hóa title (chỉ SEO tiếng Việt) |
| TITLE-TYPO | P1 | title sai chính tả/dấu | Sửa chính tả title |
| TITLE-LEN | P1 | title ngoài 30–65 ký tự | Điều chỉnh độ dài title |
| DESC-CUT | P1 | meta description cắt giữa câu | Viết meta description trọn câu |
| DESC-LEN | P2 | meta description ngoài 120–165 ký tự | Điều chỉnh độ dài meta description |
| KW-EN | P1 | từ khóa ma trận lẫn tiếng Anh | Dùng từ khóa chính tiếng Việt (lớp SEO) |
| KW-TYPO | P1 | từ khóa ma trận sai chính tả | Dùng từ khóa chính đúng chính tả (lớp SEO) |
| CANNIBAL | P1 | từ khóa trùng/rất gần bài khác ngoài cụm | Tách ý định: chỉnh title/keyword, liên kết về pillar |
| ORPHAN | P1 | không có link bài/hub trỏ vào (chỉ phân trang sâu) | Thêm link cụm chủ đề/liên quan trỏ vào |
| LOW-INBOUND | P2 | dưới 3 link ngữ cảnh/cụm trỏ vào | Tăng link nội bộ theo ngữ cảnh |
| DEPTH | P2 | độ sâu click > 4 từ trang chủ | Rút ngắn đường dẫn qua pillar/hub |
| CARD-H2 | P2 | thẻ bài liên quan dùng H2 chen vào dàn ý | Hạ thẻ bài liên quan xuống H3 |
| SCHEMA-THIN | P2 | Article schema thiếu inLanguage/image/logo | Bổ sung inLanguage, image, publisher logo |
| NO-ITEMLIST | P2 | CollectionPage thiếu ItemList | Bổ sung ItemList cho trang danh sách |
| THIN | P2 | dưới 800 từ | Bổ sung nội dung hữu ích (review body) |
| LONG | P2 | trên 2.000 từ | Rà soát cô đọng (review body) |
| NO-FAQ | P2 | thiếu FAQ | Thêm FAQ thực sự hữu ích (review body) |
| NO-TABLE | P2 | ý định so sánh nhưng thiếu bảng | Thêm bảng so sánh (review body) |
| NO-SOURCE | P1 | bài pháp lý thiếu nguồn văn bản gốc | Trích văn bản gốc + hiệu lực (legal gate) |
| NO-CTX-LINK | P2 | body không có link ngữ cảnh tới bài khác | Thêm 2–3 link ngữ cảnh trong body (review body) |
| INTRO-KW | P2 | đoạn mở chưa trả lời trực tiếp theo từ khóa | Viết câu trả lời trực tiếp ở đoạn mở (review body) |
| EN-BODY | P2 | body còn cụm tiếng Anh từ ma trận | Việt hóa cụm tiếng Anh trong body (review body) |
