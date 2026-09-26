/**
 * MotoAI Agent — settings page behaviour (admin, progressive enhancement only).
 * Không network call, không tracking: chỉ nhắc nhở trực quan cho open-delay.
 */
(function () {
  'use strict';
  var open = document.getElementById('motoai-open-delay');
  if (!open) return;
  open.addEventListener('input', function () {
    var v = parseInt(open.value, 10);
    if (isNaN(v) || v < 0) open.value = '0';
    if (v > 10000) open.value = '10000';
  });
})();
