/**
 * Blog search (v58) — client-side, index lazy-loaded on demand.
 * Text filter + category filter + clear button + result count + empty state.
 * Index: blog/search-index.json (published articles only, compact fields).
 * v72.1: results clone #blog-card-tpl (the builder's card); messages come
 * from data-* on #blog-search-results (config/blog-ui.json labels).
 */
const input = document.getElementById('blog-search-input');
const filter = document.getElementById('blog-search-filter');
const clearBtn = document.getElementById('blog-search-clear');
const countEl = document.getElementById('blog-search-count');
const results = document.getElementById('blog-search-results');
const tpl = document.getElementById('blog-card-tpl');
const copy = results?.dataset ?? {};
if (input && results && tpl) {
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
    countEl.textContent = copy.count.replace('{n}', hits.length);
  };

  const message = (text) => {
    const p = document.createElement('p');
    p.className = 'blog-empty';
    p.textContent = text;
    return p;
  };

  const cardOf = (a) => {
    const card = tpl.content.firstElementChild.cloneNode(true);
    card.href = a.url;
    card.querySelector('.cat').textContent = a.category_label;
    card.querySelector('h3').textContent = a.title;
    card.querySelector('p').textContent = a.summary ?? '';
    const time = card.querySelector('time');
    time.dateTime = time.textContent = a.date;
    const read = time.nextSibling; // " · 0 phút đọc": only the number is data
    read.textContent = read.textContent.replace(/\d+/, a.minutes);
    return card;
  };

  const render = (hits, active) => {
    results.replaceChildren(...(hits.length ? hits.map(cardOf) : [message(copy.empty)]));
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
      results.replaceChildren(message(copy.error));
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
