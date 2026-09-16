/**
 * ID generation with an injectable randomness source.
 *
 * The default source uses Web Crypto when available (browsers, Node >= 19)
 * and falls back to Math.random. Tests inject a deterministic source.
 */

function defaultRandomBytes(length) {
  try {
    const crypto = globalThis.crypto;
    if (crypto && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);
      return bytes;
    }
  } catch {
    // No crypto available (or blocked); fall through to Math.random.
  }
  const bytes = new Array(length);
  for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/**
 * Create an RFC 4122 v4 shaped ID generator.
 * @param {function} random - (length) => array-like of bytes.
 */
export function createIdGenerator(random = defaultRandomBytes) {
  return function nextId() {
    const bytes = Array.from(random(16), (b) => Number(b) & 0xff);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32)
    ].join('-');
  };
}

/** Default generator (crypto-backed when possible). */
export const nextId = createIdGenerator();
