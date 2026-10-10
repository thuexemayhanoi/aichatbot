# Continuous Writer — SINGLE EXTERNAL AI (hiện hành từ 11/10/2026)

**Source of truth:** `AGENTS.md`, `docs/EXTERNAL-WRITER.md` và trạng thái GitHub main. Đây là mô hình được rút gọn từ `/vanchinh`, áp dụng theo paths/schema thật của `/aichatbot`. Các mục cũ về Ollama/Qwen, multi-writer, coordinator, controller, 6 ops agents đều không còn hiệu lực.

## Ai làm gì?

- **MỘT AI bên ngoài:** viết prose HTML thực tế theo đề tài matrix; có thể dùng dịch vụ AI do owner chọn, không gắn GitHub Actions với mô hình AI nào.
- **MỘT production publisher deterministic:** `blog-factory-publish.yml` tự register metadata từ nội dung body mới, QA, cập nhật matrix, build, sitemap, receipt và verify Pages. Nó KHÔNG viết bài bằng AI.
- `ci.yml` và `distribution.yml`: kiểm tra mã và bản phân phối khi engine thay đổi, không phải agent viết bài.

## Loop (ngay trong phiên AI bên ngoài)

```
FETCH FRESH MAIN
 → READ AGENTS.md + ARTICLE-RULES.md + matrix + existing publications
 → RESUME unfinished unpublished QA/REPAIR items before new content
 → node tools/external-writer.mjs next
 → CHOOSE 2 PLANNED IDs and correct paths (max 10 per push)
 → RESEARCH + WRITE REAL HTML BODY for each
 → PUSH only data/blog/articles/<slug>.body.html
 → GitHub scoped QA + transaction PUBLISH + Pages verification
 → FETCH FRESH MAIN
 → NEXT 2... repeat while the external AI session is active
```

Nếu workflow QA FAIL: sửa nội dung thật và push lại file body chưa PUBLISHED. Nếu workflow bị gián đoạn: resume từ fresh GitHub main. Không reset/checkpoint/matrix, không force push, không nhận định chỉ dựa trên CI GREEN.

## Data protocol

- Matrix: `data/blog/content-matrix.csv` 2.000 dòng, ID và URL bất biến. `PUBLISHED` là bất khả xâm phạm với writer.
- Body: `data/blog/articles/<slug>.body.html` chỉ văn bản bài; title/description/author/category/date được deterministic `tools/external-writer.mjs register --files` tạo từ matrix + body đã push.
- Published manifest: `data/blog/published.json`; writer không cần và KHÔNG sửa tay. Factory commit cùng derived state, tất cả mutation qua QA.
- Scope: NEW chỉ các body mới được push, REPAIR chỉ body sửa có row QA/REPAIR/PASS, BACKLOG qua workflow_dispatch nếu đã có cả body và manifest. Không tự claim những ID chưa có body.
- Quantity: viết 2 bài mỗi lượt theo `/vanchinh`, tối đa 10 file body trong một push. Không dừng ngay sau một cặp nếu phiên AI ngoài vẫn còn chạy.

## Safe migration

Không xóa 330 bài cũ hoặc matrix. `docs/state/writer-assignments.json` của 3-writer cũ chỉ để tham khảo, không phải authoritative cho external writer. `.github/workflows/auto-writer.yml`, `writer-coordinator.yml`, `writer-publisher.yml`, `factory-controller.yml` và ops agents đã retired và không được dispatch. Mọi yêu cầu "viết thêm" từ ChatGPT/Mistral phải dùng GitHub connection của **AI đó** để push files; GitHub Actions tự thân không gọi AI.

## QA, SEO và recovery

- Editorial guideline 800–2.000 từ/bài, không padding. Publish gate hiện có: score ≥70 và không critical, bảo toàn QA cũ; không hạ threshold vì tốc độ.
- Business facts chỉ từ `data/business/business.json`, không dùng dữ liệu Văn Chính. SAFE/legal: đối chiếu văn bản gốc và ngày hiệu lực.
- Txn marker: chỉ factory xử lý `node tools/blog-factory.mjs resume` sau crash; đừng xóa thủ công.
- Chỉ đếm thành quả khi GitHub main có status PUBLISHED và production verified; body mới đẩy lên không mặc nhiên là published.
