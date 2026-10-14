/** Blog search (v67): the index (/blog/search-index.json — absolute, so it
 *  also works on 404.html) loads lazily on the first query. Text + category
 *  filter, live count (role=status), results panel with heading, static
 *  empty state (hub links rendered at build time). */
const $ = (id) => document.getElementById(id);
const input = $('blog-search-input');
const filter = $('blog-search-filter');
const clearBtn = $('blog-search-clear');
const countEl = $('blog-search-count');
const panel = $('blog-search-panel');
const emptyEl = $('blog-search-empty');
const results = $('blog-search-results');
if (input && results) {
  let loading = null;
  const loadIndex = () => loading ??= fetch('/blog/search-index.json')
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then((data) => {
      const index = data.articles ?? [];
      const seen = new Set();
      // Category options derive from the index itself — no hard-coding.
      for (const a of index) {
        if (!filter || !a.category_name || seen.has(a.category)) continue;
        seen.add(a.category);
        filter.add(new Option(a.category_name, a.category));
      }
      return index;
    })
    .catch((e) => { loading = null; throw e; });

  const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    n.textContent = text ?? '';
    return n;
  };
  // state: null = idle, [] = no hits, [..] = hits, 'error' = index failed
  const show = (state) => {
    if (panel) panel.hidden = state === null;
    if (emptyEl) emptyEl.hidden = !(Array.isArray(state) && state.length === 0);
    if (clearBtn) clearBtn.hidden = state === null;
    if (countEl) countEl.textContent = Array.isArray(state) ? `— ${state.length} kết quả` : '';
    if (state === 'error') return results.replaceChildren(el('p', 'blog-empty', 'Không tải được mục lục tìm kiếm. Vui lòng thử lại.'));
    results.replaceChildren(...(Array.isArray(state) ? state : []).map((a) => {
      const card = el('a', 'blog-card');
      card.href = a.url;
      card.append(el('span', 'cat', a.category_name ?? a.category), el('h3', '', a.title), el('p', '', a.summary));
      return card;
    }));
  };

  async function run() {
    const q = norm(input.value.trim());
    const cat = filter ? filter.value : '';
    if (q.length < 2 && !cat) return show(null);
    try {
      const list = await loadIndex();
      show(list.filter((a) => (!cat || a.category === cat) && (q.length < 2
        || [a.title, a.keywords, a.summary, a.location].some((f) => norm(f).includes(q)))).slice(0, 24));
    } catch {
      show('error');
    }
  }

  let timer = null;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 180); });
  filter?.addEventListener('change', run);
  clearBtn?.addEventListener('click', () => {
    input.value = '';
    if (filter) filter.value = '';
    show(null);
    input.focus();
  });
  if (location.hash === '#blog-search') input.focus();
}
