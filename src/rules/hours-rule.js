import { hourInTimeZone } from '../utils/format.js';

/**
 * Hours rule: opening hours with live open/closed status.
 * Time logic is deterministic: business hours are evaluated in the
 * Asia/Ho_Chi_Minh time zone regardless of the visitor's device locale.
 */
export function createHoursRule({ business } = {}) {
  return {
    id: 'hours-rule',
    canHandle(analysis) {
      return analysis?.intent?.id === 'hours_query';
    },
    respond(analysis, slots, context = {}) {
      const hours = business.hours;
      // Contract: context.now is a clock function (engine injects one);
      // a raw Date/ms value is also accepted for direct rule testing.
      const timestamp = typeof context.now === 'function' ? context.now() : context.now;
      const now = timestamp === undefined ? new Date() : new Date(timestamp);
      const clock = hourInTimeZone(now, hours.timeZone);
      const isOpen = Boolean(clock && clock.hour >= hours.openHour && clock.hour < hours.closeHour);
      const status = clock ? (isOpen ? 'Hiện đang mở cửa.' : 'Hiện đang đóng cửa.') : '';
      const answer = [
        `${business.display_name} hoạt động từ ${hours.display} hằng ngày.`,
        status,
        'Không giao xe ngoài giờ hoạt động.'
      ]
        .filter(Boolean)
        .join(' ');
      return { handled: true, answer, confidence: 1, source: 'business-data' };
    }
  };
}
