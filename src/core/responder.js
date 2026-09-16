/**
 * Responder: turns rule outputs into the final chat message.
 *
 * Responsibilities:
 * - Resolve `{{ business.x.y }}` template placeholders against the
 *   authoritative business object (used by FAQ-style answers).
 * - Sanitize action links against a strict protocol allowlist.
 * - Attach language and meta (confidence, source) to every message.
 *
 * The responder never decides content; it only formats trusted rule output.
 * HTML rendering/escaping belongs to the UI layer (Phase 4).
 */

const TEMPLATE = /\{\{\s*business\.([a-zA-Z0-9_.]+)\s*\}\}/g;
const ALLOWED_ACTION_HREF = /^(tel:|https:|mailto:)/i;
const MAX_ACTIONS = 3;

export function createResponder({ business, language = 'vi' } = {}) {
  if (!business || typeof business !== 'object') {
    throw new TypeError('createResponder requires a business object');
  }

  function resolveTemplates(text) {
    return String(text).replace(TEMPLATE, (match, path) => {
      const value = walk(business, path);
      return value === undefined || value === null ? '' : String(value);
    });
  }

  function sanitizeActions(actions) {
    if (!Array.isArray(actions)) return [];
    return actions
      .filter((action) => action && typeof action === 'object')
      .map((action) => ({ label: String(action.label ?? '').trim(), href: String(action.href ?? '').trim() }))
      .filter((action) => action.label.length > 0 && ALLOWED_ACTION_HREF.test(action.href))
      .slice(0, MAX_ACTIONS);
  }

  /**
   * @param {string} text - answer text (may contain business templates).
   * @param {object} [options]
   * @param {Array}  [options.actions] - [{ label, href }] with allowlisted hrefs.
   * @param {object} [options.meta]    - merged into message.meta.
   * @returns {role:'assistant', text, language, actions, meta}
   */
  function render(text, { actions, meta } = {}) {
    const cleanText = resolveTemplates(text).replace(/[ \t]+\n/g, '\n').trim();
    return {
      role: 'assistant',
      text: cleanText,
      language,
      actions: sanitizeActions(actions),
      meta: {
        confidence: clampConfidence(meta?.confidence),
        source: typeof meta?.source === 'string' && meta.source.length ? meta.source : null,
        ...(meta?.intentId ? { intentId: meta.intentId } : {})
      }
    };
  }

  return { render };
}

function walk(object, path) {
  return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), object);
}

function clampConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
