/** Bounded AI outline + three substantive sections; no synthetic padding. */
import { callModel } from './auto-writer-model.mjs';
import { CONTENT_MIN_WORDS, CONTENT_MAX_WORDS } from './writer-content-policy.mjs';

export const SECTION_COUNT = 3;
export const SECTION_MIN_WORDS = 250;
export const SECTION_MAX_WORDS = 450;
const stray = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff]/;
export const htmlWords = (s) => String(s).replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
const fragmentSchema = { type: 'object', properties: { body_html: { type: 'string' } }, required: ['body_html'], additionalProperties: false };
const baseOutlineSchema = { type: 'object', properties: {
  title: { type: 'string', minLength: 10, maxLength: 70 }, description: { type: 'string', minLength: 50, maxLength: 165 }, knowledge_chunks: { type: 'array', items: { type: 'string' } },
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

function fragmentError(html, min, max, needsList = false) {
  if (typeof html !== 'string' || !html.trim()) return 'missing HTML';
  if (stray.test(html) || /<(?:h[1-6]|script|style|table)\b/i.test(html)) return 'invalid language or fragment markup';
  if (/đề bài|schema|body_html|knowledge_chunks/i.test(html)) return 'internal writing instructions leaked into reader prose';
  if (needsList && !/<(?:ul|ol)\b/i.test(html)) return 'thiếu danh sách hành động: bắt buộc một ul hoặc ol với các li cụ thể';
  const n = htmlWords(html);
  return n < min || n > max ? `đếm được ${n} từ; bắt buộc ${min}-${max} từ` : '';
}

export function outlineError(o, needsChunks) {
  if (!o || typeof o.title !== 'string' || o.title.length < 10 || o.title.length > 70) return 'title must be 10-70 chars';
  if (typeof o.description !== 'string' || o.description.length < 50 || o.description.length > 165) return `description must be 50-165 chars (got ${o.description?.length ?? 'missing'})`;
  if (!Array.isArray(o.knowledge_chunks) || o.knowledge_chunks.length !== (needsChunks ? 2 : 0) ||
      o.knowledge_chunks.some((s) => typeof s !== 'string' || s.length < 150 || s.length > 750)) {
    return `knowledge_chunks requires ${needsChunks ? 2 : 0} items of 150-750 chars; got ${JSON.stringify(o.knowledge_chunks?.map?.((s) => typeof s === 'string' ? s.length : typeof s))}`;
  }
  if (!Array.isArray(o.sections) || o.sections.length !== SECTION_COUNT ||
      new Set(o.sections.map((s) => s.heading?.toLowerCase())).size !== SECTION_COUNT ||
      o.sections.some((s) => !s.heading || s.heading.length > 90 || /[<>]/.test(s.heading) || !s.brief)) return 'need three distinct concrete sections';
  if (o.sections.some((s) => /^(?:tổng kết|kết luận)|lời mời mở chat/i.test(s.heading))) return 'conclusion belongs outside the three substantive sections';
  if (o.sections.some((s) => /^(?:nguồn pháp lý|tài liệu tham khảo)|đề bài|điều kiện pháp lý.*(?:chưa|không bao gồm)/i.test(s.heading))) return 'each section must answer a reader question, not discuss sources or internal brief limits';
  if (stray.test(JSON.stringify(o))) return 'non-Vietnamese characters';
  return fragmentError(o.intro_html, 50, 130) || fragmentError(o.conclusion_html, 50, 130);
}

export function assembleArticle(outline, fragments) {
  if (fragments.length !== SECTION_COUNT) throw new Error('incomplete article sections');
  for (const [i, html] of fragments.entries()) {
    const error = fragmentError(html, SECTION_MIN_WORDS, SECTION_MAX_WORDS, i === 1);
    if (error) throw new Error(`section rejected: ${error}`);
  }
  const body_html = [outline.intro_html, ...fragments.map((html, i) => `<h2>${outline.sections[i].heading}</h2>\n${html}`),
    '<h2>Tổng kết</h2>', outline.conclusion_html].join('\n');
  const words = htmlWords(body_html);
  if (words < CONTENT_MIN_WORDS || words > CONTENT_MAX_WORDS) throw new Error(`assembled article ${words} words outside ${CONTENT_MIN_WORDS}-${CONTENT_MAX_WORDS}`);
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
    try { onComponent(label, response.content); } catch (error) {
      // Only an explicit factual-content refusal can use a component retry.
      // Transport, protocol and storage failures remain failures of the request.
      if (error.code !== 'WRITER_CONTENT_REFUSED') throw error;
      return { refusal: error.message };
    }
    try { return { value: JSON.parse(response.content) }; } catch { throw new Error(`${label}: invalid JSON`); }
  };

  let outline;
  let feedback = '';
  for (let retry = 0; retry < 2; retry++) {
    const { value: candidate, refusal } = await request(`Bạn là biên tập viên tiếng Việt. Chỉ trả JSON theo schema. ${policy}
Lập ba phần KHÁC NHAU và bám sát chủ đề, mỗi phần giải quyết một câu hỏi thực tế của khách thuê xe. Brief hướng dẫn cách giải thích, không tự suy diễn luật lệ.
Không dùng phần tổng kết, kết luận, lời mời mở chat hoặc mục về nguồn/tài liệu tham khảo trong ba phần. Không đưa giới hạn đề bài, dữ kiện chưa cung cấp hay hướng dẫn viết vào nội dung cho khách. Quy tắc về tiền cọc là giới hạn khi cần nhắc tới, không phải yêu cầu chèn tiền cọc vào chủ đề khác.
intro_html và conclusion_html: mỗi chuỗi có 50-130 từ, chỉ thẻ p/a/strong; kết luận có lời mời mở chat phù hợp chủ đề.
title 10-70 ký tự, viết như một câu tiếng Việt tự nhiên, không viết hoa từng từ; description chỉ MỘT câu ngắn khoảng 90-140 ký tự, bắt buộc không quá 165 ký tự; knowledge_chunks theo chính sách đề bài. Không viết các phần thân bài lúc này.`,
      `${user}\nNhiệm vụ hiện tại CHỈ là outline, mở đầu và kết luận, chưa phải bài hoàn chỉnh 800-2000 từ. ${feedback}`, outlineSchema(needsChunks), 1800, 'outline');
    const error = refusal || outlineError(candidate, needsChunks);
    if (!error) { outline = candidate; break; }
    feedback = `Outline trước bị từ chối: ${error}. Viết lại đúng schema và độ dài.`;
    log(feedback);
  }
  if (!outline) throw new Error(feedback || 'outline unavailable');
  const fragments = [];
  for (const [i, section] of outline.sections.entries()) {
    feedback = '';
    let accepted = false;
    let requestedWords = 250;
    for (let retry = 0; retry < 2; retry++) {
      const { value: part, refusal } = await request(`Bạn viết MỘT phần thân bài tiếng Việt, chỉ JSON {"body_html":"..."}. ${policy}
Viết khoảng ${requestedWords} từ tiếng Việt tự nhiên cho phần hiện tại, khoảng 4-5 đoạn cụ thể. Không viết h1/h2/h3, mở đầu cả bài, tổng kết cả bài, hoặc metadata.
Chỉ giải quyết câu hỏi của phần này. Không lặp lại lời khuyên chung, không chuyển sang tiền cọc hoặc quy trình cửa hàng nếu không thuộc chủ đề của phần.
Chỉ thẻ p/strong/a/ul/ol/li. Phần số 2 cần danh sách hành động cụ thể. Mỗi đoạn thêm thông tin hữu ích, không lặp ý để đạt độ dài. Không đưa hướng dẫn viết hoặc giới hạn của đề bài vào văn cho người đọc.
Liên kết chỉ khi phù hợp, không chèn liên kết trong mọi phần. Dữ kiện pháp lý chỉ từ đề bài; chỉ dùng dữ kiện liên quan phần hiện tại, không nhắc lại toàn bộ quy định trong mọi phần.`,
        `${user}\nBa góc bài: ${outline.sections.map((s) => s.heading).join(' | ')}\nPHẦN ${i + 1}/${SECTION_COUNT}: ${section.heading}\nBrief: ${section.brief}\nChỉ viết phần này với khoảng ${requestedWords} từ. ${feedback}`,
        fragmentSchema, 1000, `section ${i + 1}/${SECTION_COUNT}`);
      const error = refusal || fragmentError(part.body_html, SECTION_MIN_WORDS, SECTION_MAX_WORDS, i === 1);
      const words = htmlWords(part?.body_html ?? '');
      if (!error) { fragments.push(part.body_html); accepted = true; log(`section ${i + 1}/${SECTION_COUNT} accepted (${words} words)`); break; }
      const direction = refusal ? 'Sửa khẳng định sai theo dữ kiện đã kiểm chứng trong đề bài, giữ nguyên điều kiện và đối tượng áp dụng; không thêm suy diễn để thay thế câu sai.'
        : /thiếu danh sách/.test(error) ? 'Viết lại phần này và PHẢI có danh sách HTML <ul><li>...</li></ul> hoặc <ol><li>...</li></ol>. Mỗi mục là một hành động hữu ích, không chèn thêm câu lặp.'
        : words > SECTION_MAX_WORDS ? 'Rút gọn phần này, bỏ câu lặp và ý không thuộc câu hỏi hiện tại.'
        : words < SECTION_MIN_WORDS ? 'Bổ sung chi tiết thực tế liên quan câu hỏi này, mỗi đoạn thêm một ý hữu ích khác nhau.'
          : 'Sửa đúng ngôn ngữ và cấu trúc cho người đọc.';
      if (words > 0) requestedWords = Math.max(180, Math.min(320, Math.round(requestedWords * 320 / words)));
      feedback = `Phần trước bị từ chối: ${error}. ${direction} Viết lại toàn bộ phần, không thêm đoạn đệm.`;
      log(feedback);
    }
    if (!accepted) throw new Error(`section ${i + 1}/${SECTION_COUNT} failed after two bounded attempts: ${feedback}`);
  }
  return assembleArticle(outline, fragments);
}
