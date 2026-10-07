(function () {
  'use strict';
  const selector = 'button, a[href], input:not([type=hidden]), select, textarea, summary, label[for], label:has(input, select, textarea), [role=button], [role=switch], [data-action]';
  const timers = new WeakMap();
  const activations = new WeakMap();
  let pressed = null;
  let lastVibration = 0;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function control(target) {
    let element = target instanceof Element ? target.closest(selector) : null;
    if (!element) return null;
    if (element.matches('input[type=checkbox], input[type=radio], input[type=file]')) {
      element = element.labels?.[element.labels.length - 1] || element;
    }
    const input = element.matches('label') ? element.control : element;
    if (element.closest('[inert], [hidden], [aria-disabled=true]') || input?.matches(':disabled')) return null;
    if (getComputedStyle(element).display === 'inline') element.classList.add('tap-inline');
    return element;
  }
  function release() {
    pressed?.classList.remove('tap-pressed');
    pressed = null;
  }
  document.addEventListener('pointerdown', event => {
    release();
    if (!event.isPrimary || event.button !== 0) return;
    pressed = control(event.target);
    pressed?.classList.add('tap-pressed');
  }, true);
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
  document.addEventListener('pointerout', event => { if (!event.relatedTarget) release(); }, true);
  document.addEventListener('dragstart', release, true);
  document.addEventListener('scroll', release, true);
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', release);
  document.addEventListener('click', event => {
    const element = control(event.target); if (!element) return;
    const now = performance.now();
    // A label also forwards a click to its input; acknowledge the gesture once.
    if (now - (activations.get(element) ?? -Infinity) < 60) return;
    activations.set(element, now);
    clearTimeout(timers.get(element));
    if (element.classList.contains('tap-release')) {
      element.classList.remove('tap-release');
      void element.offsetWidth;
    }
    element.classList.add('tap-release');
    timers.set(element, setTimeout(() => element.classList.remove('tap-release'), 240));
    if (event.isTrusted && !reducedMotion() && now - lastVibration > 60 && typeof navigator.vibrate === 'function' && window.matchMedia('(pointer: coarse)').matches) {
      try { navigator.vibrate(8); lastVibration = now; } catch (_) { /* Visual feedback remains available. */ }
    }
  }, true);
})();
