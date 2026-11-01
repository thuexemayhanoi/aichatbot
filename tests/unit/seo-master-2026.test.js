/**
 * Master SEO Matrix 2026 (lô M1): the workbook must carry the 23 sheets the
 * SEO MASTER COMMAND names, in order, plus the appendices; the dashboard must
 * be live formulas that recalculated without an Excel error; the evidence
 * files must agree with each other. Reads the .xlsx with node:zlib only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { rate, THRESHOLDS } from '../../tools/seo-cwv-lab.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p));
const json = (p) => JSON.parse(read(p).toString('utf8'));

export const REQUIRED = [
  'EXECUTIVE DASHBOARD', 'URL INVENTORY', 'KEYWORD MASTER', 'KEYWORD GAP', 'COMPETITOR SERP',
  'URL–KEYWORD MAPPING', 'CANNIBALIZATION', 'HOMEPAGE & PILLAR', 'SEO HUB MATRIX', 'SILO & CATEGORY MATRIX',
  'CONTENT CLUSTERS', 'PAGE & POST OPTIMIZATION', 'TECHNICAL SEO AUDIT', 'INDEX & SITEMAP', 'HREFLANG MATRIX',
  'IMAGE SEO', 'INTERNAL LINK MATRIX', 'STRUCTURED DATA', 'LOCAL SEO & CONVERSION', 'GSC PERFORMANCE',
  'PRIORITY BACKLOG', 'QA RESULTS', 'CHANGELOG & CHECKPOINT'
];

/** Minimal ZIP reader (central directory → stored/deflated entries). */
function unzip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd > 0, 'xlsx is a zip archive');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(off + 10);
    const size = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    files.set(name, () => (method === 8 ? inflateRawSync(data) : data).toString('utf8'));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

test('MASTER-SEO-MATRIX-2026.xlsx has the 23 required sheets in order, then the appendices', () => {
  const summary = json('docs/seo/master-2026/summary.json');
  assert.deepEqual(summary.sheets, REQUIRED);
  const zip = unzip(read(summary.workbook));
  const names = [...zip.get('xl/workbook.xml')().matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => unescape(m[1]));
  assert.deepEqual(names.slice(0, REQUIRED.length), REQUIRED);
  assert.deepEqual(names.slice(REQUIRED.length), summary.appendices);
});

test('EXECUTIVE DASHBOARD is formulas that recalculated without errors', () => {
  const summary = json('docs/seo/master-2026/summary.json');
  const zip = unzip(read(summary.workbook));
  const wb = zip.get('xl/workbook.xml')();
  const rid = wb.match(/<sheet [^>]*name="EXECUTIVE DASHBOARD"[^>]*r:id="([^"]+)"/)[1];
  const rels = zip.get('xl/_rels/workbook.xml.rels')();
  const target = rels.match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${rid}"`)).slice(1).find(Boolean);
  const sheet = zip.get(`xl/${target.replace(/^\/?xl\//, '')}`)();
  const formulas = sheet.match(/<f>/g) ?? [];
  assert.ok(formulas.length >= 30, `dashboard has ${formulas.length} formulas`);
  assert.doesNotMatch(sheet, /#REF!|#NAME\?/);
  const check = json('docs/seo/master-2026/formula-check.json');
  assert.equal(check.errors.length, 0, `formula errors: ${check.errors.join(', ')}`);
  assert.equal(check.checked, formulas.length, 'every dashboard formula was recalculated');
});

test('evidence files agree: inventory rows, classification totals, checkpoint', () => {
  const summary = json('docs/seo/master-2026/summary.json');
  const rows = read('docs/seo/master-2026/url-inventory.csv').toString('utf8').trim().split('\n').slice(1);
  assert.equal(rows.length, summary.urls);
  const total = Object.values(summary.classification).reduce((a, b) => a + b, 0);
  assert.equal(total, summary.urls);
  for (const cls of Object.keys(summary.classification)) {
    assert.match(cls, /^(KEEP|IMPROVE|EXPAND|CONSOLIDATE-CANDIDATE|REDIRECT-CANDIDATE|NOINDEX-CANDIDATE)$/);
  }
  assert.equal(summary.gsc, 'NOT CONNECTED', 'no invented Search Console data');
  const cp = json('docs/seo/master-2026/checkpoint.json');
  assert.ok(cp.last_completed_batch && cp.resume_rule.includes('Tiếp tục'));
});

test('CWV lab ratings use the Core Web Vitals "good" thresholds', () => {
  assert.equal(THRESHOLDS.lcp_ms[0], 2500);
  assert.equal(THRESHOLDS.inp_ms[0], 200);
  assert.equal(THRESHOLDS.cls[0], 0.1);
  assert.equal(rate('lcp_ms', 2500), 'GOOD');
  assert.equal(rate('lcp_ms', 2501), 'NEEDS IMPROVEMENT');
  assert.equal(rate('cls', 0.26), 'POOR');
  assert.equal(rate('inp_ms', null), 'N/A');
  const lab = json('docs/seo/master-2026/cwv-lab.json');
  assert.equal(lab.kind, 'LAB');
  assert.equal(lab.field.status, 'N/A');
});

test('FEATURE-CLAIM: an assistant "xe còn trống" claim is caught through links and placeholders', (t) => {
  const py = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('m', 'tools/seo-master-2026.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
print(json.dumps([bool(m.feature_claims(s)) for s in json.loads(sys.stdin.read())]))`;
  const cases = [
    // claims (the link and the dotted placeholder used to cut the sentence)
    ['<p>Gọi {{ business.contact.phone_display }} hoặc hỏi trợ lý trên <a href="/">trang chủ</a> để biết dòng xe còn trống.</p>', true],
    ['<p>Hỏi trợ lý MotoAI ở <a href="/">trang chủ</a> xem xe điện nào đang sẵn cho tuần mưa tới.</p>', true],
    ['<p>Mở trợ lý của {{ business.brand }} về xe còn sẵn và giờ nhận trả.</p>', true],
    ['<p>Ứng dụng web của {{ business.brand }} trả lời đúng những câu ấy, bằng tiếng Anh hoặc tiếng Việt.</p>', true],
    // not claims: the store confirms, or the sentence is a question
    ['<p>Hỏi trợ lý trên <a href="/">trang chủ</a> để xem giá, còn dòng xe nào còn trống thì cửa hàng xác nhận khi bạn gọi.</p>', false],
    ['<h3>Trợ lý có báo xe còn trống không?</h3>', false],
    ['<p>Trợ lý đối chiếu với các dòng sẵn có rồi trả về vài gợi ý kèm giá.</p>', false],
    // MotoAI is the assistant, not the store; no published Zalo; no blanket maintenance promise
    ['<p>Nếu bạn cần thuê xe, liên hệ MotoAI theo số {{ business.contact.phone_display }} để được tư vấn.</p>', true],
    ['<p>Hãy nhắn qua kênh Zalo được công bố trên trang <a href="/lien-he/">liên hệ</a>.</p>', true],
    ['<p>Mọi dòng xe ga của {{ business.display_name }} đều được bảo dưỡng định kỳ.</p>', true],
    ['<p>Liên hệ cửa hàng {{ business.brand }} theo số {{ business.contact.phone_display }}.</p>', false]
  ];
  const r = spawnSync('python3', ['-B', '-c', py], { cwd: ROOT, input: JSON.stringify(cases.map((c) => c[0])), encoding: 'utf8' });
  if (r.error) return t.skip('python3 is not available');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), cases.map((c) => c[1]));
});
