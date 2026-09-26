import { parseNumber } from '../tokenizer.js';

const UNITS_IN_DAYS = {
  ngay: 1, tuan: 7, thang: 30,
  // English units (tokenized forms, no diacritics involved).
  day: 1, days: 1, week: 7, weeks: 7, month: 30, months: 30
};

const DISPLACEMENT = /^(\d+)cc$/;

/**
 * Extract rental durations and engine displacements from tokens.
 *
 * Hard rules (regression-guarded):
 * - A duration ALWAYS needs an explicit time unit (ngày/tuần/tháng).
 * - A number bound to "cc" (50cc, "110 cc") is engine displacement, never a duration.
 * - Bare numbers are never durations, even with rental context words.
 */
export function extractDurations(tokens) {
  const durations = [];
  const displacements = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    const cc = token.match(DISPLACEMENT);
    if (cc) {
      displacements.push({ cc: Number(cc[1]), raw: token });
      i += 1;
      continue;
    }

    const value = parseNumber(token);
    if (value !== null && Number.isInteger(value) && value > 0) {
      const next = tokens[i + 1];
      if (next === 'cc') {
        // "110 cc" written as two tokens
        displacements.push({ cc: value, raw: `${token} cc` });
        i += 2;
        continue;
      }
      if (next && UNITS_IN_DAYS[next]) {
        durations.push({
          value,
          unit: next,
          days: value * UNITS_IN_DAYS[next],
          raw: `${token} ${next}`
        });
        i += 2;
        continue;
      }
    }

    i += 1;
  }

  const totalDays = durations.length > 0 ? durations.reduce((sum, d) => sum + d.days, 0) : null;
  return { durations, totalDays, displacements };
}
