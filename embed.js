/*!
 * MotoAI embed widget — one script tag, iframe isolation, zero dependencies.
 *
 * Works as a classic <script> in the browser AND as an ES module import in
 * Node tests (the UMD-ish body is valid in both worlds; the `module` guard
 * only fires under CommonJS, which browsers never define).
 *
 * Usage:
 *   <script src="https://thuexemayhanoi.github.io/aichatbot/embed.js"
 *           data-motoai data-lang="vi" data-theme="auto"
 *           data-position="right" data-title="Hỗ trợ Agent" data-open="false" async></script>
 */
(function (root, factory) {
  var api = factory(root);
  root.MotoAIEmbed = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var MOUNT_FLAG = 'motoai-embed-mounted';
  var CONTAINER_ID = 'motoai-embed-root';

  var DEFAULTS = {
    lang: 'vi',
    theme: 'auto',
    position: 'right',
    title: 'Hỗ trợ Agent',
    source: null,
    open: false
  };

  /** Parse the host <script> attributes into a normalized config. */
  function parseConfig(script) {
    var attr = function (name) {
      try { return script.getAttribute(name); } catch (e) { return null; }
    };
    var config = {
      lang: (attr('data-lang') || DEFAULTS.lang).toLowerCase(),
      theme: (attr('data-theme') || DEFAULTS.theme).toLowerCase(),
      position: attr('data-position') === 'left' ? 'left' : DEFAULTS.position,
      title: (attr('data-title') || DEFAULTS.title).slice(0, 40),
      source: attr('data-source') ? String(attr('data-source')).slice(0, 64) : null,
      open: /^(true|1|yes)$/i.test(String(attr('data-open') || ''))
    };
    if (['vi', 'en'].indexOf(config.lang) === -1) config.lang = DEFAULTS.lang;
    if (['auto', 'light', 'dark'].indexOf(config.theme) === -1) config.theme = DEFAULTS.theme;
    return config;
  }

  /** Resolve the executing <script data-motoai> element. */
  function currentScriptEl(doc) {
    if (doc.currentScript && doc.currentScript.getAttribute) return doc.currentScript;
    var scripts = doc.querySelectorAll ? doc.querySelectorAll('script[data-motoai]') : [];
    return scripts.length > 0 ? scripts[scripts.length - 1] : null;
  }

  /** Iframe URL for the widget (same core as the direct link). */
  function buildFrameUrl(baseUrl, config) {
    if (!baseUrl) throw new Error('embed requires a script src');
    var url = baseUrl.replace(/\/embed\.js(\?.*)?$/, '/index.html');
    var sep = url.indexOf('?') === -1 ? '?' : '&';
    url += sep + 'embed=1&lang=' + encodeURIComponent(config.lang) +
      '&theme=' + encodeURIComponent(config.theme);
    if (config.source) url += '&source=' + encodeURIComponent(config.source);
    return url;
  }


  /**
   * Mount the widget. `doc` is injectable so Node tests can pass a stub.
   * Idempotent: mounting twice returns the same instance (no duplicates).
   * `overrides` (optional) merge over the script-tag attributes.
   */
  function mount(doc, overrides) {
    if (!doc) doc = root.document;
    if (doc[MOUNT_FLAG] && doc.getElementById && doc.getElementById(CONTAINER_ID)) {
      return { already: true, instance: doc[MOUNT_FLAG] };
    }
    var scriptEl = currentScriptEl(doc);
    if (!scriptEl || !scriptEl.src) return { already: false, error: 'cannot resolve embed.js URL' };
    var config = Object.assign(
      {},
      DEFAULTS,
      parseConfig(scriptEl),
      overrides && overrides.config ? overrides.config : overrides || {}
    );
    var frameUrl = buildFrameUrl(scriptEl.src, config);

    var container = doc.createElement('div');
    container.id = CONTAINER_ID;
    setStyle(container, {
      position: 'fixed',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
      right: config.position === 'right'
        ? 'calc(env(safe-area-inset-right, 0px) + 16px)'
        : 'auto',
      left: config.position === 'left'
        ? 'calc(env(safe-area-inset-left, 0px) + 16px)'
        : 'auto',
      zIndex: '2147483000',
      fontFamily: 'system-ui, sans-serif',
      lineHeight: '0'
    });

    var launcher = doc.createElement('button');
    launcher.type = 'button';
    launcher.setAttribute('aria-label', config.title);
    launcher.setAttribute('aria-expanded', 'false');
    setStyle(launcher, {
      width: '56px', height: '56px', borderRadius: '50%',
      background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer',
      fontSize: '24px', lineHeight: '56px', textAlign: 'center',
      boxShadow: '0 4px 14px rgba(0,0,0,.22)'
    });
    launcher.textContent = '🏍️';

    var frameHolder = doc.createElement('div');
    frameHolder.setAttribute('role', 'dialog');
    frameHolder.setAttribute('aria-label', config.title);
    frameHolder.hidden = true;
    setStyle(frameHolder, {
      position: 'fixed',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
      right: config.position === 'right' ? 'calc(env(safe-area-inset-right, 0px) + 16px)' : 'auto',
      left: config.position === 'left' ? 'calc(env(safe-area-inset-left, 0px) + 16px)' : 'auto',
      width: 'min(92vw, 384px)',
      height: 'min(78vh, 640px)',
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 12px 40px rgba(0,0,0,.28)',
      zIndex: '2147483000',
      background: '#ffffff'
    });

    var iframe = doc.createElement('iframe');
    iframe.src = frameUrl;
    iframe.title = config.title;
    setStyle(iframe, { width: '100%', height: '100%', border: '0', display: 'block' });
    frameHolder.appendChild(iframe);

    var open = function open() {
      frameHolder.hidden = false;
      launcher.setAttribute('aria-expanded', 'true');
      try { iframe.focus(); } catch (e) { /* not focused yet */ }
    };
    var close = function close() {
      frameHolder.hidden = true;
      launcher.setAttribute('aria-expanded', 'false');
      try { launcher.focus(); } catch (e) { /* detached */ }
    };
    var toggle = function toggle() { frameHolder.hidden ? open() : close(); };

    launcher.addEventListener('click', toggle);

    // Escape closes the widget from the host page (iframe keydowns reach the
    // iframe document first; the iframe posts a message when Escape is used).
    doc.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !frameHolder.hidden) close();
    });
    if (typeof root.addEventListener === 'function') {
      root.addEventListener('message', function (event) {
        if (event && event.data === 'motoai:close') close();
      });
    }

    container.appendChild(launcher);
    container.appendChild(frameHolder);
    (doc.body || doc.documentElement).appendChild(container);

    var instance = { config: config, open: open, close: close, toggle: toggle, frameUrl: frameUrl };
    doc[MOUNT_FLAG] = instance;
    if (config.open) open();
    return { already: false, instance: instance };
  }

  function setStyle(el, styles) {
    for (var key in styles) {
      if (Object.prototype.hasOwnProperty.call(styles, key)) {
        try { el.style[key] = styles[key]; } catch (e) { /* ignore */ }
      }
    }
  }

  // Auto-mount on load (classic script usage). DOMContentLoaded-safe.
  if (root.document && typeof root.document.createElement === 'function') {
    var boot = function boot() { mount(root.document); };
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

  return {
    version: '1.0.0',
    parseConfig: parseConfig,
    buildFrameUrl: buildFrameUrl,
    currentScriptEl: currentScriptEl,
    mount: mount,
    DEFAULTS: DEFAULTS
  };
});
