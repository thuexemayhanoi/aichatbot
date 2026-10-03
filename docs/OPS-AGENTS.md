# OPS AGENTS (v70) — Agent #4 / #5 / #6

Hệ thống vận hành tự trị cho hạ tầng, KHÔNG bao giờ viết nội dung bài.
Bài viết thuộc về writer pipeline (docs/CONTINUOUS-WRITER.md, docs/PARALLEL-WRITER.md).

## Vai trò

| Agent | Workflow | Vai trò | Số lần repair / incident |
|---|---|---|---|
| #4 | `.github/workflows/ops-repair-agent.yml` | First-line infra repair: classify → incident → MỘT recipe deterministic → regression → bàn giao | 1 |
| #5 | `.github/workflows/ops-supervisor.yml` | Độc lập kiểm chứng + MỘT lần sửa tuyến hai → VERIFIED / RECOVERED / FAILED_MANUAL | 1 |
| #6 | `.github/workflows/ops-watchdog.yml` | Watchdog: chỉ đánh thức production sau 2h đứng thật sự | 0 (không bao giờ repair) |

BA agent KHÔNG BAO GIỜ: viết/sửa body bài, tạo bài, claim PLANNED id, sửa matrix/manifest/taxonomy,
push writer branch, chạy generator, hay resume production khi chủ chưa cho.

## Triggers

- **#4** event-driven: `workflow_run` (conclusion=failure) của Writer Publisher, Writer Coordinator,
  Blog Factory Publish, pages build and deployment; hoặc `workflow_dispatch` thủ công.
  Lưu ý semantics của `workflow_run` + `GITHUB_TOKEN`: workflow chạy bằng token của actor khác
  có thể không kích hoạt được (đã từng gây publisher 403) — vì vậy còn có **đường thứ hai**:
  writer-publisher tự classify lỗi factory và `gh workflow run ops-repair-agent.yml` khi là INFRA.
  CI/Distribution DELIBERATELY không nằm trong trigger list (suite đang đỏ vì content blocker
  đã ghi nhận — tự kích theo CI sẽ tạo incident noise vô hạn; build lỗi vẫn tới được qua #5).
- **#5** KHÔNG tự trigger. Chỉ #4 dispatch (cùng `incident_id`) khi #4 terminal (SUCCESS/ESCALATE),
  hoặc `allow_crashed_handoff=true` khi run #4 chết giữa incident (state OPEN, lock chưa kịp tạo,
  `attempts.agent4 === 1` nên #4 không bao giờ vào lại).
- **#6** schedule `17,47 * * * *` (2 lần/giờ) + `workflow_dispatch` (dry_run). Không `workflow_run`
  — không chain đệ quy, không polling nặng.

## Phân loại lỗi: CONTENT vs INFRA

`tools/ops-agent.mjs classify` (rc=3 cho CONTENT):

- CONTENT: QA scoring fail ("Assert clean state; report QA failures") → `record-content-blocker`
  (dedup theo signature), KHÔNG mở incident, KHÔNG sửa bài, chờ pipeline REPAIR hoặc lệnh owner.
- INFRA: mọi lỗi khác → incident.

## Lock / incident contract

- State: `docs/state/operations/maintenance.json` (incident_id, status, owner, started_at,
  updated_at, base_sha, reason, attempts, production_paused, production_enabled, last_valid_progress_at,
  known_content_blockers, incidents[]).
- Lock atomic: git ref `refs/ops/maintenance-lock/<incident_id>` — create atomic (`git push origin HEAD:<ref>`),
  thua race là thua hẳn (không check-then-write). Lock refs KHÔNG nằm trong namespace branch của pages.
- Gate: mọi production workflow (coordinator/publisher/factory) chạy `ops-agent.mjs gate` TRƯỚC mutation
  đầu tiên — active incident hoặc lock ref ⇒ exit 1.

Bất biến (đã test, xem `tests/unit/ops-agents.test.js`, `ops-supervisor.test.js`, `ops-watchdog.test.js`):

- `#4_ACTIVE && #5_ACTIVE` = BẤT KHẢ THI (state machine: #5 chỉ bắt đầu khi #4 terminal;
  concurrency group riêng từng workflow; agent5-begin refuse mọi trạng thái khác).
- `MAINTENANCE_LOCK && PRODUCTION_MUTATION` = BẤT KHẢ THI (gate trong production workflows).
- `#6_WAKE && ACTIVE_PRODUCTION` = BẤT KHẢ THI; `#6_WAKE && MAINTENANCE` = BẤT KHẢ THI.
- `DUPLICATE_PRODUCTION_CYCLE` = BẤT KHẢ THI (queued run chặn wake; coordinator refuse ACTIVE batch).
- Mỗi incident: #4 tối đa 1 lần, #5 tối đa 1 lần, #6 0 lần.
- Lock mồ côi được xử lý tường minh (KEEP_ACTIVE / KEEP_FAILED_MANUAL / KEEP_FRESH_RACE / REMOVE_STALE) —
  ref mới (<1h) luôn được coi là race sống, không xóa nhầm.

## Recipe deterministic (không tự ý chữa kiểu nào khác)

`suggest-repair` chỉ match đúng 2 recipe, ngược lại ESCALATE:

- `RESUME_PENDING_TRANSACTION`: tồn tại `docs/state/blog-factory.transaction.json` →
  `node tools/blog-factory.mjs resume` (hoàn tất đúng transaction đã ghi, idempotent).
- `CLEAR_RETIRED_LOCKFILE`: tồn tại `docs/state/blog-factory.lock` (state cũ từ run crash) → xóa file.

Mọi commit repair phải qua scope guard (`ops-agent.mjs guard`, stdin là `git diff --name-only`):
cấm `data/blog/articles/`, `writer-work/`, `docs/state/writer-assignments.json`, `docs/state/active-work.json`.
#4/#5 cũng chạy targeted regression sau repair.

## Resume / wake: chỉ qua MỘT production entrypoint

Production entrypoint duy nhất: `gh workflow run writer-coordinator.yml --ref main -f dry_run=false -f limit=18`
(coordinator tự fan-out 3 writer; không ai start writer riêng lẻ).

- #5 chỉ resume khi `agent5-result` trả `resume_production=true`: tức VERIFIED/RECOVERED
  VÀ `production_enabled === true`. Hôm nay `production_enabled=false` ⇒ agent không bao giờ tự resume.
- #6 chỉ wake khi `watchdogShouldWake` thoả mọi điều kiện (xem dưới).

Đổi owner switch: sửa `production_enabled` trong `docs/state/operations/maintenance.json` (commit thường, KHÔNG [skip ci] lock).
Sự thật kinh doanh (giá, policy, SĐT) không liên quan hệ thống này.

## Watchdog #6: observation mapping

Timer 2h chỉ reset bởi **progress thật** (classifyProgressEvent = VALID):

| Tín hiệu | Nguồn quan sát |
|---|---|
| writer staging | commit cuối chạm `data/blog/articles/**` (`git log origin/main --`) |
| publish success | commit cuối chứa `PUBLISHED` trong message |
| writer branch push | `git for-each-ref refs/remotes/origin/writer/` (mới nhất theo committerdate) |
| recorded event | `last_valid_progress_at` trong maintenance.json |

KHÔNG tính: log, heartbeat, chính watchdog, check, run fail, hoạt động #4/#5, CI.

Blockers wake-decision kiểm tra lại trước khi dispatch: `production_enabled=false` (owner stop),
active incident, lock ref bất kỳ, #4 active/queued, #5 active/queued, production run đang
in_progress/queued (coordinator, publisher, factory, pages). Có MỘT điều kiện true ⇒ DO NOTHING.
Concurrency group `ops-watchdog` serialize hai watchdog trùng lịch: run thứ hai đợi xong rồi
quan sát thấy cycle đã queued ⇒ không dispatch lần hai.

## Quyền hạn (tối thiểu, lý do từng quyền write)

- **#4**: `contents:write` (lock ref, incident state, commit repair deterministic) + `actions:read` (đọc failed steps).
- **#5**: `contents:write` (incident state, report FAILED_MANUAL, commit repair tuyến hai, xóa lock ref khi khoẻ)
  + `actions:write` (dispatch đúng MỘT entrypoint — quyền write duy nhất, chỉ dùng trong resume step).
- **#6**: `contents:read` (quan sát, KHÔNG write content) + `actions:write` (dispatch đúng MỘT entrypoint).
- Không ai có pages/packages/id-token/pull-requests/issues. Không bao giờ log token (`set -x` bị cấm, test enforce).

## FAILED_MANUAL: quy trình can thiệp tay

Khi cả #4 và #5 đều thất bại:

1. Đọc `docs/state/operations/incident-reports/<incident_id>.md` (workflow #5 đã ghi).
2. Sửa nguyên nhân hạ tầng; chạy `node --test` và validator của blog-factory.
3. Xóa lock: `git push origin --delete refs/ops/maintenance-lock/<incident_id>`
   (CLI `release-lock` từ chối xóa lock FAILED_MANUAL — chỉ con người làm).
4. Production chỉ bật lại khi owner flip `production_enabled` và trigger entrypoint (hoặc để #6 wake sau 2h).

## CLI nhanh

```
node tools/ops-agent.mjs gate                       # exit 1 khi maintenance active
node tools/ops-agent.mjs classify --workflow W --failed-steps "A;;B"
node tools/ops-agent.mjs wake-decision --production-enabled true --last-progress-epoch N --now-epoch N ...
node tools/ops-agent.mjs incident-begin|agent4-result|agent5-begin|agent5-result|release-lock|report|guard|suggest-repair|record-content-blocker
```
