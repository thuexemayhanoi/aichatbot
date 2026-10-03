import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  repairForbiddenViolations, resumeDerivedAccepts, RESUME_DERIVED_ALLOWED
} from '../../tools/ops-agent.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(REPO, p), 'utf8');

const FALSE_BOUNDARY = 'git diff --name-only origin/main...HEAD | node tools/ops-agent.mjs guard';

/** The repair step of a workflow, isolated between its known neighbours. */
const repairBlock = (yml, startMark, endMark) => yml.slice(yml.indexOf(startMark), yml.indexOf(endMark));

const A4 = repairBlock(
  read('.github/workflows/ops-repair-agent.yml'),
  'Execute the ONE repair attempt', 'Post-push audit'
);
const A5 = repairBlock(
  read('.github/workflows/ops-supervisor.yml'),
  'Execute the ONE second-line repair attempt', 'Post-push audit'
);

/** Position helpers for ordering assertions inside a block. */
const first = (block, needle) => block.indexOf(needle);
const order = (block, before, after, label) =>
  assert.ok(first(block, before) >= 0 && first(block, after) >= 0 && first(block, before) < first(block, after),
    `${label}: "${before}" must run before "${after}"`);

// ---------------------------------------------------------------------------
// Required 1 & 2: forbidden article modification fails the guard BEFORE any
// commit/push — for BOTH repair agents
// ---------------------------------------------------------------------------

for (const [name, block] of [['Agent #4', A4], ['Agent #5', A5]]) {
  test(`${name}: BASE_SHA is anchored before the recipe runs`, () => {
    assert.ok(block.includes('BASE_SHA="$(git rev-parse HEAD)"'), 'base recorded pre-repair');
    order(block, 'BASE_SHA="$(git rev-parse HEAD)"', 'sh -c "${{ steps.diagnose.outputs.commands }}"', name);
  });

  test(`${name}: the scope guard gates the STAGED diff BEFORE commit and push (fail closed)`, () => {
    assert.ok(block.includes('git diff --cached --name-only | node tools/ops-agent.mjs guard'),
      'the primary boundary is the staged diff — exactly what the commit would contain');
    order(block, 'git diff --cached --name-only | node tools/ops-agent.mjs guard', 'git commit -m', `${name} staged guard precedes commit`);
    order(block, 'git diff --cached --name-only | node tools/ops-agent.mjs guard', 'git push', `${name} staged guard precedes push`);
    // A second, wider boundary: everything the repair touched vs BASE_SHA.
    assert.ok(block.includes('git diff --name-only "$BASE_SHA" | node tools/ops-agent.mjs guard'),
      'staged + unstaged changes vs BASE_SHA are guarded too');
    // The commit itself is proven clean before it is pushed.
    assert.ok(block.includes('git diff --name-only "$BASE_SHA"...HEAD | node tools/ops-agent.mjs guard'),
      'the committed range is guarded before push');
    order(block, 'git diff --name-only "$BASE_SHA"...HEAD | node tools/ops-agent.mjs guard', 'git push', `${name} commit-range guard precedes push`);
  });

  test(`${name}: staging is an explicit allowlist — never git add -A`, () => {
    assert.ok(!/^\s*git add -A/m.test(block), 'git add -A is forbidden in repair steps');
    assert.ok(!/^\s*git add \./m.test(block), 'whole-tree staging is forbidden');
    assert.ok(block.includes('git add docs/state/blog-factory.lock'),
      'CLEAR_RETIRED_LOCKFILE stages exactly the one retired file it removes');
  });

  test(`${name}: module level — a forbidden article body in the staged diff FAILS the guard`, () => {
    assert.deepEqual(
      repairForbiddenViolations(['data/blog/articles/ba-0012.body.html']),
      ['data/blog/articles/ba-0012.body.html']
    );
    // And a guard failure exits before commit/push is even reachable:
    // the workflow runs `set -e`, so a non-zero guard aborts the step —
    // proven by the ordering test above (guard < commit < push).
  });
}

// ---------------------------------------------------------------------------
// Required 3: assignment surfaces are blocked before push as well
// ---------------------------------------------------------------------------

test('assignment/active-work surfaces in the staged diff FAIL the guard before push', () => {
  assert.deepEqual(
    repairForbiddenViolations(['docs/state/writer-assignments.json', 'docs/state/active-work.json']).sort(),
    ['docs/state/active-work.json', 'docs/state/writer-assignments.json']
  );
  assert.deepEqual(
    repairForbiddenViolations(['writer-work/WRITER-BATCH-0001/A/chunk-01.json']),
    ['writer-work/WRITER-BATCH-0001/A/chunk-01.json']
  );
});

// ---------------------------------------------------------------------------
// Required 4: allowed state-only repairs still PASS
// ---------------------------------------------------------------------------

test('state-only repairs PASS the guard (maintenance state, retired lockfile, checkpoint)', () => {
  assert.deepEqual(repairForbiddenViolations([
    'docs/state/operations/maintenance.json',
    'docs/state/blog-factory.lock',
    'docs/state/blog-factory.checkpoint.json',
    'docs/state/operations/incident-reports/INC-x.md'
  ]), []);
});

// ---------------------------------------------------------------------------
// Required 5: RESUME_PENDING_TRANSACTION stages exactly the factory derived
// surface contract — and the workflow enforces it via --resume-derived
// ---------------------------------------------------------------------------

test('RESUME_PENDING_TRANSACTION allowlist = the factory derived/state surface contract', () => {
  for (const block of [A4, A5]) {
    const addAt = block.indexOf('git add data/blog/content-matrix.csv');
    assert.ok(addAt >= 0, 'the resume staging allowlist exists');
    const staged = block.slice(addAt, block.indexOf('2>/dev/null', addAt))
      .replace(/\\\n/g, ' ').split(/\s+/)
      .filter((p) => p && !p.startsWith('git') && !p.startsWith('add'));
    assert.ok(staged.length >= 8, 'the derived allowlist is explicit');
    for (const p of staged) {
      // `blog` is staged as a directory token; the contract keys it as `blog/`
      // (git reports individual files like blog/index.html in diffs, which the
      // guard checks directly).
      assert.ok(resumeDerivedAccepts(p) || RESUME_DERIVED_ALLOWED.includes(p + '/'),
        `staged ${p} must be inside RESUME_DERIVED_ALLOWED`);
    }
  }
});

test('guard --resume-derived flags anything outside the derived surface (both agents pass the flag)', () => {
  assert.ok(A4.includes('guard --resume-derived'), 'Agent #4 enforces the derived contract');
  assert.ok(A5.includes('guard --resume-derived'), 'Agent #5 enforces the derived contract');
  // Module level: every contract path is accepted, detours are not.
  for (const allowed of RESUME_DERIVED_ALLOWED) {
    assert.equal(resumeDerivedAccepts(allowed), true, `${allowed} is a derived surface`);
  }
  assert.equal(resumeDerivedAccepts('data/blog/articles/ba-0063.body.html'), false, 'article bodies are outside');
  assert.equal(resumeDerivedAccepts('tools/ops-agent.mjs'), false, 'tool edits are outside');
  assert.equal(resumeDerivedAccepts('tests/unit/ops-scope-guard.test.js'), false, 'test edits are outside');
  assert.equal(resumeDerivedAccepts('README.md'), false, 'doc edits are outside');
});

// ---------------------------------------------------------------------------
// Required 6: a post-push empty diff can NEVER be the guard (regression)
// ---------------------------------------------------------------------------

test('the false post-push boundary is GONE from both repair agents', () => {
  for (const f of ['.github/workflows/ops-repair-agent.yml', '.github/workflows/ops-supervisor.yml']) {
    const y = read(f);
    assert.ok(!y.includes(FALSE_BOUNDARY),
      `${f}: after a successful push origin/main...HEAD is empty by definition — it must never gate anything`);
  }
});

test('regression proof: an EMPTY diff always passes the module guard — which is exactly why it cannot be the boundary', () => {
  assert.deepEqual(repairForbiddenViolations([]), [], 'empty input passes (that is the trap)');
  assert.deepEqual(repairForbiddenViolations(['']), [], 'blank lines pass too');
  // Therefore the workflow must measure against BASE_SHA + the staged diff.
  assert.ok(A4.includes('"$BASE_SHA"') && A5.includes('"$BASE_SHA"'), 'both agents anchor on the pre-repair BASE_SHA');
});

// ---------------------------------------------------------------------------
// Required 9 & 10: this change touches no article surface, no incident
// ---------------------------------------------------------------------------

test('the guard fix itself contains no article writes, incidents or production triggers', () => {
  for (const f of ['.github/workflows/ops-repair-agent.yml', '.github/workflows/ops-supervisor.yml']) {
    const y = read(f);
    assert.ok(!y.includes('gen-blog-matrix'), f);
    assert.ok(!y.includes('publish-chunk'), f);
    const pushes = y.split('\n').filter((l) => l.trim().startsWith('git push'));
    for (const l of pushes) {
      assert.ok(!l.includes('refs/heads/writer'), 'no writer branch is ever pushed');
    }
  }
});
