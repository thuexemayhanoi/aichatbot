import { normalize } from './normalizer.js';
import { tokenize } from './tokenizer.js';
import { createSynonymMap, expandSynonyms } from './synonyms.js';
import { createIntentMatcher } from './intents.js';
import { extractDurations } from './entities/duration.js';
import { createVehicleMatcher } from './entities/vehicles.js';
import { createLocationMatcher } from './entities/location.js';
import { extractContactChannels } from './entities/contact-channel.js';
import { extractRiderProfile } from './entities/rider.js';
import { extractDateRange } from './entities/dates.js';
import { detectLanguage } from './language.js';

/**
 * Create the NLU facade used by the engine.
 * All business data (vehicles, areas, synonyms) is injected, never fetched
 * here, so the analyzer stays pure and testable without a DOM or network.
 *
 * Pipeline: normalize -> tokenize -> synonyms -> entities -> intent.
 *
 * `language` is DETECTED per turn (vi/en heuristic) and echoed in the
 * Analysis object; one analyzer instance handles both languages.
 */
export function createAnalyzer({ business, pricing, faq, intents, threshold, language = 'vi' } = {}) {
  const synonymMap = createSynonymMap(faq?.synonyms);
  const vehicleMatcher = createVehicleMatcher(pricing);
  const locationMatcher = createLocationMatcher(business);
  const intentMatcher = createIntentMatcher(intents);

  return function analyze(text, now = new Date()) {
    const normalized = normalize(text);
    const tokens = expandSynonyms(tokenize(normalized), synonymMap);

    const { durations, totalDays, displacements } = extractDurations(tokens);
    const vehicles = vehicleMatcher.match(tokens);
    const locations = locationMatcher.match(tokens);
    const contactChannels = extractContactChannels(tokens);
    const dateRange = extractDateRange(normalized, now);
    // A date range is itself a duration; explicit units (if any) win.
    const resolvedDays = totalDays ?? (dateRange ? dateRange.days : null);
    const rider = extractRiderProfile(normalized);

    const entities = {
      vehicles, durations, totalDays: resolvedDays, displacements,
      locations, contactChannels, dateRange, rider,
      language: detectLanguage(text, language)
    };
    const intent = intentMatcher.match(tokens, entities, threshold);

    return { raw: text, normalized, tokens, intent, entities, language: entities.language };
  };
}
