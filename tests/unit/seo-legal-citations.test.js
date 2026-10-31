/**
 * v74 Legal citation freshness: the registry data/seo/legal-documents.json
 * must be well-formed and complete for every document the published bodies
 * cite; citations are classified from their own sentence; every article the
 * report lists as citing a superseded document as the rule in force carries a
 * content flag (engine 06 stops pushing keywords to it until it is fixed).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { analyse, build, classify, citeKey, loadRegistry, scan, STATUSES, EVIDENCE, REGISTRY, OUT_DIR, OUT_MD, OUT_JSON } from '../../tools/seo-legal-citations.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const CITE_KEY = /^(bộ luật|luật|nghị định|thông tư|quyết định|nghị quyết|chỉ thị)\|\d{1,4}\/(\d{4}|ct-ttg)$/;

test('registry: unique ids, well-formed cite keys, known status/evidence, replacement chains resolve, facts exist', () => {
  const { reg, byId } = loadRegistry(ROOT);
  const facts = JSON.parse(read('data/seo/legal-facts.json')).facts;
  assert.equal(reg.$schema, 'motoai/legal-documents@1');
  assert.match(reg.checked, /^\d{4}-\d{2}-\d{2}$/);
  for (const d of reg.documents) {
    assert.match(d.id, /^[a-z0-9-]+$/, `${d.id}: id`);
    assert.ok(d.title && d.issuer, `${d.id}: title + issuer`);
    assert.ok(STATUSES.includes(d.status), `${d.id}: status ${d.status}`);
    assert.ok(EVIDENCE.includes(d.evidence), `${d.id}: evidence ${d.evidence}`);
    for (const c of d.cite ?? []) assert.match(c, CITE_KEY, `${d.id}: cite ${c}`);
    assert.ok((d.cite?.length || d.names?.length), `${d.id}: needs cite keys or names`);
    if (d.status === 'replaced') { assert.ok(byId.has(d.replaced_by), `${d.id}: replaced_by`); assert.notEqual(byId.get(d.replaced_by).status, 'replaced' === d.id, 'chain'); }
    if (d.status === 'amended') assert.ok(byId.has(d.amended_by) && d.amended_from, `${d.id}: amended_by + amended_from`);
    if (d.amendment_checked) { assert.match(d.amendment_checked, /^\d{4}-\d{2}-\d{2}$/, `${d.id}: amendment_checked date`); assert.ok(d.evidence === 'fulltext' && byId.get(d.amended_by)?.evidence === 'fulltext', `${d.id}: amendment checked only against both full texts`); }
    if (d.evidence === 'fulltext') { assert.ok(d.facts?.length, `${d.id}: fulltext evidence names its verified facts`); for (const f of d.facts) assert.ok(facts[f], `${d.id}: fact ${f} in legal-facts.json`); }
    if (d.evidence === 'reported') assert.ok(d.sources?.length, `${d.id}: reported evidence names its sources`);
    for (const s of d.sources ?? []) assert.match(s, /^https:\/\//, `${d.id}: source url`);
    for (const dt of [d.issued, d.effective, d.replaced_from, d.amended_from]) if (dt != null) assert.match(dt, /^\d{4}-\d{2}-\d{2}$/, `${d.id}: date ${dt}`);
  }
});

test('classify: the replaced document in a sentence is HISTORICAL, the replacing one CURRENT', () => {
  const at = (s, needle) => [s.toLowerCase(), s.toLowerCase().indexOf(needle)];
  assert.equal(classify(...at('Nghị định 168/2024/NĐ-CP thay thế Nghị định 100/2019/NĐ-CP ở phần xử phạt.', 'nghị định 168')), 'CURRENT');
  assert.equal(classify(...at('Nghị định 168/2024/NĐ-CP thay thế Nghị định 100/2019/NĐ-CP ở phần xử phạt.', 'nghị định 100')), 'HISTORICAL');
  assert.equal(classify(...at('Nghị định 03/2021/NĐ-CP đã được thay thế bởi Nghị định 67/2023/NĐ-CP.', 'nghị định 03')), 'HISTORICAL');
  assert.equal(classify(...at('Nghị định 03/2021/NĐ-CP đã được thay thế bởi Nghị định 67/2023/NĐ-CP.', 'nghị định 67')), 'CURRENT');
  assert.equal(classify(...at('Theo quy định trước đây tại Thông tư 46/2012/TT-BGTVT, xe từ 175 cm³ cần hạng A2.', 'thông tư 46')), 'HISTORICAL');
  assert.equal(classify(...at('Trước đó, khung chính là Nghị định 13/2023/NĐ-CP áp dụng từ 01/7/2023.', 'nghị định 13')), 'HISTORICAL');
  assert.equal(classify(...at('Các bài dẫn Nghị định 100/2019/NĐ-CP cho lỗi gương đã hết hiệu lực từ 01/01/2025.', 'nghị định 100')), 'HISTORICAL');
  assert.equal(classify(...at('Theo Thông tư 24/2023/TT-BCA của Bộ Công an, người mua kê khai giấy khai đăng ký xe.', 'thông tư 24')), 'CURRENT');
  assert.equal(classify(...at('Mức phạt theo Nghị định 168/2024/NĐ-CP là 4.000.000 đồng đến 6.000.000 đồng.', 'nghị định 168')), 'CURRENT');
  assert.equal(citeKey('Luật', '36', '2024'), 'luật|36/2024');
  assert.equal(citeKey('Chỉ thị', '20', 'CT-TTg'), 'chỉ thị|20/ct-ttg');
});

test('sandbox scan: superseded-as-current, wrong symbol, name citations and unknown documents are reported', () => {
  const root = mkdtempSync(join(tmpdir(), 'motoai-legal-'));
  mkdirSync(join(root, 'data/blog/articles'), { recursive: true });
  mkdirSync(join(root, 'data/seo'), { recursive: true });
  writeFileSync(join(root, REGISTRY), read(REGISTRY));
  const body = (slug, html) => { writeFileSync(join(root, `data/blog/articles/${slug}.body.html`), html); return `data/blog/articles/${slug}.body.html`; };
  const articles = [
    { article_id: 'BA-0001', category: 'SAFE', slug: 'a', body: body('a', '<p>Theo Thông tư 24/2023/TT-BCA của Bộ Công an, người mua kê khai giấy khai. Nghị định 168/2024/NĐ-CP thay thế Nghị định 100/2019/NĐ-CP.</p>') },
    { article_id: 'BA-0002', category: 'SAFE', slug: 'b', body: body('b', '<p>Theo Thông tư 38/2024/TB-BGTVT, tốc độ tối đa là 40 km/h. Theo Luật Trật tự, an toàn giao thông đường bộ, người lái phải có giấy phép. Thông tư 99/2099/TT-XYZ quy định khác.</p>') },
  ];
  writeFileSync(join(root, 'data/blog/published.json'), JSON.stringify({ articles }));
  const r = analyse(root);
  assert.deepEqual(r.needs_fix.map((f) => [f.article_id, f.doc]), [['BA-0001', 'tt-24-2023-bca']]);
  assert.deepEqual(r.wrong_suffix.map((w) => [w.article_id, w.cited, w.expected]), [['BA-0002', 'Thông tư 38/2024/TB-BGTVT', 'Thông tư 38/2024/TT-BGTVT']]);
  assert.deepEqual(r.unknown.map((u) => [u.key, u.articles]), [['thông tư|99/2099', ['BA-0002']]]);
  const d168 = r.documents.find((d) => d.id === 'nd-168-2024');
  assert.deepEqual([d168.articles_current, d168.articles_historical], [['BA-0001'], []]);
  assert.deepEqual(r.documents.find((d) => d.id === 'nd-100-2019').articles_historical, ['BA-0001']);
  assert.deepEqual(r.documents.find((d) => d.id === 'luat-36-2024').by_name, ['BA-0002']);
  const files = build(root);
  assert.ok(files[OUT_MD].includes('BA-0001 `a`') && files[OUT_MD].includes('thông tư|99/2099'));
  assert.equal(JSON.parse(files[OUT_JSON]).counts.needs_fix, 1);
  assert.equal(scan(root).length, 2);
});

test('repository: every cited document is in the registry, flagged articles match the report, reports are current', () => {
  const r = analyse(ROOT);
  assert.deepEqual(r.unknown, [], 'add the document to data/seo/legal-documents.json with an official source');
  const flags = JSON.parse(read('config/seo-cold-start.json')).content_flags ?? [];
  const flagged = new Set(flags.map((f) => f.article));
  for (const f of r.needs_fix) assert.ok(flagged.has(f.article_id), `${f.article_id} cites ${f.doc} as the rule in force: add a content flag`);
  for (const w of r.wrong_suffix) assert.ok(flagged.has(w.article_id), `${w.article_id} cites ${w.cited}: add a content flag`);
  const amended = r.documents.filter((d) => d.status === 'amended' && d.articles_current.length && !d.amendment_checked);
  for (const d of amended) assert.ok(r.amended.some((a) => a.doc === d.id), `${d.id} amended after publication must be listed as pending`);
  const files = build(ROOT);
  for (const name of [OUT_MD, OUT_JSON]) {
    assert.ok(existsSync(join(ROOT, OUT_DIR, name)), `${name} committed`);
    assert.equal(read(`${OUT_DIR}/${name}`), files[name], `${name} is stale — run node tools/seo-legal-citations.mjs`);
  }
});

test('a document named between its type and number is cited by number, without borrowing a later number', () => {
  const root = mkdtempSync(join(tmpdir(), 'motoai-legal-name-'));
  mkdirSync(join(root, 'data/blog/articles'), { recursive: true });
  mkdirSync(join(root, 'data/seo'), { recursive: true });
  writeFileSync(join(root, REGISTRY), read(REGISTRY));
  writeFileSync(join(root, 'data/blog/articles/a.body.html'), '<p>Theo Bộ luật Dân sự số 91/2015/QH15, bên thuê phải bảo quản tài sản. '
    + 'Luật Trật tự, an toàn giao thông đường bộ năm 2024 và Nghị định 168/2024/NĐ-CP quy định mức phạt. '
    + 'Luật Nhập cảnh giả định số 99/2099/QH99 không có trong sổ.</p>');
  writeFileSync(join(root, 'data/blog/published.json'), JSON.stringify({ articles: [{ article_id: 'BA-0001', category: 'SAFE', slug: 'a', body: 'data/blog/articles/a.body.html' }] }));
  const r = analyse(root);
  assert.deepEqual(r.wrong_suffix.map((w) => [w.cited, w.expected]), [['Bộ luật Dân sự số 91/2015/QH15', 'Bộ luật Dân sự số 91/2015/QH13']]);
  assert.deepEqual(r.unknown.map((u) => u.key), ['luật|99/2099']);
  const keys = scan(root)[0].cites.map((c) => c.key);
  assert.ok(keys.includes('nghị định|168/2024'), 'the decree is still cited');
  assert.ok(!keys.includes('luật|168/2024'), 'the law named before the decree does not borrow its number');
});
