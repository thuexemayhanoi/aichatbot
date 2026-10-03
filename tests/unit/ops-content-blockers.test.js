import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadOpsState, validateOpsState, recordContentBlocker, beginIncidentFlow
} from '../../tools/ops-agent.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The durable ops state exactly as it ships on main. */
const state = loadOpsState(REPO);

// ---------------------------------------------------------------------------
// Required 7: known_content_blockers loads and contains exactly the known
// article-level blockers (durable, machine-readable, backward-compatible)
// ---------------------------------------------------------------------------

test('the durable ops state loads and validates', () => {
  assert.ok(existsSync(join(REPO, 'docs/state/operations/maintenance.json')));
  assert.deepEqual(validateOpsState(state), [], 'the shipped state passes the state-machine validator');
});

test('known_content_blockers carries the five audited locality blockers with stable fields', () => {
  const blockers = state.known_content_blockers;
  assert.ok(Array.isArray(blockers) && blockers.length === 5);
  const byId = Object.fromEntries(blockers.map((b) => [b.article_id, b]));
  assert.deepEqual(
    blockers.map((b) => b.article_id).sort(),
    ['BA-0012', 'BA-0024', 'BA-0030', 'BA-0042', 'BA-0054']
  );
  for (const b of blockers) {
    for (const field of ['article_id', 'type', 'reason', 'status']) {
      assert.ok(typeof b[field] === 'string' && b[field].length > 0, `${b.article_id} has ${field}`);
    }
    assert.equal(b.status, 'open');
  }
  assert.equal(byId['BA-0012'].type, 'unverified_locality');
  assert.equal(byId['BA-0024'].type, 'unverified_locality');
  assert.equal(byId['BA-0030'].type, 'locality_normalization');
  assert.equal(byId['BA-0042'].type, 'locality_normalization');
  assert.equal(byId['BA-0054'].type, 'locality_normalization');
  // Machine-readable: the raw JSON parses back to the same structure.
  const raw = JSON.parse(readFileSync(join(REPO, 'docs/state/operations/maintenance.json'), 'utf8'));
  assert.equal(raw.known_content_blockers.length, 5);
});

test('BA-0063/BA-0064 are NOT locality blockers here — they live in the REPAIR pipeline', () => {
  const ids = (state.known_content_blockers ?? []).map((b) => b.article_id);
  assert.ok(!ids.includes('BA-0063') && !ids.includes('BA-0064'),
    'the factory-failed REPAIR pair must not be recorded as content blockers');
});

test('backward compatibility: runtime signature blockers coexist with the article blockers', () => {
  // The runtime QA path dedupes on `signature`; article blockers simply do not
  // carry one, so they can never collide with a workflow failure signature.
  const s = JSON.parse(JSON.stringify(state));
  recordContentBlocker(s, { signature: 'Blog Factory Publish (2-article micro batch)::Assert clean state; report QA failures', note: 'runtime' });
  assert.equal(s.known_content_blockers.length, 6);
  recordContentBlocker(s, { signature: 'Blog Factory Publish (2-article micro batch)::Assert clean state; report QA failures', note: 'runtime again' });
  assert.equal(s.known_content_blockers.length, 6, 'signature dedup still works');
  assert.equal(s.known_content_blockers[0].article_id, 'BA-0012', 'the durable blockers stay first, untouched');
  assert.deepEqual(validateOpsState(s), []);
  // A signature blocker must still skip incident creation (existing behavior),
  // and none of the article blockers may ever cause a SKIP.
  const skip = beginIncidentFlow(s, { list: () => [], create: () => true, remove: () => true }, {
    incidentId: 'INC-test', signature: 'Blog Factory Publish (2-article micro batch)::Assert clean state; report QA failures',
    nowEpochMs: Date.parse('2026-10-03T10:00:00Z')
  });
  assert.equal(skip.action, 'SKIP_BLOCKER', 'the runtime signature blocker still blocks incidents');
  const articleSide = beginIncidentFlow(s, { list: () => [], create: () => true, remove: () => true }, {
    incidentId: 'INC-test2', signature: 'Some Workflow::some step',
    nowEpochMs: Date.parse('2026-10-03T10:00:00Z')
  });
  assert.equal(articleSide.action, 'START', 'article blockers never suppress unrelated infra incidents');
});

// ---------------------------------------------------------------------------
// Required 8: the owner stop is intact
// ---------------------------------------------------------------------------

test('production_enabled is still false (owner stop)', () => {
  assert.equal(state.production_enabled, false);
});

// ---------------------------------------------------------------------------
// Required 10: no real incident, no lock, no production state was created
// ---------------------------------------------------------------------------

test('no active incident, no incident history, no mutation of production surfaces', () => {
  assert.equal(state.active_incident, null);
  assert.deepEqual(state.incidents, []);
  // This change touched only the ops state file — the production inventory is
  // intact (deep-checked by the suite's inventory tests).
  const blockers = JSON.stringify(state.known_content_blockers);
  assert.ok(!blockers.includes('body.html') && !blockers.includes('writer-work'),
    'no blocker entry carries a path into article bodies or writer branches');
});
