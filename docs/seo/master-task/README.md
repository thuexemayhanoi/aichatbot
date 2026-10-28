# MASTER TASK — MotoAI Image Factory 2000 + GitHub SEO Skills + Full SEO

Hồ sơ phục hồi nhiệm vụ qua nhiều phiên. Khi chủ sở hữu gửi **"Tiếp tục"** =
*RESUME MASTER TASK FROM THE LATEST VERIFIED GITHUB CHECKPOINT*.

## Nguồn sự thật (đọc theo thứ tự)

| Tệp | Vai trò |
|---|---|
| `AGENTS.md` | Hợp đồng vận hành repo (writer bên ngoài, không đụng body PUBLISHED) |
| `docs/seo/master-task/checkpoint.json` | Bảng điều khiển + `next_batch` + việc bị chặn |
| `docs/seo/master-task/backlog.csv` | Task, trạng thái, bước kế tiếp, trở ngại |
| `data/seo/article-images.json` | **Image Registry** — trạng thái từng ảnh (nguồn sự thật về ảnh) |
| `data/seo/image-plan.csv` | Brief/prompt/filename/ALT dự kiến cho 2.006 bài (`node tools/image-briefs.mjs`) |
| `docs/seo/master-task/errors.csv` · `review-required.csv` · `execution-log.csv` | Lỗi + sửa, việc chờ chủ sở hữu, nhật ký chạy |
| `docs/seo/AICHATBOT-SEO-MASTER-MATRIX.xlsx` | Workbook 9 sheet cho chủ sở hữu — **xuất lại**, không sửa tay |

Excel được sinh từ các tệp trên (`python3 tools/seo-master-workbook.py`). Nếu Excel
khác repo: repo thắng, xuất lại workbook.

## Quy trình mỗi lô ảnh (25–50 ảnh; lô thử 10–20)

1. `git fetch origin main` → làm trên nhánh mới từ `origin/main`; ghi baseline SHA.
2. `python3 tools/image-factory.py status` → lấy ID chưa có trong registry (bỏ ID đã có).
3. Với từng ID: lấy `prompt_en` (`node tools/image-briefs.mjs --show BA-xxxx`) →
   tạo ảnh bằng công cụ AI đã kết nối (Figma MCP `generate_image`, 1536×1024) →
   `python3 tools/image-factory.py record BA-xxxx --url <image.url> --tool "figma-mcp generate_image" --model <model> --node <nodeId> --figma-file <fileKey> --expires <YYYY-MM-DD> --width W --height H`.
4. `python3 tools/image-factory.py download BA-xxxx` → `optimize BA-xxxx <raw>`
   (crop 3:2 → 1200×800 → WebP ≤ 300 KB theo Image SEO V2: 100–300 KB, ưu tiên 120–220 KB, không độn dung lượng; sha256 + dHash; ảnh AI được gắn XMP IPTC
   `DigitalSourceType = trainedAlgorithmicMedia` — gate bắt buộc).
   Khi `www.figma.com` bị chính sách mạng chặn: tạo ≤ 8 ảnh trong một file Figma riêng cho lô
   (`create_new_file`, các khung tự xếp hàng ngang cách 40 px) → **một** lượt
   `get_screenshot` node `0:1`, `maxDimension 65536`, `enableBase64Response: true` (ảnh PNG gốc được
   lưu vào thư mục tool-results) → `python3 tools/image-factory.py split <page.png> ID1 … ID8 --raw-dir DIR`
   → `optimize ID DIR/ID.png`. Mỗi lượt get_screenshot tính vào hạn mức đọc Figma MCP (RR-10).
   **Đường tải không tốn lượt đọc (ưu tiên):** chạy workflow **Image Ingest** (`workflow_dispatch`,
   ô `items` = mỗi dòng `BA-xxxx <URL ảnh gốc>` — URL asset Figma MCP hoặc URL export Canva, tối đa 20)
   → runner GitHub tải ảnh gốc từ host trong danh sách cho phép và đặt lên nhánh tạm
   `image-ingest/run-<run_id>` → `python3 tools/image-ingest.py pull image-ingest/run-<run_id> --raw-dir DIR`
   (kiểm sha256 theo manifest, rồi xóa nhánh tạm) → `optimize ID DIR/ID.jpg`. Runner chỉ tải file, không chạy AI.
5. **Xem ảnh** (đúng chủ đề? xe đúng mẫu? không chữ/logo/biển số đọc được? an toàn: mọi người đều đội mũ?)
   → ảnh sai thì tạo lại; ảnh đạt thì `attach BA-xxxx --alt "<mô tả đúng cái nhìn thấy>"`.
6. `python3 tools/image-factory.py qa` (gate `node tools/article-images.mjs --check`: WebP, kích thước,
   dung lượng, sha256, dHash cận trùng, ALT) → QA_PASSED.
7. `node tools/build-blog.mjs` → `node --test` → `node tools/site-audit.mjs` → `node tools/seo-score.mjs`.
8. Commit + push → PR → CI xanh → merge → `python3 tools/image-factory.py deployed <sha>` →
   sau khi Pages build: `python3 tools/image-factory.py live` (hoặc kiểm tra bằng fetch bên ngoài nếu
   container bị chặn tới domain production rồi `live-mark ID … --evidence "…"`) → LIVE_VERIFIED.
   Nghiên cứu phương pháp SEO áp dụng: `docs/seo/github-seo-skills.md`.
9. Cập nhật `backlog.csv`, `execution-log.csv`, `errors.csv` → `python3 tools/seo-master-workbook.py` → commit.

Không bao giờ: tạo lại ảnh đã QA_PASSED (trừ khi sửa lỗi có ghi lỗi), dùng một ảnh cho nhiều bài,
đổi slug/canonical, sửa body PUBLISHED để gắn ảnh, hạ ngưỡng QA, commit API key.

## Trạng thái

`PENDING → IMAGE_GENERATED → IMAGE_OPTIMIZED → IMAGE_ATTACHED → QA_PASSED → DEPLOYED → LIVE_VERIFIED`;
thêm `BLOCKED`, `REVIEW_REQUIRED` cho task. Builder chỉ hiển thị ảnh từ **QA_PASSED** trở lên.

## Trở ngại hiện tại

Xem `checkpoint.json → blocked` và `review-required.csv` (RR-01: `www.figma.com` bị chính sách
mạng của môi trường chặn, nên không tải được ảnh gốc).
