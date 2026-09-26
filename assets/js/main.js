/**
 * Browser entry — shared by direct mode and embed-iframe mode.
 * Thin glue only: all decision logic lives in src/ (Node-testable modules).
 */
import { createLocalStore } from '../../src/storage/local-store.js';
import { createConfig } from '../../src/config/defaults.js';
import { createMotoApp } from '../../src/app/moto-app.js';
import { parseQueryConfig } from '../../src/app/query-config.js';
import { detectCapabilities } from '../../src/ai/capability.js';
import { DEFAULT_CHIPS, resolveChipHref } from '../../src/app/suggestions.js';
import { ENABLE_STORAGE_KEY } from './ai-settings.js';
import { initPwa } from './pwa.js';

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
  } else {
    // Mobile wrapper (Capacitor) detection: label the distribution channel
    // when the app runs inside the Android/iOS shell (spec §21).
    if (!config.source && window.Capacitor?.isNativePlatform?.()) {
      const platform = window.Capacitor.getPlatform?.(); // 'android' | 'ios'
      if (platform === 'android' || platform === 'ios') config.source = platform;
    }
    initPwa(config); // direct/PWA mode only; no-op in embed mode
    // Menu drawer wiring happens below, AFTER `elements` is defined —
    // wireMenu must never run before the DOM references exist (TDZ).
  }
  document.title = config.lang === 'en' ? 'MotoAI — Hanoi motorbike rental assistant' : document.title;

  const elements = {
    messages: document.getElementById('motoai-messages'),
    quick: document.getElementById('motoai-quick'),
    composer: document.getElementById('motoai-composer'),
    input: document.getElementById('motoai-input'),
    send: document.getElementById('motoai-send'),
    status: document.getElementById('motoai-status'),
    aiToggle: document.getElementById('motoai-menu-agent'),
    menuBtn: document.getElementById('motoai-menu-btn'),
    drawer: document.getElementById('motoai-drawer'),
    drawerBackdrop: document.getElementById('motoai-drawer-backdrop'),
    drawerClose: document.getElementById('motoai-drawer-close'),
    menuAddress: document.getElementById('motoai-menu-address'),
    menuContact: document.getElementById('motoai-menu-contact'),
    menuZalo: document.getElementById('motoai-menu-zalo'),
    menuCall: document.getElementById('motoai-menu-call'),
    menuMap: document.getElementById('motoai-menu-map'),
    aiExplain: document.getElementById('motoai-ai-explain'),
    aiConfirm: document.getElementById('motoai-ai-confirm'),
    aiCancel: document.getElementById('motoai-ai-cancel'),
    aiStatus: document.getElementById('motoai-ai-status'),
    aiBar: document.getElementById('motoai-ai-progress-bar'),
    aiStatusText: document.getElementById('motoai-ai-status-text'),
    aiOff: document.getElementById('motoai-ai-off'),
    reset: document.getElementById('motoai-reset'),
    dockPrice: document.getElementById('motoai-dock-price'),
    dockContact: document.getElementById('motoai-dock-contact'),
    dockMap: document.getElementById('motoai-dock-map'),
    menuWhatsapp: document.getElementById('motoai-menu-whatsapp')
  };
  const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

  // Menu drawer: contact hrefs are resolved from verified business.json
  // once it finishes loading (fillMenuLinks below).
  let drawerOpen = false;
  function setDrawer(open) {
    drawerOpen = open;
    elements.drawer.hidden = !open;
    elements.drawerBackdrop.hidden = !open;
    elements.menuBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function wireMenu() {
    elements.menuBtn?.addEventListener('click', () => setDrawer(!drawerOpen));
    elements.drawerClose?.addEventListener('click', () => setDrawer(false));
    elements.drawerBackdrop?.addEventListener('click', () => setDrawer(false));
    elements.drawer?.addEventListener('click', (event) => {
      // Any action closes — except accordion group toggles, which expand in place.
      if (event.target.closest('.motoai-group-btn')) return;
      if (event.target.closest('a, button')) setDrawer(false);
    });
    elements.menuAddress?.addEventListener('click', () => {
      elements.input.value = 'Địa chỉ ở đâu?';
      autoGrow();
      submit(null, { fresh: true });
    });
    // Liên hệ (Kiểu ChatGPT-style menu): the Agent answers from verified
    // business.json — no hard-coded contact info in the UI.
    elements.menuContact?.addEventListener('click', () => {
      elements.input.value = 'Liên hệ';
      autoGrow();
      submit(null, { fresh: true });
    });
    // Dock "Giá thuê": run the verified Agent price flow — never hard-coded prices.
    elements.dockPrice?.addEventListener('click', () => {
      elements.input.value = 'Giá thuê xe bao nhiêu?';
      autoGrow();
      submit(null, { fresh: true });
    });
    // Dock "Liên hệ": open the drawer straight into the verified contact group
    // (Gọi / Zalo / WhatsApp / Địa chỉ / Bản đồ from business.json) — no
    // hard-coded external contact URL on the dock itself.
    elements.dockContact?.addEventListener('click', () => {
      setDrawer(true);
      const groupBtn = document.getElementById('motoai-group-lh-btn');
      if (groupBtn && groupBtn.getAttribute('aria-expanded') !== 'true') groupBtn.click();
    });
    // Grouped menu accordion (v50): one group open at a time, ARIA-backed.
    const groupButtons = [...document.querySelectorAll('.motoai-group-btn')];
    const closeGroups = (except) => {
      for (const btn of groupButtons) {
        if (btn === except) continue;
        btn.setAttribute('aria-expanded', 'false');
        document.getElementById(btn.getAttribute('aria-controls'))?.setAttribute('hidden', '');
      }
    };
    for (const btn of groupButtons) {
      btn.addEventListener('click', () => {
        const items = document.getElementById(btn.getAttribute('aria-controls'));
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        closeGroups(btn);
        btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        if (items) {
          if (expanded) items.setAttribute('hidden', '');
          else items.removeAttribute('hidden');
        }
      });
    }
  }
  // Direct mode only, and only now that `elements` + wireMenu are fully
  // defined — this is the single place menu wiring happens.
  if (!config.embed) wireMenu();
  function fillMenuLinks(businessData) {
    const setHref = (el, href) => {
      if (!el || !href) return;
      el.href = href;
      el.hidden = false;
    };
    setHref(elements.menuZalo, resolveChipHref({ ref: 'zalo' }, businessData));
    setHref(elements.menuWhatsapp, resolveChipHref({ ref: 'whatsapp' }, businessData));
    setHref(elements.menuCall, resolveChipHref({ ref: 'phone_uri' }, businessData));
    setHref(elements.menuMap, resolveChipHref({ ref: 'maps' }, businessData));
    // Dock "Bản đồ": same verified maps URL — the canonical link lives in business.json.
    setHref(elements.dockMap, resolveChipHref({ ref: 'maps' }, businessData));
  }

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
  let businessData = null; // verified business.json — the ONLY source for link chips
  try {
    const data = await loadBusinessData();
    businessData = data.business;
    fillMenuLinks(businessData);
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

  // Quick actions: ONE horizontal scrollable row. Query chips go through the
  // deterministic engine; link chips resolve verified hrefs from business.json.
  // The 12 primary tags are FIXED (v53): the bar never swaps to contextual
  // chips after an answer — it renders once and stays put.
  function renderChips(chips) {
    elements.quick.replaceChildren();
    for (const chip of chips) {
      if (chip.type === 'link') {
        const href = resolveChipHref(chip, businessData);
        if (!href) continue; // no verified data -> never guess a URL
        const link = document.createElement('a');
        link.className = 'motoai-chip';
        link.textContent = chip.label;
        link.href = href;
        link.rel = 'noopener noreferrer';
        if (!link.href.startsWith('tel:')) link.target = '_blank';
        elements.quick.appendChild(link);
      } else if (chip.type === 'agent') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'motoai-chip';
        button.textContent = chip.label;
        button.addEventListener('click', () => {
          if (!elements.aiToggle.hidden) elements.aiToggle.click(); // open explain flow
          else if (elements.aiStatus.hidden) setStatus(elements.status, 'Agent chưa dùng được trên thiết bị này. Trợ lý cơ bản vẫn hoạt động bình thường.', 'warning');
          else setStatus(elements.status, 'Agent đang chạy.', 'success');
        });
        elements.quick.appendChild(button);
      } else {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'motoai-chip';
        button.textContent = chip.label;
        // Primary tags are explicit actions: always run FRESH so a stale
        // vehicle/duration from an earlier turn can never skew the answer.
        button.addEventListener('click', () => { elements.input.value = chip.query; autoGrow(); submit(null, { fresh: true }); });
        elements.quick.appendChild(button);
      }
    }
    // Re-render must never keep an old horizontal scroll position (v53):
    // always start at the first chip, never half-clipped on the left.
    elements.quick.scrollLeft = 0;
  }
  renderChips(DEFAULT_CHIPS);

  // Blog knowledge tier: fetched lazily after the first turn (never on load)
  // so the initial payload stays minimal. Optional: failures are silent.
  let blogWarmed = false;
  function warmBlogKnowledge() {
    if (blogWarmed || config.embed) return;
    blogWarmed = true;
    fetch('data/blog/knowledge-index.json', { cache: 'no-cache' })
      .then((response) => (response.ok ? response.json() : null))
      .then((index) => { if (index?.chunks?.length) app.attachBlogIndex(index.chunks); })
      .catch(() => { /* blog retrieval is optional; silent on failure */ });
  }

  let busy = false;
  function setBusy(value) {
    busy = value;
    elements.send.disabled = value;
    elements.composer.setAttribute('aria-busy', value ? 'true' : 'false');
  }

  async function submit(overrideText = null, { fresh = false } = {}) {
    const text = (overrideText ?? elements.input.value).trim();
    if (!text || busy) return;
    setBusy(true);
    elements.input.value = '';
    autoGrow();
    renderMessage(elements.messages, { role: 'user', text });
    showTyping();
    setStatus(elements.status, 'Đang trả lời…');
    try {
      // fresh = quick-tag/dock action: engine clears topic-skewing slots first.
      const result = fresh ? await app.sendFresh(text) : await app.send(text);
      hideTyping();
      renderMessage(elements.messages, result.reply);
      if (DEBUG && result.source) {
        renderMessage(elements.messages, {
          role: 'assistant',
          text: `[debug] nguồn: ${result.source}` // internal trace, debug mode only
        });
      }
      // Primary bar is FIXED (v53): no contextual chip swap after an answer.
      setStatus(elements.status, '');
      warmBlogKnowledge();
    } catch (error) {
      hideTyping();
      renderMessage(elements.messages, {
        role: 'assistant',
        text: `Xin lỗi, vừa có lỗi kỹ thuật. Bạn thử lại hoặc gọi ${businessData?.contact?.phone_display ?? 'điện thoại của quán'} giúp mình nhé.`
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

  // Clear conversation + remembered context (local only; nothing to delete server-side).
  elements.reset?.addEventListener('click', () => {
    try { app.resetContext(); } catch { /* engine wiring missing — nothing remembered */ }
    elements.messages.replaceChildren();
    renderMessage(elements.messages, { role: 'assistant', text: app.data.faq.assistant.greeting });
    renderChips(DEFAULT_CHIPS);
    setStatus(elements.status, 'Đã xoá hội thoại và ngữ cảnh.', 'success');
  });

  // Inside an embed iframe, Escape must close the widget on the host page.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !config.embed && !elements.drawer.hidden) {
      setDrawer(false);
      return;
    }
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
    setStatus(elements.status, 'Agent chưa dùng được trên thiết bị này. Trợ lý cơ bản vẫn hoạt động bình thường.', 'warning');
  }

  async function startLocalAi() {
    elements.aiToggle.hidden = true;
    elements.aiStatus.hidden = false;
    elements.aiStatus.dataset.tone = '';
    elements.aiStatusText.textContent = 'Đang chuẩn bị Agent...';
    const ok = await app.localLlm.load({
      onProgress: (frac, text) => {
        elements.aiBar.style.width = `${Math.round(frac * 100)}%`;
        // Generic progress line only — technical model info stays in console/debug.
        elements.aiStatusText.textContent =
          (text && DEBUG) ? text : `Đang tải... ${Math.round(frac * 100)}%`;
      }
    });
    if (ok) {
      elements.aiStatus.dataset.tone = 'success';
      elements.aiStatusText.textContent = 'Agent sẵn sàng';
      elements.aiOff.hidden = false;
      // Status is temporary: auto-hide the ready line, keep the Off control.
      setTimeout(() => {
        if (app.localLlm.state.status === 'ready') {
          elements.aiStatusText.textContent = '';
          elements.aiBar.style.width = '0';
        }
      }, 2500);
    } else {
      // Friendly line only — technical detail goes to console (debug) + state.
      elements.aiStatus.dataset.tone = 'warning';
      elements.aiStatusText.textContent =
        app.localLlm.state.userMessage ?? 'Agent chưa dùng được trên thiết bị này. Trợ lý cơ bản vẫn hoạt động bình thường.';
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
