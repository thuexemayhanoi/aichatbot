import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  emptyOpsState, beginIncidentFlow, agent4Result, agent5Begin, agent5Result,
  incidentReport, LOCK_REF_PREFIX
} from '../../tools/ops-agent.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const YML = readFileSync(join(REPO, '.github', 'workflows', 'ops-supervisor.yml'), 'utf8');

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
  incidentId: 'INC-20261003T100000Z-ab12', signature: 'Writer Publisher (serialized)::step A',
  nowEpochMs: Date.parse('2026-10-03T10:00:00Z'), baseSha: 'abc123',
  reason: 'publisher failed', trigger: 'workflow_run',
  sourceWorkflow: 'Writer Publisher (serialized)', sourceRunId: '42',
  sourceUrl: 'https://example/run/42', ...over
});

const idx = (needle) => YML.indexOf(needle);

// ---------------------------------------------------------------------------
// Lifecycle: the exact Agent #4 -> #5 chain the workflow implements
// ---------------------------------------------------------------------------

test('lifecycle: #4 SUCCESS -> #5 VERIFIED releases the lock but never resumes while production_enabled=false', () => {
  const store = memStore();
  const s = freshState();
  const { incidentId } = beginIncidentFlow(s, store, beginOpts());
  agent4Result(s, { incidentId, result: 'SUCCESS', note: 'recipe applied' });
  const begin = agent5Begin(s, { incidentId });
  assert.ok(begin.ok && begin.priorStatus === 'AGENT4_SUCCESS');
  const closed = agent5Result(s, { incidentId, result: 'VERIFIED', note: 'independent checks healthy' });
  assert.equal(closed.releaseLock, true);
  assert.equal(closed.resumeProduction, false, 'owner stop wins — no auto-resume');
  assert.equal(closed.entrypoint, null);
  assert.equal(s.active_incident, null);
});

test('lifecycle: #4 ESCALATE + #5 FAILED_MANUAL keeps the lock and writes the report BEFORE closing', () => {
  const store = memStore();
  const s = freshState();
  const { incidentId } = beginIncidentFlow(s, store, beginOpts());
  agent4Result(s, { incidentId, result: 'ESCALATE', note: 'no recipe' });
  agent5Begin(s, { incidentId });
  // The report must be renderable while the incident is still active —
  // the workflow writes it BEFORE agent5-result moves it to history.
  const report = incidentReport(s);
  assert.ok(report.includes(`# Incident ${incidentId}`));
  assert.ok(report.includes(`${LOCK_REF_PREFIX}${incidentId} is kept`));
  const closed = agent5Result(s, { incidentId, result: 'FAILED_MANUAL', note: 'second line failed too' });
  assert.equal(closed.releaseLock, false, 'FAILED_MANUAL lock is humans-only');
  assert.equal(closed.resumeProduction, false);
  assert.equal(store.list().length, 1, 'the lock ref stays for manual intervention');
});

test('lifecycle: with production_enabled=true a RECOVERED incident resumes via exactly ONE entrypoint', () => {
  const store = memStore();
  const s = emptyOpsState({ productionEnabled: true, lastValidProgressAt: '2026-10-03T07:14:41.000Z' });
  const { incidentId } = beginIncidentFlow(s, store, beginOpts());
  agent4Result(s, { incidentId, result: 'ESCALATE', note: 'no recipe' });
  agent5Begin(s, { incidentId });
  const closed = agent5Result(s, { incidentId, result: 'RECOVERED', note: 'second line fixed it' });
  assert.equal(closed.resumeProduction, true);
  assert.equal(closed.entrypoint.workflow, 'auto-writer.yml');
  assert.deepEqual(closed.entrypoint.inputs, { dry_run: 'false' });
});

// ---------------------------------------------------------------------------
// Workflow contract (static)
// ---------------------------------------------------------------------------

test('Agent #5 workflow is dispatch-only: only Agent #4 hands it incidents (no polling, no loops)', () => {
  assert.ok(YML.includes('workflow_dispatch'));
  assert.ok(!YML.includes('workflow_run:'), '#5 never self-triggers on runs — only #4 dispatches it');
  assert.ok(!YML.includes('schedule:'), '#5 is never scheduled');
  assert.ok(!YML.includes('gh workflow run ops-supervisor.yml'), '#5 never dispatches itself');
  assert.ok(!YML.includes('gh workflow run ops-repair-agent.yml'), '#5 never dispatches #4 (no ping-pong)');
  assert.match(YML, /group: ops-supervisor/);
});

test('takeover runs FIRST and refuses everything until Agent #4 is terminal', () => {
  const takeover = idx('agent5-begin');
  assert.ok(takeover >= 0, 'the workflow takes over via the state machine');
  for (const later of ['agent5-result', 'suggest-repair', 'release-lock']) {
    assert.ok(takeover < idx(later), `agent5-begin precedes ${later}`);
  }
  assert.ok(YML.includes('incident_id:'), 'the SAME incident_id is a required input');
  assert.ok(YML.includes('allow_crashed_handoff'), 'the crashed-handoff exception is an explicit input');
});

test('independent verification never trusts Agent #4: it re-checks state itself', () => {
  const verify = idx('Independently verify');
  const closeVerified = idx('Close the incident as VERIFIED');
  assert.ok(verify >= 0 && verify < closeVerified, 'verification runs before any close');
  const block = YML.slice(verify, closeVerified);
  for (const check of [
    'writer-queue.mjs validate', 'blog-factory.mjs validate',
    'blog-factory.transaction.json', 'blog-factory.lock',
    'refs/ops/maintenance-lock/', 'writer-assignments.json',
    'blog-factory.checkpoint.json', 'node --test',
    'merge-base --is-ancestor'
  ]) {
    assert.ok(block.includes(check), `independent verification re-checks: ${check}`);
  }
  assert.ok(block.includes('verify_ok='), 'the verification verdict is an explicit output');
});

test('VERIFIED closes ONLY when the independent verification passed; the second-line attempt runs ONLY otherwise', () => {
  assert.ok(/steps\.verify\.outputs\.verify_ok == 'true'/.test(YML.slice(idx('Close the incident as VERIFIED'), idx('Close the incident as VERIFIED') + 400)));
  const closeFinal = YML.slice(idx('Close the incident: RECOVERED or FAILED_MANUAL'));
  assert.ok(/steps\.verify\.outputs\.verify_ok != 'true'/.test(closeFinal.slice(0, 400)));
  assert.ok(idx('Re-diagnose') > idx('Independently verify'), 're-diagnosis happens after verification fails');
});

test('resume: EXACTLY ONE production entrypoint dispatch, gated on resume_production', () => {
  const dispatches = YML.split('gh workflow run auto-writer.yml').length - 1;
  assert.equal(dispatches, 1, 'exactly one entrypoint dispatch in the whole workflow');
  const resume = YML.slice(idx('Resume production via EXACTLY ONE'));
  assert.ok(resume.includes('-f dry_run=false'), 'the entrypoint is a REAL production cycle');
  assert.ok(/resume_production == 'true'/.test(resume.slice(0, 600)), 'gated on the CLI resume verdict');
  for (const never of ['writer-publisher.yml', 'blog-factory-publish.yml']) {
    assert.ok(!YML.includes(`gh workflow run ${never}`), 'writers are NEVER started individually');
  }
});

test('FAILED_MANUAL: report written BEFORE closing, lock KEPT, production stays paused', () => {
  const closeFinal = YML.slice(idx('Close the incident: RECOVERED or FAILED_MANUAL'));
  const reportAt = closeFinal.indexOf('incident-reports/');
  const resultAt = closeFinal.indexOf('agent5-result');
  assert.ok(reportAt >= 0 && reportAt < resultAt, 'the report captures the still-active incident');
  assert.ok(closeFinal.includes('ops-agent.mjs report'), 'the report comes from the ops module');
  const release = YML.slice(idx('Release the maintenance lock'));
  assert.ok(/release_lock == 'true'/.test(release), 'the lock release is driven by the CLI verdict (FAILED_MANUAL -> false)');
  assert.ok(YML.includes("release-lock --incident-id"), 'the lock is released through the CLI, which refuses FAILED_MANUAL');
  assert.ok(YML.includes('Production stays stopped by the owner'), 'the owner stop is logged, never bypassed');
});

test('Agent #5 permissions are minimal and documented', () => {
  const perms = YML.slice(idx('permissions:'), idx('concurrency:'));
  assert.match(perms, /contents:\s*write/);
  assert.match(perms, /actions:\s*write/);
  assert.ok(!/pages:\s*write|packages:\s*write|id-token|pull-requests|issues/.test(perms), 'no permissions beyond contents+actions');
  assert.ok(perms.includes('resume step'), 'the actions:write rationale names its single use');
});

test('Agent #5 never writes article content and never bypasses the scope guard', () => {
  for (const forbidden of [
    'gen-blog-matrix', 'publish-chunk', 'prepare-chunk',
    'writer-queue.mjs plan', 'writer-queue.mjs stage', 'writer-queue.mjs begin',
    'data/blog/articles/'
  ]) {
    assert.ok(!YML.includes(forbidden), `ops-supervisor.yml must never run "${forbidden}"`);
  }
  assert.ok(YML.includes('ops-agent.mjs guard'), 'the second-line repair runs behind the scope guard');
});

test('Agent #5 never leaks tokens into logs', () => {
  assert.ok(!YML.includes('set -x'), 'never echo commands');
  assert.ok(!/echo\s+"?\$?\{?(GH_TOKEN|GITHUB_TOKEN)/.test(YML), 'no token is ever echoed');
});
