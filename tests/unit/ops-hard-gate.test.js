import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  productionGate, watchdogShouldWake, agent5Result, beginIncidentFlow,
  agent4Result, agent5Begin, emptyOpsState, WATCHDOG_IDLE_MS
} from '../../tools/ops-agent.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(REPO, p), 'utf8');

const on = () => emptyOpsState({ productionEnabled: true, lastValidProgressAt: '2026-10-03T07:14:41.000Z' });
const off = () => emptyOpsState({ productionEnabled: false, lastValidProgressAt: '2026-10-03T07:14:41.000Z' });

function memStore() {
  const refs = new Set();
  return {
    list: () => [...refs],
    create: (ref) => (refs.has(ref) ? false : (refs.add(ref), true)),
    remove: (ref) => (refs.delete(ref) ? true : false)
  };
}

// ---------------------------------------------------------------------------
// The owner stop is a HARD GATE: no production mutation path may pass
// ---------------------------------------------------------------------------

test('production_enabled=false blocks the gate with NO incident and NO lock', () => {
  const g = productionGate(off(), []);
  assert.equal(g.allowed, false, 'a completely clean state still refuses while the owner stop is on');
  assert.match(g.reason, /production_enabled=false/);
  assert.match(g.reason, /hard gate/);
});

test('fail closed: a state without the owner switch also refuses (only explicit true allows)', () => {
  const legacy = { production_enabled: undefined };
  assert.equal(productionGate(legacy, []).allowed, false);
  assert.equal(productionGate({}, []).allowed, false);
  assert.equal(productionGate(on(), []).allowed, true, 'explicit true + clean state is the only ALLOW');
});

test('even a real article/published.json push cannot run production while disabled (factory gate)', () => {
  const factory = read('.github/workflows/blog-factory-publish.yml');
  // The factory fires on content pushes...
  assert.ok(factory.includes('data/blog/articles/**'), 'factory trigger includes article bodies');
  assert.ok(factory.includes('data/blog/published.json'), 'factory trigger includes published.json');
  // ...but its gate step runs BEFORE any mutation and consults the CLI gate.
  const gateIdx = factory.indexOf('node tools/ops-agent.mjs gate');
  const firstMutation = factory.indexOf('Select exact push scope');
  assert.ok(gateIdx >= 0 && gateIdx < firstMutation, 'the gate runs before the first factory mutation step');
  // And the CLI gate refuses on the owner stop (proven above), so a content
  // push while production_enabled=false can NEVER start real production.
});

test('the other two production workflows run the same CLI gate', () => {
  for (const f of ['writer-coordinator.yml', 'writer-publisher.yml']) {
    const y = read(join('.github/workflows', f));
    assert.ok(y.includes('node tools/ops-agent.mjs gate'), `${f} gates via the CLI`);
  }
});

// ---------------------------------------------------------------------------
// No backdoor: every other production-starting path also requires the switch
// ---------------------------------------------------------------------------

test('watchdog never wakes while the owner stop is on', () => {
  const now = Date.parse('2026-10-03T12:00:00Z');
  const r = watchdogShouldWake({
    nowEpochMs: now, productionEnabled: false, activeIncident: null, lockRefs: [],
    agent4Active: false, agent5Active: false,
    activeProductionRuns: false, queuedProductionRuns: false,
    lastValidProgressEpochMs: now - 10 * WATCHDOG_IDLE_MS // 20h idle
  });
  assert.equal(r.wake, false, 'even 20h of inactivity never wakes production while disabled');
});

test('Agent #5 closes healthy but never resumes production while the owner stop is on', () => {
  const s = off();
  const store = memStore();
  const { incidentId } = beginIncidentFlow(s, store, {
    incidentId: 'INC-t', signature: 'W::s', nowEpochMs: Date.parse('2026-10-03T10:00:00Z'),
    baseSha: 'a', reason: 'r', trigger: 't', sourceWorkflow: 'W', sourceRunId: '1', sourceUrl: ''
  });
  agent4Result(s, { incidentId, result: 'SUCCESS' });
  agent5Begin(s, { incidentId });
  const closed = agent5Result(s, { incidentId, result: 'VERIFIED' });
  assert.equal(closed.status, 'VERIFIED');
  assert.equal(closed.resumeProduction, false, 'a healthy close still never resumes while disabled');
  assert.equal(closed.entrypoint, null);
});
