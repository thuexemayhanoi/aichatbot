/**
 * Blog app shell (v54): theme (Light/Dark/Auto), verified business
 * open/closed status, and contact href filling — shared by every blog page.
 * Pure companion of blog.js (search); no framework, no backend.
 * All business facts come from data/business/business.json at runtime.
 */
import { initTheme } from './theme.js';
import { computeStatus, renderStatus } from './business-status.js';

// --- Theme (Light / Dark / Auto) — shared design tokens with the Agent ---
initTheme({ storage: globalThis.localStorage, matchMedia: globalThis.matchMedia?.bind(globalThis) });

// --- Business open/closed status (Asia/Ho_Chi_Minh, verified hours) ---
const statusEl = document.getElementById('blog-business-status');

// --- Contact hrefs from verified business.json (never hard-coded) ---
const CONTACT_REFS = { zalo: 'zalo', whatsapp: 'whatsapp', call: 'phone_uri', map: 'maps' };
const contactNodes = [...document.querySelectorAll('[data-contact-ref]')];
const needsData = Boolean(statusEl) || contactNodes.length > 0;

if (needsData) {
  fetch('/aichatbot/data/business/business.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((business) => {
      if (!business) return;
      if (statusEl) renderStatus(statusEl, computeStatus({ hours: business.hours }));
      for (const node of contactNodes) {
        const value = business?.contact?.[CONTACT_REFS[node.dataset.contactRef]];
        if (typeof value === 'string' && value.length > 0) {
          node.href = value;
          node.rel = 'noopener noreferrer';
          if (!value.startsWith('tel:')) node.target = '_blank';
        } else {
          node.hidden = true; // no verified data -> never guess a URL
        }
      }
    })
    .catch(() => { /* data unavailable: status stays hidden, links stay hidden */ });
}
