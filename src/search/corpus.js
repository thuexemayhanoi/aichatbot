import { tokenize } from '../nlu/tokenizer.js';

/**
 * Build the retrieval corpus from REPOSITORY-OWNED business data only
 * (data/business/business.json, pricing.json, faq.json).
 *
 * Every document is a verified business fact. The corpus never contains
 * scraped or learned content, so retrieval can never inject unverified
 * facts into answers. Bilingual keywords (vi + en) are attached per doc
 * type so English queries such as "Where are you located?" can match.
 *
 * `{{ business.x }}` templates stay unresolved here; the responder
 * resolves them against the authoritative business object at render time.
 */

function tokensOf(...parts) {
  return tokenize(parts.filter(Boolean).join(' '));
}

/**
 * @returns {Array<{id, source, question, answer, tokens}>}
 * `question` is the canonical phrasing shown to the local LLM as context.
 */
export function buildCorpus({ business, pricing, faq } = {}) {
  if (!business || !pricing || !faq) {
    throw new TypeError('buildCorpus requires business, pricing and faq data');
  }
  const docs = [];

  const push = (id, source, question, answer, keywordParts = []) => {
    if (typeof answer !== 'string' || answer.length === 0) return;
    docs.push({
      id,
      source,
      question,
      answer,
      tokens: [...tokensOf(question, ...keywordParts), ...tokenize(answer)]
    });
  };

  const c = business.contact ?? {};
  const h = business.hours ?? {};
  const p = business.policies ?? {};

  push('business:address', 'business-data',
    'Địa chỉ ở đâu? / Where are you located?',
    business.address?.full ?? '',
    ['address', 'where located', 'dia chi o dau', 'vi tri', 'office', 'shop', 'location', 'ban o dau']);

  push('business:hours', 'business-data',
    'Giờ mở cửa? / What are your opening hours?',
    `Giờ hoạt động: {{ business.hours.display }}. ${p.delivery?.note ?? ''}`,
    ['opening hours', 'gio mo cua', 'what time open', 'ban mo cua may gio', 'gio lam viec', 'open close']);

  push('business:contact', 'business-data',
    'Số điện thoại? / How can I contact you?',
    `Số điện thoại: {{ business.contact.phone_display }}. Zalo/WhatsApp: {{ business.contact.phone_display }}. Email: {{ business.contact.email }}.`,
    ['phone number', 'so dien thoai', 'contact', 'lien he', 'call', 'zalo', 'whatsapp', 'email', 'hotline', 'telephone']);

  push('business:deposit', 'business-data',
    'Có cần đặt cọc không? / Do I need a deposit?',
    `{{ business.policies.deposit.note }}`,
    ['deposit', 'dat coc', 'tien coc', 'deposit required', 'collateral', 'cai coc', 'coc bao nhieu', 'bao nhieu tien coc']);

  push('business:insurance', 'business-data',
    'Có bảo hiểm không? / Is insurance included?',
    `{{ business.policies.insurance.note }}`,
    ['insurance', 'bao hiem', 'insured', 'coverage']);

  push('business:delivery', 'business-data',
    'Có giao xe tận nơi không? / Do you deliver?',
    `{{ business.policies.delivery.note }}`,
    ['delivery', 'giao xe tan noi', 'giao xe tan nha', 'deliver bike', 'ship xe', 'giao xe o nha', 'home delivery', 'giao xe']);

  push('business:areas', 'business-data',
    'Giao xe ở khu vực nào? / Which areas do you serve?',
    `Khu vực phục vụ: ${(business.service_areas ?? []).join(', ')}.`,
    ['service area', 'khu vuc', 'areas serve', 'areas', 'quan huyen', 'district']);

  // FAQ quick questions (canonical answers, templates resolved by responder).
  for (const item of faq.quick_questions ?? []) {
    const extra = Array.isArray(item.keywords) ? item.keywords : [];
    const bilingual = BILINGUAL.get(item.id) ?? [];
    push(`faq:${item.id}`, 'faq-data', item.question, item.answer, [...extra, ...bilingual]);
  }

  // Vehicle pricing documents — the authoritative numbers come from pricing.json.
  const symbol = pricing.currency_symbol ?? 'đ';
  for (const vehicle of pricing.vehicles ?? []) {
    const rates = vehicle.rates ?? {};
    const lines = [];
    for (const type of pricing.rental_types ?? []) {
      const rate = rates[type.id];
      if (!rate || rate.min == null) continue;
      const range = rate.max != null && rate.max !== rate.min
        ? `${formatVnd(rate.min, symbol)} - ${formatVnd(rate.max, symbol)}`
        : formatVnd(rate.min, symbol);
      lines.push(`${type.name}: ${range}`);
    }
    if (lines.length === 0) continue;
    const aliases = (vehicle.aliases ?? []).join(' ');
    push(`pricing:${vehicle.id}`, 'pricing-data',
      `Giá thuê ${vehicle.name}? / ${vehicle.name} rental price?`,
      `Giá thuê ${vehicle.name}:\n- ${lines.join('\n- ')}\n${pricing.disclaimer ?? ''}`,
      [vehicle.name, aliases, vehicle.category,
        'gia thue', 'rental price', 'price', 'how much', 'bao nhieu', 'cost', 'ban gia',
        'xe may', 'motorbike', 'bike', 'xe', ...categoryKeywords(vehicle.category)]);
  }

  // Rental duration documents.
  for (const item of faq.quick_questions ?? []) {
    // duration docs already covered above when present in quick_questions
    void item;
  }
  for (const type of pricing.rental_types ?? []) {
    const bilingual = DURATION_KEYWORDS[type.id] ?? [];
    push(`duration:${type.id}`, 'faq-data',
      `Thuê ${type.name}? / ${type.name} rental?`,
      `${type.name} phù hợp cho thuê ${type.days} ngày. Giá tùy loại xe, xem danh sách xe hoặc liên hệ {{ business.contact.phone_display }} để được báo giá.`,
      ['thue', 'rental', 'thoi gian', 'duration', ...bilingual]);
  }

  return docs;
}

function categoryKeywords(category) {
  if (!category) return [];
  const cat = String(category);
  if (cat.includes('50cc')) return ['50cc', 'xe 50', 'light bike'];
  if (cat.includes('điện')) return ['electric', 'xe dien'];
  if (cat.toLowerCase().includes('tay ga') || cat.toLowerCase().includes('ga')) {
    return ['automatic', 'scooter', 'xe tay ga', 'xe ga', 'xe số ga'];
  }
  if (cat.toLowerCase().includes('số')) return ['manual', 'xe so', 'underbone'];
  return [];
}

const DURATION_KEYWORDS = {
  day: ['per day', 'theo ngay', '1 ngay', 'mot ngay', 'daily', 'ngay'],
  week: ['per week', 'theo tuan', '7 days', 'mot tuan', 'weekly', 'tuan', '1 week'],
  month: ['per month', 'theo thang', '30 days', 'mot thang', 'monthly', 'thang', '1 month']
};

/** Extra bilingual keywords for known FAQ ids (kept small and explicit). */
const BILINGUAL = new Map([
  ['honda-wave', ['wave', 'xe so', 'manual bike']],
  ['honda-vision', ['vision', 'scooter', 'automatic']],
  ['xe-50cc', ['50cc', 'small bike']],
  ['deposit', ['deposit', 'dat coc']],
  ['daily-rental', ['daily', 'per day', 'theo ngay']],
  ['weekly-rental', ['weekly', '7 days', 'theo tuan']],
  ['monthly-rental', ['monthly', '30 days', 'theo thang']]
]);

function formatVnd(value, symbol) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return `${n.toLocaleString('vi-VN')}${symbol}`;
}
