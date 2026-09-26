/**
 * Verified business open/closed status (v54).
 * Hours come from data/business/business.json (hours.open/close/display/
 * timeZone) — NEVER hard-coded here. Time is evaluated in the BUSINESS
 * timezone (e.g. Asia/Ho_Chi_Minh), not the visitor's device timezone.
 */

/** "HH:MM" -> minutes since midnight. */
function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  return (h % 24) * 60 + m;
}

/** Current minutes-since-midnight of `now` inside `timeZone` (Intl-based). */
export function minutesInZone(now, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone, hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return (hour % 24) * 60 + minute;
  } catch {
    return null; // unknown timezone -> caller hides the status
  }
}

/**
 * Pure status computation — deterministic, unit-testable.
 * @returns {{open:boolean, opensAt:string, closesAt:string, display:string}|null}
 * null = hours data missing/invalid -> the UI must hide the status.
 */
export function computeStatus({ now = new Date(), hours } = {}) {
  if (!hours || !hours.open || !hours.close || !hours.timeZone) return null;
  const current = minutesInZone(now, hours.timeZone);
  const open = toMinutes(hours.open);
  const close = toMinutes(hours.close);
  if (current === null || open === null || close === null) return null;
  // A window that passes midnight (close <= open) wraps; otherwise plain.
  const within = close > open
    ? current >= open && current < close
    : current >= open || current < close;
  return { open: within, opensAt: hours.open, closesAt: hours.close, display: hours.display ?? `${hours.open}–${hours.close}` };
}

/** Render the status chip into `el`; hidden when data is unavailable. */
export function renderStatus(el, status) {
  if (!el) return;
  if (!status) { el.hidden = true; return; }
  el.hidden = false;
  if (status.open) {
    el.dataset.state = 'open';
    el.textContent = `🟢 Đang mở · ${status.display}`;
  } else {
    el.dataset.state = 'closed';
    el.textContent = `🌙 Đã đóng · Mở lại ${status.opensAt}`;
  }
}
