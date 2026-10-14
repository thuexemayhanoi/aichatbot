/**
 * Internal-link planner (v70 SEO master) — deterministic, no I/O.
 *
 * Replaces the v58 "related articles" pick, which sorted every candidate
 * by article ID: in the 2,000-article corpus 1,912 articles never appeared
 * in any related block while five LOCAL articles received ~400 related links
 * each, and 524 articles were reachable only through deep hub pagination.
 *
 * Model: Pillar → Topic cluster → Supporting articles.
 *   family  = articles generated from the same topic SEED (see
 *             tools/seo-meta.mjs topicFamily); the bare seed is the pillar.
 *             Every family member links to every other member.
 *   related = the most topically similar NON-family articles (seed keyword
 *             overlap, subtopic, category, cluster, local scope), assigned
 *             round-robin with an inbound cap so links spread across the
 *             corpus instead of piling onto the lowest IDs. A final repair
 *             pass guarantees every article at least one inbound article link.
 */
import { topicFamily } from './seo-meta.mjs';

// Diacritics are KEPT: stripping them merges distinct Vietnamese words
// (chợ/cho, bão/bao, mài/mai), which made unrelated topics look identical.
const STOP = new Set(['thuê', 'xe', 'máy', 'cho', 'và', 'của', 'khi', 'theo', 'với', 'các', 'những', 'một',
  'là', 'có', 'không', 'gì', 'nào', 'thế', 'bằng', 'trong', 'tại', 'đi', 'ở', 'nên', 'cần', 'hay', 'về', 'từ',
  'đến', 'như', 'để', 'được', 'bạn', 'hà', 'nội', 'năm', 'bao', 'nhiêu', 'làm', 'sao', 'nhất']);
/** Intent markers that separate question/angle variants of one entity. */
const INTENT_KEEP = new Set(['không', 'gì', 'nào', 'khi', 'cần', 'bao', 'nhiêu', 'sao', 'thế', 'hay']);

const syllables = (text) => String(text ?? '').toLowerCase().normalize('NFC').split(/[^0-9a-zà-ỹđ]+/u).filter(Boolean);
function gramSet(syl) {
  const set = new Set(syl);
  for (let i = 0; i < syl.length - 1; i++) set.add(`${syl[i]} ${syl[i + 1]}`);
  return set;
}
/** Topical unigram + bigram token set of a keyword phrase (stop syllables removed). */
export function grams(text) {
  return gramSet(syllables(text).filter((s) => !STOP.has(s)));
}
/** Like grams() but keeps question/intent markers — used to detect two
 *  keywords that target the SAME query (cannibalization), not just one topic. */
export function intentGrams(text) {
  return gramSet(syllables(text).filter((s) => !STOP.has(s) || INTENT_KEEP.has(s)));
}

const weight = (g) => (g.includes(' ') ? 2 : 1);
function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0, wa = 0, wb = 0;
  for (const g of a) { wa += weight(g); if (b.has(g)) inter += weight(g); }
  for (const g of b) wb += weight(g);
  return inter / Math.sqrt(wa * wb);
}

/**
 * @param {object[]} articles  effective published articles (article_id, category, seo_keyword)
 * @param {object}   rows      { article_id -> matrix row }
 * @param {object}   o
 * @param {(cat:string,row:object)=>{code:string,fallback:boolean}} o.subtopicOf
 * @param {(cat:string)=>string} o.clusterOf
 * @param {number}  [o.limit=5]   related links per article
 * @param {number}  [o.cap]       max related inbound per article (default limit + 3)
 * @returns {Map<string,{family:string[],related:string[],pillar:string|null,familyKey:string}>}
 */
export function planLinks(articles, rows, { subtopicOf, clusterOf, limit = 5, cap = limit + 3 }) {
  const list = [...articles].sort((a, b) => a.article_id.localeCompare(b.article_id));
  const info = new Map();
  const families = new Map();
  for (const a of list) {
    const row = rows[a.article_id] ?? {};
    const fam = topicFamily(a.category, row.primary_keyword || a.seo_keyword || a.title);
    const sub = subtopicOf(a.category, row);
    info.set(a.article_id, {
      a, fam, row,
      sub: sub.fallback ? null : `${a.category}:${sub.code}`,
      cluster: clusterOf(a.category),
      local: (row.local_scope || '').trim().toLowerCase(),
      tokens: grams(`${fam.seed} ${a.seo_keyword ?? ''}`)
    });
    if (!families.has(fam.key)) families.set(fam.key, []);
    families.get(fam.key).push(a.article_id);
  }
  for (const ids of families.values()) {
    ids.sort((x, y) => info.get(x).fam.order - info.get(y).fam.order || x.localeCompare(y));
  }

  const score = (x, y) => {
    let s = 10 * similarity(x.tokens, y.tokens);
    if (x.sub && x.sub === y.sub) s += 3;
    if (x.a.category === y.a.category) s += 2;
    if (x.cluster === y.cluster) s += 1;
    if (x.local && x.local === y.local) s += 2;
    if (x.fam.variant && x.fam.variant === y.fam.variant) s += 0.5;
    if (y.fam.order === 0) s += 0.5; // prefer linking other topic pillars
    return s;
  };

  // Top candidates per article (outside its own family), best first.
  const TOP = 150;
  const candidates = new Map();
  for (const a of list) {
    const x = info.get(a.article_id);
    const scored = [];
    for (const b of list) {
      if (b.article_id === a.article_id) continue;
      const y = info.get(b.article_id);
      if (y.fam.key === x.fam.key) continue;
      scored.push({ id: b.article_id, s: score(x, y) });
    }
    scored.sort((p, q) => q.s - p.s || p.id.localeCompare(q.id));
    candidates.set(a.article_id, scored.slice(0, TOP));
  }

  // Round-robin assignment under the inbound cap, at most two picks from
  // any one other family (topical breadth instead of four near-twins).
  const inbound = new Map(list.map((a) => [a.article_id, 0]));
  const picks = new Map(list.map((a) => [a.article_id, []]));
  const famKey = (id) => info.get(id).fam.key;
  const PER_FAMILY = 2;
  for (let round = 0; round < limit; round++) {
    for (const a of list) {
      const chosen = picks.get(a.article_id);
      const cands = candidates.get(a.article_id);
      const fresh = (c) => !chosen.includes(c.id)
        && chosen.filter((id) => famKey(id) === famKey(c.id)).length < PER_FAMILY;
      const next = cands.find((c) => fresh(c) && inbound.get(c.id) < cap)
        ?? cands.find((c) => fresh(c));
      if (!next) continue;
      chosen.push(next.id);
      inbound.set(next.id, inbound.get(next.id) + 1);
    }
  }

  // Repair: an article with no family siblings and no related inbound gets
  // linked from its best-matching source, replacing that source's pick with
  // the most surplus inbound (never dropping a pick to zero inbound).
  for (const a of list) {
    const id = a.article_id;
    if (families.get(info.get(id).fam.key).length > 1 || inbound.get(id) > 0) continue;
    const sources = list
      .filter((s) => s.article_id !== id && info.get(s.article_id).fam.key !== info.get(id).fam.key)
      .map((s) => ({ sid: s.article_id, s: score(info.get(s.article_id), info.get(id)) }))
      .sort((p, q) => q.s - p.s || p.sid.localeCompare(q.sid));
    for (const { sid } of sources) {
      const chosen = picks.get(sid);
      const victim = [...chosen].filter((p) => inbound.get(p) > 2)
        .sort((p, q) => inbound.get(q) - inbound.get(p) || q.localeCompare(p))[0];
      if (!victim) continue;
      chosen[chosen.indexOf(victim)] = id;
      inbound.set(victim, inbound.get(victim) - 1);
      inbound.set(id, 1);
      break;
    }
  }

  const plan = new Map();
  for (const a of list) {
    const x = info.get(a.article_id);
    const fam = families.get(x.fam.key);
    const pillar = fam.find((id) => info.get(id).fam.order === 0) ?? null;
    plan.set(a.article_id, {
      familyKey: x.fam.key,
      pillar,
      family: fam.filter((id) => id !== a.article_id),
      related: picks.get(a.article_id)
    });
  }
  return plan;
}
