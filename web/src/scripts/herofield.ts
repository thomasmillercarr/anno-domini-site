/**
 * Hero field — the procedural replacement for the hero photograph.
 *
 * The old hero was a 2675x1506 WebP stretched to 100vw. On anything wider than
 * its own pixel count (ultrawides, 4K, any 2x display) the browser upscaled it,
 * and since the artwork is made almost entirely of hair-thin filaments, that is
 * exactly the detail upscaling destroys. It read as soft and pixelated. There is
 * no encoding fix; the ceiling is the source resolution.
 *
 * So the artwork is generated instead, at the display's own resolution.
 *
 * ---- what this draws ----
 *
 * A faceted line field on a two-tone terminal palette. Angular, high contrast,
 * minimal tonal range: ASCII as a discipline rather than as literal glyphs.
 *
 *   1. A piecewise-LINEAR triangular-lattice noise warps the plane. The linear
 *      interpolation is the whole trick — smoothing the lattice is what makes
 *      contours curve, so leaving the barycentric weights alone gives a field
 *      that is planar inside every triangle, and iso-lines of a planar field are
 *      straight segments that kink only on lattice edges. Faceted contours, with
 *      a triangular substructure, for free and cheaper than the smooth version.
 *   2. Three line families read that warped plane: a dense dominant one running
 *      topographically, plus two lighter ones at 60 degrees to it, so the field
 *      weaves into triangles where they cross.
 *   3. Line width is fixed in SCREEN PIXELS via fwidth, which is what keeps it
 *      sharp at any DPR. Harmonics fade out past Nyquist rather than aliasing —
 *      the one place softness is load-bearing, since hard lines moire viciously.
 *   4. Light travels along the lines. Each line hashes its own brightness, width
 *      and pulse phase, and some run dashed, so the families are never uniform.
 *   5. Nodes are places the lines crowd toward. They are drawn, never lit, and
 *      they wander — there is no bloom anywhere in this shader.
 *
 * ---- one pass ----
 *
 * Bloom was the only reason this ever had five passes, two HDR ping-pong targets
 * and a float-extension branch. Without it, everything is a single fullscreen
 * quad again, and the tonemap and grain happen inline at the end. Accumulation
 * is still in linear light: doing it in gamma space is what makes bright areas
 * go chalky grey instead of hot, and that is a physical error, not a taste.
 *
 * ---- behaviour ----
 *
 *   - Runs off gsap.ticker, which scroll.ts already drives in lockstep with
 *     Lenis. One clock for the page — a second rAF loop is what makes canvas
 *     work feel detached from smooth scroll.
 *   - The pointer bends the field, and drags a short wake behind it. All input
 *     is lerped, never applied raw.
 *   - Reduced motion renders exactly one frame and never registers a ticker.
 *   - No WebGL2, or a lost context, falls back to the CSS gradient on .hero.
 *
 * The canvas never writes its own transform: reveal.ts scrubs yPercent on
 * .hero__slot for the scroll parallax and the two would fight.
 */

import { gsap } from 'gsap';
import { rafThrottle } from './pointer';

const VERT = `#version 300 es
void main() {
  // Fullscreen quad straight from the vertex index — no buffers, no attributes.
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) - 1.0;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uPointer;     // field coords, already smoothed on the JS side
uniform float uPointerAmt;  // 0 -> 1 as the cursor enters / leaves the hero
uniform vec2  uPointerVel;  // recent cursor velocity, for the wake
uniform float uWake;        // decaying wake strength

out vec4 fragColor;

/* Palette, LINEAR — the sRGB values in the comments are the authored colours,
   these are those raised to 2.2. Every mix below happens in linear light, so
   never paste sRGB values in here.

   Two tones and almost nothing between them. GROUND is a near-flat dark warm,
   PHOSPHOR is the single line colour: an amber sitting between --timber and
   --accent-warm, deliberately NOT the near-white of --on-img so the lines never
   compete with the headline sitting on top of them. */
const vec3 GROUND_L = vec3(0.0094, 0.0066, 0.0040); /* #1A1611 */
const vec3 LIFT_L   = vec3(0.0330, 0.0250, 0.0165); /* #302820, top of frame  */
const vec3 PHOS_L   = vec3(0.8126, 0.4884, 0.2120); /* #E8B87E, the line tone */

/* Convergence nodes: xy anchor, z = strength. The lines crowd and bend toward
   these; nothing glows. Each wanders on its own slow orbit so none of them sit
   in a fixed spot. The bottom-left stays deliberately empty: the headline is
   there. */
const int NODES = 6;
const vec3 NODE[6] = vec3[6](
  vec3(-0.72,  0.14, 0.70),
  vec3(-0.31,  0.05, 0.55),
  vec3( 0.06,  0.19, 0.60),
  vec3( 0.38,  0.02, 0.52),
  vec3( 0.66,  0.16, 0.85),
  vec3( 0.95, -0.03, 0.75)
);

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z) - 0.5;
}

/* Piecewise-LINEAR triangular-lattice noise.
 *
 * Skew into the simplex grid, pick the triangle, and blend the three corner
 * values by their barycentric weights WITHOUT smoothing them. That last part is
 * the entire point: the usual f*f*(3-2f) is what rounds contours off. Left
 * linear, the field is planar inside each triangle, so its iso-lines are
 * straight segments that only kink where they cross a lattice edge.
 *
 * Keep the octave count low and the base frequency coarse — every extra octave
 * subdivides the facets, and enough of them converge back on a smooth field.
 */
float ptri(vec2 p) {
  const float K1 = 0.366025404; // (sqrt(3) - 1) / 2
  const float K2 = 0.211324865; // (3 - sqrt(3)) / 6
  vec2 s = p + (p.x + p.y) * K1;
  vec2 i = floor(s);
  vec2 f = s - i;
  float m = step(f.y, f.x);          // 1 -> lower triangle
  vec2  o = vec2(m, 1.0 - m);
  float w1 = abs(f.x - f.y);
  float w2 = mix(f.x, f.y, m);
  float w0 = 1.0 - w1 - w2;
  // Corners are unskewed only to hash them; the affine skew preserves linearity.
  return w0 * hash21(i) + w1 * hash21(i + o) + w2 * hash21(i + 1.0);
}

float fbmTri(vec2 p, int oct) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < oct; i++) { s += a * ptri(p); p *= 2.07; a *= 0.5; }
  return s;
}

/* One line family harmonic, returning linear radiance.
 *
 * Half-width is fwidth(v) * px, i.e. fixed in screen pixels whatever the
 * resolution. Above Nyquist the harmonic fades rather than drawing, because a
 * period narrower than ~2px carries no detail, only moire — and hard-edged lines
 * moire far more viciously than soft ones, so this fade is doing more work here
 * than it was when the field was atmospheric.
 *
 * Each line hashes its own identity off floor(v), constant across the line's
 * whole period so it stays stable: brightness on a cubic tail, a width jitter, a
 * pulse phase, and for some of them a dash pattern. Uniform lines are what made
 * an earlier version read as a contour map.
 */
vec3 lineFam(float v, float basePx, float seed, float along, float dashOdds) {
  float g  = abs(fract(v) - 0.5);
  float aa = fwidth(v);
  float h  = hash11(floor(v) + seed);
  float px = basePx * (0.80 + 0.45 * fract(h * 17.0));
  // Hard profile: essentially a step, with only the ~1px the AA needs.
  float line = (1.0 - smoothstep(0.0, aa * px, g)) * (1.0 - smoothstep(0.22, 0.48, aa));
  if (line <= 0.0) return vec3(0.0);

  // Some lines run broken. Hard edges, no fade — this is the ASCII part.
  float dash = 1.0;
  if (fract(h * 91.0) < dashOdds) {
    dash = step(0.34, fract(along * 0.22 + h * 7.0));
  }

  float bright = 0.30 + 1.30 * h * h * h; // cubic tail: a few hot, most faint
  // Light running the length of the line, each with its own phase so the pulses
  // scatter instead of crossing the frame as one wall.
  float pulse = 0.55 + 2.10 * smoothstep(0.62, 0.98, sin(along + h * 39.0) * 0.5 + 0.5);
  return PHOS_L * (line * dash * bright * pulse);
}

/* Highlight-only shoulder. Identity below K, then a smooth C1 roll to 1.0.
   Deliberately NOT ACES: ACES desaturates and pulls midtones down, and the
   midtones here are what the type contrast is measured against. */
const float K = 0.55;
vec3 tone(vec3 x) {
  vec3 s = vec3(K) + (1.0 - K) * (1.0 - exp(-(x - K) / (1.0 - K)));
  return mix(x, s, step(vec3(K), x));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  /* Field coords: y in [-0.5, 0.5], x scaled by aspect. Resolution-independent,
     so the composition holds from a phone to an ultrawide. */
  vec2  p     = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float uvy   = gl_FragCoord.y / uRes.y;
  float halfW = 0.5 * uRes.x / uRes.y;
  float t     = uTime * 0.045;

  /* --- nodes: attraction only, no light ---
     Keep PULL small. A radial pull competing with the base slope closes an
     iso-line into a ring at the radius where the two cancel; at this strength
     that lands within a few pixels of the centre instead of drawing a tree knot
     around every node, which is what a larger value did. */
  const float PULL = 0.20;
  const float NODE_CULL = 0.30;
  vec2 pull = vec2(0.0);
  for (int i = 0; i < NODES; i++) {
    float fi = float(i);
    // Wandering, not orbiting: two incommensurate rates per axis so the path
    // never closes and no node sits still.
    vec2 c = NODE[i].xy + vec2(
      0.085 * sin(uTime * 0.061 + fi * 1.7) + 0.045 * sin(uTime * 0.023 + fi * 4.1),
      0.055 * cos(uTime * 0.048 + fi * 2.3) + 0.030 * cos(uTime * 0.019 + fi * 0.7)
    );
    vec2  d  = p - c;
    float r2 = dot(d, d);
    if (r2 > NODE_CULL) continue;
    pull -= (d / (sqrt(r2) + 0.03)) * exp(-r2 * 7.0) * NODE[i].z * PULL;
  }

  /* --- pointer: an inward bend plus a wake along its recent direction --- */
  vec2  pd   = p - uPointer;
  float pr2  = dot(pd, pd);
  float pAmt = exp(-pr2 * 7.0) * uPointerAmt;
  pull -= (pd / (sqrt(pr2) + 0.05)) * pAmt * 0.30;
  pull += uPointerVel * (exp(-pr2 * 12.0) * uWake) * 0.30;

  /* --- the warped plane ---
     Isotropic on purpose: the three families read the same point, and an
     anisotropic scale would collapse the two cross-families onto the dominant
     one. Three octaves, coarse — enough structure to weave, few enough that the
     facets survive.

     Warp amplitude stays well under the projection scale below. Comparable
     values pile the lines into a tangle — brutalist means ordered and severe,
     not chaotic, and the first attempt at this was a scribble. */
  vec2  base = p * 1.55;
  float n1 = fbmTri(base * 0.70 + vec2(t, 0.0), 3);
  float n2 = fbmTri(base * 1.45 + vec2(-t * 0.75, 3.1), 2);
  vec2  qq = base + vec2(n2 * 0.20, n1 * 0.52) + pull;

  /* --- three families, 60 degrees apart ---
     Same projection scale for all three, so the weave is a regular triangular
     lattice; the dominant family is separated by frequency and weight rather
     than by geometry, which keeps the topographic reading without turning the
     cross-hatch into graph paper. */
  const float S = 3.0;
  float fA = dot(qq, vec2( 0.000, 1.000)) * S;
  float fB = dot(qq, vec2( 0.866, 0.500)) * S;
  float fC = dot(qq, vec2(-0.866, 0.500)) * S;

  // Along-line coordinates: perpendicular to each family's normal.
  float aA = dot(qq, vec2( 1.000, 0.000)) * 2.6 - uTime * 0.34;
  float aB = dot(qq, vec2( 0.500, -0.866)) * 2.6 - uTime * 0.27;
  float aC = dot(qq, vec2( 0.500,  0.866)) * 2.6 - uTime * 0.22;

  /* Near layer: dense, bright, and the one carrying the topographic reading. */
  vec3 rad = lineFam(fA * 11.0,        1.05,  3.0, aA, 0.16) * 1.00
           + lineFam(fA * 22.0 + 0.37, 0.80,  7.0, aA, 0.24) * 0.40
           + lineFam(fB *  6.5,        0.95, 41.0, aB, 0.32) * 0.26
           + lineFam(fC *  6.5 + 0.53, 0.95, 59.0, aC, 0.32) * 0.26;

  /* Far layer: the same three families offset and slower, dimmer rather than
     hazier — with only two tones there is no colour left to fade them into, so
     depth has to come from brightness and density. */
  vec2  qf = qq * 1.62 + vec2(uTime * 0.010, 0.47);
  float gA = dot(qf, vec2( 0.000, 1.000)) * S;
  float gB = dot(qf, vec2( 0.866, 0.500)) * S;
  float bA = dot(qf, vec2( 1.000, 0.000)) * 2.6 - uTime * 0.18;
  float bB = dot(qf, vec2( 0.500, -0.866)) * 2.6 - uTime * 0.15;
  rad += (lineFam(gA * 13.0, 0.80, 83.0, bA, 0.26)
        + lineFam(gB *  8.0, 0.80, 89.0, bB, 0.34) * 0.50) * 0.17;

  /* --- landscape band: the mass sits in a wavy horizontal belt --- */
  float hz   = 0.58 + 0.09 * fbmTri(vec2(p.x * 1.3 + uTime * 0.011, 3.7), 2);
  float mass = smoothstep(hz + 0.30, hz - 0.08, uvy) * smoothstep(hz - 0.50, hz - 0.18, uvy);
  /* Haze the extremes so the field has no visible edge, measured against the
     actual half-width so an ultrawide fades at its own edges. */
  mass *= smoothstep(1.0, 0.60, abs(p.x) / halfW);
  mass = 0.22 + 0.78 * mass; // never fully empty: this is line-work, not fog

  /* --- contrast guard ---
     The headline, sub-label and CTA are light type over this, under .hero__veil.
     On a dark ground that is a much easier position than it was on bronze, so
     this is gentler than it needed to be before — but it is not gone. Do not
     weaken it without re-running the contrast probe. */
  float copyCol = 1.0 - smoothstep(-0.55, 0.50, p.x / halfW);
  float lowBand = 1.0 - smoothstep(0.02, 0.92, uvy);
  float guard   = 1.0 - 0.55 * copyCol * lowBand;

  /* --- assemble, in linear --- */
  vec3 col = mix(GROUND_L, LIFT_L, smoothstep(-0.05, 1.05, uvy));
  col += rad * mass * guard;

  col = tone(col);
  col = pow(max(col, 0.0), vec3(1.0 / 2.2)); // linear -> sRGB

  /* Grain, weighted into the shadows. It doubles as the dither this needs: a
     near-flat dark ground across a lot of pixels bands visibly without it, on
     exactly the large displays this whole thing exists to serve. */
  float g = hash12(gl_FragCoord.xy + uTime * 137.0);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col += (g - 0.5) * 0.016 * mix(1.0, 0.25, lum);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const canvas = document.querySelector<HTMLCanvasElement>('canvas.hero__slot');
const hero = document.querySelector<HTMLElement>('.hero');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('[herofield]', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function init(): void {
  if (!canvas || !hero) return;

  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false, // the shader filters its own edges; MSAA would only cost fill rate
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
    // The reduced-motion path draws one frame and stops. Without this the
    // drawing buffer is cleared after it is composited, so anything that makes
    // the compositor re-raster the layer leaves a blank hero with nothing
    // scheduled to repaint it. The per-composite copy it costs is irrelevant
    // for a still image, and the animated path redraws every frame anyway.
    preserveDrawingBuffer: reduceMotion,
  });
  if (!gl) return; // CSS gradient on .hero carries it

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;

  const prog = gl.createProgram();
  if (!prog) return;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[herofield]', gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);
  // Some drivers refuse a draw with no VAO bound, even with zero attributes.
  gl.bindVertexArray(gl.createVertexArray());

  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uTime = gl.getUniformLocation(prog, 'uTime');
  const uPointer = gl.getUniformLocation(prog, 'uPointer');
  const uPointerAmt = gl.getUniformLocation(prog, 'uPointerAmt');
  const uPointerVel = gl.getUniformLocation(prog, 'uPointerVel');
  const uWake = gl.getUniformLocation(prog, 'uWake');

  /* ---- resolution ladder ----
     Two governors. A pixel budget caps total work; DPR alone is the wrong
     control at the top end, where a 5K panel at 2x asks for ~25M pixels a frame.
     Hard-edged line-work shows resolution loss far more readily than soft
     gradients did, so this cap is set high — with bloom gone there are four
     fewer passes to pay for, and the budget exists as a guard rail rather than
     as the thing that normally binds.
     ponytail: fixed steps, not a real adaptive controller. Ceiling: it only ever
     steps down, never recovers if the machine frees up. A rolling window that
     also steps back up is the upgrade if that ever shows. */
  /* Measured with a GPU timer query, not guessed: this shader costs ~3.07ms per
     megapixel on the machine it was built on, so 5.0e6 is the largest buffer
     that still fits inside a 16.7ms frame with headroom. It binds only at the
     top end — a 1x desktop never reaches it, a phone at 3x still gets the full
     2x cap, and a 3440-wide ultrawide lands at ~0.90 rather than having the
     ladder react its way down. */
  const MAX_PIXELS = 5.0e6;
  const dpr = window.devicePixelRatio || 1;
  const STEPS = [...new Set([2, 1.5, 1, 0.75].map((s) => Math.min(dpr, s)))];
  let step = 0;

  function currentScale(): number {
    const cssW = canvas!.clientWidth || 1;
    const cssH = canvas!.clientHeight || 1;
    return Math.min(STEPS[step], Math.sqrt(MAX_PIXELS / (cssW * cssH)));
  }

  function resize(): void {
    const s = currentScale();
    const w = Math.max(1, Math.round(canvas!.clientWidth * s));
    const h = Math.max(1, Math.round(canvas!.clientHeight * s));
    if (canvas!.width === w && canvas!.height === h) return;
    canvas!.width = w;
    canvas!.height = h;
    gl!.viewport(0, 0, w, h);
  }

  /* ---- pointer, spring-damped, with velocity for the wake ---- */
  const target = { x: 0, y: 0, amt: 0, vx: 0, vy: 0, wake: 0 };
  const eased = { x: 0, y: 0, amt: 0, vx: 0, vy: 0, wake: 0 };

  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && !reduceMotion) {
    let lastX = 0, lastY = 0, lastT = 0;
    const onMove = rafThrottle((e: PointerEvent) => {
      const r = hero!.getBoundingClientRect();
      // Same normalisation the shader uses: y up, scaled by height.
      const x = (e.clientX - r.left - r.width / 2) / r.height;
      const y = (r.height / 2 - (e.clientY - r.top)) / r.height;
      const now = performance.now();
      const dt = Math.min(120, now - lastT) || 16;
      if (lastT) {
        // Velocity in field units per second, clamped so a flick off-screen
        // cannot fling the field.
        target.vx = Math.max(-3, Math.min(3, ((x - lastX) / dt) * 1000));
        target.vy = Math.max(-3, Math.min(3, ((y - lastY) / dt) * 1000));
        target.wake = Math.min(1, Math.hypot(target.vx, target.vy) * 0.55);
      }
      lastX = x; lastY = y; lastT = now;
      target.x = x;
      target.y = y;
      target.amt = 1;
    });
    hero.addEventListener('pointermove', onMove as EventListener, { passive: true });
    hero.addEventListener('pointerleave', () => { target.amt = 0; target.wake = 0; });
  }

  let time = 0;

  function draw(dt: number): void {
    resize();
    // Lerp rather than snap — the same trailing feel as the magnetic buttons.
    const k = Math.min(1, dt * 0.006);
    eased.x += (target.x - eased.x) * k;
    eased.y += (target.y - eased.y) * k;
    eased.amt += (target.amt - eased.amt) * Math.min(1, dt * 0.004);
    eased.vx += (target.vx - eased.vx) * Math.min(1, dt * 0.012);
    eased.vy += (target.vy - eased.vy) * Math.min(1, dt * 0.012);
    eased.wake += (target.wake - eased.wake) * Math.min(1, dt * 0.010);
    // The wake decays on its own, so a cursor that stops leaves a trail that
    // settles rather than a displacement that sticks.
    const decay = Math.pow(0.9955, dt);
    target.wake *= decay;
    target.vx *= decay;
    target.vy *= decay;

    gl!.uniform2f(uRes, canvas!.width, canvas!.height);
    gl!.uniform1f(uTime, time);
    gl!.uniform2f(uPointer, eased.x, eased.y);
    gl!.uniform1f(uPointerAmt, eased.amt);
    gl!.uniform2f(uPointerVel, eased.vx, eased.vy);
    gl!.uniform1f(uWake, eased.wake);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
  }

  /* ---- static path: one frame, no ticker, no clock ---- */
  if (reduceMotion) {
    draw(0);
    canvas.classList.add('is-live');
    // Observe the element, not the window: the canvas is 124%-height inside a
    // 100vh hero, so it changes size for reasons a resize event never reports.
    new ResizeObserver(() => draw(0)).observe(canvas);
    return;
  }

  /* ---- animated path ---- */
  let slow = 0;
  let warm = 0;

  const tick = (_t: number, dt: number): void => {
    time += dt / 1000;
    draw(dt);
    /* Ignore the first ~1.5s. The page is still parsing GSAP, laying out fonts
       and running the entrance while this starts, so there is a burst of late
       frames that has nothing to do with the shader — and the ladder only ever
       steps down, so one burst at load permanently degrades the render. This
       measures the steady state or it measures nothing. */
    if (++warm < 90) return;
    /* Step down only on frames that are genuinely late, and only within a
       plausible range.
       Lower bound: a healthy 60fps frame is 16.7ms, so the threshold has to sit
       clear above that — testing against anything at or under 16.7 marks every
       normal frame slow and walks the resolution straight to the floor, which is
       the blur this replaced. 24ms is roughly 42fps.
       Upper bound: a 300ms+ frame is not a struggling GPU, it is a window that
       was not being presented. Chrome throttles occluded windows to ~1fps
       without ever setting document.hidden, so without this the ladder quietly
       degrades the render while nobody is even looking at it, and the visitor
       comes back to a permanently softer hero. */
    if (dt > 24 && dt < 300 && step < STEPS.length - 1) {
      if (++slow > 30) {
        step++;
        canvas.width = 0; // force resize() to rebuild the buffer
        slow = 0;
      }
    } else if (slow > 0) {
      slow--;
    }
  };

  let running = false;
  function run(on: boolean): void {
    if (on === running) return;
    running = on;
    if (on) gsap.ticker.add(tick);
    else gsap.ticker.remove(tick);
  }

  // No GPU work for a hero nobody is looking at.
  new IntersectionObserver(([e]) => run(e.isIntersecting && !document.hidden)).observe(hero);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) run(false);
  });

  /* ponytail: a lost context drops to the CSS gradient rather than rebuilding.
     Driver resets are rare and the fallback is a real design, not a blank box.
     Upgrade path: keep the shader sources around and re-run init() on
     webglcontextrestored. */
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    run(false);
    canvas.classList.remove('is-live');
  });

  draw(0);
  canvas.classList.add('is-live');
  run(true);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
