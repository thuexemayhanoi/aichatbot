import { createHoursRule } from './hours-rule.js';
import { createDepositRule } from './deposit-rule.js';
import { createContactRule } from './contact-rule.js';
import { createDeliveryRule } from './delivery-rule.js';
import { createReturnRule } from './return-rule.js';
import { createPolicyRule } from './policy-rule.js';
import { createLocationRule } from './location-rule.js';
import { createBikeTypeRule } from './bike-type-rule.js';
import { createPricingRule } from './pricing-rule.js';
import { createDurationRule } from './duration-rule.js';
import { createGreetingRule } from './greeting-rule.js';
import { createFallbackRule } from './fallback-rule.js';

/**
 * Rule registry.
 *
 * Priority is the array order below. It encodes two principles:
 * 1. Specific business facts (hours, deposit, contact, delivery) answer
 *    before broad catalog/price answers.
 * 2. When a turn triggers several equally-scored intents
 *    ("số điện thoại và giá thuê Wave"), the higher-priority rule wins —
 *    deterministic multi-intent handling without a planner (v43 territory).
 *
 * The fallback is kept OUTSIDE the rules list: the engine applies it only
 * after the rules and the optional retriever have all declined, so it can
 * never block a future search layer.
 */
const RULE_FACTORIES = [
  createHoursRule, // 1. opening hours + live status
  createDepositRule, // 2. deposit range
  createContactRule, // 3. phone/zalo/whatsapp/email/maps
  createDeliveryRule, // 4. delivery areas
  createReturnRule, // 5. return process (honest unknown)
  createPolicyRule, // 6. insurance + other policies
  createLocationRule, // 7. business address
  createBikeTypeRule, // 8. catalog listing
  createPricingRule, // 9. prices and estimates (may clarify vehicle)
  createDurationRule, // 10. general rental-duration questions
  createGreetingRule // 11. greetings
];

/**
 * @param {object} data - { business, pricing, faq } authoritative data files.
 * @returns { rules, fallback } where rules is priority-ordered.
 */
export function createRuleRegistry({ business, pricing, faq } = {}) {
  if (!business || typeof business !== 'object') throw new TypeError('createRuleRegistry requires business data');
  if (!pricing || typeof pricing !== 'object') throw new TypeError('createRuleRegistry requires pricing data');
  if (!faq || typeof faq !== 'object') throw new TypeError('createRuleRegistry requires faq data');

  const rules = RULE_FACTORIES.map((factory) => factory({ business, pricing, faq }));
  for (const rule of rules) {
    if (!rule || typeof rule.id !== 'string' || typeof rule.canHandle !== 'function' || typeof rule.respond !== 'function') {
      throw new TypeError(`invalid rule produced by registry: ${rule?.id ?? 'unknown'}`);
    }
  }

  const fallback = createFallbackRule({ business, pricing, faq });
  return { rules, fallback };
}
