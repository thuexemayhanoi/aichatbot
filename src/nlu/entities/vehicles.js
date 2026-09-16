import { bestPhraseMatch } from '../match.js';
import { normalize } from '../normalizer.js';

function slug(name) {
  return normalize(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Create a vehicle matcher from the authoritative pricing data.
 * Matches bike models ("Honda Vision") and categories ("xe tay ga")
 * as contiguous token phrases, completely separately from numbers.
 *
 * Vehicles flagged "matches_as_category" (e.g. Xe 50cc) register only as a
 * category so they cannot appear twice in the results.
 */
export function createVehicleMatcher(pricing) {
  const models = [];
  const categories = new Map();

  const addCategory = (entry) => {
    if (!categories.has(entry.id)) categories.set(entry.id, entry);
  };

  for (const vehicle of pricing?.vehicles ?? []) {
    const aliases = [vehicle.name, ...(vehicle.aliases ?? [])];
    if (vehicle.matches_as_category) {
      addCategory({ type: 'category', id: vehicle.id, name: vehicle.name, aliases });
      continue;
    }
    models.push({ type: 'model', id: vehicle.id, name: vehicle.name, aliases });
    const categoryAliases = [
      vehicle.category,
      ...(pricing?.category_aliases?.[vehicle.category] ?? [])
    ];
    addCategory({ type: 'category', id: slug(vehicle.category), name: vehicle.category, aliases: categoryAliases });
  }

  const entries = [...models, ...categories.values()];

  return {
    /** @returns Array<{ type: 'model'|'category', id, name, matchedPhrase }> */
    match(tokens) {
      const matches = [];
      for (const entry of entries) {
        const hit = bestPhraseMatch(tokens, entry.aliases);
        if (hit) {
          matches.push({ type: entry.type, id: entry.id, name: entry.name, matchedPhrase: hit.phrase });
        }
      }
      return matches;
    }
  };
}
