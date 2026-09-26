/**
 * MotoAI Agent — small admin UX helper.
 * Shows a live preview note of the loader attributes. No AJAX, no external calls.
 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function val(id) {
    var el = document.getElementById(id);
    if (!el) return '';
    return el.type === 'checkbox' ? (el.checked ? '1' : '0') : String(el.value || '');
  }

  function updatePreview() {
    var out = document.getElementById('motoai-agent-preview');
    if (!out) return;
    var lang = val('motoai-agent-lang') || 'vi';
    var theme = val('motoai-agent-theme') || 'auto';
    var position = val('motoai-agent-position') === 'bottom-left' ? 'left' : 'right';
    var title = val('motoai-agent-title') || 'MotoAI';
    var source = val('motoai-agent-source') || 'wordpress';
    var open = val('motoai-agent-auto-open') === '1';
    var delay = val('motoai-agent-auto-open-delay');
    var attrs = 'data-motoai data-lang="' + lang + '" data-theme="' + theme +
      '" data-position="' + position + '" data-title="' + title.replace(/"/g, '') +
      '" data-source="' + source.replace(/"/g, '') + '" data-open="' + (open ? 'true' : 'false') +
      '" data-open-delay="' + delay + '"';
    var esc = document.getElementById('motoai-agent-preview-attrs');
    if (esc) esc.textContent = attrs;
    out.hidden = false;
  }

  ready(function () {
    var form = document.querySelector('form');
    if (form) form.addEventListener('input', updatePreview);
    updatePreview();
  });
})();
