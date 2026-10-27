/** Sidebar controller (v79), ONE for app-shell.js + main.js. Overlay mode (< 1200px, and
 *  always in the Agent app): ☰ opens the left panel; ✕ / backdrop / Escape / a link close it;
 *  the page scroll is locked and Tab stays inside. Sidebar mode (desktop content pages): the
 *  panel is an in-flow column, ☰ / ✕ collapse it and the choice persists (localStorage; the
 *  head script applies it before paint). Accordions are independent (aria-expanded + hidden). */
const SIDEBAR_MQ = '(min-width: 1200px)';
const KEY = 'motoai-sidebar';

export function createDrawer(doc = document) {
  const drawer = doc.getElementById('motoai-drawer');
  const backdrop = doc.getElementById('motoai-drawer-backdrop');
  const menu = doc.getElementById('motoai-menu-btn');
  const close = doc.getElementById('motoai-drawer-close');
  if (!drawer || !backdrop) return { set() {} };
  const root = doc.documentElement;
  const body = doc.body;
  const mq = globalThis.matchMedia?.(SIDEBAR_MQ);
  const sidebarMode = () => body.classList.contains('content-page') && Boolean(mq?.matches);
  const sidebarVisible = () => root.getAttribute('data-motoai-sidebar') !== 'closed';
  let open = false; // overlay state
  let scrollY = 0;

  // Accordions: each toggle owns its list (no auto-collapse).
  const relabel = (btn, expanded) => {
    const tpl = drawer.dataset[expanded ? 'collapse' : 'expand'];
    if (tpl && btn.dataset.name) btn.setAttribute('aria-label', tpl.replace('{name}', btn.dataset.name));
  };
  for (const btn of drawer.querySelectorAll('.motoai-toggle')) {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      const list = doc.getElementById(btn.getAttribute('aria-controls'));
      if (list) list.hidden = !expanded;
      relabel(btn, expanded);
    });
  }

  const setMenu = (expanded) => {
    if (!menu) return;
    menu.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    const text = expanded ? menu.dataset.close : menu.dataset.open;
    if (text) { menu.setAttribute('aria-label', text); menu.title = text; }
  };
  const setClose = (sidebar) => {
    const text = sidebar ? close?.dataset.collapse : close?.dataset.close;
    if (text) close.setAttribute('aria-label', text);
  };

  // Overlay: keep the document where it was while the panel is open.
  const lock = (on) => {
    if (body.classList.contains('chat-home')) return; // the Agent app is already fixed
    if (on) {
      scrollY = globalThis.scrollY || 0;
      body.style.top = `-${scrollY}px`;
      root.classList.add('drawer-lock');
    } else {
      root.classList.remove('drawer-lock');
      body.style.top = '';
      globalThis.scrollTo(0, scrollY);
    }
  };
  function setOverlay(state, focus = true) {
    if (state === open) return;
    open = state;
    drawer.classList.toggle('is-open', state);
    backdrop.classList.toggle('is-open', state);
    body.classList.toggle('drawer-open', state);
    lock(state);
    setMenu(state);
    // Focus returns without scrolling: the sticky ☰ is already in view and a
    // plain focus() would drag the page back to the header's static slot.
    if (focus) (state ? close ?? drawer.querySelector('a, button') : menu)?.focus({ preventScroll: true });
  }

  function setSidebar(visible) {
    if (visible) root.removeAttribute('data-motoai-sidebar');
    else root.setAttribute('data-motoai-sidebar', 'closed');
    try { localStorage.setItem(KEY, visible ? 'open' : 'closed'); } catch { /* private mode */ }
    setMenu(visible);
  }

  function sync() {
    if (sidebarMode()) {
      setOverlay(false, false);
      setMenu(sidebarVisible());
      setClose(true);
    } else {
      // Leaving the desktop column: focus must not stay in a panel that is now off screen.
      if (!open && drawer.contains(doc.activeElement)) menu?.focus({ preventScroll: true });
      setMenu(open);
      setClose(false);
    }
  }
  menu?.addEventListener('click', () => (sidebarMode() ? setSidebar(!sidebarVisible()) : setOverlay(!open)));
  close?.addEventListener('click', () => {
    if (sidebarMode()) { setSidebar(false); menu?.focus({ preventScroll: true }); } else setOverlay(false);
  });
  backdrop.addEventListener('click', () => setOverlay(false, false));
  drawer.addEventListener('click', (event) => {
    if (event.target.closest('.motoai-toggle, .motoai-drawer-theme')) return; // stays open
    if (event.target.closest('a, button') && !sidebarMode()) setOverlay(false, false);
  });
  const focusable = () => [...drawer.querySelectorAll('a[href], button:not([disabled])')].filter((el) => el.offsetParent !== null);
  doc.addEventListener('keydown', (event) => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); setOverlay(false); return; }
    if (event.key !== 'Tab') return;
    const items = focusable();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (!drawer.contains(doc.activeElement)) { event.preventDefault(); first.focus(); }
    else if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  if (mq) (mq.addEventListener ? mq.addEventListener('change', sync) : mq.addListener(sync));
  sync();
  return { set: setOverlay };
}
