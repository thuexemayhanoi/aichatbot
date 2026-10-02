# v68 PARALLEL WRITER MODE — ghi nhận triển khai theo phase

Tài liệu hợp đồng: docs/PARALLEL-WRITER.md. Bản ghi này tóm tắt trạng thái triển khai để đối chiếu nhanh.

## Phase đã hoàn tất

- PHASE 1 — engine (commit ca67691c):
  - tools/writer-queue.mjs: coordinator reserve (max 50 PLANNED, round-robin
    A/B/C, micro chunk 2 bài), queue 3 writer, serialized publisher FIFO,
    fresh-main verification, crash/resume idempotent, duplicate fail closed.
  - tests/unit/writer-queue.test.js: 24 contract tests, gồm stress 100 vòng
    scheduling (DUPLICATE_ASSIGNMENT=0) và 100 vòng lifecycle publisher
    (DOUBLE_PUBLISH=0).
- PHASE 2 + PHASE 3 — workflows + docs (commit 862180eb):
  - writer-coordinator.yml (workflow_dispatch, dry_run mặc định true,
    concurrency writer-coordinator).
  - writer-publisher.yml (push writer/**, concurrency writer-publisher,
    serialized publisher, dispatch factory đúng 2 id, recovery dispatches).
  - docs/PARALLEL-WRITER.md + pointer trong docs/CONTINUOUS-WRITER.md và
    docs/BLOG-FACTORY.md.

## PHASE 4 (chưa bật — quyết định của owner)

1. Dispatch "Writer Coordinator" với dry_run=false để reserve batch đầu.
2. Mở 3 external writer session (writer_A/B/C), mỗi session chạy vòng:
   fetch fresh main -> next <writer> -> begin -> viết 2 bài + local QA ->
   ready --drafts -> push branch writer/<batch>/<A|B|C>.
3. Publisher tự chạy trên mỗi writer push; theo dõi FIFO qua
   docs/state/writer-assignments.json.

## Bất biến đã chứng minh bằng test

UNIQUE(article_id across A+B+C)=TRUE; writer không viết chunk của writer khác;
publisher chỉ lấy READY_TO_PUSH, đúng MỘT chunk, FIFO nghiêm ngặt; published
chunk không chạy lại; crash/resume không duplicate; NEW batch không trộn
draft/backlog/repair; dry-run không đổi production inventory.

Production inventory: không đổi trong suốt quá trình nâng cấp.
