#!/usr/bin/env node
/**
 * MotoAI ops agents — shared incident/maintenance foundation (v70).
 *
 * Three INDEPENDENT operational agents share this module (docs/OPS-AGENTS.md):
 *
 *   Agent #4 (ops-repair-agent.yml)   first-line infrastructure repair
 *   Agent #5 (ops-supervisor.yml)     independent verification + ONE second-line repair
 *   Agent #6 (ops-watchdog.yml)       2-hour inactivity watchdog (read-only + one entrypoint)
 *
 * Global contracts implemented here (pure, unit-tested core + thin CLI):
 *
 *   - MAINTENANCE_LOCK && PRODUCTION_MUTATION = IMPOSSIBLE
 *     The lock is an atomic git ref namespace refs/ops/maintenance-lock/<incident_id>.
 *     Creating a ref is atomic (the push fails if it exists) — no check-then-write
 *     race. The production workflows (coordinator/publisher/factory) refuse to run
 *     while ANY lock ref or an active incident exists (`node tools/ops-agent.mjs gate`).
 *     The owner switch production_enabled is a HARD GATE of the same command:
 *     while it is false, no production workflow may mutate anything — even a
 *     push of article bodies / published.json cannot start a real production.
 *
 *   - #4_ACTIVE && #5_ACTIVE = IMPOSSIBLE
 *     #5 may only take over an incident whose status is a #4 terminal state
 *     (AGENT4_SUCCESS | AGENT4_ESCALATE); #4 can never re-enter after that.
 *
 *   - #6_WAKE && ACTIVE_PRODUCTION = IMPOSSIBLE, #6_WAKE && MAINTENANCE = IMPOSSIBLE
 *     The wake decision requires: production_enabled (owner switch), no active
 *     incident, no lock ref, no #4/#5 activity, no in-progress/queued production
 *     run, and >= 2h since the last VALID production progress.
 *
 *   - Max repair attempts per incident: #4 = 1, #5 = 1, #6 = 0.
 *
 * NONE of the agents ever writes article content: this module has no article
 * generation/publishing/claiming commands, and the workflows run a scope guard
 * that refuses any change outside tools/, tests/, docs/, .github/workflows/
 * and docs/state/operations/.
 *
 * Durable state lives in docs/state/operations/maintenance.json (committed).
 * The owner switch `production_enabled: false` keeps production STOPPED:
 * Agent #5 will not resume and Agent #6 will not wake until the owner flips it.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const STATE_PATH = 'docs/state/operations/maintenance.json';
export const LOCK_NS = 'refs/ops/maintenance-lock';
export const LOCK_REF_PREFIX = LOCK_NS + '/';

/** The factory's per-article QA failure exit — CONTENT, never an incident. */
export const CONTENT_QA_STEP = 'Assert clean state; report QA failures';

/** Exactly ONE production entrypoint for #5-resume and #6-wake. */
export const PRODUCTION_ENTRYPOINT = Object.freeze({
  workflow: 'writer-coordinator.yml',
  inputs: Object.freeze({ dry_run: 'false', limit: '18' })
});

/** Watchdog wakes only after 2 continuous hours without valid progress. */
export const WATCHDOG_IDLE_MS = 2 * 60 * 60 * 1000;
/** A lock ref younger than this with no committed state is a live race, not stale. */
export const LOCK_RACE_WINDOW_MS = 60 * 60 * 1000;
/** An OPEN incident untouched for this long lost its Agent #4 run (crash). */
export const CRASHED_INCIDENT_WINDOW_MS = 60 * 60 * 1000;
/** History caps keep the state file small. */
export const MAX_HISTORY = 50;
export const MAX_BLOCKERS = 100;

export const INCIDENT_STATUSES = Object.freeze([
  'OPEN', 'AGENT4_SUCCESS', 'AGENT4_ESCALATE', 'AGENT5_WORKING', 'VERIFIED', 'RECOVERED', 'FAILED_MANUAL'
]);
const AGENT4_TERMINAL = new Set(['AGENT4_SUCCESS', 'AGENT4_ESCALATE']);
const CLOSED_OK = new Set(['VERIFIED', 'RECOVERED']);

/** Only these count as VALID production progress for the watchdog timer. */
export const VALID_PROGRESS_TYPES = Object.freeze(['writer_staging', 'publish_success', 'cycle_complete']);
/** Heartbeats, logs, checks, failed runs and agent activity NEVER reset the timer. */
export const IGNORED_PROGRESS_TYPES = Object.freeze([
  'log', 'heartbeat', 'watchdog_run', 'polling', 'check', 'failed_run', 'agent_activity'
]);

const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// State file IO
// ---------------------------------------------------------------------------

export function emptyOpsState({ productionEnabled = false, lastValidProgressAt = '' } = {}) {
  return {
    $schema: 'motoai/ops-state@1',
    schema_version: 1,
    production_enabled: productionEnabled,
    last_valid_progress_at: lastValidProgressAt,
    active_incident: null,
    incidents: [],
    known_content_blockers: []
  };
}

export function opsStatePath(root = ROOT) {
  return join(root, STATE_PATH);
}

export function loadOpsState(root = ROOT) {
  const p = opsStatePath(root);
  if (!existsSync(p)) return emptyOpsState();
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function saveOpsState(state, root = ROOT) {
  const p = opsStatePath(root);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

/** Structural sanity used by Agent #5 verification and tests. */
export function validateOpsState(state) {
  const errors = [];
  if (!state || typeof state !== 'object') return ['state is not an object'];
  if (typeof state.production_enabled !== 'boolean') errors.push('production_enabled must be boolean');
  if (state.active_incident !== null && typeof state.active_incident !== 'object') errors.push('active_incident must be null or object');
  if (state.active_incident) {
    const i = state.active_incident;
    if (!INCIDENT_STATUSES.includes(i.status)) errors.push('bad incident status: ' + i.status);
    if (i.attempts && (i.attempts.agent4 > 1 || i.attempts.agent5 > 1)) errors.push('repair attempts exceed the 1-per-agent cap');
    if (i.status === 'OPEN' && i.attempts?.agent4 !== 1) errors.push('OPEN incident must carry exactly one agent4 attempt');
    if (i.status === 'AGENT5_WORKING' && i.attempts?.agent5 !== 1) errors.push('AGENT5_WORKING incident must carry exactly one agent5 attempt');
    if (i.status !== 'OPEN' && i.status !== 'AGENT5_WORKING' && i.owner !== 'NONE') errors.push('closed/terminal incident must have owner NONE');
  }
  if (!Array.isArray(state.incidents)) errors.push('incidents must be an array');
  if (!Array.isArray(state.known_content_blockers)) errors.push('known_content_blockers must be an array');
  return errors;
}

// ---------------------------------------------------------------------------
// Failure classification (content QA NEVER triggers a repair incident)
// ---------------------------------------------------------------------------

export function classifyFailure({ workflow, failedSteps }) {
  const steps = (failedSteps ?? []).filter(Boolean);
  if (String(workflow ?? '').includes('Blog Factory Publish') && steps.length > 0
    && steps.every((s) => s === CONTENT_QA_STEP)) {
    return {
      kind: 'CONTENT',
      reason: 'QA scoring failure — the ids stay in the REPAIR pipeline (content task), not an infrastructure incident'
    };
  }
  return { kind: 'INFRA', reason: 'infrastructure failure in ' + (workflow || 'unknown workflow') };
}

/** Stable dedup key of a failure. */
export function signatureOf(workflow, failedSteps) {
  return String(workflow || '?') + '::' + [...(failedSteps ?? [])].sort().join('|');
}

/** Record (dedup) a content-driven failure so future identical runs never re-trigger. */
export function recordContentBlocker(state, { signature, workflow, note }, now = nowIso()) {
  const blockers = state.known_content_blockers ?? [];
  const found = blockers.find((b) => b.signature === signature);
  if (found) {
    found.last_seen = now;
    if (note) found.note = note;
  } else {
    blockers.push({ signature, workflow: workflow ?? '', note: note ?? '', first_seen: now, last_seen: now });
  }
  state.known_content_blockers = blockers.slice(-MAX_BLOCKERS);
  return state;
}

// ---------------------------------------------------------------------------
// Incident ids + lock refs
// ---------------------------------------------------------------------------

/** INC-<UTC compact timestamp>-<rand4> — the timestamp is readable from the ref name. */
export function newIncidentId(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const ts = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6);
  return `INC-${ts}-${rand}`;
}

/** Parse the UTC timestamp out of a lock ref name (null when unparsable). */
export function incidentIdOfRef(refName) {
  if (!refName.startsWith(LOCK_REF_PREFIX)) return null;
  return refName.slice(LOCK_REF_PREFIX.length) || null;
}

export function refTimestampEpoch(refName, incidentId = incidentIdOfRef(refName)) {
  const m = /^INC-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})-/.exec(incidentId ?? '');
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

/**
 * What a lone lock ref means, given the committed state:
 *  - KEEP_ACTIVE      the ref belongs to the live active incident
 *  - KEEP_FAILED_MANUAL the incident closed FAILED_MANUAL — humans clear it
 *  - KEEP_FRESH_RACE  ref younger than LOCK_RACE_WINDOW_MS with no state yet
 *                     (a concurrent Agent #4 is mid-acquisition) — never remove
 *  - REMOVE_STALE     ref older than the race window with no incident behind it
 *                     (the acquiring run crashed before committing state)
 */
export function lockCleanupDecision({ refName, state, nowEpochMs = Date.now() }) {
  const id = incidentIdOfRef(refName);
  if (!id) return { action: 'REMOVE_STALE', incidentId: null, reason: 'ref outside the incident namespace' };
  if (state.active_incident && state.active_incident.incident_id === id) {
    return { action: 'KEEP_ACTIVE', incidentId: id, reason: 'the active incident still owns this lock' };
  }
  const closed = (state.incidents ?? []).find((i) => i.incident_id === id);
  if (closed && closed.status === 'FAILED_MANUAL') {
    return { action: 'KEEP_FAILED_MANUAL', incidentId: id, reason: 'FAILED_MANUAL lock is cleared manually, never by an agent' };
  }
  const epoch = refTimestampEpoch(refName, id);
  if (epoch !== null && nowEpochMs - epoch < LOCK_RACE_WINDOW_MS) {
    return { action: 'KEEP_FRESH_RACE', incidentId: id, reason: 'fresh lock without state — a concurrent acquisition is in flight' };
  }
  return { action: 'REMOVE_STALE', incidentId: id, reason: 'stale lock: the acquiring run died before committing incident state' };
}

// ---------------------------------------------------------------------------
// Incident state machine
// ---------------------------------------------------------------------------

function startIncident(state, opts) {
  const incident = {
    incident_id: opts.incidentId,
    status: 'OPEN',
    owner: 'AGENT_4',
    started_at: opts.now,
    updated_at: opts.now,
    base_sha: opts.baseSha ?? '',
    reason: opts.reason ?? '',
    trigger: opts.trigger ?? '',
    source: { workflow: opts.sourceWorkflow ?? '', run_id: opts.sourceRunId ?? '', url: opts.sourceUrl ?? '' },
    classification: opts.classification ?? 'INFRA',
    signature: opts.signature ?? '',
    attempts: { agent4: 1, agent5: 0 },
    production_paused: true,
    result_note: ''
  };
  state.active_incident = incident;
  return incident;
}

/**
 * Agent #4 entry flow (one autonomous attempt per incident, fail-closed on
 * ambiguity). `store` is an atomic ref store: { list(), create(ref), remove(ref) }.
 * Returns an action: START | SKIP_ACTIVE | SKIP_BLOCKER | SKIP_ATTEMPTED |
 * SKIP_RACE | HANDOFF_CRASHED.
 */
export function beginIncidentFlow(state, store, opts) {
  const { signature, nowEpochMs = Date.now() } = opts;
  if ((state.known_content_blockers ?? []).some((b) => b.signature === signature)) {
    return { action: 'SKIP_BLOCKER', reason: 'known content blocker — Agent #4 never triggers on content QA' };
  }
  const closed = state.incidents ?? [];
  if (closed.some((i) => i.signature === signature && i.status === 'FAILED_MANUAL')) {
    return { action: 'SKIP_ATTEMPTED', reason: 'same failure already exhausted #4+#5 — waiting for manual intervention' };
  }
  if (state.active_incident) {
    const inc = state.active_incident;
    if (inc.status === 'OPEN' && inc.attempts.agent4 === 1 && inc.owner === 'AGENT_4'
      && nowEpochMs - Date.parse(inc.updated_at) > CRASHED_INCIDENT_WINDOW_MS
      && !store.list().some((r) => r === LOCK_REF_PREFIX + inc.incident_id)) {
      // The Agent #4 run died mid-incident: hand the SAME incident to Agent #5
      // (verification only — no second #4 repair attempt is ever allowed).
      return { action: 'HANDOFF_CRASHED', incidentId: inc.incident_id, reason: 'crashed OPEN incident without a lock — hand off to Agent #5' };
    }
    return { action: 'SKIP_ACTIVE', incidentId: inc.incident_id, reason: 'an incident is already active — never two at once' };
  }
  // Lock namespace cleanup: only refs that are provably safe to remove.
  for (const ref of store.list()) {
    const decision = lockCleanupDecision({ refName: ref, state, nowEpochMs });
    if (decision.action === 'KEEP_ACTIVE' || decision.action === 'KEEP_FRESH_RACE' || decision.action === 'KEEP_FAILED_MANUAL') {
      return { action: 'SKIP_ACTIVE', incidentId: decision.incidentId, reason: 'lock ref held: ' + decision.reason };
    }
    store.remove(ref); // REMOVE_STALE only — explicit, logged by the caller
  }
  const incidentId = opts.incidentId;
  if (!store.create(LOCK_REF_PREFIX + incidentId)) {
    // Atomic create lost the race — another Agent #4 owns the lock right now.
    return { action: 'SKIP_RACE', reason: 'lock create lost the race — the other acquisition owns the incident' };
  }
  const incident = startIncident(state, { ...opts, incidentId, now: new Date(nowEpochMs).toISOString() });
  return { action: 'START', incidentId, incident, state };
}

/** Agent #4 terminal result — SUCCESS hands the SAME incident_id to Agent #5. */
export function agent4Result(state, { incidentId, result, note = '', now = nowIso() }) {
  const inc = state.active_incident;
  if (!inc || inc.incident_id !== incidentId) return { ok: false, reason: 'unknown incident' };
  if (inc.status !== 'OPEN' || inc.owner !== 'AGENT_4') return { ok: false, reason: `incident is ${inc.status}/${inc.owner} — Agent #4 gets exactly one attempt` };
  if (result !== 'SUCCESS' && result !== 'ESCALATE') return { ok: false, reason: 'bad result' };
  inc.status = result === 'SUCCESS' ? 'AGENT4_SUCCESS' : 'AGENT4_ESCALATE';
  inc.owner = 'NONE';
  inc.result_note = note;
  inc.updated_at = now;
  return { ok: true, status: inc.status, dispatchAgent5: true, incidentId };
}

/** Agent #5 may start ONLY on a #4 terminal state (mutual exclusion).
 *  One documented exception: `allowCrashedHandoff` lets #5 take over an OPEN
 *  incident whose Agent #4 run died — #4 already spent its single attempt
 *  (attempts.agent4 === 1), so it can never re-enter and no two agents ever
 *  repair simultaneously. Only Agent #4's HANDOFF_CRASHED dispatch uses it. */
export function agent5Begin(state, { incidentId, allowCrashedHandoff = false, now = nowIso() }) {
  const inc = state.active_incident;
  if (!inc || inc.incident_id !== incidentId) return { ok: false, reason: 'unknown incident' };
  if (!AGENT4_TERMINAL.has(inc.status)) {
    const crashed = inc.status === 'OPEN' && allowCrashedHandoff === true && inc.attempts.agent4 === 1;
    if (!crashed) {
      return { ok: false, reason: `incident is ${inc.status} — Agent #5 starts only after Agent #4 reaches a terminal state` };
    }
  }
  if (inc.attempts.agent5 !== 0) return { ok: false, reason: 'Agent #5 already attempted this incident' };
  const priorStatus = inc.status; // AGENT4_SUCCESS (verify) | AGENT4_ESCALATE (repair) | OPEN (crashed handoff)
  inc.status = 'AGENT5_WORKING';
  inc.owner = 'AGENT_5';
  inc.attempts.agent5 = 1;
  inc.updated_at = now;
  return { ok: true, status: inc.status, priorStatus, incidentId };
}

/**
 * Agent #5 terminal result. VERIFIED/RECOVERED close the incident and may
 * resume production (only when the owner switch production_enabled is true);
 * FAILED_MANUAL closes it while production stays paused and the lock ref is
 * kept for manual intervention (agents never clear a FAILED_MANUAL lock).
 */
export function agent5Result(state, { incidentId, result, note = '', now = nowIso(), productionEnabled = null }) {
  const inc = state.active_incident;
  if (!inc || inc.incident_id !== incidentId) return { ok: false, reason: 'unknown incident' };
  if (inc.status !== 'AGENT5_WORKING' || inc.owner !== 'AGENT_5') {
    return { ok: false, reason: `incident is ${inc.status}/${inc.owner} — Agent #5 gets exactly one attempt` };
  }
  if (!['VERIFIED', 'RECOVERED', 'FAILED_MANUAL'].includes(result)) return { ok: false, reason: 'bad result' };
  const wasPaused = inc.production_paused === true;
  inc.status = result;
  inc.owner = 'NONE';
  inc.result_note = inc.result_note ? inc.result_note + ' | ' + note : note;
  inc.updated_at = now;
  inc.closed_at = now;
  // FAILED_MANUAL keeps production_paused recorded on the incident;
  // VERIFIED/RECOVERED end the pause.
  if (result !== 'FAILED_MANUAL') inc.production_paused = false;
  state.incidents = [...(state.incidents ?? []), inc].slice(-MAX_HISTORY);
  state.active_incident = null;
  const enabled = productionEnabled === null ? state.production_enabled : productionEnabled;
  const resumeProduction = result !== 'FAILED_MANUAL' && wasPaused && enabled === true;
  return {
    ok: true,
    status: result,
    resumeProduction,
    releaseLock: result !== 'FAILED_MANUAL',
    entrypoint: resumeProduction ? PRODUCTION_ENTRYPOINT : null
  };
}

// ---------------------------------------------------------------------------
// Production gate (OWNER_STOP && MAINTENANCE_LOCK && PRODUCTION_MUTATION = IMPOSSIBLE)
// ---------------------------------------------------------------------------

/**
 * Pure decision for the gate step of every production workflow.
 * The owner switch is checked FIRST and fail-closed (only an explicit
 * `production_enabled: true` allows production): while the owner keeps
 * production stopped, no incident is needed — the gate refuses on its own.
 */
export function productionGate(state, lockRefs = []) {
  if (state.production_enabled !== true) {
    return { allowed: false, reason: 'production is intentionally stopped by the owner (production_enabled=false) — hard gate' };
  }
  if (state.active_incident) {
    return { allowed: false, reason: `ops incident ${state.active_incident.incident_id} active (${state.active_incident.status}) — production paused` };
  }
  if (lockRefs.length > 0) {
    return { allowed: false, reason: `maintenance lock present (${lockRefs.join(', ')}) — production paused` };
  }
  return { allowed: true, reason: 'owner enabled, no incident, no lock' };
}

// ---------------------------------------------------------------------------
// Watchdog (Agent #6) — wake only after 2h without VALID progress
// ---------------------------------------------------------------------------

/** Only real production progress resets the inactivity timer. */
export function classifyProgressEvent(type) {
  return VALID_PROGRESS_TYPES.includes(type) ? 'VALID' : 'IGNORED';
}

export function lastValidProgressEpochMs(events) {
  const valid = (events ?? []).filter((e) => classifyProgressEvent(e.type) === 'VALID' && Number.isFinite(e.epochMs));
  if (valid.length === 0) return 0;
  return Math.max(...valid.map((e) => e.epochMs));
}

/**
 * Pure wake decision for Agent #6. Any blocking condition -> DO NOTHING.
 * `activeProductionRuns`/`queuedProductionRuns` cover writer cycle, publisher,
 * integration, build/deploy and any already-queued production entrypoint.
 */
export function watchdogShouldWake({
  nowEpochMs, productionEnabled, activeIncident, lockRefs = [],
  agent4Active = false, agent5Active = false,
  activeProductionRuns = false, queuedProductionRuns = false,
  lastValidProgressEpochMs: lastProgress
}) {
  const no = (reason) => ({ wake: false, reason });
  if (productionEnabled !== true) return no('production is intentionally stopped by the owner (production_enabled=false)');
  if (activeIncident) return no(`incident ${activeIncident.incident_id} active`);
  if (lockRefs.length > 0) return no('maintenance lock present: ' + lockRefs.join(', '));
  if (agent4Active) return no('Agent #4 is active');
  if (agent5Active) return no('Agent #5 is active');
  if (activeProductionRuns) return no('a production workflow is running (writer cycle / publisher / factory / build)');
  if (queuedProductionRuns) return no('a production cycle is already queued — never a duplicate');
  const idle = nowEpochMs - lastProgress;
  if (idle < WATCHDOG_IDLE_MS) return no(`only ${Math.round(idle / 60000)} min without valid progress — the 2h timer has not elapsed`);
  return { wake: true, reason: `${Math.round(idle / 3600000)}h without valid production progress — triggering exactly ONE production entrypoint` };
}

// ---------------------------------------------------------------------------
// Agent #4 deterministic repair playbook (safe, well-understood recipes only)
// ---------------------------------------------------------------------------

export const REPAIR_RECIPES = Object.freeze([
  Object.freeze({
    id: 'RESUME_PENDING_TRANSACTION',
    match: (d) => d.leftoverTxnMarker === true,
    rationale: 'a factory transaction marker survived its run — resume completes the EXACT recorded ids (idempotent recovery)',
    commands: Object.freeze(['node tools/blog-factory.mjs resume']),
    verify: Object.freeze(['test ! -f docs/state/blog-factory.transaction.json', 'node tools/blog-factory.mjs validate'])
  }),
  Object.freeze({
    id: 'CLEAR_RETIRED_LOCKFILE',
    match: (d) => d.retiredLockFilePresent === true,
    rationale: 'docs/state/blog-factory.lock is retired state left by a crashed factory run',
    commands: Object.freeze(['rm -f docs/state/blog-factory.lock']),
    verify: Object.freeze(['test ! -f docs/state/blog-factory.lock', 'node tools/blog-factory.mjs validate'])
  })
]);

/** Null recipe = ESCALATE to Agent #5 (unclear/destructive/security-sensitive). */
export function suggestRepair(diagnosis) {
  return REPAIR_RECIPES.find((r) => r.match(diagnosis ?? {})) ?? null;
}

// ---------------------------------------------------------------------------
// Repair scope guard — agents NEVER touch article/production surfaces
// ---------------------------------------------------------------------------

/** Article bodies and writer branches are NEVER written by any agent. */
export const REPAIR_FORBIDDEN_PREFIXES = Object.freeze(['data/blog/articles/', 'writer-work/']);
/** Central assignments/active-work are preserved untouched during maintenance. */
export const REPAIR_FORBIDDEN_EXACT = Object.freeze(['docs/state/writer-assignments.json', 'docs/state/active-work.json']);
/** The deterministic transaction-resume recipe may only complete the recorded
 *  transaction's own derived state (mirrors the factory's derived commit). */
export const RESUME_DERIVED_ALLOWED = Object.freeze([
  'data/blog/content-matrix.csv', 'data/blog/knowledge-index.json', 'blog/', 'sitemap.xml',
  'robots.txt', 'reports/blog-factory-run.md', 'docs/state/blog-factory.checkpoint.json',
  'docs/state/blog-factory.transaction.json', 'docs/state/blog-factory.lock'
]);

/** Paths an agent repair commit must never contain. */
export function repairForbiddenViolations(paths) {
  const norm = (p) => String(p ?? '').replace(/^\.\//, '');
  return (paths ?? []).map(norm).filter((p) =>
    REPAIR_FORBIDDEN_PREFIXES.some((pre) => p === pre || p.startsWith(pre))
    || REPAIR_FORBIDDEN_EXACT.includes(p));
}

/** True when a changed path belongs to the transaction-resume derived surface. */
export function resumeDerivedAccepts(path) {
  const p = String(path ?? '').replace(/^\.\//, '');
  return RESUME_DERIVED_ALLOWED.some((a) => p === a || p.startsWith(a));
}

// ---------------------------------------------------------------------------
// Human-readable incident report (Agent #5 FAILED_MANUAL path)
// ---------------------------------------------------------------------------

export function incidentReport(state) {
  const i = state.active_incident;
  if (!i) return '';
  const src = i.source ?? {};
  return [
    `# Incident ${i.incident_id} — MANUAL INTERVENTION REQUIRED`,
    '',
    `- status: ${i.status} (Agent #4 and Agent #5 both exhausted their single repair attempt)`,
    `- production: PAUSED — the maintenance lock ${LOCK_REF_PREFIX}${i.incident_id} is kept until a human resolves this`,
    `- reason: ${i.reason || '(none recorded)'}`,
    `- trigger: ${i.trigger || '(none recorded)'}; source: ${src.workflow || '?'} run ${src.run_id || '?'} ${src.url || ''}`,
    `- base SHA: ${i.base_sha || '(unknown)'}`,
    `- started: ${i.started_at}; last update: ${i.updated_at}`,
    `- Agent #4 note: ${(i.result_note || '').split(' | ')[0] || '(none)'}`,
    `- Agent #5 note: ${(i.result_note || '').split(' | ')[1] || '(none)'}`,
    '',
    'Resolution checklist (manual):',
    `1. Inspect the failing run above and the repo at ${i.base_sha || 'the recorded base SHA'}.`,
    `2. Fix the infrastructure cause; run \`node --test\` and the blog-factory validator.`,
    `3. Delete the lock: \`git push origin --delete ${LOCK_REF_PREFIX}${i.incident_id}\`.`,
    '4. If this signature should never auto-repair again, keep it in known_content_blockers or leave the FAILED_MANUAL incident in history.',
    ''
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Git ref store (workflow CLI only — tests inject a pure store)
// ---------------------------------------------------------------------------

export function gitRefStore(repoDir = ROOT) {
  const git = (args) => execFileSync('git', args, { cwd: repoDir, encoding: 'utf8' });
  return {
    list() {
      const out = git(['ls-remote', '--refs', 'origin', LOCK_REF_PREFIX + '*']);
      return out.split('\n').map((l) => l.trim().split(/\s+/)[1]).filter(Boolean);
    },
    create(ref) {
      try {
        git(['push', 'origin', 'HEAD:' + ref]);
        return true;
      } catch {
        return false; // atomic create lost the race (or the ref exists)
      }
    },
    remove(ref) {
      try {
        git(['push', 'origin', '--delete', ref]);
        return true;
      } catch {
        return false;
      }
    }
  };
}

// ---------------------------------------------------------------------------
// CLI (thin wiring — every decision above is a pure, tested function)
// ---------------------------------------------------------------------------

const USAGE = `usage: ops-agent.mjs <command> [args]
  gate                                   production gate: exit 1 while maintenance is active
  classify --workflow W --failed-steps A;B   INFRA vs CONTENT (content QA never triggers repair)
  record-content-blocker --workflow W --failed-steps A;B [--note X]   dedup record, prints blocker_signature
  incident-begin --reason R --trigger T --source-workflow W --source-run-id N [--source-url U] [--signature S]
                                         atomic lock + incident start; prints incident_* or skip_*
  agent4-result --incident-id I --result SUCCESS|ESCALATE [--note X]
  agent5-begin --incident-id I
  agent5-result --incident-id I --result VERIFIED|RECOVERED|FAILED_MANUAL [--note X]
  release-lock --incident-id I           refuses FAILED_MANUAL incidents (humans only)
  wake-decision --production-enabled B --last-progress-epoch N --now-epoch N
                [--active-production B] [--queued-production B] [--agent4-active B] [--agent5-active B]
  suggest-repair                         deterministic recipe for the checked-out repo, or ESCALATE
  guard [--resume-derived]             stdin paths -> exit 1 when any agent-forbidden path changed
                                       (--resume-derived: every path must also stay on the factory
                                       derived/state surface — RESUME_PENDING_TRANSACTION contract)
  report                                 prints the incident report for the active incident`;

const emit = (o) => { for (const [k, v] of Object.entries(o)) console.log(`${k}=${v}`); };
const die = (msg, code = 1) => { console.error('ERROR: ' + msg); process.exit(code); };

function parseCliArgs(rest) {
  const args = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) { const key = a.slice(2); args[key] = rest[i + 1] ?? true; i++; }
    else args._.push(a);
  }
  return args;
}

const flag = (v) => v === true || v === 'true' || v === '1';
/** Failed-step list separator: ';;' — ';' itself appears inside real step
 *  names (e.g. "Assert clean state; report QA failures"). */
const splitSteps = (raw) => String(raw ?? '').split(';;').map((s) => s.trim()).filter(Boolean);

function commitStateFile(message) {
  const git = (m) => execFileSync('git', m, { cwd: ROOT, encoding: 'utf8' });
  git(['config', 'user.name', 'motoai-bot']);
  git(['config', 'user.email', 'nguyentuantu2482@users.noreply.github.com']);
  git(['add', STATE_PATH]);
  const staged = git(['diff', '--cached', '--name-only']).trim();
  if (!staged) return 'unchanged';
  git(['commit', '-m', message + ' [skip ci]']);
  git(['push']);
  return 'committed';
}

function cmdGate() {
  const state = loadOpsState();
  const gate = productionGate(state, gitRefStore().list());
  emit({ gate: gate.allowed ? 'ALLOWED' : 'BLOCKED', reason: gate.reason });
  if (!gate.allowed) process.exit(1);
}

function cmdClassify(args) {
  const failedSteps = splitSteps(args['failed-steps']);
  const c = classifyFailure({ workflow: args.workflow, failedSteps });
  emit({ classification: c.kind, reason: c.reason, signature: signatureOf(args.workflow, failedSteps) });
  if (c.kind === 'CONTENT') process.exit(3); // distinct code: the caller records a blocker and stops
}

function cmdRecordContentBlocker(args) {
  const failedSteps = splitSteps(args['failed-steps']);
  const signature = args.signature ? String(args.signature) : signatureOf(args.workflow, failedSteps);
  const state = loadOpsState();
  recordContentBlocker(state, { signature, workflow: args.workflow, note: args.note });
  saveOpsState(state);
  commitStateFile('ops: record content blocker ' + signature);
  emit({ recorded: 'true', signature });
}

function cmdIncidentBegin(args) {
  const state = loadOpsState();
  const store = gitRefStore();
  const failedSteps = splitSteps(args['failed-steps']);
  const signature = args.signature ? String(args.signature) : signatureOf(args['source-workflow'], failedSteps);
  const incidentId = newIncidentId();
  const flow = beginIncidentFlow(state, store, {
    incidentId, signature, nowEpochMs: Date.now(),
    baseSha: args['base-sha'] ?? '', reason: args.reason ?? '', trigger: args.trigger ?? '',
    sourceWorkflow: args['source-workflow'] ?? '', sourceRunId: args['source-run-id'] ?? '', sourceUrl: args['source-url'] ?? ''
  });
  if (flow.action === 'START') {
    saveOpsState(state);
    commitStateFile(`ops: incident ${incidentId} begun — Agent #4 first-line repair (production paused)`);
    emit({ action: 'START', incident_id: incidentId, reason: state.active_incident.reason });
  } else if (flow.action === 'HANDOFF_CRASHED') {
    emit({ action: 'HANDOFF_CRASHED', incident_id: flow.incidentId, reason: flow.reason });
  } else {
    // Skip codes exit 0: the incident is already owned — never a second attempt.
    emit({ action: flow.action, incident_id: flow.incidentId ?? '', reason: flow.reason });
  }
}

function cmdAgent4Result(args) {
  const state = loadOpsState();
  const r = agent4Result(state, { incidentId: args['incident-id'], result: args.result, note: args.note ?? '' });
  if (!r.ok) die(r.reason);
  saveOpsState(state);
  commitStateFile(`ops: incident ${r.incidentId} — Agent #4 result ${r.status}`);
  emit({ agent_4_result: r.status === 'AGENT4_SUCCESS' ? 'SUCCESS' : 'ESCALATE', incident_id: r.incidentId, dispatch_agent5: 'true' });
}

function cmdAgent5Begin(args) {
  const state = loadOpsState();
  const r = agent5Begin(state, {
    incidentId: args['incident-id'],
    allowCrashedHandoff: flag(args['allow-crashed-handoff'])
  });
  if (!r.ok) die(r.reason);
  saveOpsState(state);
  commitStateFile(`ops: incident ${r.incidentId} — Agent #5 took over (verification + one second-line attempt)`);
  emit({ agent_5_status: r.status, prior_status: r.priorStatus, incident_id: r.incidentId });
}

function cmdAgent5Result(args) {
  const state = loadOpsState();
  const r = agent5Result(state, { incidentId: args['incident-id'], result: args.result, note: args.note ?? '' });
  if (!r.ok) die(r.reason);
  saveOpsState(state);
  commitStateFile(`ops: incident ${args['incident-id']} closed — Agent #5 result ${r.status}`);
  emit({
    agent_5_result: r.status,
    incident_id: args['incident-id'],
    resume_production: r.resumeProduction ? 'true' : 'false',
    release_lock: r.releaseLock ? 'true' : 'false',
    entrypoint_workflow: r.entrypoint ? r.entrypoint.workflow : ''
  });
}

function cmdReleaseLock(args) {
  const state = loadOpsState();
  const ref = LOCK_REF_PREFIX + args['incident-id'];
  if (state.active_incident && state.active_incident.incident_id === args['incident-id']) {
    die('refuse to release the lock of an ACTIVE incident — Agent #5 closes it first');
  }
  const closed = (state.incidents ?? []).find((i) => i.incident_id === args['incident-id']);
  if (closed && closed.status === 'FAILED_MANUAL') {
    die('FAILED_MANUAL lock is cleared manually by the owner — agents never clear it');
  }
  const store = gitRefStore();
  if (!store.remove(ref)) die('lock ref not found or delete failed: ' + ref);
  emit({ released: 'true', ref });
}

function cmdWakeDecision(args) {
  const state = loadOpsState();
  const r = watchdogShouldWake({
    nowEpochMs: Number(args['now-epoch']) || Date.now(),
    productionEnabled: flag(args['production-enabled']),
    activeIncident: state.active_incident,
    lockRefs: gitRefStore().list(),
    agent4Active: flag(args['agent4-active']),
    agent5Active: flag(args['agent5-active']),
    activeProductionRuns: flag(args['active-production']),
    queuedProductionRuns: flag(args['queued-production']),
    lastValidProgressEpochMs: Number(args['last-progress-epoch']) || 0
  });
  emit({ wake: r.wake ? 'true' : 'false', reason: r.reason });
}

function cmdSuggestRepair() {
  const diagnosis = {
    leftoverTxnMarker: existsSync(join(ROOT, 'docs/state/blog-factory.transaction.json')),
    retiredLockFilePresent: existsSync(join(ROOT, 'docs/state/blog-factory.lock'))
  };
  emit({ leftover_txn_marker: diagnosis.leftoverTxnMarker ? 'true' : 'false', retired_lock_file: diagnosis.retiredLockFilePresent ? 'true' : 'false' });
  const recipe = suggestRepair(diagnosis);
  if (!recipe) { emit({ recipe: 'ESCALATE', reason: 'no deterministic recipe matches — hand to Agent #5' }); return; }
  emit({ recipe: recipe.id, rationale: recipe.rationale, commands: recipe.commands.join(' && '), verify: recipe.verify.join(' && ') });
}

function cmdReport() {
  const state = loadOpsState();
  const report = incidentReport(state);
  if (!report) die('no active incident to report');
  process.stdout.write(report);
}

function cmdGuard(args) {
  const paths = readFileSync(0, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  const violations = repairForbiddenViolations(paths);
  // Strict mode for RESUME_PENDING_TRANSACTION: the commit must contain ONLY
  // the factory's recorded-transaction derived/state surfaces — no tool, test
  // or documentation detours, even ones the generic guard would allow.
  if (flag(args?.['resume-derived'])) {
    for (const p of paths) {
      if (!resumeDerivedAccepts(p)) {
        console.error('RESUME_DERIVED_VIOLATION=' + p);
        violations.push(p);
      }
    }
  }
  if (violations.length > 0) {
    for (const v of violations) console.error('FORBIDDEN_CHANGE=' + v);
    die('agent scope guard: article/assignment surfaces must never change during repair');
  }
  emit({ guard: 'PASS', checked: String(paths.length) });
}

const isMain = process.argv[1]
  && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;

if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseCliArgs(rest);
  switch (cmd) {
    case 'gate': cmdGate(); break;
    case 'classify': cmdClassify(args); break;
    case 'record-content-blocker': cmdRecordContentBlocker(args); break;
    case 'incident-begin': cmdIncidentBegin(args); break;
    case 'agent4-result': cmdAgent4Result(args); break;
    case 'agent5-begin': cmdAgent5Begin(args); break;
    case 'agent5-result': cmdAgent5Result(args); break;
    case 'release-lock': cmdReleaseLock(args); break;
    case 'wake-decision': cmdWakeDecision(args); break;
    case 'suggest-repair': cmdSuggestRepair(); break;
    case 'guard': cmdGuard(args); break;
    case 'report': cmdReport(); break;
    default:
      if (cmd) console.error(USAGE);
      else console.log(USAGE);
      process.exit(cmd ? 1 : 0);
  }
}
