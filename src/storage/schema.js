/**
 * Storage record schema.
 *
 * Every persisted value is wrapped so that schema evolution, TTL expiry and
 * corruption detection are uniform across all stores (session, history,
 * slots, agenda) and across both backends (localStorage, in-memory).
 */

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Wrap data for persistence.
 * @returns { schemaVersion, createdAt, updatedAt, expiresAt, data }
 */
export function wrapRecord(data, { schemaVersion = CURRENT_SCHEMA_VERSION, now = Date.now(), ttlMs = null } = {}) {
  const timestamp = toSafeTimestamp(now);
  return {
    schemaVersion,
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: typeof ttlMs === 'number' && ttlMs > 0 ? timestamp + ttlMs : null,
    data
  };
}

/**
 * Unwrap a persisted record.
 * Returns null (treated as "not present") when the record is malformed,
 * written by a different schema version, or past its expiry.
 */
export function unwrapRecord(record, { schemaVersion = CURRENT_SCHEMA_VERSION, now = Date.now() } = {}) {
  if (!record || typeof record !== 'object') return null;
  if (record.schemaVersion !== schemaVersion) return null;
  if (!('data' in record)) return null;
  if (typeof record.expiresAt === 'number' && record.expiresAt <= toSafeTimestamp(now)) return null;
  return record.data;
}

function toSafeTimestamp(value) {
  const n = typeof value === 'function' ? value() : value;
  return Number.isFinite(Number(n)) ? Number(n) : Date.now();
}
