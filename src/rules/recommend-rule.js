import { recommendBikes } from '../recommend/recommender.js';

/**
 * Recommendation rule: deterministic advice grounded in pricing.json.
 *
 * canHandle: recommendation_query intent.
 * The rule reads rider context (height, experience, usage, destination,
 * duration, budget...) from turn entities MERGED with remembered slots,
 * then delegates to the recommendation engine and renders a template
 * answer. When nothing usable is known, it asks ONE clarifying question.
 */
export function createRecommendRule({ business, pricing } = {}) {
  return {
    id: 'recommend-rule',
    canHandle(analysis) {
      return analysis?.intent?.id === 'recommendation_query';
    },
    respond(analysis, slots) {
      const rider = analysis?.entities?.rider ?? {};
      const durationDays = Number.isInteger(analysis?.entities?.totalDays)
        ? analysis.entities.totalDays
        : slots?.durationDays ?? null;

      const constraints = {
        transmission: rider.transmission ?? slots?.transmission ?? null,
        electric: rider.electric ?? slots?.electric ?? null,
        usage: rider.usage ?? slots?.usage ?? null,
        destination: rider.destination ?? slots?.destination ?? null,
        durationDays,
        budget: rider.budget ?? slots?.budget ?? null,
        experience: rider.experience ?? slots?.experience ?? null,
        luggage: rider.luggage ?? slots?.luggage ?? null,
        heightCm: rider.heightCm ?? slots?.heightCm ?? null
      };

      const result = recommendBikes(pricing, constraints);

      if (result.recommendedModels.length === 0) {
        return {
          handled: true,
          answer: 'Mình chưa đủ thông tin để gợi ý. Bạn đi chủ yếu trong phố hay đường dài, và muốn xe ga hay xe số?',
          clarify: { intentId: 'recommendation_query', needs: [] },
          confidence: 0.5,
          source: 'recommendation'
        };
      }

      const lines = ['Dựa trên bảng giá và mô tả niêm yết, mình gợi ý:'];
      for (const model of result.recommendedModels) {
        lines.push(`- ${model.name} (${model.category}): ${model.reasons.join('; ')}.`);
        for (const tradeoff of model.tradeoffs ?? []) lines.push(`  Lưu ý: ${tradeoff}.`);
      }
      if (result.missingInfo.length > 0) {
        lines.push('Thông tin chưa có sẵn (mình không đoán):');
        for (const item of result.missingInfo) lines.push(`- ${item}.`);
      }
      lines.push(`Để chốt xe và giá chính xác, bạn liên hệ ${business.brand} (${business.contact.phone_display}).`);

      return {
        handled: true,
        answer: lines.join('\n'),
        confidence: 0.8,
        source: 'recommendation',
        structured: result
      };
    }
  };
}
