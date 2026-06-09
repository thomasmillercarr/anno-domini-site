/**
 * Theme toggle + nav scroll-state.
 *
 * Ported from the wireframe's inline script. The initial theme is applied
 * pre-paint by the inline snippet in Base.astro; this module only wires the
 * toggle button and the nav's light-on-hero → dark-on-frosted transition.
 */

const root = document.documentElement;

/* ---- light / dark toggle ---- */
const toggle = document.getElementById('modeToggle');
toggle?.addEventListener('click', () => {
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try {
    localStorage.setItem('os-theme', next);
  } catch (e) {
    /* storage unavailable (private mode) — toggle still works for the session */
  }
});

/* ---- nav scroll-state (IntersectionObserver, no per-frame scroll reads) ----
 * Two zero-size sentinels are dropped into the document; observing when they
 * cross the viewport edge is far cheaper than reading window.scrollY on every
 * scroll event (which also forces layout). They use absolute positioning, so
 * they sit at fixed document offsets and the vh-based one re-resolves on resize. */
const nav = document.getElementById('nav');
if (nav) {
  const makeSentinel = (top: string): HTMLElement => {
    const el = document.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = `position:absolute;left:0;width:1px;height:1px;pointer-events:none;top:${top};`;
    document.body.appendChild(el);
    return el;
  };

  // `.scrolled` once we've moved past the first 24px.
  new IntersectionObserver(
    ([entry]) => nav.classList.toggle('scrolled', !entry.isIntersecting),
  ).observe(makeSentinel('24px'));

  // `.on-hero` (light nav type) until ~82% of the first viewport has scrolled past.
  new IntersectionObserver(
    ([entry]) => nav.classList.toggle('on-hero', entry.isIntersecting),
  ).observe(makeSentinel('82vh'));
}
