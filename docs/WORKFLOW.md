# WORKFLOW — Scheduled MotoAI run runbook

**Rule of every run: RESUME > FIX > VERIFY > IMPROVE > NEW FEATURE.**
Never start from zero; never assume the previous run completed.

## 0. Repository identity (absolute)

- Work ONLY on `thuexemayhanoi/aichatbot`, branch `main`.
- Before any change, verify owner/repo via the API or `git remote -v`.
- Never touch `thuexemayhanoi/game|shop|english|blog` or any other repo.

## 1. Startup checklist (in order)

1. Fetch latest `main`; record start SHA.
2. `git log -3` — note latest commit message/version (vNN).
3. Read `README.md`, `docs/`, `docs/matrix/`, `docs/state/active-work.json`.
4. Read `reports/` — latest run report.
5. Run the full test suite (`npm test`, i.e. `node --test`). All must pass before any change.
6. Identify unfinished work from `active-work.json` + Matrix (`IN_PROGRESS`, `QA_FAILED`, `BLOCKED`) and resume it FIRST.

## 2. Stale active-lock handling

If `active-work.json` exists from a previous run:

- If its `checkpoint_commit` is an ancestor of current `main` and its task status is not `IN_PROGRESS`, the lock is stale → overwrite with the new run.
- If status is `IN_PROGRESS` or `QA_FAILED`: inspect that feature's tests/evidence first; resume or mark `BLOCKED` with the exact error recorded.
- Never reset `DONE`/`VERIFIED` Matrix rows back to `PLANNED`.

## 3. During the run

- One coherent improvement = one commit. Run tests before each commit.
- Max 3 repair attempts for the same root cause; then mark `QA_FAILED`/`BLOCKED` with error, files, attempts, evidence, next action.
- Update Matrix statuses + evidence (`tools/gen-matrix.mjs` regenerates the CSV idempotently — edit the script, never hand-edit duplicate rows).
- Update `active-work.json` checkpoint before pushing.

## 4. Commit / push

- Commit message pattern: `MotoAI vNN <phase>: <summary>`.
- Inspect diff; never push known-broken code to `main`.

## 5. Deployment verification

After push, verify https://thuexemayhanoi.github.io/aichatbot/ in BOTH modes:
- DIRECT: load page, send a golden question, check answer matches verified data.
- EMBED: script tag on any host page, launcher appears, widget opens.
If stale → find cause (CDN delay vs failed build) before claiming success.

## 6. Report

Write `reports/YYYY-MM-DD-run.md` with the FINAL REPORT format (SHAs, matrix counts,
test results, fact gates, live checks, next BOT-xxx).

## Idempotency guarantees

Re-running this task must not: duplicate Matrix rows (generator is single-source),
duplicate tests, duplicate widgets (embed guard), overwrite business data,
or reset DONE/VERIFIED tasks.

## Scheduled run procedure cho BLOG factory (v47)

1. FETCH: README.md → docs/BLOG.md → docs/BLOG-FACTORY.md → data/blog/content-matrix.csv → reports/blog-factory-run.md → docs/state/blog-factory.lock + .transaction.json (nếu có).
2. Nếu marker transaction tồn tại: `node tools/blog-factory.mjs resume` TRƯỚC khi làm gì khác.
3. `node tools/blog-factory.mjs lock`.
4. Chọn lô `PLANNED` nhỏ nhất (batch_id), viết từng bài qua QA theo docs/ARTICLE-RULES.md, publish từng bài qua transaction.
5. `node tools/blog-factory.mjs validate` + `npm test` (phải xanh).
6. `unlock`, ghi report vào reports/blog-factory-run.md.
7. KHÔNG phụ thuộc bộ nhớ chat/session — mọi state nằm trong file repo.
