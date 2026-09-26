# Blog — kiến trúc cẩm nang 2.000 bài

Blog của `/aichatbot/` là lớp nội dung SEO quốc gia cho intent **app / ứng dụng thuê xe máy & xe điện**, đồng thời là nguồn tri thức tùy chọn cho Agent. Xem quyền sở hữu từ khóa: `docs/SEO-OWNERSHIP.md`.

## Cấu trúc

```
blog/index.html                  # blog home: tìm kiếm, danh mục, bài mới, CTA Agent
blog/app/                        # APP — App & Ứng dụng        (350 bài theo kế hoạch)
blog/thue-xe/                    # RENT — Thuê xe máy          (400)
blog/xe-dien/                    # EV — Xe điện / xe máy điện  (300)
blog/huong-dan/                  # GUIDE — Hướng dẫn / thủ tục (300)
blog/an-toan/                    # SAFE — An toàn / pháp lý    (250)
blog/dia-phuong/                 # LOCAL — Địa phương / du lịch(400)
```

Mỗi bài nằm ở `blog/<danh-mục>/<slug>/index.html`, thuộc đúng MỘT danh mục.

## Ma trận nội dung

`data/blog/content-matrix.csv` — đúng 2.000 dòng sản xuất, 40 lô × 50 bài, trạng thái ban đầu `PLANNED`. Tạo lại bằng:

```bash
node tools/gen-blog-matrix.mjs   # idempotent, deterministic
```

Trường bắt buộc: article_id, batch_id, category, status, primary_keyword, secondary_keywords, search_intent, working_title, slug, output_path, parent_hub, local_scope, requires_sources, source_policy, internal_link_targets, commercial_link_target, agent_retrieval, author, score, quality_status, repair_attempts, published_date, last_checked, notes.

Ma trận nội dung HOÀN TOÀN tách biệt với ma trận phát triển chatbot (`docs/matrix/`).

## Tìm kiếm blog

`assets/js/blog.js` — client-side, không framework. Mục lục `blog/search-index.json` (chỉ trường compact: title, keywords, summary, category, url) được **tải theo yêu cầu** ngay truy vấn đầu tiên, không tải khi mở trang. Không bao giờ tải nội dung đầy đủ 2.000 bài.

## Trí thức cho Agent

Bài PUBLISHED → chunks trong `data/blog/knowledge-index.json` → nạp LAZY sau lượt chat đầu tiên (direct mode) → tier retrieval THẤP NHẤT, dưới business rules và business data. Chi tiết: `docs/KNOWLEDGE-RETRIEVAL.md`.

## Build

```bash
node tools/build-blog.mjs       # dựng blog + indexes + sitemap từ data/blog/published.json
node tools/blog-factory.mjs validate
```

Nguồn sự thật publish là `data/blog/published.json` + body partials trong `data/blog/articles/`. Placeholder `{{ business.* }}` trong body được resolve từ `business.json` — bài viết không thể “già” so với dữ liệu xác minh.

## Hiện trạng (foundation run 2026-09-26)

- 2 bài pilot PUBLISHED (BA-0001, BA-0004) — fixture để kiểm thử pipeline, KHÔNG phải sản lượng sản xuất; đánh dấu `notes=pilot/fixture`.
- 1.998 dòng PLANNED chờ factory chạy theo lô trong các scheduled run.
