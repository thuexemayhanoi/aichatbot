# Blog Factory — nhà máy nội dung có thể phục hồi

Công cụ: `tools/blog-factory.mjs`. Nguyên tắc an toàn giống các hệ thống sản xuất trưởng thành: state machine, transaction, checkpoint, KHÔNG phụ thuộc bộ nhớ chat/session.

## State machine mỗi bài (cột `status` trong `data/blog/content-matrix.csv`)

```
PLANNED → WRITING → QA → PASS → PUBLISHED
                ↘ REVIEW → REPAIR (tối đa 3 lần sửa có nghĩa) → PASS
                ↘ FAIL / BLOCKED
```

Chỉ bài `PASS` mới được publish. Bài FAIL/BLOCKED phải được người phụ trách xem xét lại; không tự động retry vượt 3 lần.

## Hợp đồng sản xuất v64 — LIGHTWEIGHT MICRO LOOP: 1 BÀI / CYCLE

Hợp đồng chunk ≤10 (v58) đã nghỉ hưu. Mỗi cycle xử lý ĐÚNG MỘT bài:

```
lock → claim (đúng 1: PLANNED → WRITING) → WRITE 1 → finish 1 (→ QA)
→ scoped QA (deterministic PASS/FAIL, tools/article-qa.mjs)
→ publish 1 (transaction) → rebuild + verify → commit derived state
→ clean txn/lock → cycle kế tiếp
```

Quy tắc bất biến:

- `claim` không tham số nhận dòng PLANNED đầu tiên; `claim <BA-id>` nhận đúng dòng đó. Từ chối khi đã có dòng WRITING (happy path chỉ MỘT bài đang viết tại một thời điểm) và từ chối tham số số (chunk contract đã bỏ).
- `finish <BA-id>` đưa đúng 1 dòng WRITING → QA (`finish-chunk` giữ tương thích ngược).
- Scoped QA chỉ chạy cho đúng 1 bài; không có numeric score article-level trong repo nên kết quả là PASS/FAIL deterministic.
- Không duplicate claim, không duplicate article_id/output_path, không hồi PUBLISHED.
- Sau gián đoạn: `abandon-chunk` trả dòng WRITING về PLANNED, unlock, run mới `claim` lại tiếp tục.

## Lệnh

```bash
node tools/blog-factory.mjs status
node tools/blog-factory.mjs validate       # QA ma trận: số dòng, lô, phân bố, trùng lặp, legal gate
node tools/blog-factory.mjs lock           # run lock (docs/state/blog-factory.lock)
node tools/blog-factory.mjs unlock
node tools/blog-factory.mjs claim [BA-id]  # ĐÚNG 1 dòng PLANNED → WRITING (cần lock)
node tools/blog-factory.mjs finish BA-0002 # WRITING → QA, ghi checkpoint
node tools/blog-factory.mjs qa BA-0002     # scoped QA deterministic → PASS hoặc REVIEW/BLOCKED
node tools/blog-factory.mjs publish BA-0002 # transaction cho đúng 1 bài
node tools/blog-factory.mjs resume         # phục hồi transaction đứt quãng
node tools/blog-factory.mjs abandon-chunk  # crash recovery: WRITING → PLANNED
node tools/blog-factory.mjs checkpoint    # xem checkpoint (docs/state/blog-factory.checkpoint.json)
```

## Publish workflow tự động (`.github/workflows/blog-factory-publish.yml`)

Event-driven, deterministic, KHÔNG AI/API key trong Actions. Xử lý ĐÚNG 1 bài mỗi run:

```
detect exact ID (tools/factory-select.mjs: từ diff push, hoặc --id của workflow_dispatch)
→ guard (không lock, không txn) → lock → scoped QA → publish transaction (build + verify)
→ validate (matrix smoke) → clean txn/lock
→ commit derived state (MỘT commit: matrix, pages, indexes, sitemap, report)
```

- Push thêm/sửa đúng 1 file bài (`data/blog/articles/**`) → workflow tự chạy cho đúng ID đó.
- Push chạm nhiều file bài → REFUSE (1 bài / cycle). Dòng PLANNED/WRITING có file → REFUSE (claim + finish trước). Dòng PUBLISHED bị sửa → SKIP (shell rebuild, không republish).
- Push chỉ sửa tooling (không chạm `data/blog/articles/**`) → workflow không chạy.
- `workflow_dispatch` với `article_id` explicit là đường duyệt tay cho đúng 1 bài.
- Article-only production KHÔNG chạy full chatbot test suite mỗi bài; full `node --test` giữ nguyên trong `ci.yml` cho engine/tool/workflow changes.
- Commit derived state dùng GITHUB_TOKEN (push không re-trigger workflow), message `factory: publish <ID> (1 article/cycle) [skip ci]`, không bao giờ commit lock/txn marker.

## Publish transaction

Publish có thể cập nhật: article HTML, matrix, hub, blog index, search index, knowledge index, sitemap, reports. Ngữ nghĩa phục hồi:

```
marker (docs/state/blog-factory.transaction.json)
→ write (build-blog.mjs: manifest là nguồn sự thật)
→ verify consistency (file tồn tại + matrix=PUBLISHED + sitemap chứa URL
  + self-canonical + Article/BreadcrumbList schema + đúng 1 H1)
→ clear marker (chỉ sau khi verify xanh)
```

Nếu bất kỳ bước nào fail: marker GIỮ NGUYÊN, lệnh `resume` dựng lại từ manifest và chỉ xóa marker khi verify pass.

## Scoped QA trước publish (bắt buộc, deterministic PASS/FAIL)

`tools/article-qa.mjs` kiểm đúng 1 bài theo checklist:

1. Đúng ID / slug / output_path / body path nhất quán giữa matrix và manifest.
2. Body tồn tại, 1.500–4.000 từ hữu ích theo search intent (không padding, không truncate), ≥2 H2, không H1 trong body, có list.
3. Không filler, không đoạn trùng trong bài, không câu lặp (spun), không đoạn đã dùng ở bài khác.
4. Không cannibalization: primary_keyword và tiêu đề duy nhất toàn ma trận.
5. Title/meta/slug/date hợp lệ (title 10–70, description 50–165, YYYY-MM-DD).
6. SEO ownership: không nhắm đúng protected commercial keyword, không claim app native store, không claim cho thuê toàn quốc, không doorway "quận X".
7. Business facts: `{{ business.* }}` resolve được; số điện thoại và mức cọc chỉ được khớp dữ liệu đã xác minh.
8. Bài SAFE giữ legal gate: `source_policy=legal-gate`, `agent_retrieval=no`, knowledge chunks rỗng, có link nguồn chính gov.vn/vbpl.vn.
9. Internal links đều trỏ tới file thật; `source_policy=no-external` → không external link.
10. Consistency Agent retrieval: `agent_retrieval=yes` → có knowledge chunks (<800 ký tự).

QA FAIL → REVIEW (tối đa 3 lần sửa, vượt → BLOCKED). QA PASS → PASS → được publish.

## Scheduled run procedure (cho các run tương lai)

```
FETCH → README → docs/BLOG.md → docs/BLOG-FACTORY.md
     → data/blog/content-matrix.csv + reports/blog-factory-run.md
     → lock → claim đúng 1 PLANNED
     → WRITE 1 (body + manifest draft) → finish → push
     → workflow: scoped QA → publish → verify → green
     → fetch fresh main → cycle kế tiếp (không tự chạy liên tục)
```

KHÔNG tự động viết hàng loạt trong các run chát thông thường. Viết bài chỉ chạy khi được chủ repo yêu cầu rõ ràng, theo đúng 1 bài / cycle.
