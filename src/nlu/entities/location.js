import { bestPhraseMatch } from '../match.js';

/**
 * Create a location matcher from the authoritative service areas in business data.
 * Only listed areas match; anything else returns no match (honest "unknown"
 * handling is a rule-layer concern, not an NLU guess).
 */
export function createLocationMatcher(business) {
  const areas = (business?.service_areas ?? []).map((name) => ({ name, aliases: [name] }));

  return {
    /** @returns Array<{ name, matchedPhrase }> */
    match(tokens) {
      const matches = [];
      for (const area of areas) {
        const hit = bestPhraseMatch(tokens, area.aliases);
        if (hit) matches.push({ name: area.name, matchedPhrase: hit.phrase });
      }
      return matches;
    }
  };
}
