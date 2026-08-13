/**
 * Hero field — the procedural replacement for the hero photograph.
 *
 * The old hero was a 2675x1506 WebP stretched to 100vw. On anything wider than
 * its own pixel count (ultrawides, 4K, any 2x display) the browser upscaled it,
 * and since the artwork is made almost entirely of hair-thin filaments, that is
 * exactly the detail upscaling destroys. It read as soft and pixelated. There is
 * no encoding fix; the ceiling is the source resolution.
 *
 * So the artwork is generated instead: one fullscreen quad, one fragment shader,
 * rendered at the display's own resolution. Crisp at any size, permanently, and
 * 371KB lighter.
 *
 * Structure of the shader, in order:
 *   1. fbm noise, domain-warped — the flowing, silk-like field.
 *   2. Convergence nodes bend that field inward and add a warm bloom.
 *   3. Iso-lines of the field are drawn as filaments at a width fixed in *screen
 *      pixels* (via fwidth), which is what keeps strands 1px at every DPR.
 *   4. A wavy horizontal mask confines the mass to a landscape band.
 *   5. Palette mirrors the light-theme tokens in os-site.css.
 *
 * Behaviour:
 *   - Runs off gsap.ticker, which scroll.ts already drives in lockstep with
 *     Lenis. One clock for the page — a second rAF loop is what makes canvas
 *     work feel detached from smooth scroll.
 *   - The pointer bends the field toward itself and lifts nearby nodes. Input is
 *     lerped, never applied raw, so it trails like the magnetic buttons.
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

out vec4 fragColor;

/* Palette — mirrors the light-theme tokens in os-site.css. The hero art is
   theme-invariant, exactly as the photograph was: --on-img is not redeclared
   for dark mode either, so light type sits on this in both themes. */
const vec3 SAND   = vec3(0.847, 0.804, 0.729); /* --sand   #D8CDBA */
const vec3 TIMBER = vec3(0.788, 0.635, 0.478); /* --timber #C9A27A */
const vec3 GLINT  = vec3(1.000, 0.976, 0.929); /* strand highlight, warm white */

/* The three vertical anchors. These are not free choices: they are sampled from
   the photograph this replaces (top / mid / bottom strips of the displayed crop,
   rgb(229,215,199) / rgb(171,143,116) / rgb(144,130,117)), set a little below
   those means so the strands and blooms lift the result back onto them. The
   light type over this hero has no other backdrop, so drifting pale here is a
   contrast regression, not a style choice. */
const vec3 SKY  = vec3(0.884, 0.828, 0.764); /* top haze */
const vec3 CORE = vec3(0.596, 0.487, 0.383); /* the golden mass */
const vec3 FOG  = vec3(0.498, 0.449, 0.402); /* the warm fog the copy sits on */

/* Convergence nodes: xy in field coords, z = strength. Hand-placed to echo the
   original artwork — a bright anchor right of centre, a mid-left cluster, and
   weaker satellites. The bottom-left stays deliberately empty: the headline
   sits there. */
const int NODES = 7;
const vec3 NODE[7] = vec3[7](
  vec3(-0.90,  0.13, 0.42),
  vec3(-0.61,  0.05, 0.82),
  vec3(-0.29,  0.17, 0.52),
  vec3( 0.03,  0.02, 0.58),
  vec3( 0.27,  0.20, 0.48),
  vec3( 0.56,  0.11, 0.92),
  vec3( 0.87, -0.05, 1.00)
);

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453) * 2.0 - 1.0;
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                 dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
             mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                 dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}

/* One filament harmonic. The line's half-width is fwidth(v) * px, i.e. fixed in
   screen pixels whatever the resolution — this is the whole reason the strands
   stay sharp where the raster went soft. Above Nyquist the harmonic is faded
   out rather than drawn, because a period narrower than ~2px carries no detail,
   only moire. */
float strand(float v, float px) {
  float g  = abs(fract(v) - 0.5);
  float aa = fwidth(v);
  float line = 1.0 - smoothstep(0.0, aa * px, g);
  return line * (1.0 - smoothstep(0.22, 0.48, aa));
}

void main() {
  /* Field coords: y in [-0.5, 0.5], x scaled by aspect. Resolution-independent,
     so the composition holds from a phone to an ultrawide. */
  vec2  p    = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float uvy  = gl_FragCoord.y / uRes.y;
  float halfW = 0.5 * uRes.x / uRes.y;
  float t    = uTime * 0.05;

  /* --- nodes ---
     The pull is radial (d/r, not d), which is what turns the filaments into a
     burst: iso-lines near the node solve to sin(theta) = const, i.e. rays. A
     plain d * falloff would only pinch the field, not fan it out. */
  vec2  pull = vec2(0.0);
  float glow = 0.0;
  float lift = 0.0;
  for (int i = 0; i < NODES; i++) {
    float fi = float(i);
    vec2  c  = NODE[i].xy + 0.022 * vec2(sin(uTime * 0.11 + fi), cos(uTime * 0.09 + fi * 1.7));
    float s  = NODE[i].z;
    vec2  d  = p - c;
    float r2 = dot(d, d);
    pull -= (d / (sqrt(r2) + 0.03)) * exp(-r2 * 7.0) * s * 0.80;
    glow += s * (exp(-r2 * 900.0) * 0.80 + exp(-r2 * 130.0) * 0.07);
    lift += s * exp(-r2 * 22.0);
  }

  /* --- pointer: a gentle inward bend plus a lift on whatever it is near --- */
  vec2  pd   = p - uPointer;
  float pr2  = dot(pd, pd);
  float pAmt = exp(-pr2 * 7.0) * uPointerAmt;
  pull -= (pd / (sqrt(pr2) + 0.05)) * pAmt * 0.14;
  lift += pAmt * 0.55;

  /* --- flow ---
     Strands are iso-lines of the *warped y coordinate*, not of the noise. Iso-
     lines of isotropic fbm are closed loops and read as a contour map; iso-lines
     of a warped coordinate all run the same way and read as combed silk, which
     is the structure this is imitating. For the same reason the undulation is
     mostly in y: displacing x as hard as y brings the whorls straight back. */
  vec2  q  = vec2(p.x * 0.85, p.y * 3.0);
  float u1 = fbm(vec2(q.x * 0.55, q.y * 0.30) + vec2(t, 0.0));
  float u2 = fbm(vec2(q.x * 1.30, q.y * 0.55) + vec2(-t * 0.8, 3.1));
  q.y += 2.40 * u1 + 0.85 * u2;
  q.x += 0.25 * u2;
  q += pull;
  float field = q.y;

  /* --- filaments: three harmonics, coarse to fine --- */
  float strands = strand(field * 17.0 - 0.21, 1.2) * 0.55
                + strand(field * 34.0,        0.95)
                + strand(field * 68.0 + 0.37, 0.85) * 0.70;
  strands = clamp(strands, 0.0, 1.6);
  /* Strands brighten where they converge, rather than the node being a blob. */
  strands *= 1.0 + lift * 0.9;

  /* Glints strung along the strands — the source artwork is speckled with them
     and without it the field reads as woven fabric rather than light. */
  float sp = fract(sin(dot(floor(p * 620.0), vec2(12.9898, 78.233))) * 43758.5453);
  float sparkle = smoothstep(0.9965, 1.0, sp) * strands;

  /* --- landscape band: the mass sits in a wavy horizontal belt --- */
  float hz   = 0.58 + 0.09 * fbm(vec2(p.x * 1.4 + uTime * 0.012, 3.7));
  float mass = smoothstep(hz + 0.26, hz - 0.06, uvy) * smoothstep(hz - 0.44, hz - 0.16, uvy);
  /* Haze the left and right extremes so the field has no visible edge. Measured
     against the actual half-width, so an ultrawide fades at its own edges rather
     than going blank two thirds of the way out. */
  mass *= smoothstep(1.0, 0.62, abs(p.x) / halfW);

  /* --- contrast guard ---
     The headline, sub-label and CTA are light type in the bottom-left, sitting
     under .hero__veil, which can only darken a backdrop it can predict. So the
     lower-left carries a fog bank (the source photograph had one for exactly the
     same reason) and added light is damped inside it. Do not weaken either
     without re-running test-contrast.mjs. */
  float fogL  = (1.0 - smoothstep(-0.05, 1.15, uvy)) * (1.0 - smoothstep(-0.60, 0.55, p.x / halfW));
  float guard = mix(0.30, 1.0, smoothstep(0.04, 0.50, uvy)) * (1.0 - fogL * 0.78);

  /* --- assemble --- */
  vec3 col = mix(FOG, CORE, smoothstep(0.02, 0.50, uvy));
  col = mix(col, SKY, smoothstep(0.52, 0.96, uvy));
  col = mix(col, mix(SAND, TIMBER, 0.62), mass * 0.34 * guard);
  col = mix(col, GLINT, clamp(strands * mass * 0.30, 0.0, 1.0) * guard);
  col += GLINT * strands * mass * 0.10 * guard;
  col += GLINT * sparkle * mass * 0.85 * guard;
  col += TIMBER * 1.10 * glow * mass * guard;
  col += GLINT * pow(glow, 2.0) * 0.45 * guard;
  col = mix(col, FOG, fogL * 0.55);

  /* Ordered-ish dither. These are very shallow gradients across a lot of pixels;
     without this they band visibly on exactly the large displays this change
     exists to serve. */
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (dither - 0.5) / 255.0;

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

  /* ---- resolution ladder ----
     Render at the display's own pixels, capped at 2x — beyond that the extra
     samples are invisible on soft-edged art and only cost fill rate. Caps above
     the display's own DPR are dropped, so a 1x screen does not burn three
     step-downs going from 1 to 1 to 1 before anything actually changes.
     ponytail: a fixed step-down ladder, not a proper adaptive resolution
     controller. Ceiling: it only ever steps down, never recovers if the machine
     frees up. Revisit if that proves noticeable; a rolling window that also
     steps back up is the upgrade. */
  const dpr = window.devicePixelRatio || 1;
  const STEPS = [...new Set([2, 1.5, 1, 0.75].map((s) => Math.min(dpr, s)))];
  let step = 0;
  let scale = STEPS[step];

  function resize(): void {
    const w = Math.max(1, Math.round(canvas!.clientWidth * scale));
    const h = Math.max(1, Math.round(canvas!.clientHeight * scale));
    if (canvas!.width === w && canvas!.height === h) return;
    canvas!.width = w;
    canvas!.height = h;
    gl!.viewport(0, 0, w, h);
  }

  /* ---- pointer, spring-damped ---- */
  const target = { x: 0, y: 0, amt: 0 };
  const eased = { x: 0, y: 0, amt: 0 };

  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && !reduceMotion) {
    const onMove = rafThrottle((e: PointerEvent) => {
      const r = hero!.getBoundingClientRect();
      // Same normalisation the shader uses: y up, scaled by height.
      target.x = (e.clientX - r.left - r.width / 2) / r.height;
      target.y = (r.height / 2 - (e.clientY - r.top)) / r.height;
      target.amt = 1;
    });
    hero.addEventListener('pointermove', onMove as EventListener, { passive: true });
    hero.addEventListener('pointerleave', () => { target.amt = 0; });
  }

  let time = 0;

  function draw(dt: number): void {
    resize();
    // Lerp rather than snap — the same trailing feel as the magnetic buttons.
    const k = Math.min(1, dt * 0.006);
    eased.x += (target.x - eased.x) * k;
    eased.y += (target.y - eased.y) * k;
    eased.amt += (target.amt - eased.amt) * Math.min(1, dt * 0.004);

    gl!.uniform2f(uRes, canvas!.width, canvas!.height);
    gl!.uniform1f(uTime, time);
    gl!.uniform2f(uPointer, eased.x, eased.y);
    gl!.uniform1f(uPointerAmt, eased.amt);
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

  const tick = (_t: number, dt: number): void => {
    time += dt / 1000;
    draw(dt);
    /* Step down only on frames that are genuinely late. A healthy 60fps frame is
       16.7ms, so the threshold has to sit clear above that — testing against
       anything at or under 16.7 marks every normal frame slow and walks the
       resolution straight to the floor, which is the blur this replaced. 24ms is
       roughly 42fps. */
    if (dt > 24 && step < STEPS.length - 1) {
      if (++slow > 30) {
        step++;
        scale = STEPS[step];
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
