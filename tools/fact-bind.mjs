#!/usr/bin/env node
/**
 * FACT BINDING (v75) — "sửa 1 chỗ, toàn blog đồng bộ" for shop facts in prose.
 *
 * Bodies state shop facts through placeholders only (docs/ARTICLE-RULES.md):
 * {{ business.* }} from data/business/business.json and
 * {{ price.<vehicle-id>.<day|week|month>.<min|max> }} from pricing.json.
 * This tool finds literal copies of the CURRENT verified values in text
 * nodes and swaps each for the placeholder that renders the SAME text, so the
 * next change of a phone, address, opening hours, deposit or rental rate
 * reaches every article on the next build.
 *
 * Safety:
 *   - a body is rewritten only when resolveFacts(new) === resolveFacts(old)
 *     byte for byte: readers, search engines and the Agent see no change —
 *     a storage refactor, not a content edit (no review log, no dateModified);
 *   - text nodes only (never attributes, hrefs or existing placeholders);
 *   - a price binds only when it is followed by /ngày, /tuần or /tháng AND
 *     equals pricing.json for ITS vehicle: the one named right after it
 *     ("200.000đ/ngày cho Honda Vision"), else the one named last before it
 *     in the same sentence (a sentence end, a new block, a category word such
 *     as "xe ga" or another vehicle ends that scope). Every other attributed
 *     price is left untouched and listed as a mismatch for the owner —
 *     prices are never guessed. Binding is idempotent (a second run binds 0).
 *
 * Usage:
 *   node tools/fact-bind.mjs check     # counts + price mismatches, writes nothing
 *   node tools/fact-bind.mjs apply     # rewrite bodies (render-identical only)
 * Also used by tools/article-qa.mjs (warning `facts-as-placeholders`).
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRICING, resolveFacts } from './blog-components.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BODY_DIRS = ['data/blog/articles', 'data/site', 'data/legal'];
const UNIT = { ngày: 'day', tuần: 'week', tháng: 'month' };
const AMOUNT = String.raw`\d{1,3}(?:\.\d{3})+`;
const SEP = String.raw`\s*(?:–|—|-|đến|tới)\s*`;
const vnd = (n) => n.toLocaleString('vi-VN') + 'đ';
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Plain literal → placeholder rules, derived from the CURRENT data (longest first). */
function literalRules(business) {
  const { contact, address, hours, policies } = business;
  const rules = [
    [address.full, '{{ business.address.full }}'],
    [business.display_name, '{{ business.display_name }}'],
    [address.street, '{{ business.address.street }}'],
    [contact.phone_display, '{{ business.contact.phone_display }}'],
    [contact.phone, '{{ business.contact.phone }}'],
    [hours.display, '{{ business.hours.display }}']
  ].filter(([literal]) => typeof literal === 'string' && literal.length >= 5);
  const pairs = [
    [hours.open, hours.close, '{{ business.hours.open }}', '{{ business.hours.close }}'],
    [vnd(policies.deposit.min), vnd(policies.deposit.max), '{{ business.policies.deposit.min | vnd }}', '{{ business.policies.deposit.max | vnd }}']
  ];
  return { rules: rules.sort((a, b) => b[0].length - a[0].length), pairs };
}

/** Vehicle aliases (longest first) and category words that end an attribution. */
function vehicleIndex(pricing) {
  const aliases = pricing.vehicles.flatMap((v) => [v.name, ...(v.aliases ?? [])].map((a) => [a, v.id]));
  const resets = Object.entries(pricing.category_aliases ?? {}).flatMap(([cat, list]) => [cat, ...list])
    .concat(pricing.vehicles.map((v) => v.category)).filter(Boolean);
  const words = [...new Set([...aliases.map(([a]) => a), ...resets])].sort((a, b) => b.length - a.length);
  const byAlias = new Map(aliases.map(([a, id]) => [a.toLowerCase(), id]));
  const alt = words.map(reEscape).join('|');
  return {
    re: new RegExp(`(?<![\\p{L}\\d])(${alt})(?![\\p{L}\\d])`, 'giu'),
    // "… /ngày cho (xe) Honda Vision": the vehicle named right after a price owns it.
    after: new RegExp(`^\\s*(?:cho|với|của|đối với)\\s+(?:xe\\s+)?(${alt})(?![\\p{L}\\d])`, 'iu'),
    byAlias
  };
}

const BLOCK_TAG = /^<\/?(p|li|tr|h[1-6]|ul|ol|table|thead|tbody|blockquote|div|section|figure|details|summary)\b|^<br\b/i;

/**
 * Bind literal facts in one body. Returns { html, bound, mismatches } where
 * `bound` counts replacements and `mismatches` lists attributed prices that
 * differ from pricing.json ({ vehicle, unit, found, expected }).
 */
export function bindFacts(html, business, pricing = PRICING) {
  const { rules, pairs } = literalRules(business);
  const vehicles = vehicleIndex(pricing);
  const rate = (id, unit) => pricing.vehicles.find((v) => v.id === id)?.rates?.[unit] ?? null;
  const priceRe = new RegExp(`(${AMOUNT})đ(?:(${SEP})(${AMOUNT})đ)?(\\s*\\/\\s*)(ngày|tuần|tháng)`, 'g');
  let bound = 0;
  const mismatches = [];
  let vehicle = null; // the vehicle named last in the current sentence

  const bindText = (text) => {
    // Leave existing placeholders exactly as they are.
    return text.split(/(\{\{[^}]*\}\})/).map((part) => {
      if (part.startsWith('{{')) return part;
      let out = part;
      for (const [literal, placeholder] of rules) {
        const n = out.split(literal).length - 1;
        if (n) { out = out.split(literal).join(placeholder); bound += n; }
      }
      for (const [a, b, pa, pb] of pairs) {
        out = out.replace(new RegExp(`${reEscape(a)}(${SEP})${reEscape(b)}`, 'g'), (m, sep) => { bound++; return `${pa}${sep}${pb}`; });
      }
      // Prices: walk vehicle mentions and price expressions in reading order.
      const events = [
        ...[...out.matchAll(/[.!?…](?=\s|$)/g)].map((m) => ({ at: m.index, kind: 'stop', m })),
        ...[...out.matchAll(vehicles.re)].map((m) => ({ at: m.index, kind: 'vehicle', m })),
        ...[...out.matchAll(priceRe)].map((m) => ({ at: m.index, kind: 'price', m }))
      ].sort((x, y) => x.at - y.at);
      let result = '', last = 0;
      for (const e of events) {
        if (e.kind === 'stop') { vehicle = null; continue; }
        if (e.kind === 'vehicle') { vehicle = vehicles.byAlias.get(e.m[1].toLowerCase()) ?? null; continue; }
        const [whole, lo, sep, hi, slash, unitWord] = e.m;
        const unit = UNIT[unitWord];
        const after = vehicles.after.exec(out.slice(e.at + whole.length, e.at + whole.length + 40));
        const owner = after ? vehicles.byAlias.get(after[1].toLowerCase()) ?? null : vehicle;
        const r = owner ? rate(owner, unit) : null;
        const context = out.slice(Math.max(0, e.at - 70), e.at + whole.length + 30).replace(/\s+/g, ' ').trim();
        if (!owner || !r) continue;
        const loN = Number(lo.replace(/\./g, '')), hiN = hi ? Number(hi.replace(/\./g, '')) : null;
        let replacement = null;
        if (hiN !== null) {
          if (loN === r.min && hiN === r.max) replacement = `{{ price.${owner}.${unit}.min }}${sep}{{ price.${owner}.${unit}.max }}${slash}${unitWord}`;
        } else if (loN === r.min) replacement = `{{ price.${owner}.${unit}.min }}${slash}${unitWord}`;
        else if (loN === r.max) replacement = `{{ price.${owner}.${unit}.max }}${slash}${unitWord}`;
        if (replacement === null) {
          if (Number.isFinite(r.min)) mismatches.push({ vehicle: owner, unit, found: whole.replace(/\s+/g, ' '), expected: r.min === r.max ? vnd(r.min) : `${vnd(r.min)}–${vnd(r.max)}`, context });
          continue;
        }
        result += out.slice(last, e.at) + replacement;
        last = e.at + whole.length;
        bound += hiN !== null ? 2 : 1;
      }
      return result + out.slice(last);
    }).join('');
  };

  const out = html.split(/(<[^>]+>)/g).map((seg) => {
    if (seg.startsWith('<')) {
      if (BLOCK_TAG.test(seg)) vehicle = null;
      return seg;
    }
    return bindText(seg);
  }).join('');
  return { html: out, bound, mismatches };
}

/** Every body file the build renders through resolveFacts. */
export function bodyFiles(root = ROOT) {
  return BODY_DIRS.flatMap((dir) => readdirSync(join(root, dir)).filter((f) => f.endsWith('.body.html')).sort().map((f) => `${dir}/${f}`));
}

export function run(mode, root = ROOT) {
  const business = JSON.parse(readFileSync(join(root, 'data/business/business.json'), 'utf8'));
  const totals = { files: 0, changed: 0, bound: 0, mismatches: [] };
  for (const file of bodyFiles(root)) {
    const html = readFileSync(join(root, file), 'utf8');
    const res = bindFacts(html, business);
    totals.files++;
    for (const m of res.mismatches) totals.mismatches.push({ file, ...m });
    if (!res.bound) continue;
    if (resolveFacts(res.html, business) !== resolveFacts(html, business)) throw new Error(`${file}: binding would change the rendered text — refused`);
    totals.changed++;
    totals.bound += res.bound;
    if (mode === 'apply') writeFileSync(join(root, file), res.html, 'utf8');
  }
  return totals;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const mode = process.argv[2];
  if (!['check', 'apply'].includes(mode)) {
    console.error('usage: node tools/fact-bind.mjs check|apply');
    process.exit(2);
  }
  const t = run(mode);
  console.log(`${mode}: ${t.files} bodies, ${t.changed} ${mode === 'apply' ? 'rewritten' : 'to bind'}, ${t.bound} literal facts${mode === 'apply' ? ' bound' : ''}`);
  console.log(`price mismatches (left as written, owner review): ${t.mismatches.length}`);
  for (const m of t.mismatches.slice(0, 40)) console.log(`  ${m.file}: ${m.vehicle} ${m.unit} "${m.found}" ≠ pricing.json ${m.expected}\n      … ${m.context}`);
  if (mode === 'check' && t.changed) process.exitCode = 1;
}
