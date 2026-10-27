/** Sidebar controller (v79), ONE for app-shell.js + main.js. Overlay mode (< 1200px, and
 *  always in the Agent app): ☰ opens the left panel; ✕ / backdrop / Escape / a link close it;
 *  the page scroll is locked, the rest of the page is inert and Tab cycles inside. Sidebar
 *  mode (desktop content pages): the panel is an in-flow column, ☰ / ✕ collapse it, the
 *  reading position is kept and the choice persists (localStorage; the head script applies
 *  it before paint). Accordions are independent (aria-expanded + hidden). */
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
    // In the desktop column ☰ collapses rather than closes: it says so, like ✕ there.
    const text = expanded ? (sidebarMode() ? close?.dataset.collapse : null) ?? menu.dataset.close : menu.dataset.open;
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
  // Overlay = modal: no Tab, VoiceOver swipe or pointer reaches the page behind it.
  const inertRest = (on) => {
    for (const el of body.children) if (el !== drawer && el !== backdrop && el.tagName !== 'SCRIPT') el.inert = on;
  };
  function setOverlay(state, focus = true) {
    if (state === open) return;
    open = state;
    // Focus left in a panel that is about to disappear goes back to ☰.
    const rescue = !state && drawer.contains(doc.activeElement) && !(sidebarMode() && sidebarVisible());
    drawer.classList.toggle('is-open', state);
    backdrop.classList.toggle('is-open', state);
    body.classList.toggle('drawer-open', state);
    inertRest(state);
    lock(state);
    setMenu(state);
    // Focus moves without scrolling: the sticky ☰ is already in view and a
    // plain focus() would drag the page back to the header's static slot.
    if (focus || rescue) (state ? close ?? drawer.querySelector('a, button') : menu)?.focus({ preventScroll: true });
  }

  // Collapsing / expanding the column reflows the text: keep the line under the header in place.
  function setSidebar(visible) {
    const main = doc.getElementById('site-main');
    const line = (doc.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0) + 8;
    const box = main?.getBoundingClientRect();
    let anchor = box && globalThis.scrollY > 0 ? doc.elementFromPoint?.(box.left + box.width / 2, line) : null;
    if (anchor && !main.contains(anchor)) anchor = null;
    const before = anchor?.getBoundingClientRect().top;
    if (visible) root.removeAttribute('data-motoai-sidebar');
    else root.setAttribute('data-motoai-sidebar', 'closed');
    if (anchor) globalThis.scrollBy(0, anchor.getBoundingClientRect().top - before);
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
  backdrop.addEventListener('click', () => setOverlay(false));
  // Capture: the overlay closes (page un-inerted, focus rescued) BEFORE an item's own
  // handler runs, so a chat-mode action can still move focus into the app.
  drawer.addEventListener('click', (event) => {
    if (event.target.closest('.motoai-toggle, .motoai-drawer-theme')) return; // stays open
    if (event.target.closest('a, button') && !sidebarMode()) setOverlay(false, false);
  }, true);
  const focusable = () => [...drawer.querySelectorAll('a[href], button:not([disabled])')].filter((el) => el.offsetParent !== null);
  doc.addEventListener('keydown', (event) => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); setOverlay(false); return; }
    if (event.key !== 'Tab') return;
    const items = focusable();
    if (!items.length) return;
    // Step through the panel ourselves: Safari's default Tab skips links and buttons.
    event.preventDefault();
    const i = items.indexOf(doc.activeElement);
    items[event.shiftKey ? (i <= 0 ? items.length : i) - 1 : (i + 1) % items.length].focus();
  });
  if (mq) (mq.addEventListener ? mq.addEventListener('change', sync) : mq.addListener(sync));
  sync();
  return { set: setOverlay };
}
