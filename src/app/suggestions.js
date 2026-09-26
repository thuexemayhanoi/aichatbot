/**
 * Customer-facing suggestion chips — deterministic only, never from the LLM.
 * Query chips are plain user messages routed through the normal engine.
 * Link chips carry a ref resolved from business.json at render time.
 * Agent chips open the local Agent flow in the UI.
 */

const LINK_REFS = Object.freeze({ zalo: 'zalo', call: 'phone_uri', map: 'maps', whatsapp: 'whatsapp' });

/** Primary quick-action bar: ONE horizontal row, fixed order, never shortened. */
export const DEFAULT_CHIPS = Object.freeze([
  Object.freeze({ id: 'agent', label: '⚡ Agent', type: 'agent' }),
  Object.freeze({ id: 'pricing', label: '💰 Giá thuê', query: 'Giá thuê xe bao nhiêu?' }),
  Object.freeze({ id: 'scooter', label: '🛵 Xe ga', query: 'Xe ga' }),
  Object.freeze({ id: 'manual', label: '🏍️ Xe số', query: 'Xe số' }),
  Object.freeze({ id: 'monthly', label: '📅 Theo tháng', query: 'Thuê theo tháng' }),
  Object.freeze({ id: 'deposit', label: '💵 Đặt cọc', query: 'Đặt cọc bao nhiêu?' }),
  Object.freeze({ id: 'procedure', label: '📄 Thủ tục', query: 'Thuê xe cần giấy tờ gì?' }),
  Object.freeze({ id: 'zalo', label: '💬 Zalo', type: 'link', ref: LINK_REFS.zalo }),
  Object.freeze({ id: 'call', label: '📞 Gọi', type: 'link', ref: LINK_REFS.call }),
  Object.freeze({ id: 'address', label: '📍 Địa chỉ', query: 'Địa chỉ ở đâu?' }),
  Object.freeze({ id: 'contact', label: '☎️ Liên hệ', query: 'Liên hệ' }),
  Object.freeze({ id: 'map', label: '🗺️ Bản đồ', type: 'link', ref: LINK_REFS.map })
]);

/** Link chip href from verified business.json ('' when data is missing). */
export function resolveChipHref(chip, business) {
  const contact = business?.contact ?? {};
  const value = chip?.ref === LINK_REFS.zalo ? contact.zalo
    : chip?.ref === LINK_REFS.call ? contact.phone_uri
    : chip?.ref === LINK_REFS.map ? contact.maps
    : chip?.ref === LINK_REFS.whatsapp ? contact.whatsapp
    : null;
  return typeof value === 'string' && value.length > 0 ? value : '';
}


const PRICE_CHIPS = Object.freeze([
  Object.freeze({ id: 'day', label: '1 ngày', query: 'Thuê 1 ngày' }),
  Object.freeze({ id: 'week', label: '1 tuần', query: 'Thuê 1 tuần' }),
  Object.freeze({ id: 'month', label: '1 tháng', query: 'Thuê 1 tháng' }),
  Object.freeze({ id: 'book', label: 'Đặt xe', query: 'Liên hệ đặt xe' })
]);


const VEHICLE_CHIPS = Object.freeze([
  Object.freeze({ id: 'vision', label: 'Vision', query: 'Honda Vision' }),
  Object.freeze({ id: 'air-blade', label: 'Air Blade', query: 'Honda Air Blade' }),
  Object.freeze({ id: 'week', label: 'Theo tuần', query: 'Thuê theo tuần' }),
  Object.freeze({ id: 'month', label: 'Theo tháng', query: 'Thuê theo tháng' })
]);


const CONTACT_CHIPS = Object.freeze([
  Object.freeze({ id: 'directions', label: 'Chỉ đường', query: 'Địa chỉ ở đâu?' }),
  Object.freeze({ id: 'call', label: 'Gọi điện', query: 'Số điện thoại' }),
  Object.freeze({ id: 'zalo', label: 'Zalo', query: 'Zalo' }),
  Object.freeze({ id: 'hours', label: 'Giờ mở cửa', query: 'Giờ mở cửa' })
]);

const PRICE_INTENTS = new Set(['price_query', 'compare_query', 'deposit_query']);
const CONTACT_INTENTS = new Set(['location_query', 'contact_query', 'hours_query', 'delivery_query']);
const VEHICLE_INTENTS = new Set(['bike_type_query', 'recommendation_query']);

/** Next chip row from the finished turn; renders in the SAME single row. */
export function nextSuggestions(turn = {}) {
  const intentId = turn?.intentId ?? null;
  const slots = turn?.slots ?? {};
  if (intentId && PRICE_INTENTS.has(intentId)) return PRICE_CHIPS;
  if (intentId && CONTACT_INTENTS.has(intentId)) return CONTACT_CHIPS;
  if (intentId && VEHICLE_INTENTS.has(intentId)) {
    // A concrete vehicle is remembered: offer durations + booking instead.
    return slots?.vehicle ? PRICE_CHIPS : VEHICLE_CHIPS;
  }
  return DEFAULT_CHIPS;
}
