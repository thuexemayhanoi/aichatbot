/**
 * Fact Guard v2 — validates a candidate answer against verified sources
 * BEFORE it reaches the user. Used for local-LLM phrasing/synthesis; the
 * deterministic rules produce trusted text directly.
 *
 * Verified bundle = retrieved docs + structured results (calculator /
 * recommendation) + pinned business fields (phone, hours, deposit note,
 * address, service areas). Rejects:
 *   - numbers (prices, days, deposits) absent from the bundle
 *   - phone-like sequences that are not the business number
 *   - clock times that are not the published opening hours
 */
import { guardFacts } from './grounding.js';

const PHONE = /(?:\+84|0)\d[\d\s.-]{7,12}\d/g;
const CLOCK = /\b\d{1,2}:\d{2}\b/g;
const NUMBER = /\d[\d.,]*/g;

/**
 * @param {string} text - candidate answer.
 * @param {object} bundle
 * @param {Array}  [bundle.docs]         - retrieved verified docs.
 * @param {Array<string>} [bundle.verifiedTexts] - deterministic structured texts.
 * @param {object} [bundle.business]     - authoritative business.json.
 * @returns {boolean} true when the answer is fully grounded.
 */
export function guardAnswer(text, bundle = {}) {
  if (typeof text !== 'string' || text.trim().length === 0) return false;

  const business = bundle.business ?? {};
  const verifiedText = [
    ...(bundle.docs ?? []).map((doc) => String(doc.answer ?? '')),
    ...(Array.isArray(bundle.verifiedTexts) ? bundle.verifiedTexts.map(String) : []),
    business.address?.full ?? '',
    business.contact?.phone_display ?? '',
    business.contact?.phone ?? '',
    business.hours?.display ?? '',
    business.policies?.deposit?.note ?? '',
    (business.service_areas ?? []).join(' ')
  ].join(' ');

  // Numbers must exist in the verified text (same rule as guardFacts).
  const verifiedNumbers = new Set((verifiedText.match(NUMBER) ?? []).map((raw) => raw.replace(/[.,]+$/g, '')));
  for (const raw of text.match(NUMBER) ?? []) {
    if (!verifiedNumbers.has(raw.replace(/[.,]+$/g, ''))) return false;
  }

  // Phone-like sequences must be the business number (digit-compare).
  const businessDigits = digits(business.contact?.phone ?? '');
  for (const match of text.match(PHONE) ?? []) {
    if (digits(match) !== businessDigits) return false;
  }

  // Clock times must be the published open/close hours.
  const [open, close] = String(business.hours?.display ?? '').split(/\s*-\s*/);
  for (const match of text.match(CLOCK) ?? []) {
    if (match !== open && match !== close) return false;
  }

  // Legacy guard (prompt-echo / NOINFO / script injection) still applies.
  return guardFacts(text, bundle.docs ?? [], verifiedText);
}

function digits(text) {
  return String(text ?? '').replace(/\D/g, '');
}
