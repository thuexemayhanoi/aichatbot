/**
 * Grounding: build the local-LLM prompt from retrieved business context and
 * validate the model output so the LLM can NEVER override verified facts.
 *
 * The LLM is only consulted when the deterministic engine + retrieval both
 * declined (fallback path). Even then:
 *  - the prompt contains ONLY repository-owned facts;
 *  - prices/policies are forbidden in the prompt's "invent" sense;
 *  - output is rejected unless it is short, on-topic and non-empty.
 */

const SYSTEM_PROMPT = [
  'You are MotoAI, an assistant for a Vietnamese motorbike rental business (Thuê Xe Máy Hà Nội Nguyễn Tú).',
  'Rules you MUST follow:',
  '1. Answer ONLY from the BUSINESS FACTS provided below. Do not invent prices, policies, addresses, phone numbers or availability.',
  '2. If the facts do not answer the question, reply exactly: NOINFO',
  '3. Answer in the same language as the user (Vietnamese or English). Be short, at most 3 sentences.',
  '4. Never invent numbers. If a fact says a price must be confirmed by phone, say so.'
].join('\n');

const MAX_CONTEXT_DOCS = 4;
const MAX_OUTPUT_CHARS = 900;

/** Build the user-turn prompt with retrieved context (already deduplicated). */
export function buildPrompt({ question, docs = [], business = null }) {
  if (typeof question !== 'string' || !question.trim()) {
    throw new TypeError('buildPrompt requires a non-empty question');
  }
  const facts = docs.slice(0, MAX_CONTEXT_DOCS)
    .map((doc, i) => `[${i + 1}] Q: ${doc.question}\nA: ${doc.answer}`)
    .join('\n');
  const contact = business?.contact;
  const footer = contact
    ? `\nContact facts: phone ${contact.phone_display ?? ''}, Zalo ${contact.zalo ?? ''}.`
    : '';
  return {
    system: SYSTEM_PROMPT,
    user: `BUSINESS FACTS:\n${facts || '(no relevant facts found — reply NOINFO)'}${footer}\n\nUSER QUESTION: ${question}`
  };
}

/**
 * Validate raw LLM output. Returns cleaned text, or null when the output
 * must be discarded (fallback then answers with the honest "unknown").
 */
export function validateLlmOutput(output) {
  if (typeof output !== 'string') return null;
  const text = output.trim();
  if (text.length === 0) return null;
  if (text.length > MAX_OUTPUT_CHARS) return null;
  if (text.toUpperCase().includes('NOINFO')) return null;
  // Reject obvious prompt echo / jailbreak artifacts.
  if (text.includes('BUSINESS FACTS:') || text.includes('SYSTEM') === true && text.startsWith('You are')) return null;
  if (/<script|javascript:/i.test(text)) return null;
  return text;
}

/**
 * Fact guard: LLM output must not introduce price-like numbers that do not
 * appear in the verified context (docs + any extra verified text such as the
 * contact-facts footer of the prompt). Used together with
 * validateLlmOutput; if it fails, the deterministic fallback wins.
 */
export function guardFacts(text, docs = [], extraVerified = '') {
  if (typeof text !== 'string') return false;
  const verified = docs.map((doc) => String(doc.answer ?? '')).join(' ') + ' ' + String(extraVerified ?? '');
  const verifiedNumbers = new Set(verified.match(/\d[\d.,]*/g) ?? []);
  const outNumbers = text.match(/\d[\d.,]*/g) ?? [];
  for (const raw of outNumbers) {
    const key = raw.replace(/[.,]+$/g, '');
    if (!verifiedNumbers.has(key)) return false;
  }
  return true;
}

/** Wrap an accepted LLM answer with an honest disclosure line. */
export function withDisclosure(text, disclosure) {
  const line = typeof disclosure === 'string' && disclosure.trim().length > 0 ? disclosure.trim() : '';
  return line ? `${text}\n\n— ${line}` : text;
}
