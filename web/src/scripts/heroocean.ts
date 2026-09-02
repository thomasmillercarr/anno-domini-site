/**
 * Hero backdrop — mounts the vgpu "Particles ocean" (src/ocean/) on the hero
 * canvas, and falls back to the WebGL2 field when WebGPU is unavailable.
 *
 * The ocean itself is the example's code, adapted at three documented points
 * (see the header of src/ocean/renderer.ts). Everything in THIS file is the
 * site-side wiring the example does not have, because it was written for a
 * gallery canvas that is always on screen and owns its own clock:
 *
 *   - ONE CLOCK. gsap.ticker drives step(dt); scroll.ts already runs that ticker
 *     in lockstep with Lenis. vgpu is built for this (clock.advance claims the
 *     frame's tick), so nothing races.
 *   - NO GPU WORK FOR A HERO NOBODY IS LOOKING AT. The example runs 262,144
 *     instanced particles and a five-level bloom chain every frame, for ever.
 *     On a marketing page that is most of a laptop battery spent below the fold,
 *     so an IntersectionObserver and visibilitychange stop the ticker. The
 *     renderer is NOT disposed on the way out — the graph costs a full rebuild
 *     (h0, 18 pipelines, the bloom pyramid) and scrolling back up should be free.
 *   - FALLBACK. WebGPU is not everywhere yet, and the hero is the most important
 *     visual on the site; a flat CSS gradient is not an acceptable substitute.
 *     No navigator.gpu, or a failed init, hands the canvas to the WebGL2 field.
 *   - REDUCED MOTION renders exactly one frame and registers no ticker, matching
 *     what the WebGL2 path has always done.
 */

import { gsap } from 'gsap';

const canvas = document.querySelector<HTMLCanvasElement>('canvas.hero__slot');
const hero = document.querySelector<HTMLElement>('.hero');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

async function fallback(): Promise<void> {
  const { mountDefaultHeroField } = await import('./herofield');
  mountDefaultHeroField();
}

async function boot(): Promise<void> {
  if (!canvas || !hero) return;
  if (canvas.dataset.heroMounted !== undefined) return;

  // The capability check is navigator.gpu AND an adapter: a browser can expose
  // the API and still have no adapter (blocklisted driver, headless, a VM), and
  // that case has to reach the fallback rather than a black canvas.
  if (!navigator.gpu || !(await navigator.gpu.requestAdapter().catch(() => null))) {
    await fallback();
    return;
  }
  canvas.dataset.heroMounted = 'webgpu';

  const { createRenderer } = await import('../ocean/renderer');
  const renderer = createRenderer({
    canvas,
    onFirstFrame: () => canvas.classList.add('is-live'),
  });

  try {
    await renderer.ready;
  } catch (error) {
    // A device that reports an adapter can still fail to build the graph.
    console.warn('[heroocean] WebGPU init failed, using the WebGL2 field', error);
    renderer.dispose();
    delete canvas.dataset.heroMounted;
    await fallback();
    return;
  }
  if (!renderer.isReady()) return;

  if (reduceMotion) {
    // One frame, no ticker. A non-zero delta so the spectrum is evolved rather
    // than frozen at t=0, which is a flat sheet of water.
    renderer.step(2.5);
    return;
  }

  let running = false;
  const tick = (_t: number, dt: number): void => renderer.step(dt / 1000);
  const run = (on: boolean): void => {
    if (on === running) return;
    running = on;
    if (on) gsap.ticker.add(tick);
    else gsap.ticker.remove(tick);
  };

  const io = new IntersectionObserver(([e]) => run(e.isIntersecting && !document.hidden));
  io.observe(hero);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) run(false);
  });
  // The example's own teardown, kept: it stops the scheduler phase and destroys
  // every target in reverse allocation order.
  addEventListener('pagehide', () => {
    run(false);
    io.disconnect();
    renderer.dispose();
  });

  run(true);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void boot());
} else {
  void boot();
}
