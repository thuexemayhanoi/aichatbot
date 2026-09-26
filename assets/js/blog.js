/**
 * Blog search — client-side, index loaded ON DEMAND (never at page load).
 * Index: blog/search-index.json (published articles only, compact fields).
 */
const input = document.getElementById('blog-search-input');
const results = document.getElementById('blog-search-results');
if (input && results) {
  let index = null;
  let loading = null;

  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (!loading) {
      loading = fetch('search-index.json').then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      }).then((data) => {
        index = data.articles ?? [];
        return index;
      });
      loading.catch(() => { loading = null; });
    }
    return loading;
  }

  function norm(s) {
    return String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function render(hits) {
    results.replaceChildren();
    if (hits.length === 0) {
      const p = document.createElement('p');
      p.textContent = 'Không tìm thấy bài viết khớp.';
      results.appendChild(p);
      return;
    }
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

  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = norm(input.value.trim());
    if (q.length < 2) { results.replaceChildren(); return; }
    timer = setTimeout(async () => {
      try {
        const list = await loadIndex();
        const hits = list.filter((a) =>
          norm(a.title).includes(q) || norm(a.keywords ?? '').includes(q) || norm(a.summary ?? '').includes(q)
        ).slice(0, 12);
        render(hits);
      } catch {
        const p = document.createElement('p');
        p.textContent = 'Không tải được mục lục tìm kiếm. Vui lòng thử lại.';
        results.replaceChildren(p);
      }
    }, 180);
  });
}
