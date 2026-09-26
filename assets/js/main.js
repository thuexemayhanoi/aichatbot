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

/** Quick actions shown as chips (id order per UI spec). */
const QUICK_ACTION_IDS = ['pricing', 'calculator', 'address', 'hours', 'phone'];

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

function setStatus(el, text, tone = '') {
  el.textContent = text;
  el.dataset.tone = tone;
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
    send: document.getElementById('motoai-send'),
    status: document.getElementById('motoai-status'),
    aiToggle: document.getElementById('motoai-ai-toggle'),
    aiExplain: document.getElementById('motoai-ai-explain'),
    aiConfirm: document.getElementById('motoai-ai-confirm'),
    aiCancel: document.getElementById('motoai-ai-cancel'),
    aiStatus: document.getElementById('motoai-ai-status'),
    aiBar: document.getElementById('motoai-ai-progress-bar'),
    aiStatusText: document.getElementById('motoai-ai-status-text'),
    aiOff: document.getElementById('motoai-ai-off')
  };

  // True when the reader is already near the bottom; only then auto-scroll,
  // so reading older messages is never interrupted by a scroll jump.
  function nearBottom() {
    const el = elements.messages;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }
  function scrollToBottom(force = false) {
    const el = elements.messages;
    if (force || nearBottom()) el.scrollTop = el.scrollHeight;
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
    scrollToBottom(message.role === 'user');
  }

  let typingEl = null;
  function showTyping() {
    if (typingEl) return;
    typingEl = document.createElement('div');
    typingEl.className = 'motoai-msg motoai-msg-bot motoai-typing';
    typingEl.setAttribute('aria-label', 'Trợ lý đang soạn câu trả lời');
    typingEl.appendChild(document.createElement('span'));
    typingEl.appendChild(document.createElement('span'));
    typingEl.appendChild(document.createElement('span'));
    elements.messages.appendChild(typingEl);
    scrollToBottom();
  }
  function hideTyping() {
    typingEl?.remove();
    typingEl = null;
  }

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
    setStatus(elements.status, 'Không tải được dữ liệu. Vui lòng tải lại trang.', 'error');
    return; // Fail loudly in the status line, never a blank screen with a dead input.
  }

  // --- Chat loop ---
  renderMessage(elements.messages, { role: 'assistant', text: app.data.faq.assistant.greeting });

  const quickById = new Map((app.data.faq.quick_questions ?? []).map((q) => [q.id, q]));
  for (const id of QUICK_ACTION_IDS) {
    const chip = quickById.get(id);
    if (!chip) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'motoai-chip';
    button.textContent = chip.question;
    button.addEventListener('click', () => { elements.input.value = chip.question; autoGrow(); submit(); });
    elements.quick.appendChild(button);
  }

  let busy = false;
  function setBusy(value) {
    busy = value;
    elements.send.disabled = value;
    elements.composer.setAttribute('aria-busy', value ? 'true' : 'false');
  }

  async function submit() {
    const text = elements.input.value.trim();
    if (!text || busy) return;
    setBusy(true);
    elements.input.value = '';
    autoGrow();
    renderMessage(elements.messages, { role: 'user', text });
    showTyping();
    setStatus(elements.status, 'Đang trả lời…');
    try {
      const result = await app.send(text);
      hideTyping();
      renderMessage(elements.messages, result.reply);
      setStatus(elements.status, '');
    } catch (error) {
      hideTyping();
      renderMessage(elements.messages, {
        role: 'assistant',
        text: 'Xin lỗi, vừa có lỗi kỹ thuật. Bạn thử lại hoặc gọi 0942 467 674 giúp mình nhé.'
      });
      setStatus(elements.status, 'Lỗi tạm thời, thử lại nhé.', 'error');
    } finally {
      setBusy(false);
      elements.input.focus();
    }
  }

  // Textarea: Enter sends, Shift+Enter inserts a newline; auto-grow height.
  function autoGrow() {
    const el = elements.input;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }

  elements.composer.addEventListener('submit', (event) => { event.preventDefault(); submit(); });
  elements.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  });
  elements.input.addEventListener('input', autoGrow);

  // Inside an embed iframe, Escape must close the widget on the host page.
  document.addEventListener('keydown', (event) => {
    if (config.embed && event.key === 'Escape' && window.parent !== window) {
      window.parent.postMessage('motoai:close', '*');
    }
  });

  // --- Optional Local AI (two-step explicit consent) ---
  const capabilities = detectCapabilities(globalThis);
  if (capabilities.canUseLocalLlm) {
    elements.aiToggle.hidden = false;
    elements.aiToggle.addEventListener('click', () => {
      elements.aiExplain.hidden = false; // explain BEFORE any download
      elements.aiConfirm.focus();
    });
    elements.aiCancel.addEventListener('click', () => { elements.aiExplain.hidden = true; });
    elements.aiConfirm.addEventListener('click', () => {
      elements.aiExplain.hidden = true;
      localStorage.setItem(ENABLE_STORAGE_KEY, '1');
      startLocalAi();
    });
    // Returning users already consented once; still never silent: status shown.
    if (localStorage.getItem(ENABLE_STORAGE_KEY) === '1') {
      elements.aiToggle.hidden = true;
      startLocalAi();
    }
  } else {
    elements.aiToggle.hidden = true;
    setStatus(elements.status, 'AI tại chỗ chưa dùng được trên thiết bị này. Trợ lý cơ bản vẫn hoạt động bình thường.', 'warning');
  }

  async function startLocalAi() {
    elements.aiToggle.hidden = true;
    elements.aiStatus.hidden = false;
    elements.aiStatus.dataset.tone = '';
    elements.aiStatusText.textContent = 'Đang chuẩn bị AI tại chỗ (chỉ lần đầu, sau đó có cache)...';
    const ok = await app.localLlm.load({
      onProgress: (frac, text) => {
        elements.aiBar.style.width = `${Math.round(frac * 100)}%`;
        elements.aiStatusText.textContent = text || `Đang tải model AI... ${Math.round(frac * 100)}%`;
      }
    });
    if (ok) {
      elements.aiStatus.dataset.tone = 'success';
      elements.aiStatusText.textContent =
        `AI tại chỗ đã sẵn sàng (${app.localLlm.modelId ?? 'model nhỏ'}). Chạy 100% trên máy bạn.`;
      elements.aiOff.hidden = false;
    } else {
      // Friendly line only — technical detail goes to console (debug) + state.
      elements.aiStatus.dataset.tone = 'warning';
      elements.aiStatusText.textContent =
        app.localLlm.state.userMessage ?? 'AI tại chỗ chưa dùng được trên thiết bị này. Trợ lý cơ bản vẫn hoạt động bình thường.';
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
