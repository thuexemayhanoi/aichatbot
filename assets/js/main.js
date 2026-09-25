/**
 * Browser entry — shared by direct mode and embed-iframe mode.
 * Thin glue only: all decision logic lives in src/ (Node-testable modules).
 */
import { createLocalStore } from '../../src/storage/local-store.js';
import { createConfig } from '../../src/config/defaults.js';
import { createMotoApp } from '../../src/app/moto-app.js';
import { parseQueryConfig } from '../../src/app/query-config.js';
import { detectCapabilities } from '../../src/ai/capability.js';
import { ENABLE_STORAGE_KEY } from './ai-settings.js';

const DATA_FILES = [
  ['business', 'data/business/business.json'],
  ['pricing', 'data/business/pricing.json'],
  ['faq', 'data/business/faq.json']
];

async function loadBusinessData() {
  const entries = await Promise.all(DATA_FILES.map(async ([key, path]) => {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`cannot load ${path}: ${response.status}`);
    return [key, await response.json()];
  }));
  return Object.fromEntries(entries);
}

function esc(text) {
  return String(text ?? '');
}

function renderMessage(container, message) {
  const el = document.createElement('div');
  el.className = `motoai-msg motoai-msg-${message.role === 'user' ? 'user' : 'bot'}`;
  el.textContent = esc(message.text); // textContent: never trust any answer as HTML
  if (Array.isArray(message.actions) && message.actions.length > 0) {
    const wrap = document.createElement('div');
    wrap.className = 'motoai-msg-actions';
    for (const action of message.actions) {
      const a = document.createElement('a');
      a.textContent = esc(action.label);
      a.href = esc(action.href);
      a.rel = 'noopener noreferrer';
      wrap.appendChild(a);
    }
    el.appendChild(wrap);
  }
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

async function init() {
  const config = parseQueryConfig(location.search);
  document.documentElement.lang = config.lang;
  if (config.embed) {
    document.body.dataset.motoaiEmbed = '1';
    document.querySelector('.motoai-disclosure')?.remove();
  }
  document.title = config.lang === 'en' ? 'MotoAI — Hanoi motorbike rental assistant' : document.title;

  const elements = {
    messages: document.getElementById('motoai-messages'),
    quick: document.getElementById('motoai-quick'),
    composer: document.getElementById('motoai-composer'),
    input: document.getElementById('motoai-input'),
    status: document.getElementById('motoai-status'),
    aiToggle: document.getElementById('motoai-ai-toggle'),
    aiStatus: document.getElementById('motoai-ai-status'),
    aiBar: document.getElementById('motoai-ai-progress-bar'),
    aiStatusText: document.getElementById('motoai-ai-status-text'),
    aiOff: document.getElementById('motoai-ai-off'),
    disclosure: document.getElementById('motoai-disclosure')
  };

  let app;
  try {
    const data = await loadBusinessData();
    const store = createLocalStore({ namespace: `motoai-${config.embed ? 'embed' : 'direct'}-${config.source ?? 'root'}` });
    app = createMotoApp({
      data,
      store,
      scope: config.embed ? `embed-${config.source ?? 'default'}` : 'direct',
      config: createConfig({ language: config.lang })
    });
  } catch (error) {
    elements.status.textContent = 'Không tải được dữ liệu. Vui lòng tải lại trang.';
    return; // Fail loudly in the status line, never a blank screen with a dead input.
  }

  // --- Chat loop ---
  renderMessage(elements.messages, { role: 'assistant', text: app.data.faq.assistant.greeting });

  for (const chip of (app.data.faq.quick_questions ?? []).slice(0, 8)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'motoai-chip';
    button.textContent = chip.question;
    button.addEventListener('click', () => { elements.input.value = chip.question; submit(); });
    elements.quick.appendChild(button);
  }

  let busy = false;
  async function submit() {
    const text = elements.input.value.trim();
    if (!text || busy) return;
    busy = true;
    elements.input.value = '';
    renderMessage(elements.messages, { role: 'user', text });
    elements.status.textContent = '…';
    try {
      const result = await app.send(text);
      renderMessage(elements.messages, result.reply);
      elements.status.textContent = '';
    } catch (error) {
      renderMessage(elements.messages, {
        role: 'assistant',
        text: 'Xin lỗi, vừa có lỗi kỹ thuật. Bạn thử lại hoặc gọi 0942 467 674 giúp mình nhé.'
      });
    } finally {
      busy = false;
      elements.input.focus();
    }
  }

  elements.composer.addEventListener('submit', (event) => { event.preventDefault(); submit(); });

  // Inside an embed iframe, Escape must close the widget on the host page.
  document.addEventListener('keydown', (event) => {
    if (config.embed && event.key === 'Escape' && window.parent !== window) {
      window.parent.postMessage('motoai:close', '*');
    }
  });

  // --- Optional Local AI panel ---
  const capabilities = detectCapabilities(globalThis);
  if (capabilities.canUseLocalLlm) {
    elements.aiToggle.hidden = false;
    elements.aiToggle.addEventListener('click', () => {
      localStorage.setItem(ENABLE_STORAGE_KEY, '1');
      elements.aiToggle.hidden = true;
      startLocalAi();
    });
    if (localStorage.getItem(ENABLE_STORAGE_KEY) === '1') {
      elements.aiToggle.hidden = true;
      startLocalAi();
    }
  } else {
    elements.status.textContent = 'AI tại chỗ: không khả dụng trên thiết bị này';
  }

  async function startLocalAi() {
    elements.aiStatus.hidden = false;
    elements.aiStatusText.textContent = 'Đang tải model AI (chỉ lần đầu, ~500MB, sau đó có cache)...';
    const ok = await app.localLlm.load({
      onProgress: (frac, text) => {
        elements.aiBar.style.width = `${Math.round(frac * 100)}%`;
        elements.aiStatusText.textContent = text || `Đang tải... ${Math.round(frac * 100)}%`;
      }
    });
    if (ok) {
      elements.aiStatusText.textContent = 'Local AI đã sẵn sàng. Chạy 100% trên máy bạn.';
      elements.aiOff.hidden = false;
    } else {
      elements.aiStatusText.textContent = `Không bật được Local AI (${app.localLlm.state.error ?? 'lỗi'}). Chatbot vẫn hoạt động bình thường.`;
    }
    elements.aiOff.addEventListener('click', () => {
      localStorage.removeItem(ENABLE_STORAGE_KEY);
      app.localLlm.unload();
      elements.aiStatus.hidden = true;
      elements.aiOff.hidden = true;
      elements.aiToggle.hidden = false;
    });
  }
}

init();
