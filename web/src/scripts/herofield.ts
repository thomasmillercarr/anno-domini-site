/**
 * Hero field — the procedural replacement for the hero photograph.
 *
 * The old hero was a 2675x1506 WebP stretched to 100vw. On anything wider than
 * its own pixel count (ultrawides, 4K, any 2x display) the browser upscaled it,
 * and since the artwork is made almost entirely of hair-thin filaments, that is
 * exactly the detail upscaling destroys. It read as soft and pixelated. There is
 * no encoding fix; the ceiling is the source resolution.
 *
 * So the artwork is generated instead, at the display's own resolution. Crisp at
 * any size, permanently, and 371KB lighter.
 *
 * ---- the pipeline ----
 *
 * Five passes, three programs. A single pass cannot express bloom, and light
 * that does not bleed into its surroundings does not read as light.
 *
 *   A  field    -> sceneTex        everything below, in LINEAR HDR. Cores go
 *                                  past 1.0. Alpha carries the contrast guard.
 *   B  bright+H -> bloom¼          soft-knee threshold, downsample, blur x
 *   C  blur V   -> bloom¼
 *   D  both     -> bloom⅛          second octave: the wide soft halo
 *   E  composite-> screen          scene + bloom*guard, tonemap, grain, sRGB
 *
 * Everything accumulates in LINEAR light. Doing it in gamma space is what makes
 * bright areas go chalky grey instead of hot, and it is a physical error rather
 * than a matter of taste. The tonemap is a highlight-only shoulder, deliberately
 * not ACES: ACES pulls down midtones, and the midtones here are load-bearing for
 * type contrast (see the guard notes below).
 *
 * ---- the field itself ----
 *
 *   1. fbm noise, domain-warped once — the flowing, silk-like structure.
 *   2. Convergence nodes bend that field radially inward and add a warm bloom.
 *   3. Filaments are iso-lines of the warped *coordinate*, drawn at a width
 *      fixed in screen pixels (via fwidth), which is what keeps them sharp at
 *      every DPR. Each strand hashes its own brightness, width and temperature
 *      off its id — uniform strands are what made this read as a contour map.
 *   4. Three depth layers share that one warp, separated by scale, drift and
 *      aerial perspective. Sharing the warp is what keeps it affordable.
 *   5. Energy travels along the strands into the nodes, scattered by a
 *      per-strand phase so it is never a marching wall.
 *
 * ---- behaviour ----
 *
 *   - Runs off gsap.ticker, which scroll.ts already drives in lockstep with
 *     Lenis. One clock for the page — a second rAF loop is what makes canvas
 *     work feel detached from smooth scroll.
 *   - The pointer bends the field, lifts nearby nodes, and drags a short wake
 *     behind it. All input is lerped, never applied raw.
 *   - Reduced motion renders exactly one frame and never registers a ticker.
 *   - No WebGL2, or a lost context, falls back to the CSS gradient on .hero.
 *
 * The canvas never writes its own transform: reveal.ts scrubs yPercent on
 * .hero__slot for the scroll parallax and the two would fight.
 */

import { gsap } from 'gsap';
import { rafThrottle } from './pointer';

/* Bloom threshold, in linear light. Safe at 0.85 because the background ramp
   tops out at SKY (0.762 linear) — only emitted light, never the sky itself,
   crosses this line. If the palette is ever brightened past that, this number
   has to move with it or the whole upper frame starts glowing. */
const BLOOM_THRESHOLD = 0.85;

const VERT = `#version 300 es
void main() {
  // Fullscreen quad straight from the vertex index — no buffers, no attributes.
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) - 1.0;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

/* ============================================================
   PASS A — the field
   ============================================================ */
const FIELD_FRAG = `#version 300 es
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uPointer;     // field coords, already smoothed on the JS side
uniform float uPointerAmt;  // 0 -> 1 as the cursor enters / leaves the hero
uniform vec2  uPointerVel;  // recent cursor velocity, for the wake
uniform float uWake;        // decaying wake strength
uniform float uRange;       // >1 packs HDR into RGBA8 where floats are missing

out vec4 fragColor;

/* Palette, LINEAR. The sRGB values in the comments are the authored colours;
   these are those raised to 2.2, because every mix and every accumulation below
   happens in linear light. Do not paste sRGB values in here. */
const vec3 SAND_L   = vec3(0.694, 0.619, 0.499); /* --sand   #D8CDBA */
const vec3 TIMBER_L = vec3(0.592, 0.368, 0.197); /* --timber #C9A27A */

/* The three vertical anchors. These are not free choices: they are sampled from
   the photograph this replaces (top / mid / bottom strips of the displayed crop,
   rgb(229,215,199) / rgb(171,143,116) / rgb(144,130,117)), set below those means
   so the strands and blooms lift the result back onto them. CORE and FOG in
   particular are set by measurement, not by eye: the last 8% came off them to
   hold the headline contrast floor once the layered strands started putting more
   light into the copy zone. The
   light type over this hero has no other backdrop, so drifting pale here is a
   contrast regression, not a style choice. All well under the tonemap shoulder,
   so they survive it unchanged. */
const vec3 SKY_L  = vec3(0.762, 0.660, 0.553); /* top haze     #E1D3C3 */
const vec3 CORE_L = vec3(0.294, 0.189, 0.111); /* golden mass  #987C62 */
const vec3 FOG_L  = vec3(0.205, 0.163, 0.128); /* the fog the copy sits on */

/* Strand tints. The spread between them is small on purpose — it is there to
   stop the field reading as one flat bronze wash, not to introduce a hue. */
const vec3 WARM_L = vec3(1.000, 0.900, 0.723); /* #FFF3DC */
const vec3 COOL_L = vec3(0.891, 0.867, 0.859); /* #F2EFEE */

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

/* Sin-free hashes. The textbook fract(sin(x) * 43758.5) costs a transcendental,
   and this shader wants ~58 hashes per pixel (15 noise lookups at two each, plus
   three per strand harmonic and one per ray). On a 4.2 megapixel ultrawide that
   was the difference between holding 60fps at full resolution and the ladder
   dropping to 0.75 — i.e. between sharp strands and the softening this whole
   thing exists to remove. These are the Hoskins integer-free variants. */
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

vec2 hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                 dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
             mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                 dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
}

/* Octave count is a parameter because fbm is the whole per-pixel budget: each
   octave is four hashes, and this shader calls fbm three times. The horizon line
   is a slow horizontal wave that cannot show more than two octaves, so paying
   five for it was buying nothing at 4.2 megapixels a frame. */
float fbm(vec2 p, int oct) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < oct; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}

/* One filament harmonic, returning linear radiance.
 *
 * The line's half-width is fwidth(v) * px, i.e. fixed in screen pixels whatever
 * the resolution — this is the whole reason the strands stay sharp where the
 * raster went soft. Above Nyquist the harmonic fades out rather than drawing,
 * because a period narrower than ~2px carries no detail, only moire.
 *
 * Every strand then hashes its own identity off floor(v), which is constant
 * across a strand's whole period so it stays stable: brightness on a heavy tail
 * (a few hot threads, most faint), a width jitter, a colour temperature, and a
 * phase for the energy travelling along it. Identical strands are exactly what
 * made the first version read as a topographic map.
 */
vec3 harmonic(float v, float basePx, float seed, float along) {
  float g  = abs(fract(v) - 0.5);
  float aa = fwidth(v);
  // One hash, three decorrelated values off it. Three separate hash calls here
  // cost more than the rest of the harmonic put together, and nothing about
  // these needs to be independently random — only different.
  float h  = hash11(floor(v) + seed);
  float h2 = fract(h * 17.0);
  float px = basePx * (0.78 + 0.50 * h2);
  float line = (1.0 - smoothstep(0.0, aa * px, g)) * (1.0 - smoothstep(0.22, 0.48, aa));
  if (line <= 0.0) return vec3(0.0);

  float h3 = fract(h * 313.0);
  float bright = 0.24 + 1.45 * h * h * h; // cubic tail: a few hot, most faint
  // Energy running the length of the strand, each with its own phase offset so
  // the pulses scatter instead of crossing the frame as one wall.
  float pulse = 0.62 + 1.75 * smoothstep(0.60, 1.0, sin(along + h * 39.0) * 0.5 + 0.5);
  return mix(WARM_L, COOL_L, h3) * (line * bright * pulse);
}

/* Aerial perspective: distance scatters light toward the fog and flattens
   contrast. This, not the parallax offset, is what actually reads as depth. */
vec3 aerial(vec3 rad, float amt) {
  float l = dot(rad, vec3(0.2126, 0.7152, 0.0722));
  return mix(rad, FOG_L * l * 3.0, amt);
}

void main() {
  /* Field coords: y in [-0.5, 0.5], x scaled by aspect. Resolution-independent,
     so the composition holds from a phone to an ultrawide. */
  vec2  p     = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float uvy   = gl_FragCoord.y / uRes.y;
  float halfW = 0.5 * uRes.x / uRes.y;
  float t     = uTime * 0.05;

  /* --- nodes ---
     The burst is drawn as its own set of strands in ANGLE space, not squeezed
     out of the flow field. That is not a stylistic choice: a scalar field whose
     iso-lines radiate from a point must have a critical point there, and a
     critical point is either an extremum (closed contour) or a saddle. Bending
     the flow radially therefore always produces a ring at the radius where the
     bend cancels the base slope — it showed up as a tree knot around every node,
     and pushing it outward only made it a bigger tree knot.
     Angle-space strands have no such constraint. They stay continuous across the
     atan seam because the ray count (26) is an integer, so the wrap shifts the
     value by exactly 26 and fract() does not notice.
     The flow still bends toward each node, but only enough to read as attraction
     (PULL 0.20 puts the unavoidable ring ~26px out, inside the bright core). */
  const float PULL = 0.20;
  const float RAYS = 26.0 / 6.28318530718;
  vec2  pull = vec2(0.0);
  float glow = 0.0;
  float lift = 0.0;
  float flare = 0.0;
  float rays = 0.0;
  /* Pixels farther than this from a node get nothing from it worth a transcendental.
     Without the cull every pixel paid seven nodes' worth of exp() and atan(), and
     on an ultrawide most pixels are far from most nodes. */
  const float NODE_CULL = 0.36;
  for (int i = 0; i < NODES; i++) {
    float fi = float(i);
    vec2  c  = NODE[i].xy + 0.022 * vec2(sin(uTime * 0.11 + fi), cos(uTime * 0.09 + fi * 1.7));
    vec2  d  = p - c;
    float r2 = dot(d, d);
    // The anamorphic streak reaches much further than the radial terms, so it is
    // the one thing computed outside the cull.
    float s  = NODE[i].z * (0.82 + 0.18 * sin(uTime * 0.23 + fi * 2.399));
    flare += s * exp(-abs(d.y) * 150.0 - abs(d.x) * 7.0);
    if (r2 > NODE_CULL) continue;

    float r = sqrt(r2);
    pull -= (d / (r + 0.03)) * exp(-r2 * 7.0) * s * PULL;
    glow += s * (exp(-r2 * 900.0) * 0.80 + exp(-r2 * 130.0) * 0.07);
    lift += s * exp(-r2 * 22.0);

    /* Radial filaments. The width is derived analytically rather than with
       fwidth: the angle's screen-space derivative is RAYS/(r * uRes.y) by
       construction, and computing it that way means no derivative is taken
       inside the cull branch — fwidth under non-uniform control flow is
       undefined. It also conveniently blows up at the centre, where the Nyquist
       fade then erases the rays and leaves the bright core. */
    float ra  = atan(d.y, d.x) * RAYS + fi * 2.7;
    float raa = RAYS * 6.28318530718 / max(r * uRes.y, 1.0);
    float rl  = (1.0 - smoothstep(0.0, raa * 1.15, abs(fract(ra) - 0.5)))
              * (1.0 - smoothstep(0.20, 0.45, raa));
    // Per-ray identity, same idea as the flow strands: without it 26 evenly
    // bright rays of equal length read as a clip-art star rather than filament.
    float rh = hash11(floor(ra) * 1.7 + fi * 13.0);
    rays += rl * exp(-r * (7.0 + 13.0 * rh)) * s * (0.30 + 1.60 * rh * rh);
  }

  /* --- pointer: an inward bend, a lift on what it is near, and a wake --- */
  vec2  pd   = p - uPointer;
  float pr2  = dot(pd, pd);
  float pAmt = exp(-pr2 * 7.0) * uPointerAmt;
  pull -= (pd / (sqrt(pr2) + 0.05)) * pAmt * 0.30;
  lift += pAmt * 0.55;

  /* --- flow ---
     Strands are iso-lines of the *warped y coordinate*, not of the noise. Iso-
     lines of isotropic fbm are closed loops and read as a contour map; iso-lines
     of a warped coordinate all run the same way and read as combed silk, which
     is the structure this is imitating. For the same reason the undulation is
     mostly in y: displacing x as hard as y brings the whorls straight back.

     This warp is evaluated ONCE and all three depth layers are derived from it.
     Evaluating it per layer would triple the fbm cost, which is nearly the whole
     per-pixel budget; deriving costs only the extra harmonics, which are cheap.

     The y slope has to stay well above the warp amplitude. They were comparable
     at first, which puts extrema all through the field, and an extremum in a
     coordinate whose iso-lines you are drawing is a closed contour — the result
     read as wood grain. A slope of 7.0 against a warp of ~±1.5 keeps the field
     near-monotonic in y, so the lines undulate instead of looping. */
  vec2  q  = vec2(p.x * 0.85, p.y * 7.0);
  float u1 = fbm(vec2(q.x * 0.55, q.y * 0.13) + vec2(t, 0.0), 4);
  float u2 = fbm(vec2(q.x * 1.30, q.y * 0.24) + vec2(-t * 0.8, 3.1), 4);
  q.y += 3.30 * u1 + 1.15 * u2;
  q.x += 0.12 * u2;
  q += pull;
  // The cursor drags the field along its recent direction, decaying over ~600ms.
  q += uPointerVel * (exp(-pr2 * 12.0) * uWake) * 0.30;

  /* --- three depth layers ---
     Separated by frequency, drift speed and parallax, then pushed apart by
     aerial perspective. Near is crisp and moves most; far is hazy and slow. */
  vec2 par = uPointer * uPointerAmt;

  vec2  qn = q + vec2(par.x * 0.090 + uTime * 0.040, par.y * 0.090);
  float fn = qn.y;
  float an = qn.x * 1.70 - uTime * 0.33;
  vec3  radN = harmonic(fn * 16.0 - 0.21, 1.05, 3.0, an) * 0.50
             + harmonic(fn * 32.0,        0.90, 7.0, an)
             + harmonic(fn * 64.0 + 0.37, 0.80, 13.0, an) * 0.75;

  vec2  qm = q + vec2(par.x * 0.048 + uTime * 0.024, par.y * 0.048 + 0.31);
  float fm = qm.y;
  float am = qm.x * 2.30 - uTime * 0.24;
  vec3  radM = harmonic(fm * 24.0 + 0.61, 0.90, 41.0, am)
             + harmonic(fm * 48.0 - 0.13, 0.80, 47.0, am) * 0.70;

  vec2  qf = q + vec2(par.x * 0.021 + uTime * 0.011, par.y * 0.021 + 0.67);
  float ff = qf.y;
  float af = qf.x * 3.10 - uTime * 0.17;
  // One harmonic only: the far layer is hazed to 34% and a second octave on it
  // cost real frame time for detail the aerial perspective then washes out.
  vec3  radF = harmonic(ff * 40.0 + 0.29, 0.80, 83.0, af);

  radM = aerial(radM, 0.38) * 0.62;
  radF = aerial(radF, 0.70) * 0.34;
  vec3 rad = radN + radM + radF;

  /* Broad shading off the warp that is already in hand. Without it every part of
     the mass is lit equally and the whole thing reads flat — this is what makes
     it look like a lit surface with crests and troughs rather than a texture. */
  rad *= 0.45 + 1.05 * smoothstep(-0.28, 0.34, u1);

  /* Strands brighten where they converge, rather than the node being a blob. */
  rad *= 1.0 + lift * 0.9;
  // The bursts join the same radiance, so they bloom with everything else.
  rad += WARM_L * rays * 1.25;

  /* Glints strung along the strands — the source artwork is speckled with them
     and without it the field reads as woven fabric rather than light. */
  float sp = hash11(dot(floor(p * 620.0), vec2(1.0, 157.0)));
  float sparkle = smoothstep(0.9965, 1.0, sp) * dot(rad, vec3(0.33));

  /* --- landscape band: the mass sits in a wavy horizontal belt --- */
  float hz   = 0.58 + 0.09 * fbm(vec2(p.x * 1.4 + uTime * 0.012, 3.7), 2);
  float mass = smoothstep(hz + 0.26, hz - 0.06, uvy) * smoothstep(hz - 0.44, hz - 0.16, uvy);
  /* Haze the left and right extremes so the field has no visible edge. Measured
     against the actual half-width, so an ultrawide fades at its own edges rather
     than going blank two thirds of the way out. */
  mass *= smoothstep(1.0, 0.62, abs(p.x) / halfW);

  /* --- contrast guard ---
     The headline, sub-label and CTA are light type in the bottom-left, sitting
     under .hero__veil, which can only darken a backdrop it can predict. So the
     lower-left carries a fog bank (the source photograph had one for exactly the
     same reason) and added light is damped inside it. This value also rides out
     in alpha, and the composite pass multiplies the BLOOM by it — blur moves
     light around the frame, and that is what stops it moving light onto the
     type. Do not weaken any of it without re-running the contrast probe.
     Contrast is a function of MEAN luminance, and the strands are thin — the
     base carries far more of that mean than they do. So the fog wash on the base
     is pushed hard (it is also what reads as atmospheric depth) while the guard
     on the strands themselves is kept comparatively light. Suppressing the
     strands instead was what emptied the left half of the frame. */
  float fogL  = (1.0 - smoothstep(0.05, 1.65, uvy)) * (1.0 - smoothstep(-0.60, 0.55, p.x / halfW));
  float guard = mix(0.34, 1.0, smoothstep(0.06, 0.62, uvy)) * (1.0 - fogL * 0.72);

  /* --- assemble, in linear --- */
  vec3 col = mix(FOG_L, CORE_L, smoothstep(0.02, 0.50, uvy));
  col = mix(col, SKY_L, smoothstep(0.52, 0.96, uvy));
  col = mix(col, mix(SAND_L, TIMBER_L, 0.62), mass * 0.34 * guard);

  col += rad * mass * guard * 0.62;
  col += WARM_L * sparkle * mass * guard * 1.30;
  col += TIMBER_L * 2.30 * glow * mass * guard;
  col += WARM_L * flare * mass * guard * 0.55;
  col = mix(col, FOG_L, fogL * 0.80);

  fragColor = vec4(max(col, 0.0) / uRange, guard);
}`;

/* ============================================================
   PASSES B–D — separable blur, with an optional bright pass
   ============================================================ */
const BLUR_FRAG = `#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform vec2  uRes;     // this pass's TARGET resolution
uniform vec2  uDir;     // one texel step, in UV, along the blur axis
uniform float uThresh;  // >0 on the bright pass only; already divided by uRange

out vec4 fragColor;

/* 9-tap gaussian folded into 5 bilinear samples. */
const float O[3] = float[3](0.0, 1.3846153846, 3.2307692308);
const float W[3] = float[3](0.2270270270, 0.3162162162, 0.0702702703);

vec3 fetch(vec2 uv) {
  vec3 c = texture(uTex, uv).rgb;
  if (uThresh > 0.0) {
    // Soft knee, so a strand crossing the threshold ramps in rather than popping.
    float l = max(max(c.r, c.g), c.b);
    c *= smoothstep(uThresh, uThresh + 0.45 * uThresh, l);
  }
  return c;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = fetch(uv) * W[0];
  for (int i = 1; i < 3; i++) {
    c += fetch(uv + uDir * O[i]) * W[i];
    c += fetch(uv - uDir * O[i]) * W[i];
  }
  fragColor = vec4(c, 1.0);
}`;

/* ============================================================
   PASS E — composite, tonemap, grain, sRGB
   ============================================================ */
const COMPOSITE_FRAG = `#version 300 es
precision highp float;

uniform sampler2D uScene;
uniform sampler2D uBloom1;  // quarter res, tight glow
uniform sampler2D uBloom2;  // eighth res, wide halo
uniform vec2  uRes;
uniform float uRange;
uniform float uBloomAmt;
uniform float uGrain;
uniform float uTime;

out vec4 fragColor;

/* Highlight-only shoulder. Identity below K, then a smooth C1 roll to 1.0.
   Deliberately NOT ACES: ACES desaturates and pulls midtones down, and the
   midtones here are what the type contrast is measured against. Everything in
   the background ramp sits under K, so the palette passes through untouched and
   only emitted light gets compressed. */
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
  vec2 uv = gl_FragCoord.xy / uRes;
  vec4 s  = texture(uScene, uv);
  vec3 col = s.rgb * uRange;

  // s.a is the contrast guard from pass A. Applying it at the DESTINATION damps
  // bloom landing on the copy zone no matter which node it spread from.
  vec3 bloom = (texture(uBloom1, uv).rgb + texture(uBloom2, uv).rgb * 0.85) * uRange;
  col += bloom * uBloomAmt * s.a;

  col = tone(col);
  col = pow(max(col, 0.0), vec3(1.0 / 2.2)); // linear -> sRGB

  /* Grain, weighted into the shadows. It doubles as the dither these very
     shallow gradients need: without it they band visibly on exactly the large
     displays this whole thing exists to serve. */
  float g = hash12(gl_FragCoord.xy + uTime * 137.0);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col += (g - 0.5) * uGrain * mix(1.7, 0.45, lum);

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

function link(gl: WebGL2RenderingContext, fragSrc: string): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[herofield]', gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

interface Target {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
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

  /* Half-float render targets keep the HDR range the bloom needs. Where the
     extension is missing (~3% of contexts) fall back to RGBA8 and pack the range
     into it — precision drops, but the grain in the composite covers it. */
  const hdr = !!gl.getExtension('EXT_color_buffer_float');
  const RANGE = hdr ? 1.0 : 5.0;
  const internal = hdr ? gl.RGBA16F : gl.RGBA8;
  const texType = hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

  const fieldProg = link(gl, FIELD_FRAG);
  const blurProg = link(gl, BLUR_FRAG);
  const compProg = link(gl, COMPOSITE_FRAG);
  if (!fieldProg || !blurProg || !compProg) return;

  // Some drivers refuse a draw with no VAO bound, even with zero attributes.
  gl.bindVertexArray(gl.createVertexArray());

  const u = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const F = {
    res: u(fieldProg, 'uRes'), time: u(fieldProg, 'uTime'),
    ptr: u(fieldProg, 'uPointer'), ptrAmt: u(fieldProg, 'uPointerAmt'),
    ptrVel: u(fieldProg, 'uPointerVel'), wake: u(fieldProg, 'uWake'),
    range: u(fieldProg, 'uRange'),
  };
  const B = {
    tex: u(blurProg, 'uTex'), res: u(blurProg, 'uRes'),
    dir: u(blurProg, 'uDir'), thresh: u(blurProg, 'uThresh'),
  };
  const C = {
    scene: u(compProg, 'uScene'), bloom1: u(compProg, 'uBloom1'),
    bloom2: u(compProg, 'uBloom2'), res: u(compProg, 'uRes'),
    range: u(compProg, 'uRange'), amt: u(compProg, 'uBloomAmt'),
    grain: u(compProg, 'uGrain'), time: u(compProg, 'uTime'),
  };

  /* ---- render targets ---- */
  let scene: Target | null = null;
  let b1a: Target | null = null, b1b: Target | null = null;
  let b2a: Target | null = null, b2b: Target | null = null;

  function makeTarget(w: number, h: number): Target {
    const tex = gl!.createTexture()!;
    gl!.bindTexture(gl!.TEXTURE_2D, tex);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, internal, w, h, 0, gl!.RGBA, texType, null);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    const fb = gl!.createFramebuffer()!;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fb);
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, tex, 0);
    return { fb, tex, w, h };
  }

  function freeTarget(t: Target | null): void {
    if (!t) return;
    gl!.deleteFramebuffer(t.fb);
    gl!.deleteTexture(t.tex);
  }

  function allocTargets(w: number, h: number): void {
    [scene, b1a, b1b, b2a, b2b].forEach(freeTarget);
    const q = (n: number, d: number) => Math.max(1, Math.floor(n / d));
    scene = makeTarget(w, h);
    b1a = makeTarget(q(w, 4), q(h, 4));
    b1b = makeTarget(q(w, 4), q(h, 4));
    b2a = makeTarget(q(w, 8), q(h, 8));
    b2b = makeTarget(q(w, 8), q(h, 8));
  }

  /* ---- resolution ladder ----
     Two governors. A pixel budget caps total work — DPR alone is the wrong
     control at the top end, where a 5K panel at 2x asks for ~25M pixels a frame
     and the frame-time ladder would only find out after 30 late frames. Then the
     ladder itself steps down on frames that are genuinely late.
     ponytail: fixed steps, not a real adaptive controller. Ceiling: it only ever
     steps down, never recovers if the machine frees up. A rolling window that
     also steps back up is the upgrade if that ever shows. */
  /* Measured, not guessed: this shader runs ~22ms/frame at 4.2 megapixels on the
     machine it was built on, i.e. it misses 60fps, and the frame-time ladder
     then drops it to 0.75 — a harsher downsample than simply capping here, and
     one that only arrives after a visible few seconds at the wrong rate. A
     deliberate 0.85 beats a reactive 0.75. On a 1x display this changes nothing
     (the cap never binds below ~3 megapixels of CSS area); it only trims the
     top end on retina and ultrawide. */
  const MAX_PIXELS = 3.0e6;
  const dpr = window.devicePixelRatio || 1;
  const STEPS = [...new Set([2, 1.5, 1, 0.75].map((s) => Math.min(dpr, s)))];
  let step = 0;

  function currentScale(): number {
    const cssW = canvas!.clientWidth || 1;
    const cssH = canvas!.clientHeight || 1;
    return Math.min(STEPS[step], Math.sqrt(MAX_PIXELS / (cssW * cssH)));
  }

  function resize(): boolean {
    const s = currentScale();
    const w = Math.max(1, Math.round(canvas!.clientWidth * s));
    const h = Math.max(1, Math.round(canvas!.clientHeight * s));
    if (canvas!.width === w && canvas!.height === h && scene) return false;
    canvas!.width = w;
    canvas!.height = h;
    allocTargets(w, h);
    return true;
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

  function drawQuad(): void {
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
  }

  function pass(t: Target | null, prog: WebGLProgram): void {
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, t ? t.fb : null);
    gl!.viewport(0, 0, t ? t.w : canvas!.width, t ? t.h : canvas!.height);
    gl!.useProgram(prog);
  }

  function blur(dst: Target, src: Target, dir: [number, number], thresh: number): void {
    pass(dst, blurProg!);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, src.tex);
    gl!.uniform1i(B.tex, 0);
    gl!.uniform2f(B.res, dst.w, dst.h);
    gl!.uniform2f(B.dir, dir[0] / dst.w, dir[1] / dst.h);
    gl!.uniform1f(B.thresh, thresh);
    drawQuad();
  }

  function draw(dt: number): void {
    resize();
    if (!scene || !b1a || !b1b || !b2a || !b2b) return;

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

    /* A — the field, in linear HDR */
    pass(scene, fieldProg!);
    gl!.uniform2f(F.res, scene.w, scene.h);
    gl!.uniform1f(F.time, time);
    gl!.uniform2f(F.ptr, eased.x, eased.y);
    gl!.uniform1f(F.ptrAmt, eased.amt);
    gl!.uniform2f(F.ptrVel, eased.vx, eased.vy);
    gl!.uniform1f(F.wake, eased.wake);
    gl!.uniform1f(F.range, RANGE);
    drawQuad();

    /* B–D — bright pass, then two blur octaves */
    blur(b1a, scene, [1, 0], BLOOM_THRESHOLD / RANGE);
    blur(b1b, b1a, [0, 1], 0);
    blur(b2a, b1b, [1, 0], 0);
    blur(b2b, b2a, [0, 1], 0);

    /* E — composite to the screen */
    pass(null, compProg!);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, scene.tex);
    gl!.uniform1i(C.scene, 0);
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_2D, b1b.tex);
    gl!.uniform1i(C.bloom1, 1);
    gl!.activeTexture(gl!.TEXTURE2);
    gl!.bindTexture(gl!.TEXTURE_2D, b2b.tex);
    gl!.uniform1i(C.bloom2, 2);
    gl!.uniform2f(C.res, canvas!.width, canvas!.height);
    gl!.uniform1f(C.range, RANGE);
    gl!.uniform1f(C.amt, 0.85);
    gl!.uniform1f(C.grain, 0.0075);
    gl!.uniform1f(C.time, time);
    drawQuad();
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
    /* Step down only on frames that are genuinely late. A healthy 60fps frame is
       16.7ms, so the threshold has to sit clear above that — testing against
       anything at or under 16.7 marks every normal frame slow and walks the
       resolution straight to the floor, which is the blur this replaced. 24ms is
       roughly 42fps. */
    if (dt > 24 && step < STEPS.length - 1) {
      if (++slow > 30) {
        step++;
        canvas.width = 0; // force resize() to rebuild the buffers
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
