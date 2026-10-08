# Blog — kiến trúc cẩm nang 2.000 bài

Blog của `/` là lớp nội dung SEO quốc gia cho intent **app / ứng dụng thuê xe máy & xe điện**, đồng thời là nguồn tri thức tùy chọn cho Agent. Xem quyền sở hữu từ khóa: `docs/SEO-OWNERSHIP.md`.

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

## Phân loại cha/con (v56 — 2026-09-27)

Toàn bộ blog dùng mô hình phân loại 5 tầng, nguồn sự thật duy nhất trong `data/blog/taxonomy.json` + `tools/taxonomy.mjs`:

```
LEVEL 0  Agent (/)
LEVEL 1  Cẩm nang (/blog/)
LEVEL 2  3 cụm cha: Ứng Dụng [APP, GUIDE] · Thuê Xe [RENT, EV] · Khám Phá [SAFE, LOCAL]
LEVEL 3  6 danh mục canonical (APP/RENT/EV/GUIDE/SAFE/LOCAL — ID không đổi)
LEVEL 4  subtopic hubs (chỉ tồn tại khi có ≥ 1 bài PUBLISHED)
LEVEL 5  bài viết
```

- Mọi trường phái sinh (parent_cluster, subtopic_code/label, hub_url) được tính tất định từ mỗi dòng ma trận bằng `deriveSubtopic` — CSV không đổi schema, không đổi ID.
- Trang subtopic (`blog/<danh-mục>/<subtopic>/`) chỉ được sinh khi có ≥ 1 bài PUBLISHED — không có hub rỗng.
- Hub danh mục phân trang crawlable: 24 thẻ/trang (`blog/<cat>/page/2/`).
- Bài viết có TOC sinh lúc build (ID anchor tiếng Việt an toàn, dedupe), breadcrumb khớp 100% với BreadcrumbList, related theo subtopic → danh mục.
- Blog home hiển thị 3 thẻ cụm + 6 thẻ danh mục + tìm kiếm + bài mới + CTA Agent.
- Footer dùng chung sinh từ `config/navigation.json` (một nguồn sự thật cho menu + footer); chữ ký thấy ở mọi trang content, không có trong viewport chat của Agent.

## Dữ liệu địa phương Hà Nội (v56)

`data/local/hanoi.json` — dữ liệu hành chính chính thống đã xác minh theo Nghị quyết 1656/NQ-UBTVQH15 (hiệu lực 01/07/2025): Hà Nội có 51 phường + 75 xã, không còn cấp quận/huyện. Bài LOCAL không bao giờ được dùng danh sách quận/phường cũ làm dữ kiện hiện hành, và không được tự nhận có điểm nhận xe tại một địa phương nếu không có trong `data/business/`.
