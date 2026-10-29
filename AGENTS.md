# AGENTS.md — Single external writer contract (/aichatbot)

**ACTIVE MODE: EXTERNAL AI WRITER + DETERMINISTIC GITHUB PUBLISHER.** Đọc file này và `docs/CONTINUOUS-WRITER.md` trước khi viết. Tham khảo mô hình `/vanchinh`, nhưng dùng schema/đường dẫn của **aichatbot**, không copy nguyên template hoặc NAP của Văn Chính.

## Một agent, một trách nhiệm

- **Một AI bên ngoài GitHub Actions viết prose** (ChatGPT/Mistral/AI khác do owner lựa chọn), có quyền GitHub nếu owner cấp. Không chạy Ollama/Qwen/WebLLM/OpenAI API inference trong GitHub Actions để viết bài. Không cần token/model key trong workflow.
- **GitHub Actions không phải tác giả**: `.github/workflows/blog-factory-publish.yml` chỉ tiếp nhận body mới, tự đăng ký manifest từ matrix, scoped QA, transactional publish, build blog, verify và push derived state. CI + Distribution kiểm thay đổi hệ thống.
- Legacy `auto-writer.yml`, `writer-coordinator.yml`, `writer-publisher.yml`, `factory-controller.yml` và ops agents đã **retired**: không kích hoạt để tạo nội dung hoặc điều phối. Không gọi lại những workflow này.

## Sources of truth

- `data/blog/content-matrix.csv` — 2.000 ID nền (BA-0001…BA-2000, đóng băng) + hàng SEO nối tiếp (BA-2001+, do owner quyết từ đề xuất engine/battle matrix; kích thước khai báo ở `tools/matrix-size.mjs`)/taxonomy/URL/từ khóa/status. Lấy ID + slug + title từ đây, không tự sáng tác.
- `data/blog/published.json` — 330+ manifest của bài viết; chỉ factory đăng ký metadata mới. Không tạo entry trùng.
- `data/blog/articles/<slug>.body.html` — prose HTML do AI bên ngoài viết.
- `data/business/business.json`, `data/business/pricing.json` và `docs/ARTICLE-RULES.md` — facts kinh doanh, giá thuê + rubric QA. Body chỉ viết dữ kiện/giá qua placeholder `{{ business.* }}` / `{{ price.* }}` để đổi một chỗ là toàn blog cập nhật; bản đồ "đổi gì → sửa ở đâu": `docs/SINGLE-SOURCE.md`.
- `docs/state/blog-factory.transaction.json` — marker phục hồi nếu run đứt giữa publish. Không chạm tay.
- `docs/state/writer-assignments.json` — di sản multi-writer, KHÔNG dùng để chọn ID sau migration.

**Repository truth > hội thoại cũ > báo cáo cũ.**

## Runbook cho AI ngoài (bắt buộc)

1. Fetch fresh `origin/main`, đọc file này, matrix và `docs/ARTICLE-RULES.md`. Kiểm tra Actions/đường chạy đang tồn tại, transaction/lock và hàng `REPAIR`.
2. `node tools/external-writer.mjs next` để biết nhóm chưa viết. Ưu tiên sửa bài QA/REPAIR có body trước.
3. Viết **2–10 bài mỗi push** (ưu tiên 2) ở đúng `data/blog/articles/<slug>.body.html`. BODY chỉ chứa các thẻ nội dung cho phép, KHÔNG sinh cả HTML page, canonical, metadata, H1 hoặc site shell. Nội dung thật, 800–2.000 từ hữu ích/bài, khác biệt chủ đề, trích nguồn pháp lý gốc khi có yêu cầu.
4. Push **chỉ các body mới/sửa**, KHÔNG push `data/blog/content-matrix.csv`, `data/blog/published.json`, `blog/`, `docs/state/`, `reports/`, checkpoint hay transaction. Mỗi push tối đa 10 body; không force push. Không viết đè body PUBLISHED.
5. Workflow `Blog Factory Publish` được kích hoạt bởi body push lên main. Nó tự chạy `external-writer.mjs register`, chọn đúng scope, QA score ≥70 và critical PASS, publish từng nhóm PASS, update manifest+matrix/site/sitemap/index và xác minh Pages.
6. Verify Actions kết quả trên SHA tương ứng, đọc matrix + manifest để đếm bài PUBLISHED thật. Bài fail thì **sửa prose thực** và push lại body; không bypass QA. Fetch fresh main → tiếp tục.
7. Nếu bị ngắt, lần sau tiếp tục từ main; không reset matrix, xóa bài, rewrite 330 bài cũ, tự xóa lock/transaction hay nhân đôi URL.

## Safety / stop conditions

- Không làm giả bài 300 từ chỉ để qua threshold; QA hiện tại có floor 300 critical nhưng editorial target **800–2.000 từ**.
- Không trộn content của Văn Chính (địa chỉ, số điện thoại, thương hiệu) vào Nguyễn Tú.
- Không xóa hoặc chỉnh sửa 330 bài đã PUBLISHED; nếu cần sửa phải có quy trình review riêng.
- Bài SAFE chứa quy định pháp luật phải đối chiếu văn bản chính thức và ngày hiệu lực; domain chính phủ không tự chứng minh nội dung claim đúng.
- Không reset dữ liệu, không force push, không hạ QA, không thêm cloud AI API key vào repo.
- Agent bên ngoài dừng khi owner yêu cầu, không có quyền kết nối, hoặc hết giới hạn phiên. GitHub Actions không thể tự viết prose khi agent bên ngoài không hoạt động.

## SEO metadata layer (v70 SEO master — chỉ SEO tiếng Việt)

- Title/H1, meta description và từ khóa chính SEO của bài PUBLISHED nằm ở `data/seo/article-meta.json` (không sửa `published.json`, không ghi đè body). Builder áp dụng qua `tools/seo-meta.mjs`; xóa một entry = rollback bài đó về metadata manifest.
- Liên kết nội bộ (khối "Cùng chủ đề" theo họ chủ đề + "Bài viết liên quan" cân bằng inbound) do `tools/seo-links.mjs` lập kế hoạch khi build — không chèn link thủ công hàng loạt vào body.
- Chế độ ZERO-DATA (chưa có Search Console/GA4): `node tools/seo-cold-start.mjs` đọc SERP thật (`data/seo/serp-snapshots/`), nhu cầu từ khóa đo được (`data/seo/keyword-demand.json`) và quy tắc `config/seo-cold-start.json` → `docs/seo/cold-start/` (đối thủ, ý định SERP, topical map, content gap, baseline hiển thị). Đặt tệp xuất Search Console thật vào `data/seo/performance/` để tự chuyển DATA-DRIVEN; không tạo số liệu giả. IndexNow (`tools/indexnow.mjs`, workflow `indexnow.yml`) báo URL mới/cập nhật cho Bing và các máy tìm kiếm IndexNow.
- SEO Engine 06 (`node tools/seo-engine.mjs` → `docs/seo/engine/`): dùng lại 5 công cụ trên, gom từ khóa thành nhóm ý định (top 10 Google trùng ≥ 3 URL hoặc biến thể chính tả), lập SEO matrix theo nhóm (hành động + điểm ưu tiên có công thức), topical map, brief, hàng đợi nghiên cứu và hàng đề xuất bài mới `proposed-matrix-rows.csv` — chỉ owner thêm ID vào `content-matrix.csv`. Quyết định done/deferred/rejected ghi ở `data/seo/engine-decisions.json`; bài có nội dung lỗi thời ghi ở `content_flags` của `config/seo-cold-start.json` và chặn đẩy từ khóa tới khi sửa xong. Con số pháp lý mới trong bài đã đăng chỉ được thêm qua `facts` của patch review, lấy từ dữ kiện đã đối chiếu toàn văn trong `data/seo/legal-facts.json`.
- SEO Master Battle Matrix — 10 vũ khí (`node tools/seo-battle-matrix.mjs` → `docs/seo/battle/`): tình báo đối thủ (W1), từ khóa tổng (W2), điểm yếu đối thủ (W3), khoảng trống/cơ hội P0–P2 (W4), cụm chủ đề (W5), SERP benchmark (W6), tìm kiếm AI (W7), liên kết/thẩm quyền (W8), kiến trúc URL (W9) và Master Battle Matrix với lộ trình 30/60/90 ngày + KPI (W10). Dữ liệu chỉ từ tệp đã cam kết trong `data/seo/battle/` (chỉ số từ khóa, thị phần miền Labs, audit 127 trang đối thủ, hồ sơ backlink đối thủ — mỗi tệp ghi công cụ và ngày) + SERP snapshot + engine 06; nhãn độ tin cậy quan sát/đo được/suy ra; không mua link, không xóa/gộp/noindex URL; `--check` trong SEO monitor cảnh báo khi báo cáo cũ.
- Hiệu lực văn bản pháp luật (`node tools/seo-legal-citations.mjs` → `docs/seo/legal-citations.{md,json}`): mọi văn bản bài dẫn (Luật, Nghị định, Thông tư, Quyết định, Nghị quyết, Chỉ thị) phải có trong sổ đăng ký `data/seo/legal-documents.json` (trạng thái in_force/amended/replaced, mức bằng chứng fulltext/reported/unverified, nguồn chính thức, việc chờ đối chiếu); test fail khi bài dẫn văn bản ngoài sổ. Bài dẫn văn bản đã bị thay thế như quy định đang áp dụng phải có cờ ở `content_flags` (engine ngừng đẩy từ khóa) và chỉ được sửa qua review body sau khi đối chiếu toàn văn; văn bản sửa đổi sau ngày bài đăng (ví dụ Nghị định 238/2026/NĐ-CP sửa Nghị định 168/2024/NĐ-CP từ 15/8/2026) nằm trong hàng đợi đối chiếu cho đến khi đọc được toàn văn. SEO monitor cảnh báo khi báo cáo cũ.
- Ảnh đại diện bài viết (v80 Image Registry): `data/seo/article-images.json` (ID → ảnh WebP 1200×800, 100–300 KB — ưu tiên 120–220 KB, tối đa 300 KB, ảnh sắc nét dưới 100 KB vẫn hợp lệ — trong `assets/images/blog/`, ALT viết sau khi xem ảnh, trạng thái) + brief/prompt/filename từ `data/seo/image-plan.csv` (`node tools/image-briefs.mjs`). Builder chỉ hiển thị ảnh QA_PASSED trở lên (figure, og/twitter, Article.image, image sitemap) — không sửa body để gắn ảnh. Sản xuất từng ID qua `python3 tools/image-factory.py`, gate `node tools/article-images.mjs --check`; tiến độ, checkpoint và Excel cho chủ sở hữu: `docs/seo/master-task/README.md`.
- Audit toàn site: `node tools/seo-master-audit.mjs` → `docs/seo/seo-master-matrix.{csv,json,md}`, `docs/seo/keyword-cluster-map.md`; tiến độ: `docs/seo/seo-progress-report.md`. Khoảng trống nội dung (FAQ, bảng, nguồn pháp lý) chỉ xử lý qua quy trình review body riêng.

## Kiểm tra

`node --test` cho thay đổi engine/workflow/test. Content-only: QA scoped trong workflow, rồi production verify. Khi thay workflow, kiểm tra CI + Distribution + Pages đúng SHA và một bài mới chạy thực tế trước khi tuyên bố đã hoàn thành đầu-cuối.

Xem thêm: `docs/CONTINUOUS-WRITER.md`, `docs/EXTERNAL-WRITER.md`, `docs/BLOG-FACTORY.md`.


## Owner commercial SEO strategy — 2026-10-29 (OVERRIDES old sister-site exclusion)

**New goal: rank this domain for “cho thuê xe máy ở Hà Nội” and other relevant Hanoi commercial keywords, aiming for positions 2–10 as a goal only, not a guarantee.** This repo is no longer prohibited from competing for commercial terms targeted by sister sites; config/seo-ownership.json v2 is authoritative. Distinct canonical intents remain protected within this domain: / for the rental head, /gia-thue/ for pricing, /lien-he/ for real local contact, /agent/ for WebApplication, plus focused hubs and articles.

**Mandatory agent read order for SEO work:**
1. docs/seo/commercial/README.md
2. docs/seo/commercial/CLAUDE-SEO-AGENT.md
3. docs/seo/commercial/SEO-COMMERCIAL-2006.csv and SEO-COMMERCIAL-TARGETS.csv (generated from actual published rows)
4. docs/seo/AICHATBOT-SEO-MASTER-MATRIX.xlsx (13 tabs once the generator runs)

**Execution:** SEO commercial work is a separate plan from the paused image factory. Keep all 2.006 published slugs, bodies, canonicals, app functions and sitemap intact until each approved per-URL SEO batch is QA-tested. No bulk title stuffing, duplicate location doorways, invented GSC traffic/ranks, fake prices or reviews. Existing single-writer, source-of-truth, protected body and legal gates are still binding. Run node tools/seo-commercial-matrix.mjs to update the CSV and python3 tools/seo-master-workbook.py for the owner Excel. On “Tiếp tục,” resume the last verified batch of up to 30 URLs, not an unbounded mass rewrite.
