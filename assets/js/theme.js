/**
 * Theme system (v54): Light / Dark / Auto shared by the blog application.
 * 'auto' follows prefers-color-scheme; 'light'/'dark' are explicit choices.
 * The applied mode lives on <html data-motoai-theme="dark"> — the SAME
 * attribute style.css already themes (tokens shared with the Agent app).
 * Preference persists in localStorage('motoai-theme'); a tiny inline head
 * script (in each page) applies it before first paint to avoid a flash.
 */

const STORAGE_KEY = 'motoai-theme';
const PREFERENCES = ['auto', 'light', 'dark'];
const LABELS = { auto: 'Auto', light: '☀️', dark: '🌙' };

export function resolveTheme(preference, systemPrefersDark) {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  return systemPrefersDark ? 'dark' : 'light'; // auto
}

export function applyTheme(preference, doc, systemPrefersDark) {
  const mode = resolveTheme(preference, systemPrefersDark);
  const root = doc?.documentElement;
  if (!root) return mode;
  if (mode === 'dark') root.setAttribute('data-motoai-theme', 'dark');
  else root.removeAttribute('data-motoai-theme');
  return mode;
}

export function readPreference(storage) {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    return PREFERENCES.includes(value) ? value : 'auto';
  } catch {
    return 'auto'; // storage unavailable (private mode) -> auto, still works
  }
}

export function initTheme({ storage, matchMedia, doc } = {}) {
  const document_ = doc ?? globalThis.document;
  const systemPrefersDark = () => Boolean(matchMedia?.('(prefers-color-scheme: dark)')?.matches);
  if (!document_ || !storage) return;
  // Every theme control on the page (header + drawer) stays in sync.
  const toggles = typeof document_.querySelectorAll === 'function'
    ? [...document_.querySelectorAll('.blog-theme-toggle')]
    : (document_.getElementById?.('blog-theme-toggle') ? [document_.getElementById('blog-theme-toggle')] : []);
  if (toggles.length === 0) return;

  const sync = () => {
    const preference = readPreference(storage);
    applyTheme(preference, document_, systemPrefersDark());
    for (const toggle of toggles) {
      // v63: drawer toggles keep their "🌗 Chủ đề: " label (they are menu rows);
      // header toggles stay compact ("Auto"/"☀️"/"🌙").
      const text = LABELS[preference];
      toggle.textContent = toggle.classList.contains('motoai-drawer-theme') ? `🌗 Chủ đề: ${text}` : text;
      toggle.setAttribute('aria-label', `Chủ đề: ${preference === 'auto' ? 'tự động' : preference === 'light' ? 'sáng' : 'tối'}`);
      toggle.title = 'Chủ đề: Auto → Sáng → Tối';
    }
  };
  for (const toggle of toggles) {
    toggle.addEventListener('click', () => {
      const current = readPreference(storage);
      const next = PREFERENCES[(PREFERENCES.indexOf(current) + 1) % PREFERENCES.length];
      try { storage.setItem(STORAGE_KEY, next); } catch { /* private mode: session-only */ }
      sync();
    });
  }
  // System preference change only matters in auto mode.
  matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', () => {
    if (readPreference(storage) === 'auto') applyTheme('auto', document_, systemPrefersDark());
  });
  sync();
  return { sync };
}
