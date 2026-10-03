import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadOpsState, validateOpsState, recordContentBlocker, beginIncidentFlow
} from '../../tools/ops-agent.mjs';
import { localScope } from '../../tools/gen-blog-matrix.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The durable ops state exactly as it ships on main. */
const state = loadOpsState(REPO);

/** Naive CSV parse (the matrix never carries commas inside cells). */
function parseMatrix() {
  const lines = readFileSync(join(REPO, 'data/blog/content-matrix.csv'), 'utf8')
    .split('\n').filter(Boolean);
  const header = lines[0].split(',');
  const idCol = header.indexOf('article_id');
  const lsCol = header.indexOf('local_scope');
  const stCol = header.indexOf('status');
  const catCol = header.indexOf('category');
  return lines.slice(1).map((l) => {
    const cols = l.split(',');
    return {
      article_id: cols[idCol],
      category: cols[catCol],
      status: cols[stCol],
      local_scope: cols[lsCol]
    };
  });
}

// ---------------------------------------------------------------------------
// The five audited locality blockers (BA-0012/0024/0030/0042/0054) are now
// genuinely resolved in content, so the durable state no longer carries them.
// ---------------------------------------------------------------------------

test('the durable ops state loads and validates', () => {
  assert.ok(existsSync(join(REPO, 'docs/state/operations/maintenance.json')));
  assert.deepEqual(validateOpsState(state), [], 'the shipped state passes the state-machine validator');
});

test('known_content_blockers is empty — every recorded blocker was genuinely fixed', () => {
  assert.deepEqual(state.known_content_blockers, [],
    'resolved blockers must be cleared from the durable state, not kept as ghosts');
  const raw = JSON.parse(readFileSync(join(REPO, 'docs/state/operations/maintenance.json'), 'utf8'));
  assert.deepEqual(raw.known_content_blockers, []);
});

test('the five fixed LOCAL rows now satisfy the verified-locality contract', () => {
  const hn = JSON.parse(readFileSync(join(REPO, 'data/local/hanoi.json'), 'utf8'));
  const names = new Set(hn.units.map((u) => u.name));
  const fixed = {
    // Unverified landmark claims removed entirely (no invented phường).
    'BA-0012': '',
    'BA-0024': '',
    // Casing normalized to the canonical verified unit names.
    'BA-0030': 'Ba Đình',
    'BA-0042': 'Đống Đa',
    'BA-0054': 'Hai Bà Trưng'
  };
  const byId = Object.fromEntries(parseMatrix().map((r) => [r.article_id, r]));
  for (const [id, expected] of Object.entries(fixed)) {
    const row = byId[id];
    assert.ok(row, `${id} exists in the matrix`);
    assert.equal(row.status, 'PUBLISHED', `${id} stays published`);
    assert.equal(row.local_scope, expected, `${id} local_scope`);
    if (row.local_scope) assert.ok(names.has(row.local_scope), `${id} claims a verified unit`);
  }
});

test('every published LOCAL row now passes the LOCAL quality gate', () => {
  const hn = JSON.parse(readFileSync(join(REPO, 'data/local/hanoi.json'), 'utf8'));
  const names = new Set(hn.units.map((u) => u.name));
  for (const r of parseMatrix().filter((x) => x.category === 'LOCAL' && x.status === 'PUBLISHED')) {
    if (r.local_scope) assert.ok(names.has(r.local_scope), `unverified locality: ${r.local_scope}`);
  }
});

test('BA-0063/BA-0064 are NOT locality blockers here — they live in the REPAIR pipeline', () => {
  const ids = (state.known_content_blockers ?? []).map((b) => b.article_id);
  assert.ok(!ids.includes('BA-0063') && !ids.includes('BA-0064'),
    'the factory-failed REPAIR pair must not be recorded as content blockers');
});

test('backward compatibility: runtime signature blockers still dedupe and still gate incidents', () => {
  const s = JSON.parse(JSON.stringify(state));
  assert.equal(s.known_content_blockers.length, 0);
  recordContentBlocker(s, { signature: 'Blog Factory Publish (2-article micro batch)::Assert clean state; report QA failures', note: 'runtime' });
  assert.equal(s.known_content_blockers.length, 1);
  recordContentBlocker(s, { signature: 'Blog Factory Publish (2-article micro batch)::Assert clean state; report QA failures', note: 'runtime again' });
  assert.equal(s.known_content_blockers.length, 1, 'signature dedupe still works');
  assert.deepEqual(validateOpsState(s), []);
  // A signature blocker must still skip incident creation (existing behavior).
  const skip = beginIncidentFlow(s, { list: () => [], create: () => true, remove: () => true }, {
    incidentId: 'INC-test', signature: 'Blog Factory Publish (2-article micro batch)::Assert clean state; report QA failures',
    nowEpochMs: Date.parse('2026-10-03T10:00:00Z')
  });
  assert.equal(skip.action, 'SKIP_BLOCKER', 'the runtime signature blocker still blocks incidents');
  const articleSide = beginIncidentFlow(s, { list: () => [], create: () => true, remove: () => true }, {
    incidentId: 'INC-test2', signature: 'Some Workflow::some step',
    nowEpochMs: Date.parse('2026-10-03T10:00:00Z')
  });
  assert.equal(articleSide.action, 'START', 'no blocker may suppress unrelated infra incidents');
});

// ---------------------------------------------------------------------------
// Generator regression: future LOCAL rows can never reintroduce unverified
// locality claims (this is how "ba Đình" / "Phố cổ" / "hồ Tây" got in).
// ---------------------------------------------------------------------------

test('localScope only ever emits canonical verified unit names (or nothing)', () => {
  const hn = JSON.parse(readFileSync(join(REPO, 'data/local/hanoi.json'), 'utf8'));
  const names = new Set(hn.units.map((u) => u.name));
  const probes = [
    'đi phố cổ bằng xe máy',
    'hồ tây và xe máy',
    'hoàng hôn hồ tây',
    'ba đình xe máy phượng',
    'đống đa và xe máy',
    'hai bà trưng hành trình',
    'thuê xe máy quanh long biên',
    'du lịch hoàn kiếm bằng xe máy',
    'cầu giấy đi xe máy',
    'tây hồ running route',
    'thanh xuân coffee ride',
    'chạy buổi sáng hồ gươm',
    'giao lưu xe máy gia lâm',
    'đường vành đai hà nội',
    ''
  ];
  for (const p of probes) {
    const claim = localScope(p);
    assert.ok(claim === '' || names.has(claim), `localScope(${JSON.stringify(p)}) = ${JSON.stringify(claim)} must be a verified unit or empty`);
  }
  // The exact historical regressions must stay dead:
  assert.equal(localScope('đi phố cổ bằng xe máy'), '');
  assert.equal(localScope('hồ tây và xe máy'), '');
  assert.equal(localScope('ba đình xe máy phượng'), 'Ba Đình');
  assert.equal(localScope('đống đa và xe máy'), 'Đống Đa');
  assert.equal(localScope('hai bà trưng hành trình'), 'Hai Bà Trưng');
  // The old fallback 'Hà Nội (khu vực)' failed the gate and must never return:
  assert.notEqual(localScope('some unmatched topic'), 'Hà Nội (khu vực)');
  assert.equal(localScope('some unmatched topic'), '');
});

// ---------------------------------------------------------------------------
// The owner stop is intact
// ---------------------------------------------------------------------------

test('production_enabled is still false (owner stop)', () => {
  assert.equal(state.production_enabled, false);
});

// ---------------------------------------------------------------------------
// No real incident, no lock, no production state was created
// ---------------------------------------------------------------------------

test('no active incident, no incident history, no mutation of production surfaces', () => {
  assert.equal(state.active_incident, null);
  assert.deepEqual(state.incidents, []);
  const blockers = JSON.stringify(state.known_content_blockers);
  assert.ok(!blockers.includes('body.html') && !blockers.includes('writer-work'),
    'no blocker entry carries a path into article bodies or writer branches');
});
