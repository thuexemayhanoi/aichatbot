/**
 * Shared taxonomy model for the 2,000-article blog (v56 foundation).
 *
 * Single source of truth: data/blog/taxonomy.json (clusters + 6 canonical
 * categories + subtopics) and config/navigation.json (menu/footer vocabulary).
 * The content-matrix CSV schema is NOT modified: every derived field
 * (parent_cluster, subtopic_code, subtopic_label, hub_url, ...) is computed
 * deterministically from the matrix row here, so article #37, #500 and #2000
 * all land in the right place automatically when the factory publishes them.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const taxonomy = JSON.parse(readFileSync(join(ROOT, 'data/blog/taxonomy.json'), 'utf8'));
export const navigation = JSON.parse(readFileSync(join(ROOT, 'config/navigation.json'), 'utf8'));

export const CLUSTER_BY_ID = Object.fromEntries(taxonomy.clusters.map((c) => [c.id, c]));
export const CATEGORY_IDS = Object.freeze(Object.keys(taxonomy.categories));

/** Vietnamese-safe slug: strip diacritics, keep [a-z0-9-]. */
export function viSlug(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function norm(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

/**
 * Deterministically derive the subtopic of a matrix row (or published
 * article) from its keywords/slug. First matching subtopic in taxonomy
 * order wins; rows matching nothing fall back to the general "Tổng quan"
 * pseudo-subtopic which never gets its own hub page.
 */
export function deriveSubtopic(categoryId, row) {
  const subtopics = taxonomy.subtopics[categoryId] ?? [];
  const haystack = norm([row.primary_keyword, row.secondary_keywords, row.slug, row.working_title].filter(Boolean).join(' '));
  for (const s of subtopics) {
    for (const m of s.match) {
      if (haystack.includes(norm(m))) {
        return { code: s.code, label: s.label, slug: s.slug, fallback: false };
      }
    }
  }
  return { code: 'CHUNG', label: 'Tổng quan', slug: null, fallback: true };
}

/** Full deterministic taxonomy fields for one matrix row. */
export function deriveArticleTaxonomy(categoryId, row) {
  const cat = taxonomy.categories[categoryId];
  if (!cat) throw new Error(`unknown category: ${categoryId}`);
  return {
    category_code: categoryId,
    parent_cluster: cat.cluster,
    cluster_label: CLUSTER_BY_ID[cat.cluster].name,
    subtopic: deriveSubtopic(categoryId, row),
    hub_url: `/aichatbot/blog/${cat.dir}/`,
    subtopic_hub_url: null // resolved by the builder only for real hub pages
  };
}

/** Category navigation card (short label + canonical URL). */
export function categoryNav(categoryId) {
  const item = navigation.categories.find((c) => c.id === categoryId);
  if (!item) throw new Error(`unknown category in navigation.json: ${categoryId}`);
  const cat = taxonomy.categories[categoryId];
  return { ...item, dir: cat.dir, cluster: cat.cluster };
}
