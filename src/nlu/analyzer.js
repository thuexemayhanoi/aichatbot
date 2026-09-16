import { normalize } from './normalizer.js';
import { tokenize } from './tokenizer.js';
import { createSynonymMap, expandSynonyms } from './synonyms.js';
import { createIntentMatcher } from './intents.js';
import { extractDurations } from './entities/duration.js';
import { createVehicleMatcher } from './entities/vehicles.js';
import { createLocationMatcher } from './entities/location.js';
import { extractContactChannels } from './entities/contact-channel.js';

/**
 * Create the NLU facade used by the engine.
 * All business data (vehicles, areas, synonyms) is injected, never fetched
 * here, so the analyzer stays pure and testable without a DOM or network.
 *
 * Pipeline: normalize -> tokenize -> synonyms -> entities -> intent.
 *
 * `language` (default 'vi') is echoed in every Analysis object so a future
 * language router (v42) can route on it without touching this module.
 * One analyzer instance serves one language; routing composes instances.
 */
export function createAnalyzer({ business, pricing, faq, intents, threshold, language = 'vi' } = {}) {
  const synonymMap = createSynonymMap(faq?.synonyms);
  const vehicleMatcher = createVehicleMatcher(pricing);
  const locationMatcher = createLocationMatcher(business);
  const intentMatcher = createIntentMatcher(intents);

  return function analyze(text) {
    const normalized = normalize(text);
    const tokens = expandSynonyms(tokenize(normalized), synonymMap);

    const { durations, totalDays, displacements } = extractDurations(tokens);
    const vehicles = vehicleMatcher.match(tokens);
    const locations = locationMatcher.match(tokens);
    const contactChannels = extractContactChannels(tokens);

    const entities = { vehicles, durations, totalDays, displacements, locations, contactChannels };
    const intent = intentMatcher.match(tokens, entities, threshold);

    return { raw: text, normalized, tokens, intent, entities, language };
  };
}
