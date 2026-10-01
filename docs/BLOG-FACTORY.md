# Blog Factory — nhà máy nội dung có thể phục hồi

Công cụ: `tools/blog-factory.mjs`. Nguyên tắc an toàn giống các hệ thống sản xuất trưởng thành: state machine, transaction, checkpoint, KHÔNG phụ thuộc bộ nhớ chat/session.

## State machine mỗi bài (cột `status` trong `data/blog/content-matrix.csv`)

```
PLANNED → WRITING → QA → PASS → PUBLISHED
                ↘ REVIEW → REPAIR (tối đa 3 lần sửa có nghĩa) → PASS
                ↘ FAIL / BLOCKED
```

Chỉ bài `PASS` mới được publish. Bài FAIL/BLOCKED phải được người phụ trách xem xét lại; không tự động retry vượt 3 lần.

## Hợp đồng sản xuất v66 — TWO-ARTICLE MICRO BATCH: 2 BÀI / CHUNK

Hợp đồng 1 bài/cycle (v64) đã nghỉ hưu; chunk ≤10 mù (v58) vẫn nghỉ hưu. Đơn vị vận hành = micro chunk gồm 2 bài (1 bài được phép ở biên corpus). Workflow ceiling: tối đa 50 id/run, mirroring /vanchinh:

```
select exact ids (factory-select.mjs: từ diff push, --ids, hoặc --backlog)
→ prepare-chunk (auto-claim từng id: PLANNED → WRITING → QA)
→ qa-chunk (scoped QA từng bài, kết quả độc lập — một bài FAIL không hỏng bài PASS)
→ publish-chunk (GROUPED transaction: MỘT build cho cả chunk + verify từng bài)
→ rebuild + verify → commit derived state (MỘT commit cho cả chunk)
→ clean txn/lock → chunk kế tiếp
```

Quy tắc bất biến:

- Chunk = danh sách BA-id EXPLICIT (`prepare-chunk/qa-chunk/publish-chunk BA-0002,BA-0003`). Không bao giờ nhận tham số số (chunk mù đã bỏ).
- `claim` không tham số vẫn nhận đúng 1 dòng PLANNED đầu; `claim <BA-id>` nhận đúng dòng đó. Từ chối khi đã có dòng WRITING và từ chối tham số số.
- `finish <BA-id>` đưa đúng 1 dòng WRITING → QA (`finish-chunk` giữ tương thích ngược).
- `qa-chunk`: mỗi bài một kết quả QA độc lập; PASS publish được, REVIEW/REPAIR ở lại; threshold không hạ.
- `publish-chunk`: MỘT build() cho toàn bộ chunk (2 bài PASS = build_calls=1), MỘT marker txn chứa đúng các id PASS, verify từng bài (page + matrix + sitemap + canonical + schema + 1 H1), MỘT checkpoint update, MỘT commit derived state.
- Không duplicate claim, không duplicate article_id/output_path, không hồi PUBLISHED.
- Backlog: dòng PLANNED có sẵn body + manifest draft (workflow cũ chết) được discovery deterministic và xử lý, không cần push lại bài.
- Resume/repair (QA/REVIEW/REPAIR/PASS dở) luôn ưu tiên trước bài PLANNED mới.
- Sau gián đoạn: `abandon-chunk` trả dòng WRITING về PLANNED, unlock, run mới claim lại tiếp tục; txn marker còn → `resume` dựng lại đúng toàn bộ các id trong marker.

## Lệnh

```bash
node tools/blog-factory.mjs status
node tools/blog-factory.mjs validate       # QA ma trận: số dòng, lô, phân bố, trùng lặp, legal gate
node tools/blog-factory.mjs lock           # run lock (docs/state/blog-factory.lock)
node tools/blog-factory.mjs unlock
node tools/blog-factory.mjs claim [BA-id]  # ĐÚNG 1 dòng PLANNED → WRITING (cần lock)
node tools/blog-factory.mjs finish BA-0002 # WRITING → QA, ghi checkpoint
node tools/blog-factory.mjs prepare BA-0002        # auto-claim 1 bài: PLANNED/WRITING → QA (cần lock)
node tools/blog-factory.mjs prepare-chunk BA-0002,BA-0003 # auto-claim nhiều id → QA (workflow dùng lệnh này)
node tools/blog-factory.mjs qa BA-0002     # scoped QA 1 bài → PASS hoặc REVIEW/BLOCKED
node tools/blog-factory.mjs qa-chunk BA-0002,BA-0003 # scoped QA nhiều bài, kết quả độc lập (pass_ids/fail_ids)
node tools/blog-factory.mjs publish BA-0002        # transaction 1 bài (alias publish-chunk)
node tools/blog-factory.mjs publish-chunk BA-0002,BA-0003 # GROUPED transactional publish: 1 build cho cả chunk
node tools/blog-factory.mjs resume         # phục hồi transaction đứt quãng (1 bài hoặc chunk)
node tools/blog-factory.mjs abandon-chunk  # crash recovery: WRITING → PLANNED
node tools/blog-factory.mjs checkpoint    # xem checkpoint (docs/state/blog-factory.checkpoint.json)
```

## Publish workflow tự động (`.github/workflows/blog-factory-publish.yml`)

Event-driven, deterministic, KHÔNG AI/API key trong Actions. Xử lý đúng scope của push (1–50 id, canonical 2):

```
select exact ids (tools/factory-select.mjs: mode=new|repair|backlog)
→ RECOVER (resume txn marker; dọn stale lock) → lock
→ prepare-chunk đúng claim_ids → qa-chunk đúng qa_ids (independent PASS/FAIL)
→ collect PASS ids (+ ready_ids đã PASS) → publish-chunk (MỘT build + verify từng bài)
→ validate (matrix smoke) → clean txn/lock
→ commit derived state (MỘT commit cho cả chunk: matrix, pages, indexes, sitemap, report)
```

- Writer push = 2 body mới + đúng 2 manifest draft entries (chunk size 1 cho phép ở biên corpus). MA TRẬN KHÔNG nằm trong writer push — workflow tự claim đúng các dòng (`prepare-chunk`).
- Push chạm hơn 50 body → REFUSE. Body không có manifest entry khớp, duplicate ID/slug, push `docs/state/**`, hoặc `published.json` không kèm body → REFUSE. Dòng FAIL/BLOCKED → REFUSE. Dòng PUBLISHED bị sửa → SKIP (manual rebuild).
- Unfinished rows (QA/REVIEW/REPAIR/PASS dở) KHÔNG còn chặn writer: factory xử lý chúng TRƯỚC trong cùng run (resume-first), cùng backlog discovery (dòng PLANNED có sẵn body + draft).
- Push chỉ sửa tooling (không chạm article paths) → workflow không chạy.
- `workflow_dispatch` với `article_ids` explicit (vd `BA-0002,BA-0003`) là đường duyệt tay; bỏ trống → quét backlog/pending.
- Article-only production KHÔNG chạy full chatbot test suite mỗi chunk; full `node --test` giữ nguyên trong `ci.yml` cho engine/tool/workflow changes.
- Commit derived state dùng GITHUB_TOKEN (push không re-trigger workflow), message `factory: publish [<ids>] <mode> chunk (2-article micro batch) [skip ci]`, không bao giờ commit lock/txn marker.

## Publish transaction (grouped)

Publish có thể cập nhật: article HTML, matrix, hub, blog index, search index, knowledge index, sitemap, reports. Ngữ nghĩa phục hồi của MỘT chunk:

```
marker (docs/state/blog-factory.transaction.json — chứa ĐÚNG các id PASS của chunk)
→ write (đánh dấu PUBLISHED từng id; build-blog.mjs: manifest là nguồn sự thật)
→ build() MỘT LẦN cho cả chunk (build_calls=1)
→ verify consistency từng bài (file tồn tại + matrix=PUBLISHED + sitemap chứa URL
  + self-canonical + Article/BreadcrumbList schema + đúng 1 H1)
→ clear marker (chỉ sau khi verify xanh TOÀN BỘ chunk)
→ checkpoint update MỘT LẦN cho cả chunk
```

Nếu bất kỳ bước nào fail: marker GIỮ NGUYÊN, lệnh `resume` dựng lại từ marker (re-drive đúng các id, một build, verify từng id) và chỉ xóa marker khi verify pass cả chunk.

## Scoped QA trước publish (bắt buộc, deterministic PASS/FAIL)

`tools/article-qa.mjs` kiểm đúng từng bài trong chunk (kết quả độc lập mỗi bài) theo checklist:

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

## Scheduled run procedure (continuous-ready)

```
FETCH → README → docs/BLOG.md → docs/BLOG-FACTORY.md → docs/CONTINUOUS-WRITER.md
     → data/blog/content-matrix.csv + reports/blog-factory-run.md
     → RECOVER (txn/lock nếu có → resume/dọn ngay)
     → RESUME bài đang dở (QA/REVIEW/REPAIR/PASS) nếu có
     → WRITE 2 (bodies + manifest drafts) → local scoped QA each → push
     → workflow: prepare-chunk → qa-chunk → publish-chunk (1 build) → verify → green
     → fetch fresh main → cặp 2 bài kế tiếp (REPEAT cho đến khi corpus xong)
```

Factory là continuous-ready: khi owner yêu cầu rõ ràng, external AI writer chạy vòng lặp canonical 2 bài/chunk liên tục theo `docs/CONTINUOUS-WRITER.md`. GitHub Actions KHÔNG tự tạo prose — Actions chỉ thực hiện QA/publish/verify deterministic; vòng lặp viết liên tục do external writer đảm nhiệm. Viết bài không tự kích hoạt trong các run thường; chỉ chạy khi được chủ repo yêu cầu rõ ràng.
