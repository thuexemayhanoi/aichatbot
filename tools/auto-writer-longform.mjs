/** Bounded AI outline + seven substantive sections; no synthetic padding. */
import { callModel } from './auto-writer-model.mjs';

export const SECTION_COUNT = 7;
const stray = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff]/;
export const htmlWords = (s) => String(s).replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
const fragmentSchema = { type: 'object', properties: { body_html: { type: 'string' } }, required: ['body_html'], additionalProperties: false };
const baseOutlineSchema = { type: 'object', properties: {
  title: { type: 'string' }, description: { type: 'string' }, knowledge_chunks: { type: 'array', items: { type: 'string' } },
  intro_html: { type: 'string' }, conclusion_html: { type: 'string' },
  sections: { type: 'array', minItems: SECTION_COUNT, maxItems: SECTION_COUNT, items: { type: 'object',
    properties: { heading: { type: 'string' }, brief: { type: 'string' } }, required: ['heading', 'brief'], additionalProperties: false } },
}, required: ['title', 'description', 'knowledge_chunks', 'intro_html', 'conclusion_html', 'sections'], additionalProperties: false };

export function outlineSchema(needsChunks) {
  return { ...baseOutlineSchema, properties: { ...baseOutlineSchema.properties,
    knowledge_chunks: { type: 'array', minItems: needsChunks ? 2 : 0, maxItems: needsChunks ? 2 : 0,
      items: { type: 'string', minLength: 150, maxLength: 750 } },
  } };
}

function fragmentError(html, min, max) {
  if (typeof html !== 'string' || !html.trim()) return 'missing HTML';
  if (stray.test(html) || /<(?:h[1-6]|script|style|table)\b/i.test(html)) return 'invalid language or fragment markup';
  const n = htmlWords(html);
  return n < min || n > max ? `đếm được ${n} từ; bắt buộc ${min}-${max} từ` : '';
}

export function outlineError(o, needsChunks) {
  if (!o || typeof o.title !== 'string' || o.title.length < 10 || o.title.length > 70) return 'title must be 10-70 chars';
  if (typeof o.description !== 'string' || o.description.length < 50 || o.description.length > 165) return 'description must be 50-165 chars';
  if (!Array.isArray(o.knowledge_chunks) || o.knowledge_chunks.length !== (needsChunks ? 2 : 0) ||
      o.knowledge_chunks.some((s) => typeof s !== 'string' || s.length < 150 || s.length > 750)) {
    return `knowledge_chunks requires ${needsChunks ? 2 : 0} items of 150-750 chars; got ${JSON.stringify(o.knowledge_chunks?.map?.((s) => typeof s === 'string' ? s.length : typeof s))}`;
  }
  if (!Array.isArray(o.sections) || o.sections.length !== SECTION_COUNT ||
      new Set(o.sections.map((s) => s.heading?.toLowerCase())).size !== SECTION_COUNT ||
      o.sections.some((s) => !s.heading || s.heading.length > 90 || /[<>]/.test(s.heading) || !s.brief)) return 'need seven distinct concrete sections';
  if (stray.test(JSON.stringify(o))) return 'non-Vietnamese characters';
  return fragmentError(o.intro_html, 50, 130) || fragmentError(o.conclusion_html, 50, 130);
}

export function assembleArticle(outline, fragments) {
  if (fragments.length !== SECTION_COUNT) throw new Error('incomplete article sections');
  for (const html of fragments) {
    const error = fragmentError(html, 220, 270);
    if (error) throw new Error(`section rejected: ${error}`);
  }
  const body_html = [outline.intro_html, ...fragments.map((html, i) => `<h2>${outline.sections[i].heading}</h2>\n${html}`),
    '<h2>Tổng kết</h2>', outline.conclusion_html].join('\n');
  const words = htmlWords(body_html);
  if (words < 1600 || words > 2200) throw new Error(`assembled article ${words} words outside 1600-2200`);
  return { title: outline.title, description: outline.description, knowledge_chunks: outline.knowledge_chunks, body_html };
}

export async function generateLongform({ model, system, user, needsChunks, config, log = () => {}, onComponent = () => {} }, infer = callModel) {
  // Retain factual, business, language, link and originality rules. Article
  // length/shape rules belong to assembly, not each independent section call.
  const policy = system.split('\n').filter((line) => /^(?:[4-8]|10)\./.test(line)).join('\n');
  const request = async (sys, prompt, schema, tokens, label) => {
    log(`${label}: local streaming request`);
    const response = await infer(model, [{ role: 'system', content: sys }, { role: 'user', content: prompt }], {
      ...config, numCtx: 4096, numPredict: tokens, responseFormat: schema,
      onMetrics: (m) => log(`${label} inference metrics: ${JSON.stringify(m)}`),
    });
    if (response.error) throw new Error(`${label}: ${response.status}: ${response.text}`);
    onComponent(label, response.content);
    try { return JSON.parse(response.content); } catch { throw new Error(`${label}: invalid JSON`); }
  };

  let outline;
  let feedback = '';
  for (let retry = 0; retry < 2; retry++) {
    const candidate = await request(`Bạn là biên tập viên tiếng Việt. Chỉ trả JSON theo schema. ${policy}
Lập bảy phần KHÁC NHAU cho bài, mỗi phần có một góc cụ thể và brief hướng dẫn; không dùng phần tổng kết trong bảy phần.
intro_html và conclusion_html: mỗi chuỗi có 50-130 từ, chỉ thẻ p/a/strong; kết luận có lời mời mở chat phù hợp chủ đề.
title 10-70 ký tự; description 50-165 ký tự; knowledge_chunks theo chính sách đề bài. Không viết các phần thân bài lúc này.`,
      `${user}\nNhiệm vụ hiện tại CHỈ là outline, mở đầu và kết luận, chưa phải bài 1600 từ. ${feedback}`, outlineSchema(needsChunks), 1800, 'outline');
    const error = outlineError(candidate, needsChunks);
    if (!error) { outline = candidate; break; }
    feedback = `Outline trước bị từ chối: ${error}. Viết lại đúng schema và độ dài.`;
    log(feedback);
  }
  if (!outline) throw new Error(feedback || 'outline unavailable');
  const fragments = [];
  for (const [i, section] of outline.sections.entries()) {
    feedback = '';
    let accepted = false;
    for (let retry = 0; retry < 2; retry++) {
      const part = await request(`Bạn viết MỘT phần thân bài tiếng Việt, chỉ JSON {"body_html":"..."}. ${policy}
Viết 240-260 từ cho phần hiện tại, khoảng 4-5 đoạn cụ thể. Không viết h1/h2/h3, mở đầu cả bài, tổng kết cả bài, hoặc metadata.
Chỉ thẻ p/strong/a/ul/ol/li. Phần số 4 cần danh sách hành động cụ thể. Mỗi đoạn thêm thông tin hữu ích, không lặp ý để đạt độ dài.
Liên kết chỉ khi phù hợp, không chèn liên kết trong mọi phần. Dữ kiện pháp lý chỉ từ đề bài.`,
        `${user}\nBảy góc bài: ${outline.sections.map((s) => s.heading).join(' | ')}\nPHẦN ${i + 1}/7: ${section.heading}\nBrief: ${section.brief}\nChỉ viết phần này với 240-260 từ. ${feedback}`,
        fragmentSchema, 1000, `section ${i + 1}/7`);
      const error = fragmentError(part.body_html, 220, 270);
      if (!error) { fragments.push(part.body_html); accepted = true; log(`section ${i + 1}/7 accepted (${htmlWords(part.body_html)} words)`); break; }
      feedback = `Phần trước bị từ chối: ${error}. Viết lại toàn bộ phần này đủ độ dài, mỗi đoạn là một ý khác nhau.`;
      log(feedback);
    }
    if (!accepted) throw new Error(`section ${i + 1}/7 failed after two bounded attempts: ${feedback}`);
  }
  return assembleArticle(outline, fragments);
}
