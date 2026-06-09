/**
 * Hero stat card: count-up + self-drawing sparkline (ideas 1 + 4).
 *
 * When the card scrolls into view (it's above the fold, so effectively on
 * load) the headline number counts up from 0 to its target while the sparkline
 * draws itself left-to-right; the end dot then fades in and settles into a
 * slow, perpetual "breathing" pulse driven by CSS.
 *
 * prefers-reduced-motion: snap straight to the final figure, no animation.
 * The CSS carries an equivalent static fallback, so a no-JS render is correct.
 */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function decimalsOf(s: string): number {
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

function countUp(el: HTMLElement, target: number, decimals: number): void {
  const duration = 1100;
  const start = performance.now();
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

  const frame = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = (target * easeOutCubic(t)).toFixed(decimals);
    if (t < 1) requestAnimationFrame(frame);
    else el.textContent = target.toFixed(decimals);
  };
  requestAnimationFrame(frame);
}

function initStatcard(): void {
  const card = document.querySelector<HTMLElement>('.statcard');
  if (!card) return;

  const numEl = card.querySelector<HTMLElement>('[data-countup]');
  const line = card.querySelector<SVGGeometryElement>('.statcard__line');

  // Feed the real path length to the CSS dash animation.
  if (line) line.style.setProperty('--len', String(line.getTotalLength()));

  const raw = numEl?.dataset.countup ?? numEl?.textContent ?? '0';
  const target = parseFloat(raw);
  const decimals = decimalsOf(raw.trim());

  if (reduceMotion || !Number.isFinite(target)) {
    card.classList.add('is-revealed', 'no-motion');
    if (numEl && Number.isFinite(target)) numEl.textContent = target.toFixed(decimals);
    return;
  }

  // Reset to zero, then reveal once the card enters the viewport.
  if (numEl) numEl.textContent = (0).toFixed(decimals);

  const reveal = () => {
    card.classList.add('is-revealed');
    if (numEl) countUp(numEl, target, decimals);
  };

  const io = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          reveal();
          obs.disconnect();
          break;
        }
      }
    },
    { threshold: 0.4 },
  );
  io.observe(card);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStatcard);
} else {
  initStatcard();
}
