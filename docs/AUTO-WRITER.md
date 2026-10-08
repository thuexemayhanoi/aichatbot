# Auto Writer — AUTO FACTORY 24/7 (v71)

Owner directive 2026-10-08: production phải chạy 24/7 bằng GitHub Actions, KHÔNG phụ thuộc bất kỳ external chat session nào. Tài liệu này là hợp đồng vận hành của thành phần mới; mọi bất biến của PARALLEL WRITER MODE (v68, `docs/PARALLEL-WRITER.md`) được giữ nguyên, trừ đúng một điểm: Actions giờ ĐƯỢC viết prose thông qua AI engine có guardrail.

## Thành phần

| Thành phần | Vai trò |
| --- | --- |
| `tools/auto-writer.mjs` | AI writer engine: chọn chunk RESERVED seq thấp nhất của batch ACTIVE, sinh 2 bài bằng GitHub Models inference, chạy full production QA trong sandbox root, regenerate có giới hạn khi QA fail |
| `.github/workflows/auto-writer.yml` | Mỗi run đúng 1 chunk (không bao giờ loop trong job), cron `*/25 * * * *`, `workflow_dispatch` (dry_run/model/max_attempts) |
| `writer-queue.mjs begin/ready` | Vẫn là state writer DUY NHẤT (WRITING → READY_TO_PUSH) |
| `writer-publisher.yml` | Vẫn là thành phần DUY NHẤT push main; auto-writer chỉ push branch `writer/<batch>/<A|B|C>` |
| `writer-coordinator.yml` | Vẫn là trung tâm reservation; auto-writer dispatch khi queue hết chunk ACTIVE |

## Chu kỳ một run

1. Ops gate: `production_enabled=false` hoặc lock/incident → run IDLE (exit 0, KHÔNG đỏ). Ngược lại `tools/ops-agent.mjs gate`.
2. `node tools/auto-writer.mjs run` → emit `status=READY_TO_PUSH|NEED_BATCH|FAILED`.
3. `READY_TO_PUSH` → workflow gọi `begin` + `ready`, push branch (đúng 2 bodies + chunk file), dispatch `writer-publisher.yml -f action=auto` (push bằng GITHUB_TOKEN không trigger workflow).
4. `NEED_BATCH` → dispatch `writer-coordinator.yml -f dry_run=false -f limit=18`, exit 0. Run cron kế tiếp (≤ 25 phút) lấy batch mới.
5. `FAILED` → exit 1 (đỏ): Agent #4 mở incident + lock → production PAUSED cho đến khi owner RESUME (rule dừng bắt buộc).

## Guardrail AI engine (giữ nguyên hợp đồng writer)

- Chỉ đúng 2 id của chunk được giao, chỉ writer slot được giao; business facts CHỈ qua placeholder đã kiểm chứng; internal links chỉ trong hub của dòng (+ root); dòng SAFE legal-gate bắt buộc link gov.vn/vbpl.vn; không CJK/Cyrillic rơi vãi, không `<h1>`, không markdown; `knowledge_chunks` theo `agent_retrieval` (SAFE → `[]`, ngược lại 2 × <800 chars).
- Mỗi bài: local validation → full production QA (`article-qa.mjs`, PASS ≥ 70) trong sandbox temp factory root (symlink repo + 2 draft entries). QA fail → regenerate với feedback lỗi (mặc định 4 lần, chuỗi model fallback: `openai/gpt-4o-mini` → `openai/gpt-4.1-mini` → `mistral-ai/mistral-large-2407`).
- Auth 401/403 model → FAILED với lý do rõ ràng: cần secret `GH_MODELS_TOKEN` (PAT models:read) hoặc quyền `models: read` của GITHUB_TOKEN.
- Crash-safe: run chết giữa chừng để chunk RESERVED — run kế tiếp retry an toàn, không double publish.

## STOP / RESUME (owner)

- STOP: push `ops/owner-review/request.json` với `{"action":"pause"}` → shim set `production_enabled=false` trong `docs/state/operations/maintenance.json` (bền vững, commit main). Mọi run auto-writer kế tiếp IDLE ngay tại ops gate; watchdog không bao giờ wake. KHÔNG xóa bài đã publish, KHÔNG đụng queue/matrix.
- RESUME: push `{"action":"resume"}` → shim set `production_enabled=true`, commit, và dispatch `auto-writer.yml -f dry_run=false` để chu kỳ đầu khởi động ngay.
- Nếu đang có incident/lock (workflow đỏ): giải quyết theo hướng dẫn resolve-incident của Agent #5, rồi RESUME như trên.

## Vòng tuần hoàn 24/7

- Cron `*/25 * * * *` là nhịp chính (mỗi run 1 chunk ≈ 2 bài).
- Watchdog (Agent #6) đổi entrypoint wake sang `auto-writer.yml`: sau 2h không có progress hợp lệ, dispatch đúng MỘT run auto-writer.
- Agent #4 giờ theo dõi cả `Auto Writer (AI article generation)` qua workflow_run.
- Toàn bộ khóa chống chạy trùng giữ nguyên: concurrency group mỗi workflow, chunk state idempotent, publisher serialized FIFO, coordinator atomic exclusive create.
