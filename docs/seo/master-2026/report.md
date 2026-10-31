# Lô M1 — Master SEO Matrix 2026 (2026-10-31)

Workbook: `docs/seo/MASTER-SEO-MATRIX-2026.xlsx` — 23 sheet bắt buộc + 4 phụ lục; sinh bởi `tools/seo-master-2026.py`, công thức dashboard kiểm bằng LibreOffice (`formula-check.json`).

## Kết quả đo

- URL kiểm kê: **2138** — sitemap 2138, HTML build 2138, có liên kết vào 2138, bài trong manifest 2006.
- Phân loại: KEEP 1952, IMPROVE 186 (CONSOLIDATE / REDIRECT / NOINDEX-CANDIDATE: 0 — không có bằng chứng trùng nội dung hay trùng ý định).
- QA proxy 100 điểm: trung bình 94.4, thấp nhất 83, 2134/2138 URL ≥ 85 (proxy tự động, không thay review biên tập).
- Họ biến thể slug: 331 họ, Jaccard 5-gram cao nhất 0.161 (ngưỡng gộp 0,5) → 0 ứng viên gộp.
- Kiểm tra kỹ thuật không PASS: T20 FAIL, T21 WARN, T23 WARN, T24 N/A, CWV07-INTERACTION WARN.
- Search Console: NOT CONNECTED; CWV: LAB only.

## Backlog mở (ưu tiên)

- B02 P0 — Search Console chưa kết nối — không có dữ liệu index/CTR/truy vấn (owner, lô —)
- B04 P1 — Hub chủ yếu là danh sách thẻ; đoạn dẫn ngắn (agent, lô M3)
- B06 P2 — Đoạn văn trùng với bài khác (QA nhà máy no-cross-article-duplicate) (agent, lô C08+)
- B07 P3 — local_scope trống trong content-matrix (QA local-angle) (owner, lô —)
- B08 P2 — IMAGE PENDING — chưa có ảnh đại diện (owner, lô —)
- B11 P3 — Google từng hiển thị URL /index.html (SERP 2026-10-14) (owner, lô —)
- B12 P2 — Chưa đo GBP/local pack (owner, lô —)
- B13 P2 — Khoảng trống từ khóa chưa có trang (owner, lô —)
- B14 P3 — CSS mỗi trang 85.6 KB chưa nén (cảnh báo nội bộ ≥ 64 KB) (agent, lô —)
- B15 P2 — Chỉ số CWV lab chưa đạt: Tương tác chạm menu lab (ms, proxy INP) — Hub chủ đề con = 248 — trang hub liệt kê toàn bộ bài (DOM lớn, xem T20) (agent, lô M3)

## Giới hạn

- Không có dữ liệu Search Console/CrUX/GBP/backlink của website: các ô tương ứng ghi N/A kèm nguồn thiếu.
- CWV là số đo LAB (máy chủ tĩnh cục bộ, giả lập mạng 4G chậm, CPU 4x), không phải dữ liệu field.
- Vị trí SERP là ảnh chụp một thời điểm (data/seo/serp-snapshots/), không phải thứ hạng cố định.
- Chuẩn tham chiếu và ngày cập nhật: sheet X-DATA SOURCES.
