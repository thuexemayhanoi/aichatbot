# Self-healing factory

Repository scope: `thuexemayhanoi/aichatbot` only. Production remains the
existing GitHub Pages main/root site at `https://chatbot.thuexemaynguyentu.com/`.
GitHub Actions owns all schedules; an open chat session is unnecessary.

## Publication path

WRITE → FIX → QA → PUBLISH → DISTRIBUTION → DEPLOY → VERIFY.

Auto Writer retains local Ollama, `OLLAMA_NO_CLOUD=1`, and the current
`qwen3:4b-instruct-2507-q4_K_M` model. No paid inference endpoint is added.
The existing 800–2000-word range, factual-source checks, originality checks,
HTML validation and production QA thresholds stay intact. BA-0311 scored
100 and BA-0312 scored 95 on real scoped QA; the latter's local-angle warning
remains visible. These results do not justify a model change.

FIX can append a slash only to an anchor backed by a real directory index.
It leaves files, images, static resources, unknown paths, queries and fragments
untouched. The exact unpublished QA scope is validated in full before writing.
No live article body is edited. The builder also canonicalizes rendered links,
and the site audit resolves actual directory indexes without accepting missing
targets. QA still runs after every draft fix.

The factory publishes only PASS articles. A failing partner remains REPAIR;
its passing partner can complete distribution/deployment/verification even
while the run correctly reports the scoped QA failure. Each chunk produces a
WordPress distribution artifact. Engine changes additionally require the full
CI and Distribution suites on the same code revision.

`content-matrix.csv` records the transactional content checkpoint.
`published.json` also contains staged drafts: its length is not a published
count. `docs/state/publication-receipts.json` is the production evidence ledger.
Before a receipt is saved, VERIFY requires a unique local and live manifest,
PUBLISHED matrix rows on both sides, unique canonical URLs in both sitemaps,
HTTP 200 from the correct production origin, and byte-identical deployed HTML.
Receipts include the publication SHA, body/entry/page SHA-256 hashes and time.
Once backfilled, `readPublicationBudget()` counts only valid receipts. Missing
or changed evidence is reported as awaiting verification. Legacy repositories
without a ledger are backfilled by the controller; completion always rechecks
all 2000 production pages. Progress reports expose matrix checkpoints and
production verification separately.

## Bounded recovery and dead letter

`factory-controller.yml` runs at minutes 9, 19, 29, 39, 49 and 59 of every hour,
and on relevant workflow completion events. GitHub may delay scheduled starts.
The Auto Writer's independent `*/25` heartbeat and the existing Agent #6
watchdog are retained. Controller, writer, publisher and factory concurrency
groups serialize their respective actors. The controller checks queued and
active equivalents before dispatch. A persisted dispatch intent prevents a
lost API response from immediately causing a second dispatch. State writes
use a fast-forward push, never force or rebase over another actor's evidence.

Only allowlisted transient read failures retry automatically, at most three
times. CI/Distribution transient infrastructure failures can rerun their failed
jobs with a durable three-retry budget; content QA and permission errors never
take that path. Staged drafts receive at most three serialized factory requeues.
Their source is retained unchanged if recovery is exhausted.

Fresh model/content refusals retain candidate/component evidence in the
`writer-evidence-<run>` artifact. The successful deferral step distinguishes
content refusal from infrastructure failure. Before model loading, the next
writer checks for an unconsumed refusal and waits for the controller. The
controller verifies the exact run/artifact SHA, batch, sequence and reservation,
then uses `writer-queue defer-content` to close that chunk safely. Only the
refused article spends a content cycle; its untouched partner remains eligible
for a later batch. Other reserved chunks continue.

Scoped factory QA produces `factory-evidence-<run>`. Only matching REPAIR rows
may be deferred from that artifact. `docs/state/factory-dead-letter.json` stores
failure reasons, evidence run IDs, cycle count and retry time. Cycles one and
two wait 30 and 60 minutes respectively; the third becomes DEAD_LETTER.
Cooldown and dead-letter entries are excluded from both new reservation and
backlog selection. A row is RESOLVED only with valid production evidence.
Dead-letter articles remain unpublished and visible for investigation; the
controller never invents proof or rewrites uncertain facts to reach the target.

## Incident and completion gates

Owner STOP, active incidents and maintenance refs always block production.
The controller never deletes a maintenance ref. Agent #4 keeps its existing
deterministic repair playbook and single attempt. After Agent #4 terminates,
the controller may request genuine read-only Ollama smoke and dry-run runs,
then supply their correlated run IDs plus same-code green CI/Distribution
to Agent #5. Agent #5 independently checks artifacts, QA, source hashes and
the code before consuming its attempt. Only that existing verified recovery
path can release a lock and invoke the owner's authorized normal RESUME path.
FAILED_MANUAL remains locked; no automatic override is implemented.

At exactly 2000 verified articles, a final full production reconciliation
must pass before production is switched off. A durable
`reports/factory-completion.json` records the count, verification SHA and time;
Pages is explicitly deployed and checked for that final state. The schedules
continue to observe owner STOP, so no further articles are generated.

Tests: `node --test`. The regression suite covers the two recorded URL errors,
live-body immutability, production-proof mismatches, partial QA, cooldowns,
dead letter, stale assignments, duplicate dispatches, permissions and bounded
transport retries. No test requires an AI API.
