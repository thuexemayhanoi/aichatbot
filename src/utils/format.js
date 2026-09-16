/**
 * Formatting helpers for Vietnamese-facing output.
 * Pure functions, no locale runtime dependency: number grouping is manual so
 * output is byte-identical across browsers (Safari included).
 */

/** Group thousands with Vietnamese dots: 150000 -> "150.000". */
export function groupDigits(value) {
  if (value === null || value === undefined) return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const sign = n < 0 ? '-' : '';
  const digits = Math.abs(Math.trunc(n)).toString();
  if (digits.length <= 3) return sign + digits;
  const parts = [];
  for (let i = digits.length; i > 0; i -= 3) {
    parts.unshift(digits.slice(Math.max(0, i - 3), i));
  }
  return sign + parts.join('.');
}

/** Format one VND amount: 150000 -> "150.000đ". Null-safe: returns null for null. */
export function formatVnd(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return `${groupDigits(value)}đ`;
}

/**
 * Format a VND range with the business separator " - ".
 * - min === max            -> "150.000đ"
 * - max null               -> "từ 150.000đ"
 * - min null               -> "tối đa 150.000đ"
 * - both null / malformed  -> null (never "0đ")
 */
export function formatVndRange(min, max) {
  const hasMin = min !== null && min !== undefined && Number.isFinite(Number(min));
  const hasMax = max !== null && max !== undefined && Number.isFinite(Number(max));
  if (!hasMin && !hasMax) return null;
  if (hasMin && hasMax) {
    if (Number(min) === Number(max)) return formatVnd(min);
    return `${formatVnd(min)} - ${formatVnd(max)}`;
  }
  if (hasMin) return `từ ${formatVnd(min)}`;
  return `tối đa ${formatVnd(max)}`;
}

/**
 * Human-friendly duration in Vietnamese.
 * 30 -> "1 tháng", 14 -> "2 tuần", 5 -> "5 ngày".
 * Non-integers and non-positives fall back to days.
 */
export function describeDays(days) {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (Number.isInteger(n) && n % 30 === 0) return `${n / 30} tháng`;
  if (Number.isInteger(n) && n % 7 === 0) return `${n / 7} tuần`;
  return `${n} ngày`;
}

/**
 * Wall-clock hour in an IANA time zone, independent of the host locale.
 * Returns { hour, minute } on a 0-23 scale ("h23", so midnight is 0).
 */
export function hourInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return { hour, minute };
}

/** "9", "5" -> "09:05". */
export function formatClock(hour, minute) {
  const h = Number(hour);
  const m = Number(minute);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm}`;
}
