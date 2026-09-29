/**
 * MotoAI content-site runtime (v61): the shared companion of the single
 * app shell. Runs on every generated screen EXCEPT the chat home
 * (assets/js/main.js owns the home screen).
 * - Theme (Light / Dark / Auto) — same storage + tokens as the Agent app
 * - Verified open/closed status line (business.json is the only truth)
 * - Menu drawer + accordion groups (same behaviour as the home drawer)
 * - Contact hrefs filled from verified business.json — never hard-coded
 * - v61: parent-hub dropdowns — hover/focus-within (CSS) + a small touch
 *   toggle so tablets are not hover-only; Escape and outside click close
 * Pure vanilla ES module; no framework, no backend.
 */
import { initTheme } from './theme.js?v=63';
import { computeStatus, renderStatus } from './business-status.js?v=63';

initTheme({ storage: globalThis.localStorage, matchMedia: globalThis.matchMedia?.bind(globalThis) });

// --- Menu drawer (same open/close + accordion contract as home) ---
const menuBtn = document.getElementById('motoai-menu-btn');
const drawer = document.getElementById('motoai-drawer');
const backdrop = document.getElementById('motoai-drawer-backdrop');
const drawerClose = document.getElementById('motoai-drawer-close');

let drawerOpen = false;
function setDrawer(open) {
  drawerOpen = open;
  drawer.hidden = !open;
  backdrop.hidden = !open;
  menuBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
}
menuBtn?.addEventListener('click', () => setDrawer(!drawerOpen));
drawerClose?.addEventListener('click', () => setDrawer(false));
backdrop?.addEventListener('click', () => setDrawer(false));
drawer?.addEventListener('click', (event) => {
  if (event.target.closest('.motoai-group-btn')) return; // accordion expands in place
  if (event.target.closest('a, button')) setDrawer(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && drawerOpen) setDrawer(false);
});

// One accordion group open at a time (ARIA-backed, like home).
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

// --- Verified business data: status line + contact hrefs ---
const statusEl = document.getElementById('blog-business-status');
const CONTACT_REFS = { call: 'phone_uri', whatsapp: 'whatsapp', map: 'maps' };
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

// --- v60 scroll diagnostic (tiny, dev-friendly) ---
// On the owner's iPhone: open the page, and the console shows whether the
// document scrolls past the viewport and the footer is reachable.
window.addEventListener('load', () => {
  const doc = document.documentElement;
  const footer = document.querySelector('.blog-footer');
  const maxScrollY = Math.max(0, doc.scrollHeight - window.innerHeight);
  console.info(
    `[MotoAI] build=${document.querySelector('meta[name="motoai-build"]')?.content}` +
    ` scrollHeight=${doc.scrollHeight} innerHeight=${window.innerHeight}` +
    ` maxScrollY=${maxScrollY}` +
    ` footer=${footer ? 'present, bottom at ' + Math.round(footer.getBoundingClientRect().top + window.scrollY) : 'MISSING'}`
  );
});
