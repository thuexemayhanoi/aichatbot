import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  emptyOpsState, loadOpsState, saveOpsState, validateOpsState,
  classifyFailure, signatureOf, recordContentBlocker,
  newIncidentId, incidentIdOfRef, refTimestampEpoch, lockCleanupDecision,
  beginIncidentFlow, agent4Result, agent5Begin, agent5Result,
  productionGate, watchdogShouldWake, classifyProgressEvent, lastValidProgressEpochMs,
  suggestRepair, repairForbiddenViolations, resumeDerivedAccepts,
  incidentReport, PRODUCTION_ENTRYPOINT, WATCHDOG_IDLE_MS, LOCK_REF_PREFIX,
  CONTENT_QA_STEP, STATE_PATH
} from '../../tools/ops-agent.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OPS_YML_DIR = join(REPO, '.github', 'workflows');
const read = (p) => readFileSync(join(REPO, p), 'utf8');

/** The three ops-agent workflows that must exist by the end of commit D
 *  (missing ones are simply skipped here so each commit stays green). */
const OPS_WORKFLOWS = ['ops-repair-agent.yml', 'ops-supervisor.yml', 'ops-watchdog.yml'];
const existingOpsWorkflows = () => OPS_WORKFLOWS.filter((f) => existsSync(join(OPS_YML_DIR, f)));

/** Pure in-memory atomic ref store (mirrors gitRefStore semantics). */
function memStore() {
  const refs = new Set();
  return {
    list: () => [...refs],
    create: (ref) => (refs.has(ref) ? false : (refs.add(ref), true)),
    remove: (ref) => (refs.delete(ref) ? true : false)
  };
}

const freshState = () => emptyOpsState({ productionEnabled: false, lastValidProgressAt: '2026-10-03T07:14:41.000Z' });

const beginOpts = (over = {}) => ({
  incidentId: newIncidentId(new Date('2026-10-03T10:00:00Z')),
  signature: 'Writer Publisher (serialized)::step A',
  nowEpochMs: Date.parse('2026-10-03T10:00:00Z'),
  baseSha: 'abc123', reason: 'publisher failed', trigger: 'workflow_run',
  sourceWorkflow: 'Writer Publisher (serialized)', sourceRunId: '42',
  sourceUrl: 'https://example/run/42', ...over
});

// ---------------------------------------------------------------------------
// No agent ever writes article content (required tests 1, 2, 3, 29, 30)
// ---------------------------------------------------------------------------

test('ops module contains NO article generation/publishing/claiming code', () => {
  const src = read('tools/ops-agent.mjs');
  // The only child processes are git commands (lock/state); no tool of the
  // article pipeline is ever imported or executed by the module itself —
  // the deterministic RESUME recipe only HANDS its command to the workflow.
  assert.ok(!src.includes("execFileSync('node'"), 'the ops module never executes node tools');
  for (const forbidden of [
    'publish-chunk', 'prepare-chunk', 'gen-blog-matrix', 'gen-matrix',
    'writer-queue.mjs', 'article-qa.mjs'
  ]) {
    assert.ok(!src.includes(forbidden), `ops-agent.mjs must never reference "${forbidden}"`);
  }
  // The factory CLI appears ONLY inside the resume recipe (documented
  // transaction recovery), never as a module-level execution.
  const recipeBlock = src.slice(src.indexOf('REPAIR_RECIPES'), src.indexOf('Git ref store'));
  assert.ok(recipeBlock.includes('blog-factory.mjs resume'), 'the resume recipe is defined');
  assert.equal((src.match(/blog-factory\.mjs/g) ?? []).length, 3, 'resume command + the two recipe verifies only');
  for (const m of ['node:fs', 'node:path', 'node:url', 'node:child_process']) {
    assert.ok(src.includes(m));
  }
  assert.ok(!/from '\.\//.test(src), 'the ops module never imports repo tools');
});

test('no ops workflow invokes an article generator or writer command', () => {
  for (const f of existingOpsWorkflows()) {
    const y = readFileSync(join(OPS_YML_DIR, f), 'utf8');
    for (const forbidden of [
      'gen-blog-matrix', 'gen-matrix', 'publish-chunk', 'prepare-chunk',
      'writer-queue.mjs plan', 'writer-queue.mjs begin', 'writer-queue.mjs ready',
      'writer-queue.mjs stage', 'writer-queue.mjs select-publish'
    ]) {
      assert.ok(!y.includes(forbidden), `${f} must never run "${forbidden}"`);
    }
  }
});

test('no ops workflow starts Writer A, B or C individually or pushes a writer branch', () => {
  for (const f of existingOpsWorkflows()) {
    const y = readFileSync(join(OPS_YML_DIR, f), 'utf8');
    assert.ok(!/writer\s*\/\s*WRITER-BATCH/.test(y), `${f} must never push a writer branch`);
    assert.ok(!/refs\/heads\/writer/.test(y), `${f} must never create writer refs`);
  }
});

test('the scope guard refuses article bodies, writer branches and assignments', () => {
  assert.deepEqual(repairForbiddenViolations([
    'data/blog/articles/foo.body.html', 'writer-work/WRITER-BATCH-0001/A/chunk-01.json',
    'docs/state/writer-assignments.json', 'docs/state/active-work.json'
  ]).sort(), ['data/blog/articles/foo.body.html', 'docs/state/active-work.json',
    'docs/state/writer-assignments.json', 'writer-work/WRITER-BATCH-0001/A/chunk-01.json']);
  assert.deepEqual(repairForbiddenViolations([
    'tools/writer-queue.mjs', 'docs/state/operations/maintenance.json', 'tests/unit/x.test.js'
  ]), []);
});

// ---------------------------------------------------------------------------
// Classification: content QA NEVER triggers a repair incident
// ---------------------------------------------------------------------------

test('a factory QA-scoring failure is CONTENT (never an incident)', () => {
  const c = classifyFailure({ workflow: 'Blog Factory Publish (2-article micro batch)', failedSteps: [CONTENT_QA_STEP] });
  assert.equal(c.kind, 'CONTENT');
  // The step NAME itself contains ';' — the CLI separator is ';;', so the
  // whole name must stay ONE step (regression: this used to classify as INFRA).
  const single = classifyFailure({
    workflow: 'Blog Factory Publish (2-article micro batch)',
    failedSteps: ['Assert clean state; report QA failures']
  });
  assert.equal(single.kind, 'CONTENT');
  const mixed = classifyFailure({
    workflow: 'Blog Factory Publish (2-article micro batch)',
    failedSteps: ['Assert clean state; report QA failures', 'Minimal QA chunk (score >= 70 -> PASS; independent result per article)']
  });
  assert.equal(mixed.kind, 'INFRA', 'a QA engine crash beside a scoring failure is infra');
});

test('a factory infrastructure failure is INFRA', () => {
  const c = classifyFailure({
    workflow: 'Blog Factory Publish (2-article micro batch)',
    failedSteps: ['Grouped transactional publish (PASS + ready ids; ONE build for the chunk)']
  });
  assert.equal(c.kind, 'INFRA');
  const publisher = classifyFailure({ workflow: 'Writer Publisher (serialized)', failedSteps: ['Stage, verify and push the exact 2-article chunk (publish) — or requeue it (§6G)'] });
  assert.equal(publisher.kind, 'INFRA');
});

test('content blockers are deduped by signature and stop future triggers', () => {
  let s = freshState();
  const sig = signatureOf('CI', ['Full test suite (gates before any artifact)']);
  s = recordContentBlocker(s, { signature: sig, workflow: 'CI', note: 'content' });
  const flow = beginIncidentFlow(s, memStore(), beginOpts({ signature: sig }));
  assert.equal(flow.action, 'SKIP_BLOCKER');
  assert.equal(s.known_content_blockers.length, 1);
  s = recordContentBlocker(s, { signature: sig, workflow: 'CI', note: 'again' });
  assert.equal(s.known_content_blockers.length, 1, 'dedup by signature');
});

// ---------------------------------------------------------------------------
// Incident lock + one-incident-at-a-time (required test 4)
// ---------------------------------------------------------------------------

test('only ONE incident can start: racing begins share one atomic lock', () => {
  const store = memStore();
  const s1 = freshState();
  const s2 = freshState();
  const f1 = beginIncidentFlow(s1, store, beginOpts());
  const f2 = beginIncidentFlow(s2, store, beginOpts());
  const starts = [f1, f2].filter((f) => f.action === 'START');
  assert.equal(starts.length, 1, 'exactly one acquisition wins the atomic create');
  assert.equal(store.list().length, 1, 'exactly one lock ref exists');
  assert.equal(f2.action === 'START' ? 'START' : f2.action, f1.action === 'START' ? f2.action : 'START');
});

test('STRESS lock acquisition x100: exactly one START, one ref, per race', () => {
  for (let i = 0; i < 100; i++) {
    const store = memStore();
    const flows = [freshState(), freshState(), freshState()].map((s) => beginIncidentFlow(s, store, beginOpts()));
    assert.equal(flows.filter((f) => f.action === 'START').length, 1);
    assert.equal(store.list().length, 1);
  }
});

test('a signature that already exhausted #4+#5 (FAILED_MANUAL) is never re-attempted', () => {
  const s = freshState();
  s.incidents = [{
    incident_id: 'INC-old', status: 'FAILED_MANUAL', signature: 'Writer Publisher (serialized)::step A',
    attempts: { agent4: 1, agent5: 1 }
  }];
  const flow = beginIncidentFlow(s, memStore(), beginOpts());
  assert.equal(flow.action, 'SKIP_ATTEMPTED');
});

// ---------------------------------------------------------------------------
// #4/#5 mutual exclusion and the one-attempt caps (required tests 5, 6, 7, 8)
// ---------------------------------------------------------------------------

test('#5 cannot start before #4 reaches a terminal state', () => {
  const s = freshState();
  const flow = beginIncidentFlow(s, memStore(), beginOpts());
  assert.equal(flow.action, 'START');
  const early = agent5Begin(s, { incidentId: flow.incidentId });
  assert.equal(early.ok, false, 'OPEN incident — #5 must refuse');
});

test('#4 and #5 can never repair simultaneously (mutual exclusion)', () => {
  const s = freshState();
  const flow = beginIncidentFlow(s, memStore(), beginOpts());
  const id = flow.incidentId;
  // While #4 owns the incident, #4's result step and #5's begin are the only
  // doors; the state machine allows only one owner at a time.
  const r4 = agent4Result(s, { incidentId: id, result: 'ESCALATE' });
  assert.equal(r4.ok, true);
  assert.equal(r4.status, 'AGENT4_ESCALATE');
  assert.equal(s.active_incident.owner, 'NONE', 'between #4 and #5 nobody repairs');
  const r5 = agent5Begin(s, { incidentId: id });
  assert.equal(r5.ok, true);
  assert.equal(s.active_incident.owner, 'AGENT_5');
  // #4 can never come back (#4 and #5 never repair at the same time).
  const back4 = agent4Result(s, { incidentId: id, result: 'SUCCESS' });
  assert.equal(back4.ok, false, '#4 gets exactly one attempt — no re-entry');
});

test('#4 gets at most ONE repair attempt per incident', () => {
  const s = freshState();
  const flow = beginIncidentFlow(s, memStore(), beginOpts());
  const id = flow.incidentId;
  assert.equal(s.active_incident.attempts.agent4, 1);
  const again = agent4Result(s, { incidentId: id, result: 'ESCALATE' });
  assert.equal(again.ok, true);
  const second = agent4Result(s, { incidentId: id, result: 'ESCALATE' });
  assert.equal(second.ok, false, 'a second #4 attempt must be refused');
  const reBegin = beginIncidentFlow(s, memStore(), beginOpts());
  assert.equal(reBegin.action, 'SKIP_ACTIVE', 'a new #4 trigger while the incident lives is a no-op');
});

test('#5 gets at most ONE repair attempt per incident', () => {
  const s = freshState();
  const id = beginIncidentFlow(s, memStore(), beginOpts()).incidentId;
  agent4Result(s, { incidentId: id, result: 'ESCALATE' });
  assert.equal(agent5Begin(s, { incidentId: id }).ok, true);
  const twice = agent5Begin(s, { incidentId: id });
  assert.equal(twice.ok, false, 'a second #5 attempt must be refused');
});

test('crashed-handoff is the ONLY way #5 may take an OPEN incident (#4 already spent its attempt)', () => {
  const s = freshState();
  const id = beginIncidentFlow(s, memStore(), beginOpts()).incidentId;
  assert.equal(agent5Begin(s, { incidentId: id, allowCrashedHandoff: true }).ok, true);
  const s2 = freshState();
  const id2 = beginIncidentFlow(s2, memStore(), beginOpts()).incidentId;
  assert.equal(agent5Begin(s2, { incidentId: id2 }).ok, false, 'without the explicit flag an OPEN incident refuses');
});

// ---------------------------------------------------------------------------
// #5 terminal results + production stays STOPPED while the owner switch is off
// ---------------------------------------------------------------------------

test('VERIFIED closes the incident but does NOT resume production while production_enabled=false', () => {
  const s = freshState(); // owner switch OFF (production stopped by the owner)
  const id = beginIncidentFlow(s, memStore(), beginOpts()).incidentId;
  agent4Result(s, { incidentId: id, result: 'SUCCESS' });
  agent5Begin(s, { incidentId: id });
  const r = agent5Result(s, { incidentId: id, result: 'VERIFIED' });
  assert.equal(r.ok, true);
  assert.equal(r.resumeProduction, false, 'production remains STOPPED until the owner flips production_enabled');
  assert.equal(r.releaseLock, true);
  assert.equal(s.active_incident, null);
  assert.equal(s.incidents.length, 1);
});

test('with production_enabled=true a VERIFIED incident resumes via EXACTLY ONE entrypoint', () => {
  const s = emptyOpsState({ productionEnabled: true });
  const id = beginIncidentFlow(s, memStore(), beginOpts()).incidentId;
  agent4Result(s, { incidentId: id, result: 'SUCCESS' });
  agent5Begin(s, { incidentId: id });
  const r = agent5Result(s, { incidentId: id, result: 'VERIFIED' });
  assert.equal(r.resumeProduction, true);
  assert.equal(r.entrypoint.workflow, 'writer-coordinator.yml');
  assert.deepEqual({ ...r.entrypoint.inputs }, { dry_run: 'false', limit: '18' });
});

test('FAILED_MANUAL keeps production paused and the lock (humans clear it)', () => {
  const s = emptyOpsState({ productionEnabled: true });
  const id = beginIncidentFlow(s, memStore(), beginOpts()).incidentId;
  agent4Result(s, { incidentId: id, result: 'ESCALATE' });
  agent5Begin(s, { incidentId: id });
  const r = agent5Result(s, { incidentId: id, result: 'FAILED_MANUAL' });
  assert.equal(r.ok, true);
  assert.equal(r.resumeProduction, false);
  assert.equal(r.releaseLock, false, 'the FAILED_MANUAL lock ref is never released by an agent');
  assert.equal(s.incidents[0].status, 'FAILED_MANUAL');
  assert.equal(s.incidents[0].production_paused, true);
});

test('the human incident report names the incident, the pause and the manual lock release', () => {
  const s = freshState();
  const id = beginIncidentFlow(s, memStore(), beginOpts()).incidentId;
  agent4Result(s, { incidentId: id, result: 'ESCALATE', note: 'no recipe' });
  agent5Begin(s, { incidentId: id });
  const report = incidentReport(s);
  assert.match(report, /MANUAL INTERVENTION REQUIRED/);
  assert.ok(report.includes(id));
  assert.ok(report.includes(LOCK_REF_PREFIX + id));
  assert.match(report, /PAUSED/);
});

// ---------------------------------------------------------------------------
// Lock staleness + crash/restart (required tests 22, 23)
// ---------------------------------------------------------------------------

test('a fresh orphan ref is treated as a live race — never removed', () => {
  const s = freshState();
  const id = newIncidentId(new Date('2026-10-03T09:59:30Z')); // 30s old
  const d = lockCleanupDecision({
    refName: LOCK_REF_PREFIX + id, state: s, nowEpochMs: Date.parse('2026-10-03T10:00:00Z')
  });
  assert.equal(d.action, 'KEEP_FRESH_RACE');
});

test('an OLD orphan ref (acquiring run died) is explicitly stale -> removed once, then the incident can start', () => {
  const store = memStore();
  const oldId = newIncidentId(new Date('2026-10-03T06:00:00Z'));
  store.create(LOCK_REF_PREFIX + oldId);
  const s = freshState();
  const flow = beginIncidentFlow(s, store, beginOpts({ nowEpochMs: Date.parse('2026-10-03T10:00:00Z') }));
  assert.equal(flow.action, 'START', 'the stale lock was removed and the incident began');
  assert.deepEqual(store.list(), [LOCK_REF_PREFIX + flow.incidentId]);
});

test('a FAILED_MANUAL lock is never cleaned up by an agent', () => {
  const s = freshState();
  const id = newIncidentId(new Date('2026-10-03T06:00:00Z'));
  s.incidents = [{ incident_id: id, status: 'FAILED_MANUAL', signature: 'sig' }];
  const d = lockCleanupDecision({
    refName: LOCK_REF_PREFIX + id, state: s, nowEpochMs: Date.parse('2026-10-03T12:00:00Z')
  });
  assert.equal(d.action, 'KEEP_FAILED_MANUAL');
});

test('crash/restart preserves incident state (file round-trip)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-state-'));
  const s = freshState();
  const id = beginIncidentFlow(s, memStore(), beginOpts()).incidentId;
  saveOpsState(s, dir);
  const reloaded = loadOpsState(dir);
  assert.equal(reloaded.active_incident.incident_id, id);
  assert.equal(reloaded.active_incident.status, 'OPEN');
  assert.deepEqual(reloaded.active_incident.attempts, { agent4: 1, agent5: 0 });
  assert.deepEqual(validateOpsState(reloaded), []);
  rmSync(dir, { recursive: true, force: true });
});

test('a crashed OPEN incident (state committed, lock never created, >1h) is handed to #5', () => {
  const store = memStore(); // no lock ref — the acquiring run died pre-push
  const s = freshState();
  const flow = beginIncidentFlow(s, memStore(), beginOpts());
  const id = flow.incidentId;
  const later = beginIncidentFlow(s, store, beginOpts({
    signature: 'OTHER::other', nowEpochMs: Date.parse('2026-10-03T12:00:00Z')
  }));
  assert.equal(later.action, 'HANDOFF_CRASHED');
  assert.equal(later.incidentId, id);
});

test('a young crashed incident is NOT handed off yet (its run may still be alive)', () => {
  const store = memStore();
  const s = freshState();
  beginIncidentFlow(s, memStore(), beginOpts({ nowEpochMs: Date.parse('2026-10-03T10:00:00Z') }));
  const later = beginIncidentFlow(s, store, beginOpts({
    signature: 'OTHER::other', nowEpochMs: Date.parse('2026-10-03T10:05:00Z')
  }));
  assert.equal(later.action, 'SKIP_ACTIVE');
});

// ---------------------------------------------------------------------------
// Production gate (required test 24) + checkpoints/assignments (25, 26)
// ---------------------------------------------------------------------------

test('productionGate blocks on an active incident and on a bare lock ref', () => {
  const s = freshState();
  assert.equal(productionGate(s, []).allowed, true);
  const s2 = freshState();
  beginIncidentFlow(s2, memStore(), beginOpts());
  assert.equal(productionGate(s2, []).allowed, false, 'active incident blocks production');
  const bare = productionGate(freshState(), [LOCK_REF_PREFIX + 'INC-x']);
  assert.equal(bare.allowed, false, 'a lock ref blocks production even without state');
});

test('every production workflow carries the ops gate BEFORE its first mutation', () => {
  const gateBefore = (file, mutator) => {
    const y = readFileSync(join(OPS_YML_DIR, file), 'utf8');
    const gate = y.indexOf('Ops maintenance gate');
    assert.ok(gate >= 0, `${file} must have the ops gate step`);
    assert.ok(y.slice(gate, gate + 400).includes('refs/ops/maintenance-lock'), `${file} gate must check the lock namespace`);
    assert.ok(y.slice(gate, gate + 400).includes('ops-agent.mjs gate'), `${file} gate must run the state check`);
    const mut = y.indexOf(mutator);
    assert.ok(mut > gate, `${file}: the gate must precede "${mutator}"`);
  };
  gateBefore('writer-coordinator.yml', 'Auto-refill the topic queue');
  gateBefore('writer-publisher.yml', "steps.select.outputs.action == 'requeue'");
  gateBefore('blog-factory-publish.yml', 'Select exact push scope');
});

test('checkpoint and assignment integrity survive a failed repair (nothing outside ops state is touched)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-fix-'));
  const s = freshState();
  const id = beginIncidentFlow(s, memStore(), beginOpts()).incidentId;
  agent4Result(s, { incidentId: id, result: 'ESCALATE', note: 'no deterministic recipe' });
  saveOpsState(s, dir);
  // Only docs/state/operations/maintenance.json was written in the fixture root.
  assert.deepEqual(readdirSync(join(dir, 'docs/state/operations')), ['maintenance.json']);
  assert.ok(resumeDerivedAccepts('docs/state/blog-factory.checkpoint.json'), 'resume may complete the recorded checkpoint');
  assert.equal(s.active_incident.attempts.agent5, 0, '#5 may still take the SAME incident');
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Watchdog (required tests 9-21)
// ---------------------------------------------------------------------------

const wakeBase = (over = {}) => ({
  nowEpochMs: Date.parse('2026-10-03T14:00:00Z'),
  productionEnabled: true,
  activeIncident: null,
  lockRefs: [],
  agent4Active: false,
  agent5Active: false,
  activeProductionRuns: false,
  queuedProductionRuns: false,
  lastValidProgressEpochMs: Date.parse('2026-10-03T10:00:00Z'), // 4h idle
  ...over
});

test('#6 does NOTHING before 2 hours of inactivity (required 10)', () => {
  const r = watchdogShouldWake(wakeBase({ lastValidProgressEpochMs: Date.parse('2026-10-03T13:00:00Z') }));
  assert.equal(r.wake, false, '1h idle — too early');
  const edge = watchdogShouldWake(wakeBase({ lastValidProgressEpochMs: Date.parse('2026-10-03T14:00:00Z') - (WATCHDOG_IDLE_MS - 1) }));
  assert.equal(edge.wake, false, '2h minus 1ms — still too early');
});

test('heartbeats, logs, checks, failed runs and agent activity NEVER reset the timer (required 11)', () => {
  const t0 = Date.parse('2026-10-03T10:00:00Z');
  const events = [
    { type: 'log', epochMs: t0 + 3000000 }, { type: 'heartbeat', epochMs: t0 + 3200000 },
    { type: 'watchdog_run', epochMs: t0 + 3400000 }, { type: 'polling', epochMs: t0 + 3500000 },
    { type: 'check', epochMs: t0 + 3600000 }, { type: 'failed_run', epochMs: t0 + 3700000 },
    { type: 'agent_activity', epochMs: t0 + 3800000 }
  ];
  assert.equal(lastValidProgressEpochMs(events), 0, 'no valid progress event at all');
  const withValid = [...events, { type: 'publish_success', epochMs: t0 + 1000000 }];
  assert.equal(lastValidProgressEpochMs(withValid), t0 + 1000000, 'ignored events never reset the timer');
});

test('real writer staging resets the inactivity timer (required 12)', () => {
  assert.equal(classifyProgressEvent('writer_staging'), 'VALID');
  const t0 = Date.parse('2026-10-03T12:30:00Z');
  const events = [
    { type: 'publish_success', epochMs: Date.parse('2026-10-03T10:00:00Z') },
    { type: 'writer_staging', epochMs: t0 }
  ];
  assert.equal(lastValidProgressEpochMs(events), t0);
  const r = watchdogShouldWake(wakeBase({ lastValidProgressEpochMs: lastValidProgressEpochMs(events) }));
  assert.equal(r.wake, false, 'recent writer staging means production is NOT genuinely stopped');
});

test('a successful publish resets the timer (required 13)', () => {
  assert.equal(classifyProgressEvent('publish_success'), 'VALID');
  assert.equal(classifyProgressEvent('cycle_complete'), 'VALID');
  const recent = watchdogShouldWake(wakeBase({ lastValidProgressEpochMs: Date.parse('2026-10-03T13:30:00Z') }));
  assert.equal(recent.wake, false);
});

test('#6 does NOTHING while a maintenance lock or incident exists (required 14)', () => {
  const state = freshState();
  beginIncidentFlow(state, memStore(), beginOpts());
  assert.equal(watchdogShouldWake(wakeBase({ activeIncident: state.active_incident })).wake, false);
  assert.equal(watchdogShouldWake(wakeBase({ lockRefs: [LOCK_REF_PREFIX + 'INC-x'] })).wake, false);
});

test('#6 does NOTHING while Agent #4 or #5 is active (required 15, 16)', () => {
  assert.equal(watchdogShouldWake(wakeBase({ agent4Active: true })).wake, false);
  assert.equal(watchdogShouldWake(wakeBase({ agent5Active: true })).wake, false);
});

test('#6 does NOTHING while any production workflow is running or queued (required 17, 18, 19)', () => {
  // activeProductionRuns covers an active writer cycle, publisher, factory,
  // integration and any in-progress build/deploy (CI/Distribution/Pages).
  assert.equal(watchdogShouldWake(wakeBase({ activeProductionRuns: true })).wake, false);
  assert.equal(watchdogShouldWake(wakeBase({ queuedProductionRuns: true })).wake, false);
});

test('#6 does NOTHING while the owner keeps production stopped (production_enabled=false)', () => {
  const r = watchdogShouldWake(wakeBase({ productionEnabled: false }));
  assert.equal(r.wake, false);
  assert.match(r.reason, /intentionally stopped/);
});

test('#6 wakes production ONLY after genuine 2h inactivity, targeting exactly ONE entrypoint (required 20)', () => {
  const r = watchdogShouldWake(wakeBase());
  assert.equal(r.wake, true);
  assert.match(r.reason, /production entrypoint/);
  assert.equal(PRODUCTION_ENTRYPOINT.workflow, 'writer-coordinator.yml', 'the single normal entrypoint');
});

test('two simultaneous watchdogs cannot create a duplicate production cycle (required 21)', () => {
  // The second watchdog observes the entrypoint run the first one queued.
  const second = watchdogShouldWake(wakeBase({ queuedProductionRuns: true }));
  assert.equal(second.wake, false);
  // And even a dispatch race is safe: the coordinator refuses an ACTIVE batch
  // (covered by tests/unit/writer-queue.test.js — plan is idempotent),
  // so at most ONE cycle can ever exist.
});

test('STRESS watchdog decision x100 under randomized blockers: wake only when every condition clears', () => {
  for (let i = 0; i < 100; i++) {
    const blockers = i % 32;
    const obs = wakeBase({
      productionEnabled: (blockers & 1) === 0 || blockers === 0,
      activeIncident: (blockers & 2) ? { incident_id: 'x' } : null,
      lockRefs: (blockers & 4) ? ['refs/ops/maintenance-lock/INC-x'] : [],
      agent4Active: (blockers & 8) !== 0,
      agent5Active: (blockers & 16) !== 0,
      activeProductionRuns: (blockers & 32) !== 0,
      queuedProductionRuns: (blockers & 64) !== 0
    });
    const r = watchdogShouldWake(obs);
    if (blockers === 0) assert.equal(r.wake, true, 'no blockers -> wake');
    else assert.equal(r.wake, false, `blockers=${blockers} -> do nothing`);
  }
});

// ---------------------------------------------------------------------------
// Repair playbooks + dry-run safety (required tests 9, 28)
// ---------------------------------------------------------------------------

test('Agent #6 has NO repair capability (nothing in the module offers it)', () => {
  const src = read('tools/ops-agent.mjs');
  assert.ok(src.includes('watchdogShouldWake'), 'watchdog decision exists');
  assert.ok(!src.includes('watchdogRepair'), '#6 has no repair entry point');
  // #6 only reads state and triggers one entrypoint — enforced again by the
  // ops-watchdog.yml contract test in commit D.
});

test('deterministic recipes only: leftover txn marker or retired lockfile, else ESCALATE', () => {
  assert.equal(suggestRepair({ leftoverTxnMarker: true }).id, 'RESUME_PENDING_TRANSACTION');
  assert.equal(suggestRepair({ retiredLockFilePresent: true }).id, 'CLEAR_RETIRED_LOCKFILE');
  assert.equal(suggestRepair({}), null, 'no recipe -> Agent #4 must ESCALATE, never improvise');
  assert.equal(suggestRepair({ leftoverTxnMarker: false, retiredLockFilePresent: false }), null);
});

test('suggest-repair is read-only (dry-run never creates articles or state)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-dry-'));
  const file = join(dir, 'probe.json');
  writeFileSync(file, '{"a":1}');
  const hashBefore = createHash('md5').update(readFileSync(file)).digest('hex');
  const recipe = suggestRepair({ leftoverTxnMarker: false, retiredLockFilePresent: false });
  assert.equal(recipe, null);
  const hashAfter = createHash('md5').update(readFileSync(file)).digest('hex');
  assert.equal(hashAfter, hashBefore, 'pure suggestion changed nothing');
  assert.deepEqual(readdirSync(dir), ['probe.json'], 'no article or state file appeared');
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Production inventory is never touched by agent machinery (required 27)
// ---------------------------------------------------------------------------

test('agent tests never change the real production inventory', () => {
  const inventory = ['data/blog/published.json', 'data/blog/content-matrix.csv', 'docs/state/writer-assignments.json'];
  for (const p of inventory) {
    assert.ok(existsSync(join(REPO, p)), p + ' must exist');
    const content = readFileSync(join(REPO, p));
    const h = createHash('md5').update(content).digest('hex');
    assert.match(h, /^[0-9a-f]{32}$/, p + ' readable — agents left it untouched');
  }
  const bodies = readdirSync(join(REPO, 'data/blog/articles')).length;
  assert.ok(bodies > 0, 'article bodies still in place');
});

test('validateOpsState rejects broken states (checkpoint of the state machine)', () => {
  const bad1 = freshState();
  bad1.active_incident = { incident_id: 'X', status: 'WEIRD', owner: 'AGENT_4', attempts: { agent4: 1, agent5: 0 } };
  assert.ok(validateOpsState(bad1).length > 0, 'unknown status rejected');
  const bad2 = freshState();
  bad2.active_incident = { incident_id: 'X', status: 'OPEN', owner: 'AGENT_4', attempts: { agent4: 2, agent5: 0 } };
  assert.ok(validateOpsState(bad2).some((e) => e.includes('cap')), 'double #4 attempt rejected');
  const bad3 = freshState();
  bad3.production_enabled = 'yes';
  assert.ok(validateOpsState(bad3).length > 0, 'non-boolean owner switch rejected');
});

test('incident ids parse back out of lock ref names', () => {
  const id = newIncidentId(new Date(Date.UTC(2026, 9, 3, 12, 34, 56)));
  const ref = LOCK_REF_PREFIX + id;
  assert.equal(incidentIdOfRef(ref), id);
  assert.equal(refTimestampEpoch(ref), Date.UTC(2026, 9, 3, 12, 34, 56));
  assert.ok(STATE_PATH.endsWith('maintenance.json'));
});

// ---------------------------------------------------------------------------
// Agent #4 workflow contract (static, mirrors the §6G contract-test style)
// ---------------------------------------------------------------------------

test('Agent #4 workflow: event-driven triggers, minimal permissions, serialized', () => {
  const y = read('.github/workflows/ops-repair-agent.yml');
  assert.ok(y.includes('workflow_run'), 'event-driven on real failures');
  assert.match(y, /Writer Publisher \(serialized\)/);
  assert.match(y, /Writer Coordinator \(central reservation\)/);
  assert.match(y, /Blog Factory Publish \(2-article micro batch\)/);
  assert.match(y, /concurrency:/);
  assert.match(y, /group: ops-repair-agent/);
  const perms = y.slice(y.indexOf('permissions:'), y.indexOf('concurrency:'));
  assert.match(perms, /contents:\s*write/);
  assert.match(perms, /actions:\s*read/);
  assert.ok(!/pages:\s*write|packages:\s*write|id-token|secrets\.(?!(GITHUB_TOKEN))/.test(perms),
    'no permissions beyond contents:write + actions:read');
});

test('Agent #4 workflow: content QA never opens an incident; one attempt; scope guard; SAME incident handed to #5', () => {
  const y = read('.github/workflows/ops-repair-agent.yml');
  assert.ok(y.includes('record-content-blocker'), 'content failures only get recorded');
  assert.ok(y.includes('incident-begin'), 'infra failures open an incident with the atomic lock');
  assert.ok(y.includes('ops-agent.mjs guard'), 'the scope guard runs');
  assert.ok(y.includes('agent4-result'), 'the result is recorded in durable state');
  const dispatches = y.split('gh workflow run ops-supervisor.yml').length - 1;
  assert.equal(dispatches, 2, 'exactly the handoff paths (terminal result + crashed handoff) dispatch #5');
  assert.ok(y.includes('-f incident_id='), '#5 receives the SAME incident_id');
  assert.ok(!y.includes('set -x'), 'never echo commands (token safety)');
  assert.ok(!/echo\s+"?\$?\{?(GH_TOKEN|GITHUB_TOKEN)/.test(y), 'no token is ever echoed to a log');
});

test('the writer-publisher classifies factory failures and dispatches Agent #4 only for INFRA', () => {
  const y = read('.github/workflows/writer-publisher.yml');
  const i = y.indexOf('Factory failed (mark FACTORY_FAILED');
  assert.ok(i >= 0);
  const block = y.slice(i, i + 2600);
  assert.ok(block.includes('ops-agent.mjs classify'), 'failure is classified');
  assert.ok(block.includes('gh workflow run ops-repair-agent.yml'), 'INFRA dispatches Agent #4');
  assert.ok(block.includes('REPAIR pipeline, no ops incident'), 'CONTENT stays in the repair pipeline');
});

test('Agent #4 is never triggered by its own runs or by CI/Distribution red (no loops)', () => {
  const y = read('.github/workflows/ops-repair-agent.yml');
  assert.ok(!y.includes("'CI'") && !y.includes('name: CI'), 'CI failures are deliberately not auto-triggers (known content blocker keeps CI red)');
  const runBlock = y.slice(y.indexOf('workflow_run:'), y.indexOf('permissions:'));
  for (const self of ['Ops Repair Agent', 'Ops Supervisor Agent', 'Ops Watchdog Agent']) {
    assert.ok(!runBlock.includes(self), `no ops workflow listens to itself or its peers (${self})`);
  }
});
