/**
 * Cursor-tracking hover flair (magnetic pop + row highlight).
 *
 * Two effects, both driven purely by CSS — this script only writes the pointer
 * position into custom properties; all transforms/glows live in os-site.css:
 *
 *  - `.step` columns (How it works): a "magnetic pop" — the column lifts/scales
 *    toward the cursor (`--px` / `--py` ≈ [-1, 1] offset from centre) with the
 *    number/label parallaxing from the same vars.
 *  - `.os-row` items (What we build): a highlight glow that tracks the cursor
 *    horizontally across the row (`--mx`, a 0–100% position). The slide / dot
 *    grow / brighten is pure CSS :hover.
 *
 * Bails entirely for reduced-motion or coarse/no-hover pointers, leaving the
 * plain static design (the CSS reduced-motion block is an equivalent fallback).
 */

const enabled =
  window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Coalesce pointermove writes into one rAF tick. */
function rafThrottle<T extends (...args: never[]) => void>(fn: T): T {
  let queued = false;
  let lastArgs: unknown[];
  return ((...args: unknown[]) => {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      (fn as (...a: unknown[]) => void)(...lastArgs);
    });
  }) as T;
}

function initSteps(): void {
  const steps = document.querySelectorAll<HTMLElement>('.step');
  steps.forEach((step) => {
    const onMove = rafThrottle((e: PointerEvent) => {
      const r = step.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * 2 - 1; // [-1, 1]
      const py = ((e.clientY - r.top) / r.height) * 2 - 1;
      step.style.setProperty('--px', px.toFixed(3));
      step.style.setProperty('--py', py.toFixed(3));
    });

    step.addEventListener('pointerenter', () => step.classList.add('is-pop'));
    step.addEventListener('pointermove', onMove as EventListener, { passive: true });
    step.addEventListener('pointerleave', () => {
      step.classList.remove('is-pop');
      step.style.setProperty('--px', '0');
      step.style.setProperty('--py', '0');
    });
  });
}

function initRows(): void {
  const rows = document.querySelectorAll<HTMLElement>('.os-row');
  rows.forEach((row) => {
    const onMove = rafThrottle((e: PointerEvent) => {
      const r = row.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width) * 100; // 0–100%
      row.style.setProperty('--mx', `${mx.toFixed(1)}%`);
    });

    row.addEventListener('pointermove', onMove as EventListener, { passive: true });
    row.addEventListener('pointerleave', () => row.style.setProperty('--mx', '50%'));
  });
}

function init(): void {
  if (!enabled) return;
  initSteps();
  initRows();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
