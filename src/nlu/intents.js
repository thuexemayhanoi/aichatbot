import { phraseToTokens, phraseScore } from './match.js';

export const DEFAULT_INTENT_THRESHOLD = 0.5;

/**
 * Declarative intent definitions (Vietnamese).
 * Add a new intent by appending a definition; nothing else needs to change.
 * Phrases may be written with full Vietnamese diacritics.
 */
export const INTENT_DEFINITIONS = [
  { id: 'price_query', phrases: ['giá', 'giá thuê', 'giá xe', 'chi phí', 'phí thuê', 'bao nhiêu tiền'] },
  { id: 'deposit_query', phrases: ['đặt cọc', 'tiền cọc', 'thế chân'] },
  { id: 'documents_query', phrases: ['giấy tờ', 'chứng minh nhân dân', 'hộ chiếu', 'bằng lái', 'cần gì để thuê', 'điều kiện thuê'] },
  { id: 'contact_query', phrases: ['liên hệ', 'số điện thoại', 'sdt', 'gọi điện', 'zalo', 'whatsapp', 'email'] },
  { id: 'delivery_query', phrases: ['giao xe', 'giao tận nơi', 'giao đến', 'giao ở', 'giao tại', 'ship xe', 'nhận xe tại'] },
  { id: 'return_query', phrases: ['trả xe', 'hoàn xe', 'muộn trả', 'trễ trả'] },
  { id: 'policy_query', phrases: ['chính sách', 'điều khoản', 'quy định', 'bảo hiểm', 'hủy'] },
  { id: 'bike_type_query', phrases: ['loại xe', 'dòng xe', 'có xe gì', 'có những xe nào'] },
  { id: 'duration_query', phrases: ['thuê bao lâu', 'thời gian thuê', 'thuê theo ngày', 'thuê theo tuần', 'thuê theo tháng', 'thuê dài hạn', 'thuê ngắn hạn'] },
  { id: 'location_query', phrases: ['ở đâu', 'khu vực', 'quận nào', 'địa chỉ', 'giao ở đâu'] },
  { id: 'hours_query', phrases: ['giờ mở cửa', 'giờ hoạt động', 'mấy giờ', 'mở cửa', 'đóng cửa'] },
  { id: 'recommendation_query', phrases: ['nên thuê xe gì', 'nên chọn xe nào', 'nên thuê xe nào', 'xe nào phù hợp', 'gợi ý xe', 'tư vấn xe', 'which bike', 'recommend', 'xe gì hợp', 'chọn xe nào', 'nên chọn xe gì', 'chọn xe gì', 'nên lấy xe'] },
  { id: 'compare_query', phrases: ['rẻ hơn', 'rẻ nhất', 'so sánh', 'cái nào rẻ', 'xe nào rẻ', 'which is cheaper', 'cheaper', 'giá nào tốt hơn'] },
  { id: 'greeting', phrases: ['xin chào', 'chào bạn', 'hello', 'hi', 'chào'] }
];

/**
 * Create an intent classifier.
 * Score = best phrase score (contiguous phrase = 1.0, scattered tokens discounted).
 * When nothing reaches the threshold, entities infer a sensible intent:
 *   vehicle mentioned  -> price_query
 *   duration mentioned -> duration_query
 *   displacement only  -> bike_type_query
 *   location mentioned -> location_query
 * Otherwise the intent is 'unknown'.
 */
export function createIntentMatcher(definitions = INTENT_DEFINITIONS) {
  const compiled = definitions
    .filter((def) => def && typeof def.id === 'string' && Array.isArray(def.phrases))
    .map((def) => ({
      id: def.id,
      phrases: def.phrases
        .map((phrase) => ({ raw: phrase, tokens: phraseToTokens(phrase) }))
        .filter((p) => p.tokens.length > 0)
    }))
    .filter((intent) => intent.phrases.length > 0);

  function match(tokens, entities = {}, threshold = DEFAULT_INTENT_THRESHOLD) {
    const scored = compiled
      .map((intent) => {
        let score = 0;
        let matchedPhrase = null;
        for (const phrase of intent.phrases) {
          const s = phraseScore(tokens, phrase.tokens);
          if (s > score) {
            score = s;
            matchedPhrase = phrase.raw;
          }
        }
        return { id: intent.id, score: round(score), matchedPhrase };
      })
      .sort((a, b) => b.score - a.score);

    const ranked = scored.slice(0, 3);
    const best = scored[0];

    if (best && best.score >= threshold) {
      return { id: best.id, score: best.score, matchedPhrase: best.matchedPhrase, inferred: false, ranked };
    }
    const inferred = inferFromEntities(entities);
    if (inferred) {
      return { id: inferred, score: best ? best.score : 0, matchedPhrase: null, inferred: true, ranked };
    }
    return { id: 'unknown', score: best ? best.score : 0, matchedPhrase: null, inferred: false, ranked };
  }

  return { match };
}

function inferFromEntities(entities) {
  if (!entities) return null;
  if (entities.vehicles && entities.vehicles.length) return 'price_query';
  // A stated trip shape (destination/road) without a vehicle is advice-seeking.
  if (entities.rider && (entities.rider.destination || entities.rider.usage)) return 'recommendation_query';
  if (entities.durations && entities.durations.length) return 'duration_query';
  if (entities.displacements && entities.displacements.length) return 'bike_type_query';
  if (entities.locations && entities.locations.length) return 'location_query';
  return null;
}

function round(n) {
  return Math.round(n * 100) / 100;
}
