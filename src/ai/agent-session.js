/**
 * Agent startup policy (v65) — pure and Node-testable.
 *
 * The WebLLM engine NEVER auto-starts on page load, even when the user
 * previously consented (saved consent + model cache are kept). Booting a
 * ~1GB-VRAM engine while the page was still settling froze low-memory
 * iOS devices. The user always taps "Agent" in the CURRENT session;
 * the browser\'s model cache makes that tap fast.
 */

const HINT_CONSENTED = 'Agent đã sẵn sàng để bật khi bạn cần.';

/**
 * @param {object} [input]
 * @param {object} [input.capabilities] - result of detectCapabilities(env).
 * @param {string|null} [input.consent] - stored consent value ('1' = agreed).
 * @returns {{
 *   mode: 'unsupported'|'available'|'consented',
 *   showToggle: boolean,
 *   autoStart: boolean,   // always false since v65 — kept explicit for tests
 *   hint: string|null
 * }}
 */
export function resolveAgentStartup({ capabilities, consent } = {}) {
  if (!capabilities?.canUseLocalLlm) {
    return { mode: 'unsupported', showToggle: false, autoStart: false, hint: null };
  }
  if (consent === '1') {
    // Consent (and the downloaded model) survives reloads; the engine does
    // not. The hint tells the returning user the Agent is one tap away.
    return { mode: 'consented', showToggle: true, autoStart: false, hint: HINT_CONSENTED };
  }
  return { mode: 'available', showToggle: true, autoStart: false, hint: null };
}
