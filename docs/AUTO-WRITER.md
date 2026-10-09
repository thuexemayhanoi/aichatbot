# Auto Writer — local inference in Actions

## Why the engine changed (2026-10-08)

GitHub Models was fully retired on 2026-07-30, including its inference API:
https://docs.github.com/en/github-models
The old writer called that endpoint and received HTTP 200 with plain `OK`,
not a completion. Changing API tokens or cycling retired model names cannot
restore that service. `/vanchinh` used external AI writers; its Actions only
validated and published their files. It completed 2,000 articles.

The replacement uses Ollama with the explicit non-thinking
`qwen3:4b-instruct-2507-q4_K_M` model tag on the Actions runner.
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
   `auto-writer-longform.mjs` generates an AI outline and seven distinct
   sections (220–270 words each), with at most two calls per component.
   It uses a 4,096-token context and structured JSON schemas. All prose comes
   from local inference; assembly never pads or repeats paragraphs. Full
   article and pair QA still run after assembly. Rejected real candidates
   are retained as Actions evidence for diagnosis.
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

Recovery measurement: run `37821331522` completed 11.45-minute and 8.50-minute
streaming requests with Qwen3 4B, no swap use, but produced only 1,199 and
1,147 words. Both were correctly rejected. The smaller Apache-2.0 model
`qwen3:1.7b` passed real smoke run `37824564900`; smoke alone does not prove
long-form QA. Sources: https://ollama.com/library/qwen3:1.7b and
https://huggingface.co/Qwen/Qwen3-1.7B.

## Recovery verification and completion

`smoke_only=true` and `dry_run=true` can verify inference under maintenance.
They never change the incident, lock, reservation, matrix or published source.
The owner request shim accepts `smoke-test` and `dry-run`; dispatch failures
make its run fail. Evidence is an Actions artifact, not a log commit to main.

The writer requires 1,600–2,200 words and checks both articles together before
staging. Repeated paragraphs/sentences, cross-article copies and filler are
rejected even if the general article score would otherwise pass. Dry-run
artifacts include bodies, individual QA, model metrics and inventory hashes.

`factory-target.mjs` counts PUBLISHED rows against matching manifest entries
and existing source/page files. The coordinator limits the final reservation
to the remaining slots; a one-article boundary chunk is allowed. At exactly
2,000 publications the scheduled writer validates the site, records
`reports/factory-completion.json`, and turns `production_enabled` off.
More than 2,000 publications or inconsistent evidence fails closed.

The watchdog refuses to wake production when Actions observations fail.
Publisher waiting includes queued/pending factory jobs; derived commits retry
safe push races three times and stop on an actual content conflict.

Factory explicitly requests the existing main/root Pages build using
`pages: write` after its derived commit, and verifies the exact deployed SHA.
GITHUB_TOKEN pushes alone do not trigger Pages. Source settings and CNAME
are checked and never changed. The owner `pages-test` request verifies this
path against the already validated current site before RESUME. The coordinator
has `actions: write` and GH_TOKEN to start one writer after a new reservation.

Small-model verification: runs `37878076696` and `37879272052` were
correctly rejected. Qwen3 1.7B failed metadata/length constraints and produced
contradictions of the verified speed source. No content was published.
The writer now rejects those observed source contradictions and excludes
outline sections that merely duplicate the conclusion. The 4B Instruct 2507
Q4_K_M variant is selected for further real long-form verification:
https://ollama.com/library/qwen3:4b-instruct-2507-q4_K_M and
https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507.

The exact 4B Instruct model passed real smoke `37880775795`. Dry-run
`37880999484` rejected four descriptions of 195–283 characters before any
body publication; description remains limited to 50–165 characters, now
encoded in the inference schema. Verified legal-topic links take precedence
over unrelated sources from older articles. BA-0305 cites the official
government implementation notice at
https://pbgdpl.laichau.gov.vn/uploads/news/2024_12/cv-3045.pdf (HTTP 200,
speed table cross-checked); the original regulation PDF remains in the
source record. HTML link checks support both valid quote styles.
