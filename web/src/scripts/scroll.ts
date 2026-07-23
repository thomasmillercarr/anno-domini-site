/**
 * Smooth scrolling (Lenis) + GSAP-driven section snapping.
 *
 * Behaviour (per the agreed design):
 *  - Lenis provides inertial smooth scroll; GSAP's ticker drives its RAF loop
 *    and ScrollTrigger stays in sync for any future scroll-linked animation.
 *  - Snapping is PROXIMITY-based: once scrolling settles, if a section top is
 *    within reach we glide to it; otherwise we leave the viewport where it is.
 *    Sections taller than the viewport therefore scroll freely and never lock.
 *  - prefers-reduced-motion disables Lenis, snapping, and smooth anchors
 *    entirely — anchor links fall back to instant native jumps.
 */

import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (reduceMotion) {
  // Native scrolling only. Anchor clicks use the browser default (instant jump).
} else {
  gsap.registerPlugin(ScrollTrigger);

  const lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });

  // Expose for other scripts that need to pause smooth scroll (e.g. booker.ts
  // locks the page while the contact panel is open). Absent under reduced
  // motion, where Lenis never initialises.
  (window as unknown as { __lenis?: Lenis }).__lenis = lenis;

  // Sync ScrollTrigger to Lenis, and run Lenis off GSAP's ticker.
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  /* ---- section-top proximity snap ---- */
  // Every major block carries data-screen-label; the fixed nav is excluded.
  const sections = Array.from(
    document.querySelectorAll<HTMLElement>('[data-screen-label]'),
  ).filter((el) => el.id !== 'nav');

  let isSnapping = false;
  let idleTimer: number | undefined;

  const snapToNearest = () => {
    if (isSnapping) return;
    const vh = window.innerHeight;
    const threshold = vh * 0.35; // only snap when a boundary is within reach
    const current = window.scrollY;
    const maxScroll = document.documentElement.scrollHeight - vh;

    let bestTop: number | null = null;
    let bestDist = Infinity;
    for (const el of sections) {
      const top = Math.round(el.getBoundingClientRect().top + window.scrollY);
      const dist = Math.abs(top - current);
      if (dist < bestDist) {
        bestDist = dist;
        bestTop = top;
      }
    }
    if (bestTop === null) return;
    bestTop = Math.min(bestTop, maxScroll); // don't overshoot the page end

    if (bestDist > 2 && bestDist <= threshold && Math.abs(bestTop - current) > 2) {
      isSnapping = true;
      lenis.scrollTo(bestTop, {
        duration: 0.7,
        easing: (t) => 1 - Math.pow(1 - t, 3),
        onComplete: () => {
          isSnapping = false;
        },
      });
    }
  };

  // Evaluate a snap only once scrolling has settled (debounced).
  lenis.on('scroll', () => {
    if (isSnapping) return;
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(snapToNearest, 140);
  });

  /* ---- smooth in-page anchor navigation ---- */
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const hash = a.getAttribute('href');
      if (!hash || hash === '#') return;
      const target: number | HTMLElement | null =
        hash === '#top' ? 0 : document.querySelector<HTMLElement>(hash);
      if (target === null) return;
      e.preventDefault();
      isSnapping = true; // suppress proximity snap during the deliberate jump
      lenis.scrollTo(target, {
        duration: 1.0,
        onComplete: () => {
          isSnapping = false;
        },
      });
    });
  });

  // Re-measure once late-loading assets (fonts, hero image) settle layout.
  window.addEventListener('load', () => ScrollTrigger.refresh());
}
