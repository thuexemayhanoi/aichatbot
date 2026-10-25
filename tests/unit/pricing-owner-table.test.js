import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricing, business } from '../helpers/load-data.js';
import { estimatePrice } from '../../src/utils/estimate.js';

/**
 * The owner's verified price + deposit table (Cho Thuê Xe Máy Nguyễn Tú,
 * VNĐ). data/business/pricing.json must hold exactly this; null = not
 * published ("Liên hệ"). Rent and deposit are separate amounts. Every
 * surface (price page, chatbot, calculator, placeholders, schema) reads
 * pricing.json, so this one table pins them all.
 */
const L = null; // "Liên hệ" / not published
const OWNER_TABLE = {
  'honda-wave': { name: 'Honda Wave', day: [150000, 150000], week: [700000, 700000], month: [900000, 1200000], deposit: [2000000, 3000000] },
  'honda-vision': { name: 'Honda Vision', day: [200000, 200000], week: [1000000, 1000000], month: [1800000, 2000000], deposit: [4000000, 5000000] },
  'honda-airblade': { name: 'Honda Air Blade', day: [200000, 200000], week: [1000000, 1000000], month: [1500000, 1500000], deposit: [3000000, 3000000] },
  'honda-click': { name: 'Honda Click / Yamaha Mio', day: [150000, 150000], week: [700000, 700000], month: [900000, 1200000], deposit: [2000000, 2000000] },
  'xe-50cc': { name: 'Xe tay ga 50cc', day: [200000, 200000], week: [L, L], month: [L, L], deposit: [4000000, 4000000] },
  'electric-bike': { name: 'Xe máy điện', day: [L, L], week: [L, L], month: [L, L], deposit: [L, L] },
  'electric-scooter': { name: 'Xe đạp điện', day: [L, L], week: [L, L], month: [L, L], deposit: [L, L] }
};
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const vnd = (v) => v.toLocaleString('vi-VN') + 'đ';
const cell = ([min, max]) => (min === null ? 'Liên hệ' : min === max ? vnd(min) : `${vnd(min)} – ${vnd(max)}`);

test('pricing.json holds exactly the owner table (rates, deposits, nothing extra)', () => {
  assert.deepEqual(pricing.vehicles.map((v) => v.id), Object.keys(OWNER_TABLE), 'same vehicles, same order');
  for (const v of pricing.vehicles) {
    const row = OWNER_TABLE[v.id];
    assert.equal(v.name, row.name, `${v.id}: name`);
    for (const unit of ['day', 'week', 'month']) {
      assert.deepEqual([v.rates[unit].min, v.rates[unit].max], row[unit], `${v.id}: ${unit}`);
    }
    assert.deepEqual([v.deposit.min, v.deposit.max], row.deposit, `${v.id}: deposit (separate from the rent)`);
    if (row.deposit[0] === null) assert.match(v.deposit_note, /theo mẫu xe/, `${v.id}: deposit confirmed per model`);
  }
});

test('the 50cc entry is the scooter, kept apart from other 50cc vehicles', () => {
  const v = pricing.vehicles.find((x) => x.id === 'xe-50cc');
  assert.equal(v.category, 'Xe tay ga 50cc');
  assert.ok(v.aliases.includes('Xe tay ga 50cc'));
  assert.ok(!pricing.vehicles.some((x) => x.id !== 'xe-50cc' && /50\s*cc/i.test(`${x.name} ${x.category}`)), 'no second 50cc entry');
});

test('the deposit policy covers exactly the per-vehicle range and stays separate from the rent', () => {
  const deposits = pricing.vehicles.flatMap((v) => [v.deposit.min, v.deposit.max]).filter(Number.isFinite);
  assert.equal(business.policies.deposit.min, Math.min(...deposits));
  assert.equal(business.policies.deposit.max, Math.max(...deposits));
  assert.match(business.policies.deposit.note, /khoản riêng/);
  assert.doesNotMatch(business.policies.deposit.note, /không cần cọc|miễn cọc/i);
});

test('a week or month without a published rate is never derived from the day rate', () => {
  for (const v of pricing.vehicles) {
    if (v.rates.week.min === null) assert.equal(estimatePrice(v, 7), null, `${v.id}: 7 days = Liên hệ`);
    if (v.rates.month.min === null && v.rates.week.min === null) assert.equal(estimatePrice(v, 30), null, `${v.id}: 30 days = Liên hệ`);
  }
});

test('/gia-thue/ renders every cell of the owner table, deposit as its own column, unknowns as "Liên hệ"', () => {
  const html = read('gia-thue/index.html');
  assert.match(html, /<th scope="col">Tiền cọc<\/th>/, 'deposit column');
  for (const row of Object.values(OWNER_TABLE)) {
    const tr = new RegExp(`<th scope="row">${row.name.replace(/[/]/g, '\\/')}<span[^>]*>[^<]*</span></th>\\s*([\\s\\S]*?)</tr>`).exec(html);
    assert.ok(tr, `${row.name}: row present`);
    const cells = [...tr[1].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((m) => m[1]);
    const depositCell = row.deposit[0] === null ? 'Xác nhận theo mẫu xe' : cell(row.deposit);
    assert.deepEqual(cells, [cell(row.day), cell(row.week), cell(row.month), depositCell], `${row.name}: cells`);
  }
  assert.ok(!/\b0đ\b/.test(html), 'never 0đ');
});

test('NAP matches the owner data everywhere it is declared', () => {
  assert.equal(business.display_name, 'Cho Thuê Xe Máy Nguyễn Tú');
  assert.equal(business.gbp_name, 'Thuê xe máy ở Hà Nội - Nguyễn Tú');
  assert.equal(`${business.address.full}, ${business.address.country}`, '112 Nguyễn Văn Cừ, Bồ Đề, Long Biên, Hà Nội, Việt Nam');
  assert.equal(business.contact.phone_display, '0942 467 674');
  assert.equal(business.contact.phone_uri, 'tel:+84942467674');
  assert.equal(business.contact.whatsapp, 'https://wa.me/84942467674');
  assert.equal(business.contact.maps, 'https://maps.google.com/maps?cid=7448790013669858019');
  assert.equal(business.url, 'https://thuexemaynguyentu.com/');
  assert.deepEqual([business.hours.open, business.hours.close], ['09:00', '21:00']);
  const ld = [...read('lien-he/index.html').matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1])).find((d) => d['@type'] === 'AutoRental');
  assert.equal(ld.name, business.display_name);
  assert.equal(ld.alternateName, business.gbp_name);
  assert.equal(ld.telephone, '+84942467674');
  assert.equal(ld.hasMap, business.contact.maps);
  assert.deepEqual([ld.openingHoursSpecification[0].opens, ld.openingHoursSpecification[0].closes], ['09:00', '21:00']);
});
