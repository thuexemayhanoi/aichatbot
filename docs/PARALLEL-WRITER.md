# Parallel Writer Contract — 3 writer song song + central coordinator + serialized publisher (v68)

Tài liệu này là hợp đồng vận hành của PARALLEL WRITER MODE, nâng cấp từ mô hình 1 writer tuần tự (v67, `docs/CONTINUOUS-WRITER.md`). Khi 3 writer bật, tài liệu này có hiệu lực song song với hợp đồng v67; mọi nguyên tắc tốt của v67 (MICRO_CHUNK=2, EXACT_SCOPE, NEW/REPAIR/BACKLOG tách rời, GROUPED_BUILD, factory KHÔNG chờ Pages) được giữ nguyên.

## Phân vai

- **Central Coordinator** (workflow `writer-coordinator.yml`): thành phần DUY NHẤT được chọn/claim/reserve article ID. Mỗi đợt reserve tối đa 50 dòng PLANNED theo thứ tự ma trận, chia micro-chunk 2 bài, gán round-robin cho 3 writer, ghi manifest `docs/state/writer-assignments.json` lên main. Manifest là nguồn sự thật duy nhất của mọi assignment.
- **Writer A/B/C** (external AI session, mỗi writer một session riêng): KHÔNG BAO GIỜ tự tìm PLANNED, không tự lấy "next article", không tự scan matrix. Writer chỉ đọc queue riêng của mình từ manifest, viết 2 bài, local QA, rồi push lên branch riêng `writer/<batch>/<A|B|C>`. Writer KHÔNG BAO GIỜ push main.
- **Serialized Publisher** (workflow `writer-publisher.yml`): thành phần DUY NHẤT đưa bài lên main. Xử lý tuần tự FIFO theo chunk seq, mỗi lần đúng một micro-chunk 2 bài, có fresh-main verification trước khi push.
- **GitHub Actions KHÔNG BAO GIỜ viết prose.** Việc viết vẫn do external writer đảm nhiệm; Actions chỉ deterministic.

Ba writer "song song" ở mức viết: trong khi publisher/factory xử lý cặp trước, writer đã có thể viết cặp kế tiếp của queue mình. Tính song song được bảo đảm bằng tách branch (mỗi writer một branch), guard của tool (`tools/writer-queue.mjs`) và test concurrency — không phải bằng nhiều workflow writer trong Actions.

## Luồng tổng quan

```
COORDINATOR: plan (max 50 PLANNED, deterministic) -> manifest docs/state/writer-assignments.json (commit main)
WRITER A/B/C (từng session, branch riêng):
    next <writer>          -> chunk kế tiếp của CHỈ writer đó
    begin <writer> <batch> <seq>       -> WRITING (chunk file trong writer-work/)
    research + viết 2 bodies + 2 manifest drafts
    ready <writer> <batch> <seq> --drafts f.json   -> LOCAL_QA_PASS -> READY_TO_PUSH
    push branch writer/<batch>/<A|B|C>: 2 bodies + writer-work/<batch>/<X>/chunk-NN.json
    (KHÔNG push matrix, published.json, docs/state trên branch)
    lặp lại với chunk kế tiếp của queue mình — không phải chờ publisher/factory
PUBLISHER (mỗi lần MỘT chunk, FIFO nghiêm ngặt):
    select-publish  -> chunk READY_TO_PUSH có seq thấp nhất (không nhảy cóc)
    wait factory quiet -> stage trên FRESH main -> verify-push
    push main (đúng 2 bodies + published.json) -> dispatch factory đúng 2 id
    factory: prepare-chunk -> qa-chunk -> publish-chunk (MỘT build) -> derived commit
    complete -> chunk PUBLISHED trong manifest (commit [skip ci])
```

## 1. Central reservation (nguyên tắc quan trọng nhất)

- Chỉ coordinator reserve. Writer tuyệt đối không tự chọn ID ngoài queue được giao.
- Coordinator fetch fresh main, chọn tối đa 50 dòng PLANNED hợp lệ theo thứ tự ma trận, reserve TOÀN BỘ trong một thao tác (một commit manifest duy nhất).
- Phân chia: chunk 01 → writer_A, 02 → writer_B, 03 → writer_C, 04 → writer_A, … round-robin xác định (50 bài = 25 chunk: A 9 chunk/18 bài, B 8/16, C 8/16). Chunk size 1 chỉ được phép ở biên corpus.
- BẤT BUỘC: `UNIQUE(article_id across writer_A + writer_B + writer_C) = TRUE`. Tool `validate` fail closed khi có duplicate; batch duplicate không bao giờ được commit, không writer nào chạy trên nó.
- Ghi manifest dùng atomic exclusive create: hai coordinator chạy đồng thời chỉ một bên thắng, bên thua báo `created=false`, không ghi đè.

## 2. State machine mỗi micro-chunk

Trạng thái bền vững chia hai nơi (crash-safe, tránh commit state liên tục lên main):

- Central manifest (`docs/state/writer-assignments.json`, chỉ coordinator/publisher ghi): `RESERVED` → `PUBLISHED` | `FAILED` | `FACTORY_FAILED` (+ mảng `events`). `PUSHING`/`PUSHED`/`FACTORY_PROCESSING` là sự kiện trong run của publisher (ghi vào `events` khi `complete`, không tạo commit riêng).
- Writer chunk file (`writer-work/<batch>/<A|B|C>/chunk-NN.json`, chỉ tồn tại trên branch writer, KHÔNG BAO GIỜ lên main): `WRITING` → `LOCAL_QA_PASS` → `READY_TO_PUSH`, kèm `WRITING_FAILED`/`LOCAL_QA_FAILED`/`ABORTED`.

Chunk FAILED là terminal: publisher bỏ qua (không chặn FIFO), các id giữ nguyên cho pipeline REPAIR/BACKLOG, KHÔNG tự cấp cho writer khác.

## 3. Writer chỉ làm việc trên queue riêng

- `next <writer>` trả về chunk RESERVED đầu tiên CỦA writer đó. Tool từ chối khi writer `begin` chunk của writer khác, batch không ACTIVE, hay chunk không RESERVED.
- `begin` là resume-safe: chạy lại giữa chừng không tạo duplicate chunk file; writer gặp lỗi (WRITING_FAILED/ABORTED) được phép `begin` lại CHÍNH chunk đó (cùng id, cùng writer), không được chuyển id.
- `ready` yêu cầu `--drafts` chứa đúng 2 manifest draft entries khớp id/slug/body path của chunk; sau `ready` chunk file là `READY_TO_PUSH` và không được viết lại.
- Writer push branch đúng: 2 body (`data/blog/articles/<slug>.body.html`) + 1 chunk file. KHÔNG push matrix, `published.json`, hay bất cứ gì dưới `docs/state` — những guard này cũng nằm trong factory-select của v67.

## 4. Serialized publisher

- Trigger: push vào `writer/**` (paths `writer-work/**`) hoặc dispatch thủ công (recovery).
- Publisher trích TOÀN BỘ các branch writer (`git archive` từng branch) thành một view chung — FIFO nhìn thấy trạng thái toàn cục của cả 3 writer.
- `select-publish`: chọn MỘT chunk `READY_TO_PUSH` có seq thấp nhất. Chunk nào ở seq thấp hơn chưa xong → `wait` (không bao giờ publish nhảy cóc). Chunk PUBLISHED/FAILED bị bỏ qua.
- Trước push: đợi factory quiet (tránh race derived commit), fetch fresh main, `stage` (2 bodies + merge 2 drafts vào `published.json`), `verify-push` (batch còn ACTIVE, chunk còn READY_TO_PUSH, 2 dòng vẫn PLANNED, đúng 1 draft entry mỗi id, không conflict body/manifest).
- Scope cứng khi commit: ĐÚNG 3 file (2 bodies + `published.json`), guard trong workflow fail khi lệch.
- Push bằng GITHUB_TOKEN không trigger được workflow, nên publisher dispatch `blog-factory-publish.yml` với `article_ids` chính xác của chunk, rồi theo dõi run theo đúng SHA đã push (fallback: run dispatched mới nhất). Factory xử lý ĐÚNG 2 id đó (prepare-chunk → qa-chunk → publish-chunk, MỘT build).
- Factory xong: `complete` xác minh 2 dòng đã PUBLISHED trên fresh main rồi mới đánh dấu chunk PUBLISHED trong manifest (commit `[skip ci]` riêng). `complete` là idempotent — chunk đã PUBLISHED không bao giờ chạy lại.
- Factory fail: chunk thành `FACTORY_FAILED` (terminal), id giữ nguyên cho pipeline sửa. Push fail/timeout: chunk GIỮ `RESERVED` (retry-safe; guard chống double push).

## 5. Chống trùng bài / double claim / race

- Reserve: chỉ dòng PLANNED; dòng đã có draft (pending/REPAIR) hoặc đã có body trên đĩa (backlog) KHÔNG BAO GIỜ vào batch NEW (§9). Batch đang ACTIVE không được reserve lại.
- Writer begin: `assigned_writer == current_writer`, `chunk_status == RESERVED`, batch ACTIVE.
- Stage (tạo body lên main): từ chối khi id đã có manifest entry hoặc body tồn tại ngoài assignment hiện tại → conflict, dừng.
- Trước push: fresh main + `verify-push`; chunk đã PUBLISHED không bao giờ được push lại.
- Concurrency groups: `writer-coordinator` và `writer-publisher`, đều `cancel-in-progress: false` — hai coordinator không cùng reserve, hai publisher không cùng push. Không có global writer lock; 3 writer không chờ nhau khi VIẾT.

## 6. Crash / resume

- Coordinator chết: batch ACTIVE còn nguyên trong manifest → lần `plan` sau từ chối reserve lại (`created=false, reason=never re-reserve`), writer/publisher resume từ manifest.
- Publisher chết giữa chừng: chunk còn RESERVED/READY_TO_PUSH → push branch writer lần nữa (hoặc dispatch `auto`) để publisher làm lại từ đầu; mọi bước idempotent, không double push (verify-push chặn).
- Factory chết: txn marker của v67 + `resume` giữ nguyên; chunk chỉ `complete` khi matrix thực sự PUBLISHED.
- Writer chết: `begin` lại chính chunk của mình; không writer khác nhận được id đó.

## 7. Không trộn backlog, không phá SIMPLE PRODUCTION MODE

- Batch 50 id là scope riêng: không kéo REVIEW/REPAIR/BACKLOG cũ hay PLANNED ngoài manifest (guard trong `selectCandidateIds` + factory-select v67).
- Factory vẫn exact-scope 2 bài/chunk, grouped build MỘT lần; không biến factory thành xử lý 6 bài cùng transaction.
- 3 writer chỉ tăng throughput phần WRITE. Mọi gate QA/publish của v67 giữ nguyên threshold.

## 8. Vận hành

- Bật production theo phase: PHASE 1 engine + tests; PHASE 2 dry-run coordinator; PHASE 3 publisher end-to-end với scope nhỏ; PHASE 4 mới bật 3 writer thật.
- Coordinator dispatch: `dry_run=true` mặc định (chỉ in kế hoạch, không ghi gì). `dry_run=false` mới reserve thật.
- Recovery thủ công qua dispatch `writer-publisher.yml`: `mark-published`, `mark-failed`, `mark-factory-failed`, `factory-requeue` (kèm ids).
- Báo cáo bắt buộc sau mỗi phase: WRITERS=3, MICRO_CHUNK=2, RESERVATION=CENTRALIZED, ASSIGNMENT_UNIQUE, DIRECT_WRITER_PUSH_TO_MAIN=NO, PUBLISHER_SERIALIZED, WRITER_CAN_WRITE_AHEAD, FACTORY_EXACT_SCOPE, DUPLICATE_ASSIGNMENT_TEST, CRASH_RESUME_TEST, DOUBLE_PUBLISH_TEST.

## 9. Tests

`tests/unit/writer-queue.test.js` phủ toàn bộ hợp đồng: 50 id unique, round-robin deterministic, duplicate fail-closed, hai coordinator chạy đua chỉ một thắng, writer không viết chunk của writer khác, publisher chỉ lấy READY_TO_PUSH và đúng MỘT chunk, FIFO nghiêm ngặt, fresh-main verification, published chunk không chạy lại, crash/resume không duplicate, stage conflict từ chối, stress 100 vòng scheduling (DUPLICATE_ASSIGNMENT=0) và 100 vòng lifecycle publisher (DOUBLE_PUBLISH=0), dry-run không đổi production inventory.

## 10. Lệnh tool

```bash
node tools/writer-queue.mjs plan [--limit N] [--dry-run] [--base-sha X]
node tools/writer-queue.mjs status
node tools/writer-queue.mjs validate
node tools/writer-queue.mjs next <writer_A|writer_B|writer_C>
node tools/writer-queue.mjs begin <writer> <batch> <seq>
node tools/writer-queue.mjs ready <writer> <batch> <seq> --drafts <file.json>
node tools/writer-queue.mjs abort <writer> <batch> <seq> [--reason X]
node tools/writer-queue.mjs select-publish [--work <dir>]
node tools/writer-queue.mjs stage <batch> <seq> --work <dir>
node tools/writer-queue.mjs verify-push <batch> <seq> --work <dir>
node tools/writer-queue.mjs complete <batch> <seq>
node tools/writer-queue.mjs fail <batch> <seq> --state failed|factory-failed|push-failed
```
