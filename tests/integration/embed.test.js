import test from 'node:test';
import assert from 'node:assert/strict';

// embed.js is dual-mode: as an ES module import it exposes its API on
// globalThis.MotoAIEmbed (the module guard for CommonJS never fires here).
await import('../../embed.js');
const api = globalThis.MotoAIEmbed;

/** Minimal fake DOM sufficient for MotoAIEmbed.mount (no jsdom needed). */
function fakeDoc(scriptAttrs = {}) {
  const elements = [];
  const body = makeElement('body');
  function makeElement(tag) {
    const el = {
      tag,
      children: [],
      style: {},
      attrs: {},
      hidden: false,
      listeners: {},
      addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
      setAttribute(k, v) { this.attrs[k] = v; },
      getAttribute(k) { return this.attrs[k] ?? null; },
      appendChild(child) { this.children.push(child); return child; },
      focus() { this.focused = true; },
      querySelectorAll() { return []; }
    };
    if (tag === 'script') {
      el.src = 'https://thuexemayhanoi.github.io/aichatbot/embed.js';
      el.attrs = { ...scriptAttrs };
    }
    if (tag === 'iframe') el.style = {};
    return el;
  }
  const doc = {
    currentScript: makeElement('script'),
    readyState: 'complete',
    createElement: makeElement,
    addEventListener(type, fn) { (doc.listeners ??= {})[type] ??= []; doc.listeners[type].push(fn); },
    getElementById(id) { return elements.find((el) => el.id === id) ?? null; },
    body
  };
  // The mount flow appends the container to <body>: track that in `elements`
  // so getElementById (used by the dedupe guard) can find it.
  const bodyAppend = body.appendChild.bind(body);
  body.appendChild = (child) => { elements.push(child); return bodyAppend(child); };
  doc.createElement('div').id = ''; // noop shape
  const realCreate = doc.createElement;
  doc.createElement = (tag) => {
    const el = realCreate(tag);
    if (tag === 'div') {
      const orig = el.appendChild.bind(el);
      el.appendChild = (child) => { elements.push(child); return orig(child); };
    }
    return el;
  };
  return doc;
}

test('embed api is importable and complete', () => {
  assert.ok(api);
  assert.equal(typeof api.mount, 'function');
  assert.equal(typeof api.parseConfig, 'function');
  assert.equal(typeof api.buildFrameUrl, 'function');
});

test('embed: config attributes are parsed and clamped', () => {
  const script = {
    getAttribute: (name) => ({
      'data-lang': 'EN', 'data-theme': 'dark', 'data-position': 'left',
      'data-title': 'X'.repeat(80), 'data-source': 'blog', 'data-open': 'true'
    })[name] ?? null
  };
  const config = api.parseConfig(script);
  assert.equal(config.lang, 'en');
  assert.equal(config.theme, 'dark');
  assert.equal(config.position, 'left');
  assert.equal(config.title.length, 40);
  assert.equal(config.source, 'blog');
  assert.equal(config.open, true);

  const bad = api.parseConfig({ getAttribute: () => 'nope' });
  assert.equal(bad.lang, 'vi');
  assert.equal(bad.theme, 'auto');
  assert.equal(bad.position, 'right');
  assert.equal(bad.open, false);
});

test('embed: iframe URL carries lang/theme/source and embed flag', () => {
  const url = api.buildFrameUrl('https://thuexemayhanoi.github.io/aichatbot/embed.js', {
    lang: 'en', theme: 'auto', source: 'partner'
  });
  assert.equal(
    url,
    'https://thuexemayhanoi.github.io/aichatbot/index.html?embed=1&lang=en&theme=auto&source=partner'
  );
  assert.throws(() => api.buildFrameUrl(''), Error);
});

test('embed: mount creates launcher + iframe and marks the document', () => {
  const doc = fakeDoc({ 'data-motoai': '' });
  const result = api.mount(doc);
  assert.equal(result.already, false);
  const instance = result.instance;
  assert.ok(instance.frameUrl.includes('index.html?embed=1'));
  assert.equal(typeof instance.open, 'function');
  assert.equal(typeof instance.close, 'function');
  assert.equal(doc.body.children.length, 1, 'one container appended');
  const container = doc.body.children[0];
  assert.equal(container.children.length, 2, 'launcher + frame holder');
  assert.ok(doc['motoai-embed-mounted'], 'document flagged as mounted');
});

test('embed: mounting twice does not duplicate the widget', () => {
  const doc = fakeDoc();
  const first = api.mount(doc);
  const second = api.mount(doc);
  assert.equal(second.already, true);
  assert.equal(second.instance, first.instance);
  assert.equal(doc.body.children.length, 1, 'still exactly one container');
});

test('embed: open/close cycles toggle visibility and aria state', () => {
  const doc = fakeDoc({ 'data-open': 'false' });
  const { instance } = api.mount(doc);
  const holder = doc.body.children[0].children[1];
  for (let i = 0; i < 3; i++) {
    instance.open();
    assert.equal(holder.hidden, false);
    instance.close();
    assert.equal(holder.hidden, true);
  }
});

test('embed: Escape key closes an open widget', () => {
  const doc = fakeDoc();
  const { instance } = api.mount(doc);
  instance.open();
  const keydowns = doc.listeners['keydown'];
  assert.ok(keydowns.length >= 1);
  keydowns.forEach((fn) => fn({ key: 'Escape' }));
  const holder = doc.body.children[0].children[1];
  assert.equal(holder.hidden, true);
});

test('embed: data-open="true" opens the widget on mount', () => {
  const doc = fakeDoc({ 'data-open': 'true' });
  api.mount(doc);
  const holder = doc.body.children[0].children[1];
  assert.equal(holder.hidden, false);
});

test('embed: auto-open="false" keeps the widget closed on mount', () => {
  const doc = fakeDoc({ 'data-open': 'false' });
  api.mount(doc);
  const holder = doc.body.children[0].children[1];
  assert.equal(holder.hidden, true);
});
