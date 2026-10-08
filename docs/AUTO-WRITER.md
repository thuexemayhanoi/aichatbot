# Auto Writer — local inference in Actions

## Why the engine changed (2026-10-08)

GitHub Models was fully retired on 2026-07-30, including its inference API:
https://docs.github.com/en/github-models
The old writer called that endpoint and received HTTP 200 with plain `OK`,
not a completion. Changing API tokens or cycling retired model names cannot
restore that service. `/vanchinh` used external AI writers; its Actions only
validated and published their files. It completed 2,000 articles.

The replacement uses Ollama with `qwen3:4b-instruct` on the Actions runner.
The server listens on loopback only. No paid inference API or model token
is used; `GITHUB_TOKEN` remains limited to GitHub operations. The chatbot
frontend continues to run locally without a remote inference service.
The site's canonical domain is **https://chatbot.thuexemaynguyentu.com**.

## Production cycle

1. Owner switch and incident/maintenance locks gate all work.
2. Inspect the lowest RESERVED chunk. A READY_TO_PUSH writer branch resumes
   publication without rewriting content. An empty queue dispatches the
   coordinator; inspection runs before downloading any model.
3. Restore the model cache, install Ollama v0.40.1 from its official release
   with SHA-256 verification, start the loopback server, and pull the model.
4. Generate two articles. Each candidate must pass the existing local checks
   and full sandboxed `article-qa.mjs`. Default: two attempts per article,
   maximum four. Requests have a 20-minute timeout; the job is bounded to
   120 minutes. CPU inference is slower than a hosted model, so a cron tick
   is an opportunity to run, not a promise of two articles every 25 minutes.
5. `writer-queue begin/ready` remains the only writer-state editor. Push two
   bodies and the chunk record to the assigned writer branch, explicitly
   dispatch the serialized publisher, and publish only QA-passing articles.
6. Generation failures preserve key=value outputs despite Bash `-e` and
   explicitly dispatch the repair workflow using `failure()` and the exact
   source run ID. Failures remain red; QA thresholds are unchanged.

Internal URLs use `/blog/<hub>/<slug>/` and derive from manifest categories
(the source bodies live in a flat directory). The coordinator persists any
refilled matrix alongside the assignments. A coordinator dry-run never refills.

## Controls

- Owner STOP: `ops/owner-review/request.json` with `{"action":"pause"}`.
- Owner RESUME/start immediately: `{"action":"resume"}`.
- Dry-run: `{"action":"dry-run"}`. Generation and QA run, but nothing is
  reserved, pushed, or published. It also checks the real local inference path.
- A red run or incident requires repairing the recorded cause before resume.
- `auto-writer.yml` accepts `model` (an Ollama model tag), `max_attempts`
  (1–4), and `dry_run`. No `GH_MODELS_TOKEN` is needed.

## Verification

Run `node --test`, `node tools/writer-queue.mjs validate`,
`node tools/blog-factory.mjs validate`, `node tools/site-audit.mjs`, and verify
that `build-blog.mjs` leaves derived output unchanged. Model adapter tests
cover real loopback HTTP, non-JSON 200 replies, truncated responses, transport
errors/timeouts and credential isolation. Workflow tests exercise a failed
Bash pipeline and recovery from a staged writer branch in a temporary repo.
Successful tests do not prove that a small CPU model will pass production QA;
verify a real Actions run and matrix progress after deployment.
