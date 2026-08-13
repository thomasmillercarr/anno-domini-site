/**
 * Smooth scrolling (Lenis).
 *
 * Behaviour:
 *  - Lenis provides inertial smooth scroll; GSAP's ticker drives its RAF loop
 *    and ScrollTrigger stays in sync for the scroll-linked animation layer.
 *  - The viewport moves on its own ONLY when the visitor asks it to, by clicking
 *    an in-page anchor. A proximity auto-snap used to glide to the nearest
 *    section top 140ms after scrolling settled; it was removed deliberately —
 *    taking the viewport off someone who has just chosen where to stop is the
 *    one thing on this page that overrode the user's own input.
 *  - prefers-reduced-motion disables Lenis and smooth anchors entirely —
 *    anchor links fall back to instant native jumps.
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

  /* ---- smooth in-page anchor navigation ---- */
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const hash = a.getAttribute('href');
      if (!hash || hash === '#') return;
      const target: number | HTMLElement | null =
        hash === '#top' ? 0 : document.querySelector<HTMLElement>(hash);
      if (target === null) return;
      e.preventDefault();
      lenis.scrollTo(target, { duration: 1.0 });
    });
  });

  // Re-measure once late-loading assets (fonts, section images) settle layout.
  // The hero backdrop is a canvas pinned to inset:0, so it never moves anything.
  window.addEventListener('load', () => ScrollTrigger.refresh());
}
