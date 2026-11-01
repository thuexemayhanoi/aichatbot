# Lô M1 — Master SEO Matrix 2026 (2026-11-01)

Workbook: `docs/seo/MASTER-SEO-MATRIX-2026.xlsx` — 23 sheet bắt buộc + 4 phụ lục; sinh bởi `tools/seo-master-2026.py`, công thức dashboard kiểm bằng LibreOffice (`formula-check.json`).

## Kết quả đo

- URL kiểm kê: **2169** — sitemap 2169, HTML build 2169, có liên kết vào 2169, bài trong manifest 2006.
- Phân loại: KEEP 2009, IMPROVE 160 (CONSOLIDATE / REDIRECT / NOINDEX-CANDIDATE: 0 — không có bằng chứng trùng nội dung hay trùng ý định).
- QA proxy 100 điểm: trung bình 94.9, thấp nhất 84, 2168/2169 URL ≥ 85 (proxy tự động, không thay review biên tập).
- Họ biến thể slug: 331 họ, Jaccard 5-gram cao nhất 0.161 (ngưỡng gộp 0,5) → 0 ứng viên gộp.
- Kiểm tra kỹ thuật không PASS: T21 WARN, T23 WARN, T24 N/A.
- Search Console: NOT CONNECTED; CWV: LAB only.

## Backlog mở (ưu tiên)

- B02 P0 — Search Console chưa kết nối — không có dữ liệu index/CTR/truy vấn (owner, lô —)
- B04 P1 — Hub chủ yếu là danh sách thẻ; đoạn dẫn dùng chung mô tả danh mục (agent, lô M5)
- B06 P1 — Đoạn văn trùng với bài khác (QA nhà máy no-cross-article-duplicate) (agent, lô D01+)
- B07 P3 — local_scope trống trong content-matrix (QA local-angle) (agent, lô L01+)
- B08 P3 — IMAGE PENDING — chưa có ảnh đại diện (owner, lô —)
- B11 P3 — Google từng hiển thị URL /index.html (SERP 2026-10-14) (owner, lô —)
- B12 P2 — Chưa đo GBP/local pack (owner, lô —)
- B13 P2 — Khoảng trống từ khóa chưa có trang (owner, lô —)
- B14 P3 — CSS mỗi trang 85.7 KB chưa nén (cảnh báo nội bộ ≥ 64 KB) (agent, lô —)
- B19 P2 — Bài pháp lý chưa qua lô đối chiếu toàn văn (agent, lô C08+)
- B21 P2 — Bài thiếu cấu trúc H2/danh sách (agent, lô T1)

## Giới hạn

- Không có dữ liệu Search Console/CrUX/GBP/backlink của website: các ô tương ứng ghi N/A kèm nguồn thiếu.
- CWV là số đo LAB (máy chủ tĩnh cục bộ, giả lập mạng 4G chậm, CPU 4x), không phải dữ liệu field.
- Vị trí SERP là ảnh chụp một thời điểm (data/seo/serp-snapshots/), không phải thứ hạng cố định.
- Chuẩn tham chiếu và ngày cập nhật: sheet X-DATA SOURCES.
