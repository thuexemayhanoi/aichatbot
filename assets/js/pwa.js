/**
 * PWA glue — registration + install UI.
 *
 * Only runs in DIRECT mode (never inside the embed iframe, so embedded
 * host sites never get our service worker scoped onto them).
 * No-op on browsers without SW support (iOS Safari < 16.4, old Android).
 */
const IOS_INSTALL_HINT_KEY = 'motoai:ios-install-hint-shown';

export function initPwa(config) {
  if (config?.embed) return; // embed mode: never register the SW
  if (!('serviceWorker' in navigator)) return;

  // Register after load so it never competes with first paint / first chat.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {
      // Registration failure must never break the chatbot.
    });
  });

  setupInstallButton();
  setupIosHint();
}

/** Subtle "Cài Agent" pill shown only when the browser offers install. */
function setupInstallButton() {
  const button = document.getElementById('motoai-install');
  if (!button) return;
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    button.hidden = false; // appears only when installable
  });

  button.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    button.hidden = true; // never nag again after one interaction
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    button.hidden = true;
  });
}

/**
 * iOS has no beforeinstallprompt: show a one-time hint (localStorage flag),
 * dismissed by the user. Text only, no nag loop.
 */
function setupIosHint() {
  if (!/^iP(hone|od|ad)$/.test(navigator.platform)) return;
  try {
    if (localStorage.getItem(IOS_INSTALL_HINT_KEY)) return;
    localStorage.setItem(IOS_INSTALL_HINT_KEY, '1');
  } catch { /* private mode: skip the hint entirely */ }
  // Hint surface is the chat disclosure line; keeps the UI minimal.
  const disclosure = document.getElementById('motoai-disclosure');
  if (!disclosure) return;
  const hint = document.createElement('span');
  hint.className = 'motoai-ios-hint';
  hint.textContent = ' — Cài app: Share → “Thêm vào Màn hình chính”.';
  disclosure.appendChild(hint);
}
