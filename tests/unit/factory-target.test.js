import test from 'node:test';
import assert from 'node:assert/strict';
import { publicationBudget, readPublicationBudget } from '../../tools/factory-target.mjs';

const corpus = (n) => {
  const rows = Array.from({ length: n }, (_, i) => ({ article_id: `BA-${i}`, slug: `article-${i}`, status: 'PUBLISHED' }));
  return [rows, rows.map((r) => ({ article_id: r.article_id, slug: r.slug }))];
};

test('the final reservation cannot overshoot 2000 and completion requires exactly 2000 publications', () => {
  for (const n of [0, 304, 1990, 1998, 1999, 2000]) {
    const budget = publicationBudget(...corpus(n));
    assert.equal(budget.remaining, 2000 - n);
    assert.equal(budget.complete, n === 2000);
    assert.ok(n + Math.min(18, budget.remaining) <= 2000);
  }
  assert.throws(() => publicationBudget(...corpus(2001)), /target exceeded/);
});

test('duplicate or missing publication evidence fails closed rather than counting toward completion', () => {
  const [rows, entries] = corpus(2);
  assert.throws(() => publicationBudget([rows[0], { ...rows[1], slug: rows[0].slug }], entries), /duplicate/);
  assert.throws(() => publicationBudget(rows, [entries[0], entries[0]]), /evidence/);
  assert.throws(() => publicationBudget(rows, [{ ...entries[0], slug: 'wrong' }, entries[1]]), /evidence/);
  assert.throws(() => publicationBudget(rows, [...entries, { article_id: 'ghost', slug: 'ghost' }]), /counts disagree/);
});

test('real repository target inspection is read-only and consistent with publication truth', () => {
  const budget = readPublicationBudget();
  assert.ok(budget.published >= 304 && budget.published <= 2000);
  assert.equal(budget.remaining + budget.published, budget.target);
});
