# AGENTS.md — Single external writer contract (/aichatbot)

**ACTIVE MODE: EXTERNAL AI WRITER + DETERMINISTIC GITHUB PUBLISHER.** Đọc file này và `docs/CONTINUOUS-WRITER.md` trước khi viết. Tham khảo mô hình `/vanchinh`, nhưng dùng schema/đường dẫn của **aichatbot**, không copy nguyên template hoặc NAP của Văn Chính.

## Một agent, một trách nhiệm

- **Một AI bên ngoài GitHub Actions viết prose** (ChatGPT/Mistral/AI khác do owner lựa chọn), có quyền GitHub nếu owner cấp. Không chạy Ollama/Qwen/WebLLM/OpenAI API inference trong GitHub Actions để viết bài. Không cần token/model key trong workflow.
- **GitHub Actions không phải tác giả**: `.github/workflows/blog-factory-publish.yml` chỉ tiếp nhận body mới, tự đăng ký manifest từ matrix, scoped QA, transactional publish, build blog, verify và push derived state. CI + Distribution kiểm thay đổi hệ thống.
- Legacy `auto-writer.yml`, `writer-coordinator.yml`, `writer-publisher.yml`, `factory-controller.yml` và ops agents đã **retired**: không kích hoạt để tạo nội dung hoặc điều phối. Không gọi lại những workflow này.

## Sources of truth

- `data/blog/content-matrix.csv` — đúng 2.000 ID/taxonomy/URL/từ khóa/status. Lấy ID + slug + title từ đây, không tự sáng tác.
- `data/blog/published.json` — 330+ manifest của bài viết; chỉ factory đăng ký metadata mới. Không tạo entry trùng.
- `data/blog/articles/<slug>.body.html` — prose HTML do AI bên ngoài viết.
- `data/business/business.json` và `docs/ARTICLE-RULES.md` — facts kinh doanh + rubric QA.
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

## Kiểm tra

`node --test` cho thay đổi engine/workflow/test. Content-only: QA scoped trong workflow, rồi production verify. Khi thay workflow, kiểm tra CI + Distribution + Pages đúng SHA và một bài mới chạy thực tế trước khi tuyên bố đã hoàn thành đầu-cuối.

Xem thêm: `docs/CONTINUOUS-WRITER.md`, `docs/EXTERNAL-WRITER.md`, `docs/BLOG-FACTORY.md`.
