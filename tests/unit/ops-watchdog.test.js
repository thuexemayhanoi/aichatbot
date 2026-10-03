import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { watchdogShouldWake, WATCHDOG_IDLE_MS, PRODUCTION_ENTRYPOINT } from '../../tools/ops-agent.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const YML = readFileSync(join(REPO, '.github', 'workflows', 'ops-watchdog.yml'), 'utf8');
const idx = (n) => YML.indexOf(n);

// ---------------------------------------------------------------------------
// Module reminders (full behavior matrix lives in ops-agents.test.js)
// ---------------------------------------------------------------------------

test('the wake threshold stays 2h and the entrypoint is the real production cycle', () => {
  assert.equal(WATCHDOG_IDLE_MS, 2 * 60 * 60 * 1000);
  assert.equal(PRODUCTION_ENTRYPOINT.workflow, 'writer-coordinator.yml');
  assert.deepEqual(PRODUCTION_ENTRYPOINT.inputs, { dry_run: 'false', limit: '18' });
});

test('module sanity: a genuine 2h stop with every blocker clear still wakes once', () => {
  const now = Date.parse('2026-10-03T12:00:00Z');
  const r = watchdogShouldWake({
    nowEpochMs: now, productionEnabled: true, activeIncident: null, lockRefs: [],
    agent4Active: false, agent5Active: false,
    activeProductionRuns: false, queuedProductionRuns: false,
    lastValidProgressEpochMs: now - WATCHDOG_IDLE_MS
  });
  assert.equal(r.wake, true);
});

// ---------------------------------------------------------------------------
// Workflow contract (static)
// ---------------------------------------------------------------------------

test('Agent #6 runs on a lightweight schedule + manual dispatch only (no event chains)', () => {
  assert.match(YML, /schedule:/);
  assert.match(YML, /cron: '17,47 \* \* \* \*'/, 'twice hourly — the only schedule in the ops system');
  assert.ok(YML.includes('workflow_dispatch'));
  assert.ok(!YML.includes('workflow_run:'), '#6 never chains off other runs (no recursive triggering)');
  assert.match(YML, /group: ops-watchdog/, 'concurrency group serializes simultaneous watchdogs');
  assert.ok(/cancel-in-progress:\s*false/.test(YML), 'a queued watchdog waits its turn, then re-observes');
});

test('Agent #6 permissions: NO contents write — read state + trigger one entrypoint only', () => {
  const perms = YML.slice(idx('permissions:'), idx('concurrency:'));
  assert.match(perms, /contents:\s*read/, 'contents are read-only');
  assert.ok(!/contents:\s*write/.test(perms), 'the watchdog must NEVER write repository contents');
  assert.match(perms, /actions:\s*write/, 'actions:write exists solely for the single entrypoint dispatch');
  assert.ok(!/pages:\s*write|packages:\s*write|id-token|pull-requests|issues|deployments/.test(perms), 'no other permissions');
  assert.ok(perms.includes('sole reason'), 'the actions:write rationale is documented');
});

test('wake dispatches EXACTLY ONE entrypoint, gated on the decision AND dry_run', () => {
  const dispatches = YML.split('\n')
    .filter((l) => l.includes('gh workflow run') && !l.trim().startsWith('#')).length;
  assert.equal(dispatches, 1, 'exactly one gh workflow run in the whole workflow');
  assert.ok(YML.includes('gh workflow run writer-coordinator.yml'), 'the one dispatch targets the coordinator');
  const wakeStep = YML.slice(idx('Wake production: EXACTLY ONE'));
  assert.match(wakeStep.slice(0, 200), /steps\.decide\.outputs\.wake == 'true'/, 'gated on the module decision');
  assert.match(wakeStep.slice(0, 200), /inputs\.dry_run != 'true'/, 'a dry run never dispatches');
  assert.ok(wakeStep.includes('-f dry_run=false'), 'the dispatch is a REAL production cycle');
  assert.ok(wakeStep.includes('-f limit=18'), 'v69 cycle limit');
  // Read-only observations (gh run list) are fine; DISPATCHING anything else is not.
  const dispatchLines = YML.split('\n').filter((l) => l.includes('gh workflow run'));
  for (const never of ['writer-publisher', 'blog-factory-publish', 'ops-repair-agent', 'ops-supervisor', 'writer/', 'WRITER-']) {
    assert.ok(!dispatchLines.join('\n').includes(never), `#6 must never dispatch ${never}`);
  }
});

test('Agent #6 NEVER repairs, edits or mutates anything (required 9)', () => {
  for (const forbidden of [
    'suggest-repair', 'incident-begin', 'agent4-result', 'agent5-begin', 'agent5-result',
    'release-lock', 'record-content-blocker', 'ops-agent.mjs report', 'ops-agent.mjs guard',
    'git commit', 'git push', 'git add', 'node --test', 'article-qa.mjs',
    'blog-factory.mjs', 'writer-queue.mjs', 'gen-blog-matrix'
  ]) {
    assert.ok(!YML.includes(forbidden), `ops-watchdog.yml must never run "${forbidden}"`);
  }
});

test('the observation counts ONLY valid progress — never heartbeats, checks or logs', () => {
  const block = YML.slice(idx('Observe'), idx('Decide:'));
  for (const valid of ['data/blog/articles/', 'PUBLISHED', 'refs/remotes/origin/writer/', 'last_valid_progress_at']) {
    assert.ok(block.includes(valid), `valid progress signal observed: ${valid}`);
  }
  // This run's own activity can never register as progress: it writes nothing.
  assert.ok(!block.includes('date -s'), 'no clock tampering');
});

test('every blocker flag reaches the wake decision (owner stop, agents, active+queued runs)', () => {
  const block = YML.slice(idx('node tools/ops-agent.mjs wake-decision'), idx('node tools/ops-agent.mjs wake-decision') + 900);
  for (const flag of [
    '--production-enabled', '--last-progress-epoch', '--now-epoch',
    '--active-production', '--queued-production', '--agent4-active', '--agent5-active'
  ]) {
    assert.ok(block.includes(flag), `wake-decision receives ${flag}`);
  }
  assert.ok(YML.includes('ops-agent.mjs wake-decision'), 'the decision comes from the tested module, not ad-hoc shell');
});

test('Agent #6 never leaks tokens into logs', () => {
  assert.ok(!YML.includes('set -x'), 'never echo commands');
  assert.ok(!/echo\s+"?\$?\{?(GH_TOKEN|GITHUB_TOKEN)/.test(YML), 'no token is ever echoed');
});
