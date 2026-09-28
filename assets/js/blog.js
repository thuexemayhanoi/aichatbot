/**
 * Blog search (v58) — client-side, index lazy-loaded on demand.
 * Text filter + category filter + clear button + result count + empty state.
 * Index: blog/search-index.json (published articles only, compact fields).
 */
const input = document.getElementById('blog-search-input');
const filter = document.getElementById('blog-search-filter');
const clearBtn = document.getElementById('blog-search-clear');
const countEl = document.getElementById('blog-search-count');
const results = document.getElementById('blog-search-results');
if (input && results) {
  let index = null;
  let loading = null;

  const loadIndex = () => {
    if (index) return Promise.resolve(index);
    if (!loading) {
      loading = fetch('search-index.json').then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      }).then((data) => {
        index = data.articles ?? [];
        // Category options derive from the index itself — no hard-coding.
        if (filter) {
          const seen = new Set();
          for (const a of index) {
            if (!a.category_name || seen.has(a.category)) continue;
            seen.add(a.category);
            const opt = document.createElement('option');
            opt.value = a.category;
            opt.textContent = a.category_name;
            filter.appendChild(opt);
          }
        }
        return index;
      });
      loading.catch(() => { loading = null; });
    }
    return loading;
  };

  const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const setCount = (hits, active) => {
    if (!countEl) return;
    if (!active) { countEl.hidden = true; countEl.textContent = ''; return; }
    countEl.hidden = false;
    countEl.textContent = `— ${hits.length} kết quả`;
  };

  const render = (hits, active) => {
    results.replaceChildren();
    if (hits.length === 0) {
      const p = document.createElement('p');
      p.className = 'blog-empty';
      p.textContent = 'Không tìm thấy bài viết khớp. Thử từ khóa khác hoặc hỏi Agent.';
      results.appendChild(p);
    } else {
      for (const a of hits) {
        const card = document.createElement('a');
        card.className = 'blog-card';
        card.href = a.url;
        const cat = document.createElement('span');
        cat.className = 'cat';
        cat.textContent = a.category_name ?? a.category ?? '';
        const h = document.createElement('h3');
        h.textContent = a.title;
        const p = document.createElement('p');
        p.textContent = a.summary ?? '';
        card.append(cat, h, p);
        results.appendChild(card);
      }
    }
    setCount(hits, active);
  };

  async function run() {
    const q = norm(input.value.trim());
    const cat = filter ? filter.value : '';
    if (q.length < 2 && !cat) {
      results.replaceChildren();
      setCount([], false);
      if (clearBtn) clearBtn.hidden = true;
      return;
    }
    if (clearBtn) clearBtn.hidden = false;
    try {
      const list = await loadIndex();
      const hits = list.filter((a) => {
        if (cat && a.category !== cat) return false;
        return q.length < 2
          || norm(a.title).includes(q)
          || norm(a.keywords ?? '').includes(q)
          || norm(a.summary ?? '').includes(q)
          || norm(a.location ?? '').includes(q);
      }).slice(0, 24);
      render(hits, true);
    } catch {
      const p = document.createElement('p');
      p.className = 'blog-empty';
      p.textContent = 'Không tải được mục lục tìm kiếm. Vui lòng thử lại.';
      results.replaceChildren(p);
    }
  }

  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, 180);
  });
  if (filter) filter.addEventListener('change', run);
  if (clearBtn) clearBtn.addEventListener('click', () => {
    input.value = '';
    if (filter) filter.value = '';
    results.replaceChildren();
    setCount([], false);
    clearBtn.hidden = true;
    input.focus();
  });
  if (location.hash === '#blog-search') input.focus();
}
