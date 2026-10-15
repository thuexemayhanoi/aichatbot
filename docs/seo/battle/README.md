# SEO Master Battle Matrix — 10 vũ khí (chế độ ZERO-DATA)

_Chế độ ZERO-DATA; SERP đã chụp: 2026-10-14.json (72 truy vấn); trang đối thủ đã audit: 127 (5 không tải được). Sinh bởi `node tools/seo-battle-matrix.mjs` — không sửa tay._

| # | Vũ khí | Tệp | Kết quả |
| --- | --- | --- | --- |
| 1 | Tình báo đối thủ | [01](01-competitor-intelligence.md) | 30 đối thủ nội dung / 258 miền |
| 2 | Từ khóa tổng | [02](02-keyword-master-matrix.md) | 791 từ khóa, 723 có volume, 59 có KD |
| 3 | Điểm yếu đối thủ | [03](03-weakness-matrix.md) | 189 trang chấm, 60 truy vấn |
| 4 | Khoảng trống & cơ hội | [04](04-opportunity-matrix.md) | P0 6 / P1 1 / P2 1 |
| 5 | Cụm chủ đề | [05](05-topic-cluster-matrix.md) | 20 cụm; pillar thiếu 0; trộn ý định 8 |
| 6 | SERP benchmark | [06](06-serp-benchmark.md) | 60 truy vấn, 42 có trang của ta |
| 7 | Tìm kiếm AI | [07](07-ai-search-matrix.md) | 60 truy vấn; AI Overview 60; được trích 0 |
| 8 | Liên kết & thẩm quyền | [08](08-backlink-matrix.md) | 1 hồ sơ đối thủ, 88 trang danh sách |
| 9 | Kiến trúc URL | [09](09-url-architecture.md) | 2129 URL + 4 đề xuất |
| 10 | Master Battle Matrix | [10](10-master-battle-matrix.md) | 57 việc (P0 8) |

## Nguồn dữ liệu (chỉ quan sát/đo được)

- SERP Google Việt Nam: data/seo/serp-snapshots/2026-10-14.json — 72 truy vấn, chụp 2026-10-14
- Volume A: data/seo/keyword-demand.json
- Volume B + KD: OpenSEO get_keyword_metrics 2026-10-14 (data/seo/battle/keyword-metrics.json)
- Volume B + KD: OpenSEO get_keyword_metrics 2026-10-15 (data/seo/battle/keyword-metrics.json)
- Thị phần miền: OpenSEO find_serp_competitors 2026-10-15 (data/seo/battle/serp-competitors-labs.json)
- Trang đối thủ: 127 trang (data/seo/battle/page-audits.json, 2026-10-15)
- Backlink đối thủ: OpenSEO get_backlinks_overview motogo.vn 2026-10-15 (data/seo/battle/backlink-sources.json)
- Engine 06: docs/seo/engine/ (nhóm từ khóa, trang đích, điểm ưu tiên)
- Ma trận URL: docs/seo/seo-master-matrix.json

## Cách chạy

`node tools/seo-battle-matrix.mjs` ghi lại thư mục này; `--check` báo lệch khi dữ liệu đổi mà báo cáo chưa sinh lại (SEO monitor cảnh báo). Mọi thay đổi trang vẫn đi qua tools/seo-body-review.mjs, data/seo/article-meta.json và quy trình owner thêm ID; rollback = git revert commit tương ứng.
