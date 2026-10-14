/**
 * MotoAI content-site runtime (v67). Runs on every generated page except
 * the chat home (assets/js/main.js owns that screen). Vanilla ES module.
 * - Theme (Light / Dark / Auto): same storage + tokens as the Agent app
 * - Menu drawer: focus moves in on open and back on close, Tab wraps,
 *   Escape/backdrop/link close; accordion groups (one open at a time)
 * - Verified open/closed status + contact hrefs from business.json only
 * - Mega menu (APG disclosure nav): parent <a> navigates, toggle button
 *   opens; CSS hover/focus-within also open; Escape + outside click close
 */
import { initTheme } from './theme.js?v=63';
import { computeStatus, renderStatus } from './business-status.js?v=63';

initTheme({ storage: globalThis.localStorage, matchMedia: globalThis.matchMedia?.bind(globalThis) });

const $ = (id) => document.getElementById(id);
const FOCUSABLE = 'a[href],button:not([disabled])';

// --- Drawer ---
const menuBtn = $('motoai-menu-btn');
const drawer = $('motoai-drawer');
const backdrop = $('motoai-drawer-backdrop');
const drawerClose = $('motoai-drawer-close');
let drawerOpen = false;
function setDrawer(open) {
  drawerOpen = open;
  drawer.hidden = !open;
  backdrop.hidden = !open;
  menuBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
  (open ? drawerClose : menuBtn)?.focus();
}
menuBtn?.addEventListener('click', () => setDrawer(!drawerOpen));
drawerClose?.addEventListener('click', () => setDrawer(false));
backdrop?.addEventListener('click', () => setDrawer(false));
drawer?.addEventListener('click', (e) => {
  if (e.target.closest('.motoai-group-btn')) return; // accordion expands in place
  if (e.target.closest('a, button')) setDrawer(false);
});
drawer?.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const f = [...drawer.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  const first = f[0]; const last = f[f.length - 1];
  if (!first) return;
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && drawerOpen) setDrawer(false);
});

// One accordion group open at a time (ARIA-backed, like home).
const groupButtons = [...document.querySelectorAll('.motoai-group-btn')];
const closeGroups = (except) => {
  for (const btn of groupButtons) {
    if (btn === except) continue;
    btn.setAttribute('aria-expanded', 'false');
    $(btn.getAttribute('aria-controls'))?.setAttribute('hidden', '');
  }
};
for (const btn of groupButtons) {
  btn.addEventListener('click', () => {
    const items = $(btn.getAttribute('aria-controls'));
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
const statusEl = $('blog-business-status');
const CONTACT_REFS = { call: 'phone_uri', whatsapp: 'whatsapp', map: 'maps' };
const contactNodes = [...document.querySelectorAll('[data-contact-ref]')];
if (statusEl || contactNodes.length) {
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
    .catch(() => { /* data unavailable: status + links stay hidden */ });
}

// --- Mega menu ---
// Visible = CSS hover (fine pointers) | :focus-within | .open (toggle);
// .closed = dismissed (Escape/toggle) while hover/focus would still show it,
// cleared once pointer and focus have both left. aria-expanded always
// mirrors the computed visibility, so touch (no hover, no button focus on
// iOS) and mouse/keyboard agree.
const navItems = [...document.querySelectorAll('.site-nav-item')];
const shown = (it) => getComputedStyle(it.querySelector('.site-nav-drop')).display !== 'none';
const sync = (it) => it.querySelector('.site-nav-toggle')?.setAttribute('aria-expanded', String(shown(it)));
const closeDropitems = (except) => { for (const it of navItems) if (it !== except) { it.classList.remove('open'); sync(it); } };
for (const item of navItems) {
  const toggle = item.querySelector('.site-nav-toggle');
  const reset = () => setTimeout(() => {
    if (!item.matches(':hover') && !item.contains(document.activeElement)) item.classList.remove('open', 'closed');
    sync(item);
  });
  toggle?.addEventListener('click', () => {
    const on = !shown(item);
    closeDropitems(item);
    item.classList.toggle('open', on);
    item.classList.toggle('closed', !on);
    sync(item);
  });
  item.addEventListener('focusin', () => sync(item));
  item.addEventListener('mouseenter', () => sync(item));
  item.addEventListener('focusout', reset);
  item.addEventListener('mouseleave', reset);
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { item.classList.remove('open'); item.classList.add('closed'); sync(item); toggle?.focus(); }
  });
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.site-nav')) closeDropitems(null);
});
