/**
 * Scroll-linked motion layer, riding the GSAP ScrollTrigger ↔ Lenis sync that
 * scroll.ts establishes.
 *
 * The choreography extends the brand's existing "self-drawing line" motif
 * (the statcard sparkline): hairlines, manifesto icons, the device's
 * input→output lines, and the steps' cycle line all draw themselves in as
 * the visitor scrolls. Section content rises into place around them.
 *
 * Everything is gated behind the `motion` class that Base.astro's inline
 * script adds pre-paint (JS available + no prefers-reduced-motion). The CSS
 * MOTION LAYER in os-site.css holds only the above-the-fold elements hidden
 * under that class (with a keyframe safety net); everything below the fold
 * gets its initial state from gsap.set() here, so a failed script load can
 * never strand content invisible.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const motionOK =
  document.documentElement.classList.contains('motion') &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const EASE = 'power3.out';

function $all(sel: string, root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(sel));
}

/** Prime an inline icon for stroke drawing; returns stroked + filled shapes. */
function prepIconDraw(svg: SVGSVGElement): {
  strokes: SVGGeometryElement[];
  fills: SVGGeometryElement[];
} {
  const strokes: SVGGeometryElement[] = [];
  const fills: SVGGeometryElement[] = [];
  svg.querySelectorAll<SVGGeometryElement>('path, circle, polyline').forEach((shape) => {
    const fill = shape.getAttribute('fill');
    if (fill && fill !== 'none') {
      fills.push(shape);
      return;
    }
    const len = shape.getTotalLength();
    shape.style.strokeDasharray = String(len);
    shape.style.strokeDashoffset = String(len);
    strokes.push(shape);
  });
  return { strokes, fills };
}

interface RiseOpts {
  y?: number;
  duration?: number;
  stagger?: number;
  delay?: number;
  start?: string;
}

/** Fade-rise target(s) once their trigger scrolls into view (plays once). */
function rise(targets: gsap.TweenTarget, trigger: gsap.DOMTarget, opts: RiseOpts = {}): void {
  const els = gsap.utils.toArray(targets) as Element[];
  if (!els.length) return;
  gsap.set(els, { y: opts.y ?? 24, autoAlpha: 0 });
  gsap.to(els, {
    y: 0,
    autoAlpha: 1,
    duration: opts.duration ?? 0.9,
    delay: opts.delay ?? 0,
    stagger: opts.stagger ?? 0,
    ease: EASE,
    scrollTrigger: { trigger, start: opts.start ?? 'top 82%', once: true },
  });
}

/* ---- hero: load entrance ----
   The hero entrance now lives entirely in CSS (see the MOTION LAYER block in
   os-site.css) and its word masks are server-rendered by Hero.astro. The hero
   is the LCP region, so nothing above the fold may wait on this bundle
   downloading and parsing — that was worth ~600ms and, if the script ever
   failed, left the headline invisible for 2.4s. Only the scroll-out parallax
   below still needs GSAP. */

function heroParallax(): void {
  const hero = document.querySelector<HTMLElement>('.hero');
  if (!hero) return;
  const scrollOut = { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } as const;
  // yPercent stays well inside the ±12% CSS bleed on .hero__slot.
  gsap.to('.hero__slot', { yPercent: 6, ease: 'none', scrollTrigger: { ...scrollOut } });
  gsap.to('.hero__grid', { y: 64, ease: 'none', scrollTrigger: { ...scrollOut } });
}

/* ---- manifesto: photographic parallax + panel rise + icons drawing ---- */
function manifesto(): void {
  const section = document.querySelector<HTMLElement>('.manifesto');
  if (!section) return;

  gsap.fromTo(
    '.manifesto__slot',
    { yPercent: -6 },
    {
      yPercent: 6,
      ease: 'none',
      scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true },
    },
  );

  const panel = section.querySelector<HTMLElement>('.mpanel');
  if (!panel) return;
  const principles = $all('.principle', section);
  const icons = principles.map((p) => {
    const svg = p.querySelector<SVGSVGElement>('svg');
    return svg ? prepIconDraw(svg) : { strokes: [], fills: [] };
  });
  const allFills = icons.flatMap((i) => i.fills);
  if (allFills.length) gsap.set(allFills, { opacity: 0 });
  gsap.set(panel, { y: 48, autoAlpha: 0 });
  if (principles.length) gsap.set(principles, { y: 18, autoAlpha: 0 });

  const tl = gsap.timeline({
    defaults: { ease: EASE },
    scrollTrigger: { trigger: section, start: 'top 70%', once: true },
  });
  tl.to(panel, { y: 0, autoAlpha: 1, duration: 1.0 });
  if (principles.length)
    tl.to(principles, { y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.12 }, 0.25);
  icons.forEach(({ strokes, fills }, i) => {
    if (strokes.length)
      tl.to(strokes, { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut' }, 0.35 + i * 0.12);
    if (fills.length) tl.to(fills, { opacity: 1, duration: 0.3 }, 1.05 + i * 0.12);
  });
}

/* ---- problem: statements rise, their hairlines draw ---- */
function problem(): void {
  const section = document.querySelector<HTMLElement>('#approach');
  if (!section) return;
  const label = section.querySelector<HTMLElement>('.label');
  if (label) rise(label, section, { y: 12, start: 'top 78%' });

  $all('.problem__item', section).forEach((item) => {
    gsap.set(item, { y: 28, autoAlpha: 0, '--draw': 0 });
    const tl = gsap.timeline({
      defaults: { ease: EASE },
      scrollTrigger: { trigger: item, start: 'top 85%', once: true },
    });
    tl.to(item, { y: 0, autoAlpha: 1, duration: 0.85 }).to(
      item,
      { '--draw': 1, duration: 1.0, ease: 'power3.inOut' },
      0.05,
    );
  });
}

/* ---- solution: text cascade, index rows slide in, device draws I→O ---- */
function solution(): void {
  const section = document.querySelector<HTMLElement>('.solution');
  if (!section) return;

  const textTargets = [
    section.querySelector<HTMLElement>('.label'),
    section.querySelector<HTMLElement>('.solution__h'),
    section.querySelector<HTMLElement>('.body'),
  ].filter((el): el is HTMLElement => el !== null);
  const index = section.querySelector<HTMLElement>('.osindex');
  const rows = $all('.os-row', section);

  if (textTargets.length) gsap.set(textTargets, { y: 26, autoAlpha: 0 });
  if (index) gsap.set(index, { y: 30, autoAlpha: 0 });
  if (rows.length) gsap.set(rows, { x: -12, autoAlpha: 0 });

  const tl = gsap.timeline({
    defaults: { ease: EASE },
    scrollTrigger: { trigger: section, start: 'top 72%', once: true },
  });
  if (textTargets.length) tl.to(textTargets, { y: 0, autoAlpha: 1, duration: 0.9, stagger: 0.1 });
  if (index) tl.to(index, { y: 0, autoAlpha: 1, duration: 0.9 }, 0.3);
  if (rows.length)
    // clearProps so the rows' CSS hover translateX isn't pinned by inline transforms
    tl.to(rows, { x: 0, autoAlpha: 1, duration: 0.6, stagger: 0.06, clearProps: 'transform' }, 0.45);

  const device = section.querySelector<HTMLElement>('.device');
  if (!device) return;
  const lines = $all('.io-line', device);
  const labels = $all('.io-label', device);
  const core = device.querySelector<HTMLElement>('.io-core');
  const cap = device.querySelector<HTMLElement>('.device__cap');

  gsap.set(device, { y: 40, autoAlpha: 0 });
  if (lines.length) gsap.set(lines, { scaleX: 0, transformOrigin: 'left center' });
  if (core) gsap.set(core, { scale: 0.92, autoAlpha: 0 });
  const quiet = [...labels, ...(cap ? [cap] : [])];
  if (quiet.length) gsap.set(quiet, { autoAlpha: 0 });

  // input → core → output, told left to right
  const dtl = gsap.timeline({
    defaults: { ease: EASE },
    scrollTrigger: { trigger: device, start: 'top 78%', once: true },
  });
  dtl.to(device, { y: 0, autoAlpha: 1, duration: 1.0 });
  if (labels[0]) dtl.to(labels[0], { autoAlpha: 1, duration: 0.4 }, 0.3);
  if (lines[0]) dtl.to(lines[0], { scaleX: 1, duration: 0.55, ease: 'power2.inOut' }, 0.42);
  if (core) dtl.to(core, { scale: 1, autoAlpha: 1, duration: 0.6 }, 0.85);
  if (lines[1]) dtl.to(lines[1], { scaleX: 1, duration: 0.55, ease: 'power2.inOut' }, 1.1);
  if (labels[1]) dtl.to(labels[1], { autoAlpha: 1, duration: 0.4 }, 1.5);
  if (cap) dtl.to(cap, { autoAlpha: 1, duration: 0.6 }, 1.65);
}

/* ---- how it works: scrubbed cycle line lights each step in turn ---- */
function howItWorks(): void {
  const section = document.querySelector<HTMLElement>('#insights');
  if (!section) return;
  const header = [
    section.querySelector<HTMLElement>('.label'),
    section.querySelector<HTMLElement>('.lede'),
  ].filter((el): el is HTMLElement => el !== null);
  if (header.length) rise(header, section, { y: 18, stagger: 0.1, start: 'top 78%' });

  const stepsWrap = section.querySelector<HTMLElement>('.steps');
  const steps = $all('.step', section);
  const line = section.querySelector<HTMLElement>('.steps-line');
  if (!stepsWrap || !steps.length) return;

  // The lift uses --rise (composed via the CSS `translate` property) so the
  // pointer.ts magnetic `transform` keeps working after the scrub settles.
  //
  // Deliberately no opacity here. This tween is scrubbed to scroll position, so
  // dimming the steps meant the text genuinely sat at 0.16 alpha — 1.14:1
  // against the ground — for anyone whose scroll happened to rest mid-band. The
  // sequence still reads: the cycle line draws through each step as it rises.
  gsap.set(steps, { '--rise': '18px' });
  if (line) gsap.set(line, { scaleX: 0 });

  const tl = gsap.timeline({
    scrollTrigger: { trigger: stepsWrap, start: 'top 80%', end: 'top 28%', scrub: 0.4 },
  });
  steps.forEach((step, i) => {
    tl.to(step, { '--rise': '0px', duration: 0.8, ease: 'power2.out' }, i);
    if (line) tl.to(line, { scaleX: (i + 1) / steps.length, duration: 1, ease: 'none' }, i);
  });
}

/* ---- ladder: rungs rise, hairlines draw, the active wash sweeps in ---- */
function ladder(): void {
  const section = document.querySelector<HTMLElement>('.ladder');
  if (!section) return;
  const label = section.querySelector<HTMLElement>('.ladder__label');
  if (label) rise(label, section, { y: 12, start: 'top 80%' });

  $all('.rung', section).forEach((rung) => {
    const active = rung.classList.contains('rung--active');
    gsap.set(rung, { y: 26, autoAlpha: 0, '--draw': 0, ...(active ? { '--veil': 0 } : {}) });
    const tl = gsap.timeline({
      defaults: { ease: EASE },
      scrollTrigger: { trigger: rung, start: 'top 86%', once: true },
    });
    tl.to(rung, { y: 0, autoAlpha: 1, duration: 0.85 }).to(
      rung,
      { '--draw': 1, duration: 1.0, ease: 'power3.inOut' },
      0.05,
    );
    if (active) tl.to(rung, { '--veil': 1, duration: 1.1, ease: 'power2.inOut' }, 0.25);
  });
}

/* ---- proof: header rise + gallery blinds ---- */
function proof(): void {
  const grid = document.querySelector<HTMLElement>('.proof__grid');
  if (grid) {
    const header = [
      grid.querySelector<HTMLElement>('.proof__label'),
      grid.querySelector<HTMLElement>('.proof__statement'),
      grid.querySelector<HTMLElement>('.body'),
    ].filter((el): el is HTMLElement => el !== null);
    if (header.length) rise(header, grid, { y: 24, stagger: 0.12, start: 'top 76%' });
  }

  const imgs = $all('.proof__imgs img');
  if (imgs.length) {
    gsap.set(imgs, { clipPath: 'inset(0 0 100% 0)' });
    gsap.to(imgs, {
      clipPath: 'inset(0 0 0% 0)',
      duration: 1.15,
      ease: 'power4.inOut',
      stagger: 0.16,
      scrollTrigger: { trigger: '.proof__imgs', start: 'top 80%', once: true },
    });
  }
  const bars = $all('.proof__bar');
  if (bars.length) rise(bars, '.proof__bars', { y: 16, stagger: 0.12, delay: 0.35, start: 'top 88%' });
}

/* ---- cta ---- */
function cta(): void {
  const section = document.querySelector<HTMLElement>('.cta');
  if (!section) return;
  const h = section.querySelector<HTMLElement>('.cta__h');
  const line = section.querySelector<HTMLElement>('.cta__line');
  const btn = section.querySelector<HTMLElement>('.btn');

  const tl = gsap.timeline({
    defaults: { ease: EASE },
    scrollTrigger: { trigger: section, start: 'top 74%', once: true },
  });
  if (h) {
    gsap.set(h, { y: 34, autoAlpha: 0 });
    tl.to(h, { y: 0, autoAlpha: 1, duration: 1.0 }, 0);
  }
  if (line) {
    gsap.set(line, { y: 20, autoAlpha: 0 });
    tl.to(line, { y: 0, autoAlpha: 1, duration: 0.8 }, 0.15);
  }
  if (btn) {
    gsap.set(btn, { y: 16, autoAlpha: 0 });
    // clearProps hands the transform back to the CSS magnetic-hover vars
    tl.to(btn, { y: 0, autoAlpha: 1, duration: 0.7, clearProps: 'transform' }, 0.3);
  }
}

/* ---- footer: letter rise, hairline draw, os-bar cells settle ---- */
function footer(): void {
  const letter = document.querySelector<HTMLElement>('.foot-letter');
  if (letter) {
    const lead = letter.querySelector<HTMLElement>('.foot-letter__lead');
    const link = letter.querySelector<HTMLElement>('.foot-link');
    const hr = letter.querySelector<HTMLElement>('.hair');
    const copy = letter.querySelector<HTMLElement>('.foot-letter__copy');

    const tl = gsap.timeline({
      defaults: { ease: EASE },
      scrollTrigger: { trigger: letter, start: 'top 84%', once: true },
    });
    if (lead) {
      gsap.set(lead, { y: 22, autoAlpha: 0 });
      tl.to(lead, { y: 0, autoAlpha: 1, duration: 0.9 }, 0);
    }
    if (hr) {
      gsap.set(hr, { scaleX: 0, transformOrigin: 'left center' });
      tl.to(hr, { scaleX: 1, duration: 1.1, ease: 'power3.inOut' }, 0.2);
    }
    if (link) {
      gsap.set(link, { autoAlpha: 0 });
      tl.to(link, { autoAlpha: 1, duration: 0.7 }, 0.25);
    }
    if (copy) {
      gsap.set(copy, { autoAlpha: 0 });
      tl.to(copy, { autoAlpha: 1, duration: 0.7 }, 0.5);
    }
  }

  const bar = document.querySelector<HTMLElement>('.os-bar');
  if (bar) {
    const cells = $all(':scope > *', bar);
    if (!cells.length) return;
    gsap.set(cells, { y: 10, autoAlpha: 0 });
    gsap.to(cells, {
      y: 0,
      autoAlpha: 1,
      duration: 0.7,
      stagger: 0.08,
      ease: EASE,
      scrollTrigger: { trigger: bar, start: 'top bottom', once: true },
    });
  }
}

function init(): void {
  if (!motionOK) return;
  gsap.registerPlugin(ScrollTrigger);

  heroParallax();
  manifesto();
  problem();
  solution();
  howItWorks();
  ladder();
  proof();
  cta();
  footer();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
