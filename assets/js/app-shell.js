/**
 * MotoAI content-site runtime (v61): the shared companion of the single
 * app shell. Runs on every generated screen EXCEPT the chat home
 * (assets/js/main.js owns the home screen).
 * - Theme (Light / Dark / Auto) — same storage + tokens as the Agent app
 * - Verified open/closed status line (business.json is the only truth)
 * - Menu drawer + tab bar (shared assets/js/drawer.js)
 * - Contact hrefs filled from verified business.json — never hard-coded
 * - v61: parent-hub dropdowns — hover/focus-within (CSS) + a small touch
 *   toggle so tablets are not hover-only; Escape and outside click close
 * Pure vanilla ES module; no framework, no backend.
 */
import { initTheme } from './theme.js?v=63';
import { computeStatus, renderStatus } from './business-status.js?v=63';
import { createDrawer } from './drawer.js?v=78';

initTheme({ storage: globalThis.localStorage, matchMedia: globalThis.matchMedia?.bind(globalThis) });

// --- Menu drawer + bottom tab bar: the shared controller (drawer.js) ---
createDrawer();
// While a field has focus the keyboard owns the bottom edge: the tab bar steps aside.
document.addEventListener('focusin', (e) => document.body.classList.toggle('is-typing', e.target.matches('input, textarea, select')));
document.addEventListener('focusout', () => document.body.classList.remove('is-typing'));

// --- Verified business data: status line + contact hrefs ---
const statusEl = document.getElementById('blog-business-status');
const CONTACT_REFS = { call: 'phone_uri', whatsapp: 'whatsapp', map: 'maps' };
const contactNodes = [...document.querySelectorAll('[data-contact-ref]')];
const needsData = Boolean(statusEl) || contactNodes.length > 0;

if (needsData) {
  fetch('/data/business/business.json', { cache: 'no-cache' })
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

// --- v61 parent-hub dropdowns: touch toggle + Escape + outside close ---
// CSS opens .site-nav-drop on :hover/:focus-within (mouse + keyboard).
// This block only adds: touch/tap open on first tap (second tap navigates),
// Escape to close, and closing when tapping outside the header nav.
const navItems = [...document.querySelectorAll('.site-nav-item')];
function closeDropitems(except) {
  for (const item of navItems) {
    if (item === except) continue;
    item.classList.remove('open');
    item.querySelector('.site-nav-parent')?.setAttribute('aria-expanded', 'false');
  }
}
for (const item of navItems) {
  const parent = item.querySelector('.site-nav-parent');
  parent?.addEventListener('click', (event) => {
    if (!event.pointerType || event.pointerType === 'touch') {
      // First tap opens the panel; once open, a tap follows the hub link.
      if (!item.classList.contains('open')) {
        event.preventDefault();
        closeDropitems(item);
        item.classList.add('open');
        parent.setAttribute('aria-expanded', 'true');
      }
    }
  });
  item.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && item.classList.contains('open')) {
      closeDropitems(null);
      parent?.focus();
    }
  });
}
document.addEventListener('click', (event) => {
  if (!event.target.closest('.site-nav')) closeDropitems(null);
});

// --- v72 TOC wayfinding: mark the section being read in the desktop rail ---
const tocLinks = [...document.querySelectorAll('.blog-toc-desktop a[href^="#"]')];
if (tocLinks.length && 'IntersectionObserver' in window) {
  const byId = new Map(tocLinks.map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
  const spy = new IntersectionObserver((entries) => {
    const hit = entries.find((e) => e.isIntersecting);
    if (!hit) return;
    for (const a of tocLinks) a.removeAttribute('aria-current');
    byId.get(hit.target.id)?.setAttribute('aria-current', 'true');
  }, { rootMargin: '0px 0px -70% 0px' });
  for (const id of byId.keys()) { const h = document.getElementById(id); if (h) spy.observe(h); }
}
