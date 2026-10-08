#!/usr/bin/env node
/**
 * v71 AUTO WRITER — the AI writer engine (docs/AUTO-WRITER.md).
 *
 * Owner directive 2026-10-08: production must run 24/7 WITHOUT any external
 * chat session. This tool lets a scheduled GitHub Actions job act as the
 * writer: it picks the lowest-seq RESERVED chunk of the ACTIVE batch
 * (manifest docs/state/writer-assignments.json — the ONLY source of truth),
 * generates the 2 articles with GitHub Models inference, runs the FULL
 * production QA (tools/article-qa.mjs against a sandbox factory root that
 * carries the 2 draft entries), regenerates on QA failure (bounded), then
 * leaves READY_TO_PUSH staging for the workflow:
 *
 *   node tools/auto-writer.mjs run [--dry-run] [--model <id>] [--max-attempts N]
 *
 * Emits machine-readable key=value lines. NEVER touches main, NEVER edits the
 * matrix/manifest/chunk state itself (writer-queue.mjs begin/ready stay the
 * only state writers; the workflow calls them). Everything is idempotent and
 * crash-safe: a failed run leaves the chunk RESERVED.
 *
 * Guardrails kept identical to the human-writer contract:
 *   - only the chunk's exact ids, only its assigned writer slot;
 *   - business facts ONLY via verified placeholders;
 *   - internal links only within the row's hub (+ root);
 *   - SAFE legal-gate rows need a gov.vn/vbpl.vn link from the verified list;
 *   - no stray CJK/Cyrillic, no markdown, no <h1>, no external prose links;
 *   - knowledge_chunks per agent_retrieval (SAFE -> [], else 2 x <800 chars).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, symlinkSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { parseMatrix } from './blog-factory.mjs';
import { HUBS } from './build-blog.mjs';

export const ROOT = process.env.MOTOAI_FACTORY_ROOT
  ?? join(dirname(fileURLToPath(import.meta.url)), '..');

const MANIFEST = join(ROOT, 'data/blog/published.json');
const ASSIGNMENTS = join(ROOT, 'docs/state/writer-assignments.json');
const ARTICLES_DIR = join(ROOT, 'data/blog/articles');
const MODELS_URL = 'https://models.github.ai/inference/chat/completions';
const DEFAULT_MODELS = ['openai/gpt-4o-mini', 'openai/gpt-4.1-mini', 'mistral-ai/mistral-large-2407'];
const PLACEHOLDERS = [
  '{{ business.policies.deposit.min | vnd }}',
  '{{ business.policies.deposit.max | vnd }}',
  '{{ business.hours.display }}',
  '{{ business.brand }}',
  '{{ business.contact.phone_display }}',
  '{{ business.address.full }}',
];
const HUB_DIR = Object.fromEntries(HUBS.map((h) => [h.id, h.dir]));
const LEGAL_LINK_RE = /https?:\/\/[^\s"']*?(gov\.vn|vbpl\.vn)[^\s"']*/g;

const read = (p) => readFileSync(isAbsolute(p) ? p : join(ROOT, p), 'utf8');
const emit = (o) => { for (const [k, v] of Object.entries(o)) console.log(`${k}=${v}`); };
const die = (msg, extra = {}) => { emit({ status: 'FAILED', reason: msg, ...extra }); process.exit(1); };
const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** Strip code fences / chatter and parse the first JSON object in a string. */
export function extractJson(text) {
  if (!text || typeof text !== 'string') return null;
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  const slice = t.slice(first, last + 1);
  try { return JSON.parse(slice); } catch { /* fallthrough */ }
  // repair the most common LLM defect: trailing content after the object
  const deeper = t.indexOf('{', first + 1);
  if (deeper !== -1) {
    for (let end = t.lastIndexOf('}'); end > deeper; end = t.lastIndexOf('}', end - 1)) {
      try { return JSON.parse(t.slice(first, end + 1)); } catch { /* keep shrinking */ }
    }
  }
  return null;
}

/** Word count on tag-stripped text (same heuristic family as article-qa). */
export function countWords(html) {
  const text = String(html).replace(/<[^>]+>/g, ' ');
  return (text.match(/[A-Za-zÀ-ỹ0-9]+/g) || []).length;
}

export const STRAY_RE = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff]/;

/** All hrefs of a body, split internal (root-relative) / external. */
export function splitLinks(bodyHtml) {
  const hrefs = [...String(bodyHtml).matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const internal = hrefs.filter((h) => h.startsWith('/'));
  const external = hrefs.filter((h) => /^https?:\/\//i.test(h));
  return { hrefs, internal, external };
}

/**
 * Fast local candidate validation (before the expensive production QA).
 * ctx = { allowedHubPrefixes, allowedLegalLinks (Set|null), needsLegalLink,
 *         needsChunks }.
 * Returns an array of error strings (empty = acceptable for full QA).
 */
export function validateCandidate(row, cand, ctx) {
  const errs = [];
  if (!cand || typeof cand !== 'object') return ['candidate is not an object'];
  const { title, description, knowledge_chunks, body_html } = cand;
  if (typeof title !== 'string' || title.length < 10 || title.length > 70) {
    errs.push(`title must be 10-70 chars (got ${typeof title === 'string' ? title.length : 'missing'})`);
  }
  if (typeof description !== 'string' || description.length < 50 || description.length > 165) {
    errs.push(`description must be 50-165 chars (got ${typeof description === 'string' ? description.length : 'missing'})`);
  }
  if (typeof body_html !== 'string' || body_html.length < 1000) {
    return [...errs, 'body_html missing or too short'];
  }
  const chunks = Array.isArray(knowledge_chunks) ? knowledge_chunks : null;
  if (ctx.needsChunks) {
    if (!chunks || chunks.length < 2) errs.push('knowledge_chunks: exactly 2 chunks required');
    else {
      if (chunks.length > 2) errs.push(`knowledge_chunks: got ${chunks.length}, expected 2`);
      chunks.forEach((c, i) => {
        if (typeof c !== 'string' || c.length < 50) errs.push(`knowledge_chunks[${i}] too short`);
        if (typeof c === 'string' && c.length >= 800) errs.push(`knowledge_chunks[${i}] must be < 800 chars (got ${c.length})`);
      });
    }
  } else if (chunks && chunks.length > 0) {
    errs.push('knowledge_chunks must be empty for agent_retrieval=no rows');
  }
  const body = body_html;
  const stray = body.match(STRAY_RE);
  if (stray) errs.push(`stray CJK/Cyrillic character(s): ${[...new Set(stray)].join(',')}`);
  if (/<h1\b/i.test(body)) errs.push('body must not contain <h1>');
  const h2 = (body.match(/<h2\b/g) || []).length;
  if (h2 < 2) errs.push(`body needs >= 2 <h2> (got ${h2})`);
  if (!/<ul\b|<ol\b/i.test(body)) errs.push('body needs at least one <ul>/<ol> list');
  if (/<script|<style/i.test(body)) errs.push('body must not embed <script>/<style>');
  if (/\]\(|\)\s*<\/a>/i.test(body.replace(/<a href="[^"]*">[^<]*<\/a>/g, ''))) errs.push('markdown links are not allowed (use <a href>)');
  const wc = countWords(body);
  if (wc < 1200 || wc > 4000) errs.push(`body word count ${wc} outside 1200-4000 (target 1600-2200)`);
  const { internal, external } = splitLinks(body);
  const prefixes = ctx.allowedHubPrefixes;
  for (const href of internal) {
    if (href === '/') continue;
    if (!prefixes.some((p) => href === p || href.startsWith(p))) {
      errs.push(`internal link outside the row's hub is not allowed: ${href}`);
    }
  }
  for (const href of external) {
    // NOTE: do not reuse the global LEGAL_LINK_RE here — its lastIndex state
    // leaks between .test() and .matchAll() and silently rejects valid links.
    const ok = ctx.needsLegalLink && /gov\.vn|vbpl\.vn/.test(href);
    if (!ok) errs.push(`external link not allowed (only gov.vn/vbpl.vn for legal-gate rows): ${href}`);
  }
  if (ctx.needsLegalLink && !external.some((h) => /gov\.vn|vbpl\.vn/.test(h))) {
    errs.push('legal-gate row: body needs at least one gov.vn/vbpl.vn source link');
  }
  if (/app store|google play/i.test(body)) errs.push('forbidden strings: app store / google play');
  const phoneLike = body.match(/\+?\d(?:[\d\s.\-]{7,})\d/g);
  if (phoneLike) errs.push(`unverified phone-like number: ${phoneLike[0]}`);
  const usedPh = [...body.matchAll(/\{\{[^}]+\}\}/g)].map((m) => m[0]);
  for (const ph of usedPh) {
    if (!PLACEHOLDERS.includes(ph)) errs.push(`unknown placeholder: ${ph}`);
  }
  const depositSentence = /[^\n.!?]*cọc[^\n.!?]*[.!?]/gi;
  for (const s of body.match(depositSentence) || []) {
    if (/\d[\d.,]*\s?đ/.test(s) && !PLACEHOLDERS.some((p) => s.includes(p))) {
      errs.push(`deposit sentence with a literal amount is not allowed: ${s.trim().slice(0, 60)}...`);
    }
  }
  return errs;
}

/** Build the writing prompt pair (system + user) for one row. Pure. */
export function buildPrompt(row, ctx, feedback) {
  const hubDir = HUB_DIR[row.category] ?? 'blog';
  const lines = [];
  lines.push(`BÀI: ${row.article_id}`);
  lines.push(`Chủ đề / từ khóa chính: ${row.primary_keyword}`);
  lines.push(`Từ khóa phụ: ${row.secondary_keywords}`);
  lines.push(`Ý định tìm kiếm: ${row.search_intent}`);
  lines.push(`Tiêu đề làm việc (có thể tinh chỉnh, giữ 10-70 ký tự): ${row.working_title}`);
  lines.push(`Slug (bắt buộc dùng đúng): ${row.slug}`);
  lines.push(`Chuyên mục: ${row.category} (hub ${row.parent_hub})`);
  if (ctx.needsLegalLink) {
    lines.push('Đây là bài pháp lý (legal-gate): PHẢI dẫn ít nhất 1 nguồn gov.vn hoặc vbpl.vn bằng thẻ <a href> trực tiếp trong thân bài. Chỉ dùng link từ danh sách nguồn đã kiểm chứng sau: ' + (ctx.legalLinks.slice(0, 8).join(' ')));
  } else {
    lines.push('KHÔNG dùng bất kỳ liên kết ngoài nào. Mọi liên kết trong thân bài phải là liên kết nội bộ.');
  }
  lines.push(`Liên kết nội bộ CHỈ ĐƯỢC PHEP trỏ tới các slug trong hub ${hubDir} (danh sách bên dưới) hoặc về trang chủ "/":`);
  lines.push((ctx.hubSlugs.length ? ctx.hubSlugs.join(', ') : '(hub chưa có bài nào — chỉ dùng link về "/")'));
  if (ctx.exampleTitles.length) {
    lines.push('Vài tiêu đề đã xuất bản trong hub này (chỉ để đo hơi văn phong, TUYỆT ĐỐI không sao chép câu): ' + ctx.exampleTitles.join(' | '));
  }
  if (ctx.needsChunks) {
    lines.push('knowledge_chunks: đúng 2 đoạn mô tả kiến thức, mỗi đoạn 150-750 ký tự, tổng kết thông tin xác thực của bài.');
  } else {
    lines.push('knowledge_chunks: mảng RỖNG [].');
  }
  if (feedback) {
    lines.push('');
    lines.push('Bản nháp trước đó bị QA từ chối với các lỗi sau — PHẢI sửa toàn bộ, viết lại câu bị lỗi bằng văn hoàn toàn mới:');
    lines.push(feedback);
  }
  return { system: ctx.systemPrompt, user: lines.join('\n') };
}

export const SYSTEM_PROMPT = `Bạn là writer chuyên nghiệp của MotoAI — blog thuê xe máy & xe điện tại Hà Nội (cửa hàng Thuê xe máy Nguyễn Tú, 112 Nguyễn Văn Cừ, Long Biên). Nhiệm vụ: viết MỘT bài blog tiếng Việt hoàn chỉnh cho khách thuê xe máy.

QUY TẮC BẤT BUỘC:
1. Chỉ trả về MỘT đối tượng JSON hợp lệ, không thêm chữ nào ngoài JSON: {"title": "...", "description": "...", "knowledge_chunks": ["...","..."], "body_html": "..."}. body_html là chuỗi HTML.
2. body_html: chỉ dùng các thẻ <p>, <h2>, <ul>/<ol>/<li>, <strong>, <a>. KHÔNG dùng <h1>, <script>, <style>, markdown, mũi tên, bảng. Mở đầu bằng một <p> dẫn nhập; ít nhất 2 <h2>; ít nhất 1 danh sách <ul> hoặc <ol>; kết thúc bằng <h2> tổng kết có 1-2 câu kêu gọi hành động. Mục "Câu hỏi thường gặp" (nếu có) là <ul> gồm các <li> hỏi đáp ngắn.
3. Độ dài: 1600-2200 từ tiếng Việt (đếm cả dấu). Bài phải đầy đủ, cụ thể, hữu ích cho khách thật; KHÔNG đệp chữ, KHÔNG lặp ý, KHÔNG đoạn "lorem".
4. Tiếng Việt chuẩn, tự nhiên, đúng chính tả. TUYỆT ĐỐI KHÔNG xuất hiện ký tự Trung/Nhận/Hàn/Cyrillic. Không lẫn từ tiếng Anh giữa câu.
5. Dữ liệu kinh doanh CHỈ qua placeholder (bắt buộc dùng đúng từng ký tự): {{ business.policies.deposit.min | vnd }}, {{ business.policies.deposit.max | vnd }}, {{ business.hours.display }}, {{ business.brand }}, {{ business.contact.phone_display }}, {{ business.address.full }}. KHÔNG bịa giá thuê, số điện thoại, địa chỉ, giờ mở cửa khác. Câu nói về tiền cọc luôn dùng dải placeholder, nói cọc "được đối chiếu trực tiếp lúc nhận xe" và "quay về bạn khi trả xe đúng hiện trạng". KHÔNG viết con số tiền cọc hay giá thuê cụ thể nào.
6. Không nhắc "app store" hay "google play". Không khẳng định cửa hàng có chi nhánh/giao xe tận nơi trừ khi dùng placeholder giờ mở cửa. Không khẳng định toàn quốc — cửa hàng ở Hà Nội.
7. Liên kết nội bộ: 2-4 link dạng <a href="/blog/<hub>/<slug>/">chữ mô tả</a> trong văn — chỉ đúng slug được liệt kê, hoặc <a href="/">trang chủ</a>. Không thêm liên kết ngoài trừ bài legal-gate (chỉ link gov.vn/vbpl.vn được liệt kê sẵn).
8. Mọi câu viết phải MỚI HOÀN TOÀN. Không sao chép câu, cụm kết luận, câu hỏi thường gặp quen mặt từ bất kỳ bài đã xuất bản nào.
9. title: 10-70 ký tự, chứa từ khóa chính, tự nhiên. description: 50-165 ký tự, tóm đúng nội dung, có từ khóa chính.
10. An toàn pháp lý: chỉ phát biểu luật lệ/chế tài đã cho trong đề bài hoặc tri thức phổ quát chắc chắn; khi không chắc, diễn đạt thận trọng ("nên xác nhận với cơ quan chức năng/cửa hàng").`;

// ---------------------------------------------------------------------------
// context loading
// ---------------------------------------------------------------------------

function loadAssignments() { return JSON.parse(read(ASSIGNMENTS)); }

/** The lowest-seq RESERVED chunk of the ACTIVE batch (FIFO across writers). */
export function chooseChunk(assignments) {
  const b = assignments && assignments.active;
  if (!b || b.status !== 'ACTIVE') return { batch: null, chunk: null };
  const open = (b.chunks ?? []).filter((c) => c.status === 'RESERVED').sort((x, y) => x.seq - y.seq);
  return { batch: b, chunk: open[0] ?? null };
}

function loadManifestEntries() {
  const m = JSON.parse(read(MANIFEST));
  return Array.isArray(m.articles) ? m.articles : [];
}

function writerShort(writer) { return String(writer).replace(/^writer_/, ''); }

function verifiedLegalLinks(entries) {
  const links = new Set();
  for (const e of entries) {
    if (e.category !== 'SAFE' && !/an-toan/.test(e.body ?? '')) continue;
    const p = join(ROOT, e.body ?? '');
    if (!existsSync(p)) continue;
    for (const m of readFileSync(p, 'utf8').matchAll(LEGAL_LINK_RE)) {
      if (/gov\.vn|vbpl\.vn/.test(m[0])) links.add(m[0].replace(/[)"'.,;]+$/, ''));
    }
  }
  return [...links].slice(0, 24);
}

function buildCtx(row) {
  const entries = loadManifestEntries();
  const hubDir = HUB_DIR[row.category] ?? 'blog';
  const hubPrefix = `/${hubDir}/`;
  const hubSlugs = entries
    .filter((e) => e.body && e.body.includes(`/${hubDir}/`))
    .map((e) => e.slug);
  const exampleTitles = entries
    .filter((e) => e.body && e.body.includes(`/${hubDir}/`))
    .slice(-4)
    .map((e) => e.title);
  const needsLegalLink = row.source_policy === 'legal-gate';
  return {
    systemPrompt: SYSTEM_PROMPT,
    allowedHubPrefixes: [hubPrefix],
    hubSlugs: hubSlugs.map((s) => `/${hubDir}/${s}/`),
    exampleTitles,
    needsLegalLink,
    legalLinks: verifiedLegalLinks(entries),
    needsChunks: row.agent_retrieval === 'yes',
    allEntries: entries,
  };
}

// ---------------------------------------------------------------------------
// model call
// ---------------------------------------------------------------------------

async function callModel(model, messages, maxAttemptsPerModel, token) {
  const body = {
    model,
    messages,
    temperature: 0.7,
    max_tokens: 16000,
  };
  try {
    body.response_format = { type: 'json_object' };
  } catch { /* unreachable */ }
  const tryOnce = async (payload) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 180000);
    try {
      const res = await fetch(MODELS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      if (res.status === 400 && payload.response_format) {
        const txt = await res.text();
        if (/response_format/i.test(txt)) return { retryWithoutResponseFormat: true };
      }
      if (res.status === 401 || res.status === 403) {
        return { authError: true, status: res.status, text: (await res.text()).slice(0, 200) };
      }
      if (!res.ok) {
        return { error: true, status: res.status, text: (await res.text()).slice(0, 300) };
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        return { error: true, status: res.status, text: 'empty model response' };
      }
      return { content };
    } finally {
      clearTimeout(t);
    }
  };
  let r = await tryOnce(body);
  if (r && r.retryWithoutResponseFormat) {
    const stripped = { ...body };
    delete stripped.response_format;
    r = await tryOnce(stripped);
  }
  return r;
}

// ---------------------------------------------------------------------------
// sandboxed FULL production QA (article-qa with a temp factory root)
// ---------------------------------------------------------------------------

/** Build a throwaway factory root mirroring ROOT + the 2 draft entries. */
export function buildTempFactoryRoot(drafts, bodies, tmpParent = tmpdir()) {
  const tmp = mkdtempSync(join(tmpParent, 'motoai-aw-'));
  const entries = readdirSync(ROOT, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === 'data' || e.name === '.git') continue;
    symlinkSync(join(ROOT, e.name), join(tmp, e.name));
  }
  mkdirSync(join(tmp, 'data'));
  for (const e of readdirSync(join(ROOT, 'data'), { withFileTypes: true })) {
    if (e.name === 'blog') continue;
    symlinkSync(join(ROOT, 'data', e.name), join(tmp, 'data', e.name));
  }
  mkdirSync(join(tmp, 'data/blog'));
  for (const e of readdirSync(join(ROOT, 'data/blog'), { withFileTypes: true })) {
    if (e.name === 'published.json' || e.name === 'articles') continue;
    symlinkSync(join(ROOT, 'data/blog', e.name), join(tmp, 'data/blog', e.name));
  }
  // articles: symlink every existing body, then add the candidate bodies
  mkdirSync(join(tmp, 'data/blog/articles'));
  for (const f of readdirSync(ARTICLES_DIR)) {
    symlinkSync(join(ARTICLES_DIR, f), join(tmp, 'data/blog/articles', f));
  }
  for (const [slug, html] of bodies) {
    writeFileSync(join(tmp, 'data/blog/articles', `${slug}.body.html`), html);
  }
  const manifest = JSON.parse(read(MANIFEST));
  manifest.articles = [...manifest.articles, ...drafts];
  writeFileSync(join(tmp, 'data/blog/published.json'), JSON.stringify(manifest, null, 2) + '\n');
  return tmp;
}

/** Run article-qa against the sandbox root; returns { pass, out, failures }. */
export function runSandboxedQa(rootOverride, id) {
  const p = spawnSync(process.execPath, [join(ROOT, 'tools/article-qa.mjs'), id], {
    env: { ...process.env, MOTOAI_FACTORY_ROOT: rootOverride },
    encoding: 'utf8',
    timeout: 120000,
  });
  const out = `${p.stdout || ''}${p.stderr || ''}`;
  const failures = out.split('\n').filter((l) => /^FAIL\s/.test(l) || /^QA FAIL/.test(l));
  return { pass: p.status === 0, out, failures };
}

// ---------------------------------------------------------------------------
// one-article generation with bounded retries
// ---------------------------------------------------------------------------

async function generateArticle(row, ctx, opts, log) {
  const token = opts.token;
  const models = opts.models;
  let feedback = '';
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    const { system, user } = buildPrompt(row, ctx, feedback);
    let content = null;
    let lastModelErr = '';
    for (const model of models) {
      log(`attempt ${attempt} model ${model}`);
      const r = await callModel(model, [{ role: 'system', content: system }, { role: 'user', content: user }], 1, token);
      if (r && r.authError) return { fatal: `model API unauthorized (${r.status}) — set GH_MODELS_TOKEN secret or check models access` };
      if (r && r.content) { content = r.content; break; }
      lastModelErr = r && r.error ? `${r.status}: ${r.text}` : (r && r.authError ? 'auth' : 'empty');
      log(`  model ${model} failed: ${lastModelErr.slice(0, 120)}`);
    }
    if (content === null) {
      if (/unauthorized|403|401/.test(lastModelErr)) {
        return { fatal: 'model API unauthorized — set GH_MODELS_TOKEN secret or check models access' };
      }
      feedback = `Lỗi hệ thống sinh bài (model API): ${lastModelErr.slice(0, 200)}`;
      continue;
    }
    const cand = extractJson(content);
    if (!cand) { feedback = 'Output không phải JSON hợp lệ. Chỉ trả về JSON thuần.'; continue; }
    const errs = validateCandidate(row, cand, ctx);
    if (errs.length) {
      log(`  local validation: ${errs.length} error(s)`);
      feedback = errs.map((e) => `- ${e}`).join('\n');
      continue;
    }
    // full production QA in a sandbox root
    const draft = manifestDraft(row, cand);
    const tmp = buildTempFactoryRoot([draft], [[row.slug, cand.body_html]]);
    let qa;
    try {
      qa = runSandboxedQa(tmp, row.article_id);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
    if (qa.pass) return { cand };
    log(`  production QA failed:\n${qa.failures.join('\n')}`);
    feedback = [...qa.failures, ...qa.out.split('\n').filter((l) => /^WARN\s/.test(l))].join('\n');
  }
  return { fail: `exhausted ${opts.maxAttempts} attempts for ${row.article_id}` };
}

function manifestDraft(row, cand) {
  return {
    article_id: row.article_id,
    category: row.category,
    slug: row.slug,
    title: cand.title.trim(),
    description: cand.description.trim(),
    published_date: today(),
    author: row.author || 'MotoAI Editorial',
    pilot: false,
    body: `data/blog/articles/${row.slug}.body.html`,
    knowledge_chunks: Array.isArray(cand.knowledge_chunks) ? cand.knowledge_chunks.map((c) => c.trim()) : [],
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [], '--': {} };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i];
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { args['--'][key] = true; }
      else { args['--'][key] = next; i++; }
    } else args._.push(argv[i]);
  }
  return args;
}

async function cmdRun(args) {
  const flags = args['--'];
  const maxAttempts = parseInt((flags['--max-attempts'] ?? flags.maxAttempts) ?? '4', 10);
  const models = [flags['--model'] ?? flags.model, process.env.AUTO_WRITER_MODEL, ...DEFAULT_MODELS]
    .filter((m) => typeof m === 'string' && m.trim())
    .filter((m, i, arr) => arr.indexOf(m) === i);
  const token = process.env.AUTO_WRITER_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const dryRun = (flags['--dry-run'] ?? flags.dryRun) === true || (flags['--dry-run'] ?? flags.dryRun) === 'true';
  const log = (m) => console.error('[auto-writer]', m);

  if (!token) die('no model token (AUTO_WRITER_TOKEN/GITHUB_TOKEN)');

  const rows = parseMatrix();
  const byId = new Map(rows.map((r) => [r.article_id, r]));

  const { batch, chunk } = chooseChunk(loadAssignments());
  if (!batch) { emit({ status: 'NEED_BATCH', reason: 'no ACTIVE batch' }); return; }
  if (!chunk) { emit({ status: 'NEED_BATCH', batch_id: batch.batch_id, reason: 'all chunks terminal' }); return; }

  const ids = chunk.ids;
  const writer = chunk.writer;
  const branch = `writer/${batch.batch_id}/${writerShort(writer)}`;
  log(`chunk ${batch.batch_id}#${chunk.seq} (${writer}) ids=${ids.join(',')}`);
  emit({ status: 'GENERATING', batch: batch.batch_id, seq: String(chunk.seq), writer, ids: ids.join(','), branch });

  const drafts = [];
  const bodies = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) die(`matrix row missing for ${id}`, { batch: batch.batch_id, seq: String(chunk.seq) });
    if (row.status !== 'PLANNED') die(`row ${id} is ${row.status} — only PLANNED rows can be written`, { batch: batch.batch_id, seq: String(chunk.seq) });
    const ctx = buildCtx(row);
    const r = await generateArticle(row, ctx, { models, maxAttempts, token }, log);
    if (r.fatal) die(r.fatal, { batch: batch.batch_id, seq: String(chunk.seq), ids: ids.join(',') });
    if (r.fail) die(r.fail, { batch: batch.batch_id, seq: String(chunk.seq), ids: ids.join(',') });
    drafts.push(manifestDraft(row, r.cand));
    bodies.push([row.slug, r.cand.body_html]);
    log(`${id}: candidate accepted`);
  }

  const draftsPath = join(ROOT, 'writer-work', batch.batch_id, writerShort(writer), `drafts-${chunk.seq}.json`);
  if (!dryRun) {
    mkdirSync(dirname(draftsPath), { recursive: true });
    writeFileSync(draftsPath, JSON.stringify(drafts, null, 2) + '\n');
    for (const [slug, html] of bodies) {
      writeFileSync(join(ARTICLES_DIR, `${slug}.body.html`), html.endsWith('\n') ? html : html + '\n');
    }
  } else {
    mkdirSync(join(ROOT, 'writer-work-auto-dryrun'), { recursive: true });
    writeFileSync(join(ROOT, 'writer-work-auto-dryrun', `drafts-${chunk.seq}.json`), JSON.stringify(drafts, null, 2) + '\n');
  }

  emit({
    status: 'READY_TO_PUSH',
    batch: batch.batch_id,
    seq: String(chunk.seq),
    writer,
    ids: ids.join(','),
    branch,
    drafts: draftsPath,
    titles: drafts.map((d) => d.title).join(' | '),
    dry_run: dryRun ? 'true' : 'false',
  });
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'run') {
    cmdRun(parseArgs(rest)).catch((e) => die(String(e && e.stack ? e.stack : e)));
  } else {
    console.error('usage: node tools/auto-writer.mjs run [--dry-run] [--model <id>] [--max-attempts N]');
    process.exit(2);
  }
}
