/**
 * Date-range parsing for rental periods ("từ 5/10 đến 18/10", "5/10-18/10",
 * "from 5/10 to 18/10"). Works on the NORMALIZED text (accents stripped).
 *
 * Deterministic and validated: invalid day/month, reversed ranges and
 * year wrap are rejected (null), never guessed. Days are INCLUSIVE of both
 * endpoints (pickup and return days are rental days). Leap years are handled
 * by the Date implementation itself.
 */

const RANGE = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:-|den|toi|to|until|->|–|→|~)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/;
const DAY_MS = 86_400_000;

/**
 * @param {string} normalized - normalized user text.
 * @param {Date}   [now]      - clock for default year (tests).
 * @returns {{start, end, days, raw}|null} dates as YYYY-MM-DD, days inclusive.
 */
export function extractDateRange(normalized, now = new Date()) {
  const text = String(normalized ?? '');
  const m = RANGE.exec(text);
  if (!m) return null;

  const defaultYear = now instanceof Date && Number.isFinite(now.getFullYear()) ? now.getFullYear() : new Date().getFullYear();

  const start = parseDate(m[1], m[2], m[3], defaultYear);
  const end = parseDate(m[4], m[5], m[6], defaultYear);
  if (!start || !end) return null;
  if (end.getTime() < start.getTime()) return null;

  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (!Number.isInteger(days) || days <= 0 || days > 366) return null;

  return {
    start: toIso(start),
    end: toIso(end),
    days,
    raw: m[0].trim()
  };
}

function parseDate(dayRaw, monthRaw, yearRaw, defaultYear) {
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  let year = yearRaw != null ? Number(yearRaw) : defaultYear;
  if (yearRaw != null && yearRaw.length === 2) year += 2000;
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject e.g. 31/02 or 29/02 on a non-leap year.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

function toIso(date) {
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Human label: "2026-10-05" -> "05/10/2026" (Vietnamese reading order). */
export function formatDateVi(iso) {
  const [y, m, d] = String(iso ?? '').split('-');
  if (!y || !m || !d) return String(iso ?? '');
  return `${d}/${m}/${y}`;
}
