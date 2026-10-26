/** Menu drawer (v78), ONE controller for main.js + app-shell.js: Menu button and tab bar
 *  ([data-drawer-open] = group id) open it; ✕/backdrop/Escape/link close. No scroll lock. */
export function createDrawer(doc = document) {
  const drawer = doc.getElementById('motoai-drawer');
  const backdrop = doc.getElementById('motoai-drawer-backdrop');
  if (!drawer || !backdrop) return { set() {} };
  const toggles = [...doc.querySelectorAll('[aria-controls="motoai-drawer"]')];
  const groupButtons = [...drawer.querySelectorAll('.motoai-group-btn')];
  let open = false;
  let opener = null;

  function setDrawer(state, from = null) {
    open = state;
    drawer.hidden = !state;
    backdrop.hidden = !state;
    for (const t of toggles) t.setAttribute('aria-expanded', state ? 'true' : 'false');
    opener = state ? from : opener;
  }

  const closeGroups = (except) => {
    for (const btn of groupButtons) {
      if (btn === except) continue;
      btn.setAttribute('aria-expanded', 'false');
      doc.getElementById(btn.getAttribute('aria-controls'))?.setAttribute('hidden', '');
    }
  };
  for (const btn of groupButtons) {
    btn.addEventListener('click', () => {
      const items = doc.getElementById(btn.getAttribute('aria-controls'));
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      closeGroups(btn);
      btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      if (expanded) items?.setAttribute('hidden', '');
      else items?.removeAttribute('hidden');
    });
  }

  for (const t of toggles) {
    t.addEventListener('click', () => {
      if (!('drawerOpen' in t.dataset)) return setDrawer(!open, t); // header Menu toggles
      setDrawer(true, t);
      const group = doc.getElementById(`motoai-group-${t.dataset.drawerOpen}-btn`);
      if (group && group.getAttribute('aria-expanded') !== 'true') group.click();
      (group ?? doc.getElementById('motoai-drawer-close'))?.focus();
    });
  }
  doc.getElementById('motoai-drawer-close')?.addEventListener('click', () => setDrawer(false));
  backdrop.addEventListener('click', () => setDrawer(false));
  drawer.addEventListener('click', (event) => {
    if (event.target.closest('.motoai-group-btn')) return; // accordion expands in place
    if (event.target.closest('a, button')) setDrawer(false);
  });
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) {
      setDrawer(false);
      opener?.focus();
    }
  });
  return { set: setDrawer };
}
