/**
 * The hero's scroll-out progress, on its own so that reading it costs nothing.
 *
 * This used to live in herofield.ts, and reveal.ts imported it from there. That
 * one static import pulled the entire WebGL2 field — herofield.ts plus
 * oceanfft.ts, about 20KB gzipped — into every visitor's bundle, including the
 * majority who get the WebGPU ocean and never mount the field at all. reveal.ts
 * always loads, so the fallback always loaded with it.
 *
 * Three lines in their own module instead. herofield.ts reads it when it is
 * actually the renderer in use; nothing else has to drag it along.
 */
let scrollP = 0;

/** Fed by reveal.ts from the same ScrollTrigger that scrubs the hero parallax. */
export function setHeroScroll(p: number): void {
  scrollP = Math.min(1, Math.max(0, p));
}

export function getHeroScroll(): number {
  return scrollP;
}
