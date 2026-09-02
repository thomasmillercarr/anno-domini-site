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
 * A contoured relief landscape. A folded, eroded landmass carved by dense cream
 * iso-lines, over a soft dusty ground: coral bodies, deep red in the troughs,
 * cream washes blowing out along the lit crests. The grain reads as wood or a
 * fingerprint, and it flows — the contour bands migrate across the surface while
 * the folds themselves slowly reshape.
 *
 *   1. A HEIGHT FIELD h(p): a four-octave value-noise fbm on a DOMAIN-WARPED
 *      coordinate. The warp is what makes the grain swirl and eddy. Without it
 *      an fbm gives rounded blobs and the contours draw concentric rings, which
 *      is a topographic map, not this.
 *   2. CONTOURS as the dominant texture — fract(h * BANDS), anti-aliased against
 *      fwidth so they stay clean at any resolution, and deliberately allowed to
 *      SATURATE to solid cream where the bands fall below Nyquist.
 *   3. SHADING from the field's own analytic gradient: Lambert against a light
 *      up and to the left, plus a tight specular for the near-white ridge line.
 *   4. A SILHOUETTE cut at a sea level, so the mass has hard eroded edges against
 *      the ground rather than fading out, with a darker band just inside the cut
 *      so it reads as a cliff face rather than a paper cutout.
 *   5. The pointer pushes a bulge into the height field — the contours ripple
 *      outward from it — and drags the warp along its recent travel.
 *
 * On top of the field, four choreographed moves — all of them uniforms and a
 * little ALU, ZERO new noise evaluations, so the measured pixel budget below
 * still holds:
 *
 *   - FORMATION: the first ~2.9s after the ticker starts drain the sea to
 *     surface the landmass and etch the contour lines in, behind the CSS type
 *     entrance. At uForm = 0 the frame is the bare sky gradient, which is what
 *     the .hero CSS fallback paints, so the is-live opacity fade is seamless.
 *   - SUBMERGENCE: reveal.ts feeds the hero's scroll-out progress into
 *     setHeroScroll(); the sea rises with it and swallows the landmass as the
 *     visitor leaves, then gives it back on the way up. Same clock, same
 *     ScrollTrigger — no scroll listener here.
 *   - RIPPLES: a click (or a real tap on touch — pointerup within 350ms/12px,
 *     so scroll flicks never fire it) drops a travelling gaussian ring into the
 *     HEIGHT, with its analytic gradient added to the shading normal. The
 *     surface deforms and the contours wave outward; it is not a colour overlay.
 *     Three pooled slots, oldest recycled, the whole block gated on one uniform.
 *   - THEME SWEEP: the theme change is a radial front expanding from the toggle
 *     button — night crosses the landscape — instead of the old whole-frame
 *     temporal lerp. Idle frames have uDarkTo == uDark, so the mix collapses.
 *   - LIVING LIGHT: the light direction orbits ±4 degrees over ~26s, so the
 *     crest highlights crawl along the ridge lines even with no input. At
 *     time = 0 it equals the old constants exactly, which keeps the
 *     reduced-motion frame identical.
 *
 * ---- why the contours saturate, and why that is correct ----
 *
 * The line is drawn with `smoothstep(0, fwidth(c), ...)`, so its edge softness
 * tracks how fast the bands are moving across the screen. Where a slope is steep
 * enough that a band spans less than a pixel, that smoothstep can no longer
 * resolve anything and the coverage tends to the mean — a flat grey. The `max`
 * against `smoothstep(0.30, 0.78, aa)` takes it the rest of the way to solid
 * cream instead. That wash along the crests is the single most recognisable
 * thing about the look; it is the intended behaviour of an unresolvable band,
 * not an artefact to clamp away. Do not "fix" it by pinning the line width.
 *
 * ---- what this costs, and what was not built ----
 *
 * The reference is viewed at an angle, so its ridges lean and near-overlap.
 * Faking that needs two or three fixed-point iterations of q = p + vec2(0, h(q)*k),
 * which is two or three more full field evaluations — roughly a third of the
 * pixel budget. Hard contour lines are the most resolution-sensitive thing this
 * shader could possibly draw, so buying lean with blur is the wrong trade; it is
 * the same reasoning that replaced the hero WebP in the first place. The relief
 * is shaded flat and lit instead.
 *
 * The field is 6 noise evaluations a fragment: 2 for the warp, 4 for the height.
 * Both use vnoiseD, which returns the value AND its exact closed-form gradient —
 * three taps of an fbm for an approximate derivative costs 3x that for a worse
 * answer. This is the one optimisation that has ever paid on this file; keep it.
 *
 * ---- one pass ----
 *
 * One fullscreen quad, one program. Accumulation is in linear light — doing it
 * in gamma space is what makes bright areas go chalky grey instead of hot, and
 * that is a physical error, not a taste. The palette constants are ALREADY
 * raised to 2.2; never paste sRGB values into them.
 *
 * ---- behaviour ----
 *
 *   - Runs off gsap.ticker, which scroll.ts already drives in lockstep with
 *     Lenis. One clock for the page — a second rAF loop is what makes canvas
 *     work feel detached from smooth scroll.
 *   - Two palettes, selected per-fragment by the theme front (see THEME SWEEP
 *     above). The coupling is one-directional: this file watches data-theme
 *     with a MutationObserver, theme.ts knows nothing about it. A toggle while
 *     the ticker is stopped (hero off-screen, tab hidden) snaps instead of
 *     sweeping, so the field is never caught mid-front when it scrolls back in.
 *   - The pointer bends the field and drags a short wake behind it. All input is
 *     lerped, never applied raw. Pointer positions are normalised against the
 *     CANVAS box, not the hero's — the canvas is the shader's coordinate frame
 *     (it bleeds 124% for the parallax), and its rect includes the parallax
 *     transform, which is the visual truth the cursor lines up against.
 *   - Reduced motion renders exactly one frame — complete, uForm = 1 — and
 *     never registers a ticker.
 *   - No WebGL2 falls back to the CSS gradient on .hero. A LOST context tears
 *     everything down to that same gradient, and a restored one re-runs init()
 *     so a driver reset costs the visitor nothing.
 *
 * The canvas never writes its own transform: reveal.ts scrubs yPercent on
 * .hero__slot for the scroll parallax and the two would fight.
 */

import { gsap } from 'gsap';
import { rafThrottle } from './pointer';
import { createOcean, type Ocean } from './oceanfft';
import { getHeroScroll } from './heroscroll';

const VERT = `#version 300 es
void main() {
  // Fullscreen quad straight from the vertex index — no buffers, no attributes.
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) - 1.0;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

/* No #version directive in here: it has to be the FIRST line of the source, and
   the two defines that select the variant and the height source are injected
   ahead of the body at compile time. buildFrag() below owns that. */
const FRAG_BODY = `precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uPointer;     // field coords, already smoothed on the JS side
uniform float uPointerAmt;  // 0 -> 1 as the cursor enters / leaves the hero
uniform vec2  uPointerVel;  // recent cursor velocity, for the wake
uniform float uWake;        // decaying wake strength
uniform float uDark;        // settled ("from") theme value, 0 light / 1 dark
uniform float uDarkTo;      // incoming theme value; equals uDark when idle
uniform vec3  uSweep;       // theme front: centre.xy in field coords, radius
uniform float uForm;        // formation 0 -> 1, eased on the JS side
uniform float uSink;        // scroll-out submergence 0 -> 1, eased on the JS side
uniform float uRipOn;       // any ripple live — uniform gate for the whole block
uniform vec4  uRip[3];      // ripples: centre.xy, age in s, amplitude
uniform vec3  uLdir;        // light direction (unit), orbited on the JS side
uniform vec3  uLhalf;       // matching half vector, orbited in lockstep
uniform float uContentHW;   // half-width of .hero__grid, in field units
uniform vec2  uQuietTop;    // uvy of the top of (copy column, statcard)
uniform float uNavY;        // uvy of the nav's BOTTOM edge, measured from layout
#if OCEAN
uniform sampler2D uDisp;    // (height, slopeX, slopeZ, foam), normalised
uniform sampler2D uRaw;     // (height, Dx, Dz, 0), raw — the choppy warp source
uniform float uOScale;      // field units -> patch uv
uniform float uOWarp;       // choppy displacement, in uv
uniform vec2  uODrift;      // slow uv drift across the patch
uniform float uON;          // patch resolution, for the interpolation fade
#endif

out vec4 fragColor;

/* Palette, LINEAR — the sRGB values in the comments are the authored colours,
   these are those raised to 2.2. Every mix below happens in linear light, so
   never paste sRGB values in here.

   Two sets. The light one is the reference artwork: dusty mauve ground, coral
   body, cream lines. The dark one is the same landscape at night — the site has
   a theme toggle and a high-key coral field under it would be the one thing on
   the page that ignores it.

   GROUND_LO is the bottom of the frame, and it is the single most load-bearing
   colour here: the headline, the sub-label, the CTA and the statcard all sit on
   it. The composition below keeps the mass off it deliberately, and the type
   contrast is measured against whatever it leaves behind. */
const vec3 SKY_HI_L  = vec3(0.3994, 0.2157, 0.2428); /* #A87F86 dusty mauve   */
const vec3 SKY_LO_L  = vec3(0.8123, 0.6523, 0.6056); /* #E8D2CB pale rose     */
const vec3 CORAL_L   = vec3(0.7518, 0.1303, 0.1450); /* #E0656A the body      */
const vec3 DEEP_L    = vec3(0.3994, 0.0415, 0.0582); /* #A83C46 troughs       */
/* Dimmed on request from #F6E7DC — the lines were shouting over the light
   field. A deeper, warmer cream keeps them solid (translucency would read as
   faded print) while pulling the wash down about a stop. */
const vec3 CREAM_L   = vec3(0.8592, 0.7085, 0.5990); /* #EEDACA the lines     */
const vec3 HILITE_L  = vec3(1.0000, 0.9405, 0.8832); /* #FFF8F1 crest         */

const vec3 SKY_HI_D  = vec3(0.0078, 0.0029, 0.0037); /* #1C1214 */
const vec3 SKY_LO_D  = vec3(0.0231, 0.0084, 0.0104); /* #2E1D20 */
const vec3 CORAL_D   = vec3(0.1975, 0.0231, 0.0328); /* #7A2E36 */
const vec3 DEEP_D    = vec3(0.0385, 0.0041, 0.0060); /* #3A1519 */
/* Measurably darker than the obvious rose-gold. The dark theme puts NEAR-WHITE
   type over this, and a line tone bright enough to look like polished copper
   took the nav links to 4.50:1 — a fail on the round. These are the same hues,
   two stops down, and the pairing is 6.4:1. */
const vec3 CREAM_D   = vec3(0.5924, 0.2428, 0.1604); /* #C9866F */
const vec3 HILITE_D  = vec3(0.8199, 0.4314, 0.2844); /* #E9AE90 */

/* ---- field constants ---- */
const float HS     = 1.70;  // height field scale — roughly 3 large forms across 16:9
const float WS     = 1.05;  // warp field scale
const float WARP   = 0.95;  // warp amplitude, in height-field units
const float NAMP   = 0.52;  // height noise amplitude, against TILT below
/* BANDS was 54 and LW 0.15 (~30% duty); both came down together on request —
   the field read as cluttered and the cream too dominant in the light theme.
   Fewer bands open the spacing AND shrink the saturation blowouts (aa scales
   with BANDS, so the sub-pixel zones recede), and the narrower duty holds the
   individual line at roughly its old on-screen weight instead of letting the
   wider bands fatten it into ribbons. CFLOW dropped in proportion so the drift
   does not LOOK faster across the wider spacing. Density down is the safe
   direction for the pixel budget — denser lines need more resolution, not
   fewer. */
const float BANDS  = 40.0;  // contour bands over the full height range
const float LW     = 0.12;  // half line width, in band units (so ~24% duty)
const float CFLOW  = 0.40;  // bands migrated per second — the "flow" across the hero
const float RELIEF = 1.30;  // how far the shading normal tilts
const float SEA    = -0.06; // silhouette cut

/* THE RATIO OF TILT TO NAMP IS THE WHOLE LOOK. Read this before touching either.
 *
 * An fbm has no preferred direction, so its iso-lines close into rings around
 * every local extremum. Contour a plain fbm and the frame fills with concentric
 * whorls and little eyes — marbled paper, or a survey map. A plane has perfectly
 * parallel iso-lines and no character at all.
 *
 * The reference is neither: it is a PLANE, warped. Long lines running roughly
 * parallel for the width of the frame, folded into sweeping curves, closing into
 * a lens shape only occasionally. That comes from letting the tilt dominate the
 * height (roughly 3:1 here) and putting the character in the domain warp
 * instead, which bends the parallel bands without creating new extrema for them
 * to close around. Push NAMP up toward TILT and the rings come straight back;
 * this was tried at parity and it is unmistakably the wrong picture.
 *
 * The tilt doubles as composition: its gradient points up and to the right, so
 * the landmass sits high there and the ground opens toward the lower left, which
 * is where the headline column is. */
const float TILT = 0.95;
const vec2  TDIR = vec2(0.42, 0.91);

#if OCEAN
/* ---- the ocean's terms ----
 *
 * The FFT surface arrives at unit variance (oceanfft normalises by the measured
 * sigma of its own spectrum), so OAMP is directly comparable to NAMP above and
 * the TILT ratio the whole look depends on carries across unchanged.
 *
 * Which is the point worth stating: the tilt is still doing its job here, but it
 * has help now. Phillips' directional term already biases the crests along one
 * wind vector, so the field arrives with a grain instead of being isotropic. The
 * tilt no longer has to manufacture the parallelism single-handed — it is setting
 * composition (mass high and right, ground open toward the copy) more than it is
 * suppressing rings. See DIR_POW in oceanfft.ts for the other half of this.
 */
  #if VARIANT == 2
    /* Tide: the tilt comes down so the frame reads as sea rather than as a
       landmass with a shoreline. Less plane, more water — which means the quiet
       guards carry more of the composition than they do in variant 1. */
    const float OTILT = 0.55;
    const float OAMP  = 0.110;
    const float OSEA  = SEA;
    const float FORMH = 1.05;
  #elif VARIANT == 3
    /* Horizon: perspective supplies the composition, so there is no tilt at all.
       FORMH clears three sigma of a unit-variance field with room to spare, so
       uForm = 0 is still a genuinely empty frame. */
    const float OTILT = 0.0;
    const float OAMP  = 0.200;
    /* No shoreline in a perspective ocean: the cut has to sit below the whole
       surface or the water breaks into islands. -3.6 is under three sigma, so
       the far tail costs a handful of specks and nothing structural. */
    const float OSEA  = -0.95;
    const float FORMH = 1.90;
  #else
    const float OTILT = 0.95;
    /* Solved, not dialled: the field's slope-per-uv was measured off the
       spectrum (28.9 at these settings), so OAMP = (TILT/3) / (slope x scale)
       is what puts the tilt three to one over the noise on the GRADIENT, which
       is the ratio the "plane, warped" look actually depends on. */
    const float OAMP  = 0.170;
    const float OSEA  = SEA;
    /* 1.15 cleared the old fbm, whose octaves are bounded. This field is a
       Gaussian with a real tail, so the empty frame needs three sigma of the
       noise term plus the tilt's corner value, or uForm = 0 leaves stray peaks
       standing in what is supposed to be bare sky. */
    const float FORMH = 1.55;
  #endif
#else
const float OTILT = TILT;
const float OAMP  = NAMP;
const float OSEA  = SEA;
const float FORMH = 1.15;
#endif

#if VARIANT == 3
/* ---- the grazing camera ----
 * Pitched down by CAM_A from horizontal, looking along -z, focal length 1. The
 * horizon lands where the ray stops descending, at screen y = tan(CAM_A), so
 * CAM_A alone places it: 0.30 puts it in the upper third with the copy column
 * clear underneath. CAM_H is the only thing setting the apparent wave scale,
 * because a plane has no other length in it.
 */
const float CAM_A = 0.2915;   // atan(0.30)
const float CAM_H = 0.42;
const float FOGK  = 0.085;    // distance at which the surface has gone to sky
#endif

#if OCEAN
/* Quintic-faded bilinear, wrapped. Four texel fetches and a C2 fade, which is
   the same interpolant vnoiseD uses and for exactly the same reason: hardware
   bilinear is only C0, so its GRADIENT jumps at every texel boundary, and this
   field is drawn as iso-lines — which trace the gradient. A C0 height field puts
   a visible kink in every contour along every texel edge of a 256x256 grid, a
   diamond lattice laid over the whole frame. It is the single most obvious way
   to make a sampled height field look sampled.

   Interpolating the whole vec4 rather than one channel is free at the fetch
   level (the texel is fetched entire either way) and gives the slopes the same
   continuity as the height, so the shading gets it too.

   texelFetch has no wrap mode of its own, hence the wrap arithmetic — which is
   what makes the patch tile rather than clamp at its edges. It is done in FLOAT,
   with mod(), and that is not a style choice: GLSL ES leaves integer % undefined
   when either operand is negative, and half of any centred frame has a negative
   texel index. Doing it with int % produced hard axis-aligned rectangles across
   the whole field on the first run — the tell is that they were rectangles, since
   a broken wrap breaks x and y independently.

   ponytail: textureGather would collapse the four fetches into one instruction,
   but it is GLSL ES 3.10 and WebGL2 is 3.00. Revisit if this ever moves to
   WebGPU, where the reference lives anyway. */
vec4 qtex(sampler2D s, vec2 uv) {
  vec2 t = uv * uON - 0.5;
  vec2 i = floor(t);
  vec2 f = t - i;
  vec2 w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 m0 = mod(i, uON);            // mod() is defined for negatives; % is not
  vec2 m1 = mod(i + 1.0, uON);
  ivec2 b0 = ivec2(m0);
  ivec2 b1 = ivec2(m1);
  vec4 c00 = texelFetch(s, b0, 0);
  vec4 c10 = texelFetch(s, ivec2(b1.x, b0.y), 0);
  vec4 c01 = texelFetch(s, ivec2(b0.x, b1.y), 0);
  vec4 c11 = texelFetch(s, b1, 0);
  return mix(mix(c00, c10, w.x), mix(c01, c11, w.x), w.y);
}
#endif

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z) - 0.5;
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/* Value noise AND its exact gradient, as (value, d/dx, d/dy), with a quintic
 * fade so the field is C2 and the gradient C1 — which matters twice here, once
 * because the gradient IS the shading normal and once because a discontinuous
 * gradient puts a visible crease along every lattice edge in the contours.
 *
 * The obvious way to get a gradient is three taps and two subtractions: 3x the
 * noise for a derivative that is only approximate. Value noise on a lattice is a
 * bilinear form in the faded coordinates, so its derivative is closed-form — the
 * same four corner hashes plus the derivative of the quintic, for about a third
 * more work than the value alone. */
vec3 vnoiseD(vec2 p) {
  vec2 i = floor(p), f = p - i;
  vec2 u  = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  float k1 = b - a, k2 = c - a, k3 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k3 * u.x * u.y,
              du.x * (k1 + k3 * u.y),
              du.y * (k2 + k3 * u.x));
}

/* Every octave is ROTATED as well as scaled. Value noise sits on a square
   lattice and its features line up with the axes; stack octaves on the same
   axes and the alignment reinforces instead of averaging out, which draws tall
   axis-aligned rectangles across the frame. Contours make that unmissable —
   they trace the iso-lines, so any axis bias in the field becomes a bias in
   every single line. One rotation per octave decorrelates them and it is free. */
const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);

/* The height field: value + its exact gradient, chain-ruled through the octave
 * transforms. The matrix m carries the accumulated domain transform, so octave
 * i's contribution to d/dp is (dn/dp_i) * M_i. (No backticks in here — the whole
 * shader is a JS template literal and one would end it.)
 *
 * gSoft is the same gradient truncated to the first two octaves, and it is what
 * the SHADING uses. The full gradient is dominated by the finest octave, and
 * lighting a surface with that gives a sandblasted look with no readable form —
 * the fine detail is already carried by the contour lines, which is where it
 * belongs. Splitting it out inside the same loop costs no extra noise. */
vec3 fbmD(vec2 p, out vec2 gSoft) {
  float a = 0.5, s = 0.0;
  vec2 g = vec2(0.0);
  gSoft = vec2(0.0);
  mat2 m = mat2(1.0);
  for (int i = 0; i < 4; i++) {
    vec3 n = vnoiseD(p);
    vec2 gi = a * (n.yz * m);
    s += a * n.x;
    g += gi;
    if (i < 2) gSoft += gi;   // loop-constant, unrolls away
    m = 2.07 * ROT * m;
    p = 2.07 * ROT * p;
    /* Gain above the usual 0.5 on purpose. At 0.5 the slope is nearly uniform
       across the frame, so the contours come out evenly spaced everywhere and
       the result reads as a survey map — legible, inert. The extra weight on the
       fine octaves is what makes some stretches pack tight and blow out to cream
       while others open into broad coral, which is the variation the reference
       lives on. It is also what erodes the silhouette into fingers. */
    a *= 0.53;
  }
  return vec3(s, g);
}

/* The domain warp: a divergence-free vector from a stream function,
   v = rot90(grad psi). Two octaves, exact gradients, one evaluation.

   This is what turns the fbm's rounded blobs into folded, eddying grain. Drop it
   and the contours draw concentric rings around every local maximum, which is a
   contour MAP — legible, and completely unlike the reference. Divergence-free is
   not decoration either: a warp with sinks bunches the iso-lines into knots. */
vec2 curl(vec2 w) {
  vec2 g = vec2(0.0);
  mat2 m = mat2(1.0);
  float a = 0.5;
  for (int i = 0; i < 2; i++) {
    vec3 n = vnoiseD(w);
    g += a * (n.yz * m);
    m = 2.07 * ROT * m;
    w = 2.07 * ROT * w;
    a *= 0.5;
  }
  return vec2(g.y, -g.x);
}

/* Highlight-only shoulder. Identity below K, then a smooth C1 roll to 1.0.
   Deliberately NOT ACES: ACES desaturates and pulls midtones down, and the
   midtones here are what the type contrast is measured against. K sits high
   because this palette is high-key — a shoulder starting at 0.55 would compress
   the cream lines, which are the brightest thing in the frame and the whole
   subject. */
const float K = 0.80;
vec3 tone(vec3 x) {
  vec3 s = vec3(K) + (1.0 - K) * (1.0 - exp(-(x - K) / (1.0 - K)));
  return mix(x, s, step(vec3(K), x));
}

void main() {
  float hw  = 0.5 * uRes.x / uRes.y;
  float t   = uTime;
  vec2  p   = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float uvy = gl_FragCoord.y / uRes.y;
  float nx  = p.x / hw;

  /* A portrait frame is a different composition, not a cropped one: the copy
     stops being a column and spans the width, and the statcard drops below it
     rather than sitting beside it, so both take far more of the height. */
  float narrow = 1.0 - smoothstep(0.55, 0.80, hw);

  /* p stays the SCREEN coordinate throughout — the pointer, the ripples, the
     theme front and every composition guard are authored against it and against
     the measured layout uniforms, so they must not move when the field does.
     fp is the coordinate the FIELD is sampled in. For the plan-view variants the
     two are the same; for the horizon variant fp is a point on the water plane,
     which is a different space entirely and only the field may use it. */
  vec2  fp    = p;
  float fog   = 0.0;   // 0 at the near edge, 1 at the horizon
  float voidy = 0.0;   // 1 where the ray never meets the plane
#if VARIANT == 3
  float ca = cos(CAM_A), sa = sin(CAM_A);
  vec3  rd = normalize(vec3(p.x, p.y * ca - sa, -(p.y * sa + ca)));
  /* Above the horizon the ray escapes and there is nothing to sample. Clamp
     rather than branch: a divergent ray would send fp to infinity and take the
     contour fwidth with it, and the sky is painted over the result anyway. */
  voidy = step(-1e-3, rd.y);
  float td = CAM_H / max(-rd.y, 1e-3);
  fp  = vec2(rd.x, -rd.z) * td * 0.55;
  fog = td * FOGK / (1.0 + td * FOGK);
#endif

  /* ---- pointer, as a disturbance in the field ----
     Gated on the uniform, not on anything per-fragment. uPointerAmt is the same
     for every fragment in the draw, so this is uniform control flow and the
     whole block is skipped for free — which is the common case on a desktop and
     the only case on a phone, where there is no fine pointer at all.

     The bulge carries its own analytic gradient. Adding to h without adding to
     the gradient would light the swelling as if it were flat, and the contours
     would ripple over a surface that never tilted. */
  bool  hover = uPointerAmt > 0.002;
  vec2  wpush = vec2(0.0);
  float bump  = 0.0;
  vec2  bumpG = vec2(0.0);
  if (hover) {
    vec2  pd = p - uPointer;
    float r2 = dot(pd, pd);
    bump  = uPointerAmt * 0.085 * exp(-r2 * 24.0);
    bumpG = -48.0 * pd * bump;
    wpush = uPointerVel * exp(-r2 * 16.0) * uWake * 0.09;
  }

  /* ---- pressure ripples ----
     A tap drops a stone into the field: a travelling gaussian ring added to
     the HEIGHT, its analytic gradient added to the shading normal, so the
     contours and the lighting genuinely wave outward — a deformation, not a
     colour overlay. Gated the same way as the bulge: uRipOn and each slot's
     amplitude are per-draw uniforms, so an idle frame skips all of this as
     uniform control flow. */
  float rip  = 0.0;
  vec2  ripG = vec2(0.0);
  if (uRipOn > 0.5) {
    for (int i = 0; i < 3; i++) {
      vec4 R = uRip[i];
      if (R.w > 0.0005) {
        vec2  rd = p - R.xy;
        float d  = max(length(rd), 1e-4);
        float g  = d - (0.10 + R.z * 0.50);   // the front expands at 0.5 units/s
        float aR = R.w * exp(-R.z * 1.15);    // and the wave decays as it goes
        float e  = aR * exp(-70.0 * g * g);
        rip  += e;
        ripG += (-140.0 * g * e) * (rd / d);
      }
    }
  }

  /* ---- the field ----
     Two fetches where there used to be six noise evaluations, which is why the
     ocean makes the expensive pass CHEAPER rather than dearer. The pipeline that
     fills these textures runs at 256x256; this runs at the display's resolution.

     The two fetches are dependent, and deliberately so. Sampling the surface at
     the plain uv would give the height of the water column standing at that
     grid point, but a choppy ocean's water is not above its grid point — the
     horizontal displacement D has carried it sideways, which is the entire
     reason crests are sharp and troughs are broad. So D is read first and the
     height is read at uv - D: the standard inverse-map approximation, and
     structurally the same two-stage lookup the curl warp used to be.

     Which is the neat part of this whole port. The old warp was a hand-rolled
     divergence-free field, chosen divergence-free because a warp with sinks
     bunches iso-lines into knots. The ocean's displacement is emphatically NOT
     divergence-free — it converges, that is what folding IS — and here that is
     correct rather than a regression, because the convergence is physical and
     the Jacobian tells us exactly where it happened. Those knots are foam. */
  float foam = 0.0;
#if OCEAN
  vec2 uv0 = fp * uOScale + uODrift + wpush * 0.35;
  vec2 D   = qtex(uRaw, uv0).gb * uOWarp;
  vec4 S   = qtex(uDisp, uv0 - D);
  foam = S.w;
  float h = OAMP * S.x + bump + rip + OTILT * dot(fp, TDIR);
#else
  /* ponytail: the noise field is kept as the fallback for GPUs without
     EXT_color_buffer_float — roughly 2% of visitors, on the single most
     important visual on the site, where the alternative is the flat CSS
     gradient. It is a genuine duplicate of the height source and nothing else;
     every term below is shared. Delete it if the extension ever becomes
     universal enough that the gradient is an honest fallback. */
  vec2 wq = fp * WS + vec2(t * 0.011, -t * 0.008);
  vec2 q  = fp * HS + WARP * curl(wq) + wpush + vec2(-t * 0.016, t * 0.009);

  vec2 gSoft;
  vec3 H  = fbmD(q, gSoft);
  float h = OAMP * H.x + bump + rip + OTILT * dot(fp, TDIR);
#endif

  /* ponytail: the shading gradient is taken in WARPED space and is not
     chain-ruled through the warp's Jacobian, which would need two more vnoiseD
     for the Hessian of the stream function. At these warp amplitudes the error
     is a slight slide of the lighting relative to the grain and it is not
     visible; the contours are drawn from h exactly, so the form itself is
     always right. Upgrade path if the lighting ever visibly detaches from the
     grain: compose the warp Jacobian into gSoft. */
  /* The tilt is deliberately NOT in the shading gradient. It is a constant, so
     including it would light the whole frame from one fixed angle regardless of
     the local surface — a flat wash across the picture rather than modelling.
     What should catch the light is the deviation from the plane, which is the
     noise. The tilt still governs where the contours and the silhouette go. */
#if OCEAN
  /* The slopes came out of the spectrum as i*k*h, so they are exact derivatives
     of the surface rather than differences of it, and chain-ruling them through
     the sampling scale is the same step fbmD's gradient needed. They are also
     inherently the SOFT gradient the shading wants: the patch is band-limited at
     N/2, so the sandblasted look that came from lighting a surface with its
     finest octave cannot happen here — the fine detail lives in the contour
     lines, which is where it belongs. */
  vec2 dh = (S.yz * OAMP * uOScale) + bumpG + ripG;
#else
  vec2 dh = (gSoft * OAMP * HS) + bumpG + ripG;
#endif

  /* ---- composition: where the landmass recedes ----
     The type is not fought back with a scrim, it is given somewhere to sit. Sea
     level RISES over the copy column and over the statcard, so those corners are
     open ground by construction. Both extents are aspect-aware — in a portrait
     frame the copy spans the width, so copyX goes to 1 and the statcard term
     switches off because the card is no longer beside anything. */
  /* Measured against the CONTENT width, not the frame width. The layout is
     capped at --maxw and centred, so past about 1800px the two stop agreeing:
     on a 3440 ultrawide the copy occupies the middle 45% of the frame, and a
     guard in frame coordinates protects empty margin on the left while leaving
     the statcard standing on open terrain. uContentHW is the actual .hero__grid
     half-width, read once per resize. */
  float cx = p.x / min(hw, uContentHW);

  float copyX = mix(1.0 - smoothstep(-0.62, 0.34, cx), 1.0, narrow);
  float statX = smoothstep(0.14, 0.98, cx) * (1.0 - narrow);

  /* The vertical ceilings are MEASURED from layout, not guessed at, and this is
     the second time a magic number here has been wrong. The copy block is a
     stack of fixed-size type, so the shorter the viewport the larger the
     fraction of it the block occupies: a ceiling tuned to look right at 900px
     tall put the sub-label out on bare terrain at 586px, measured at 4.05:1.
     There is no constant that is correct at every height, so uQuietTop carries
     the real top edge of each block, in the canvas's own coordinates — which
     also makes it right for the 124% parallax bleed and for the portrait
     rearrangement without either being special-cased. */
  float lowYc = 1.0 - smoothstep(0.02, uQuietTop.x, uvy);
  float lowYs = 1.0 - smoothstep(0.02, uQuietTop.y, uvy);
  float quiet = max(lowYc * copyX, lowYs * statX);

  /* Plus a mild global floor, and a rise at the extreme left and right so the
     mass has no visible edge against the side of the frame. Measured against the
     actual half-width, so an ultrawide opens out at its own edges. */
  /* Formation and submergence are both just sea level. 1.15 clears the field's
     maximum height (TILT reaches ~0.79 at the top-right corner plus ~0.26 of
     noise), so uForm = 0 and uSink = 1 are each a genuinely empty frame — the
     bare sky gradient the CSS fallback paints. The landmass therefore surfaces
     highest-first, flooding in from the upper right along the tilt, which is
     the composition assembling itself toward the copy. */
  float seaShape = 0.52 * quiet
                 + 0.08 * (1.0 - smoothstep(-0.05, 0.34, uvy))
                 + 0.35 * (1.0 - smoothstep(1.04, 0.72, abs(nx)));
#if VARIANT == 3
  /* A perspective ocean has no shoreline, so the guards cannot work by raising
     sea level: a raised patch over the copy column would punch a hole of sky
     through the middle of the water. They fall through to damping the marks
     instead, which the line and specular terms below already do for the nav. */
  seaShape = 0.0;
#endif
  float sea = OSEA + FORMH * (1.0 - uForm) + FORMH * uSink + seaShape;

  float ee   = max(fwidth(h), 1e-5);
  float mass = smoothstep(-ee, ee, h - sea) * (1.0 - voidy);

  /* ---- contours ----
     See the header for why the saturation term is correct rather than a bug. The
     small constant in the smoothstep width keeps the edge from going infinitely
     hard on a perfectly flat patch, where fwidth is zero. */
  float c    = h * BANDS + t * CFLOW;
  float f    = abs(fract(c) - 0.5);
  float aa   = fwidth(c);
  /* During the formation the lines ETCH in: at formLine = 0 the width term
     vanishes and only a hairline survives at each band centre, so the freshly
     surfaced crests appear as filaments and thicken to the full duty cycle as
     the land drains clear. The saturation term scales with it so the first
     crests do not arrive pre-blown-out. */
  float formLine = smoothstep(0.10, 0.90, uForm);
  float line = 1.0 - smoothstep(0.0, aa * 1.2 + 0.008, f - LW * formLine);
  line = max(line, smoothstep(0.20, 0.58, aa) * formLine);
#if OCEAN && VARIANT != 2
  /* Foam feeds the SATURATION term rather than being painted over the top, and
     this is the mapping the whole port was worth doing for. The cream wash along
     the crests is what happens when a contour band falls below a pixel and the
     anti-aliasing can no longer resolve it — it is a slope artefact, and it has
     always been the most recognisable thing about this field. The Jacobian marks
     where the surface folds onto itself, which is where the slope goes vertical.
     They are the same places. So the foam does not add a new mark, it deepens
     one that was already trying to be there for the right physical reason. */
  line = max(line, smoothstep(0.30, 0.95, foam) * formLine);
#endif

  /* The guard is the last word on type contrast, and it works on the LINES
     rather than on the colour. Washing the whole frame toward the ground would
     be a flat overlay by another name — the one part of the field that never
     changes while everything behind it does, which is exactly what reads as
     pasted on. Softening the contrast of the marks leaves the field moving. */
  line *= 1.0 - 0.55 * quiet;

  /* The nav is the one piece of type that cannot be given open ground — it is
     pinned to the top of the frame, which is exactly where the mass sits, and it
     has no frost until it scrolls. Raising sea level there instead would carve
     the landmass off the top edge, which is the best part of the composition, so
     the marks are damped rather than the mass removed. It costs a strip of
     detail at the very top, where there is the least to lose.

     This has to hit the SPECULAR as well as the lines, and that is the half that
     actually matters: the worst backdrop under the nav is not a cream line, it
     is a crest blowout with the highlight on top of it, which is the brightest
     thing the whole field produces. Damping lines alone left the dark theme with
     near-white type on near-white ridges.

     The strip's extent is MEASURED (uNavY, the nav's real bottom edge), like
     every other composition guard here, because the hard-coded 0.86 it replaced
     was the same class of bug the guards were built against: the nav is a
     fixed-height bar over a viewport-relative canvas, so at real viewport
     heights the glyphs sat BELOW the damped strip, and a 20-second watch of the
     dark theme caught the migrating copper crests taking the links to 3.0:1.

     And the damp is THEME-WEIGHTED, because the two themes fail in opposite
     directions. Dark puts near-white type over the field, so its enemy is the
     bright marks — lines and specular — and muting them is correct. Light puts
     near-black ink over it, and muting the lines there UNCOVERS bare coral and
     deep troughs, the darkest thing the field makes: measured, the ink went to
     3.6:1 the moment the cream lines were damped away. So dark mutes the
     marks, light keeps every line and instead lifts the troughs toward the
     coral mid-tone. dk is per-fragment, so a theme sweep carries the right
     guard across with the front. */
  float navQ = smoothstep(uNavY - 0.05, uNavY, uvy);
  float dk = mix(uDark, uDarkTo,
                 1.0 - smoothstep(uSweep.z - 0.45, uSweep.z + 0.45, distance(p, uSweep.xy)));
  float navD = navQ * dk;
  line *= 1.0 - 0.84 * navD;

  /* ---- shading ----
     The light is up and to the left, but it is a UNIFORM now, not a constant:
     the JS side orbits it a few degrees over ~26s so the crest highlights
     crawl along the ridges at idle. The specular is the last thing the
     formation delivers and the first thing the submergence takes away — the
     glint belongs to a finished, surfaced landscape. */
  vec3 n = normalize(vec3(-dh * RELIEF, 1.0));
  float lam  = max(dot(n, uLdir), 0.0);
  float spec = pow(max(dot(n, uLhalf), 0.0), 18.0) * (1.0 - 0.95 * navD) * (1.0 - 0.6 * quiet)
             * smoothstep(0.55, 1.0, uForm) * (1.0 - 0.85 * uSink);

  /* ---- palette, selected by the theme FRONT ----
     Not a scalar cross-fade: when the theme toggles, the JS side expands
     uSweep's radius from the toggle button and the incoming palette fills the
     inside of the front, so night visibly crosses the landscape. The 0.45 soft
     width is broad on purpose — a band of dusk, not a hard terminator. Idle
     frames have uDarkTo == uDark and the mix collapses to the settled value.
     dk itself is computed up at the nav guard, which needs it first. */
  vec3 SKY_HI = mix(SKY_HI_L, SKY_HI_D, dk);
  vec3 SKY_LO = mix(SKY_LO_L, SKY_LO_D, dk);
  vec3 CORAL  = mix(CORAL_L,  CORAL_D,  dk);
  vec3 DEEP   = mix(DEEP_L,   DEEP_D,   dk);
  vec3 CREAM  = mix(CREAM_L,  CREAM_D,  dk);
  vec3 HILITE = mix(HILITE_L, HILITE_D, dk);

  /* ---- assemble, in linear ---- */
  vec3 body = mix(DEEP, CORAL, smoothstep(0.06, 0.80, lam));
  // The light half of the nav guard: under the nav, the light theme lifts the
  // deep troughs toward the coral mid-tone — the ink's worst backdrop is the
  // darkness, not the lines, which stay at full strength there.
  body = mix(body, CORAL, 0.45 * navQ * (1.0 - dk));
  vec3 surf = mix(body, CREAM, line);
  // The crest highlight rides the lines, because that is where it does in the
  // reference — the merged bands and the specular peak are the same ridge.
  surf += HILITE * spec * (0.22 + 0.85 * line);
#if OCEAN && VARIANT == 2
  /* Tide draws the foam as its own whitewater instead of folding it into the
     lines. More literally an ocean, and it reads at a glance — but it is opaque
     paint over a moving field, so it is the term most likely to flatten the
     picture. That is the trade this variant exists to show. */
  surf = mix(surf, HILITE, smoothstep(0.25, 0.90, foam) * 0.85 * formLine);
#endif

  /* The cliff face. Without it the silhouette is a paper cutout: the surface
     runs right up to the cut at full brightness and stops. A darker band just
     inside reads as the near-vertical wall the cut implies. */
  float cliff = 1.0 - smoothstep(0.0, 0.085, h - sea);
  surf = mix(surf, mix(surf * 0.42, DEEP, 0.35), cliff * 0.85);

  vec3 sky = mix(SKY_LO, SKY_HI, smoothstep(-0.12, 1.05, uvy));
#if VARIANT == 3
  /* Everything past the fog distance is sky, which is the only thing standing
     between this and a solid band of unresolvable contour at the horizon. It is
     also what stops the pixel cost of that band from mattering. */
  surf = mix(surf, sky, fog);
#endif
  vec3 col = mix(sky, surf, mass);

  col = tone(col);
  col = pow(max(col, 0.0), vec3(1.0 / 2.2)); // linear -> sRGB

  /* Grain, weighted into the shadows. It doubles as the dither this needs: a
     large smooth ground across a lot of pixels bands visibly without it, on
     exactly the large displays this whole thing exists to serve. */
  float g = hash12(gl_FragCoord.xy + uTime * 137.0);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col += (g - 0.5) * 0.016 * mix(1.0, 0.25, lum);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The variant the page ships. The lab route overrides it per mount. */
export const DEFAULT_VARIANT = 1;

/* Per-variant sampling. These are the knobs that decide how much ocean fits in
   the frame, and they are separate from oceanfft's spectrum knobs on purpose:
   those describe the SEA, these describe the shot of it.

   scale  patch uv per field unit, and the control that really decides how busy
          the field looks: undulations across the frame is scale x (patch /
          characteristic length), so 0.20 puts about four across the hero. Also
          well under 1, so the patch never repeats visibly in a 16:9 frame; the
          horizon variant sees far more of the plane, so it has to tile and
          relies on distance to hide it.
   warp   choppy displacement, multiplied by the ocean's own 1/sigma so it stays
          put when the wind speed or patch size is retuned. It has to stay a
          small fraction of a WAVELENGTH in uv, not a small number in the
          abstract — at 0.03 the displacement was around half a wavelength and
          the lookup folded over itself, which draws as torn edges.
   drift  a lateral current on top of the dispersion. Small: the surface already
          moves on its own, this only stops the patch feeling pinned to the frame.
   time   the reference's 0.6 time scale, per variant. */
const OCEAN_TUNE: Record<number, { scale: number; warp: number; drift: number; time: number }> = {
  1: { scale: 0.200, warp: 0.018, drift: 0.0020, time: 0.60 },
  2: { scale: 0.280, warp: 0.014, drift: 0.0030, time: 0.75 },
  3: { scale: 0.120, warp: 0.009, drift: 0.0000, time: 0.55 },
};

/* #version has to be the first line of the source, so the defines that select
   the variant and the height source are spliced in ahead of the body here. */
const buildFrag = (variant: number, ocean: boolean): string =>
  `#version 300 es
#define VARIANT ${variant}
#define OCEAN ${ocean ? 1 : 0}
${FRAG_BODY}`;

/* The scroll-out progress now lives in heroscroll.ts, and this module only
   reads it. It moved because reveal.ts imported the setter from here, which
   dragged this whole file plus oceanfft.ts into the bundle for every visitor —
   including the ones running the WebGPU ocean, who never mount this at all.
   reveal.ts still feeds it from the SAME ScrollTrigger that scrubs the
   parallax, so there is still no scroll listener anywhere in here. */

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

function init(canvas: HTMLCanvasElement, hero: HTMLElement, variant: number): (() => void) | undefined {
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

  // Some drivers refuse a draw with no VAO bound, even with zero attributes —
  // and the ocean pipeline below draws, so this has to come first.
  gl.bindVertexArray(gl.createVertexArray());

  /* The height field comes from here now. createOcean returns null when the GPU
     cannot render to float, which is the cue to compile the fbm fallback
     instead — so it has to be built BEFORE the program that samples it. */
  // The simulation needs the framing's warp scale to make its Jacobian
  // dimensionless, so the tune is read before the ocean is built.
  const tune = OCEAN_TUNE[variant] ?? OCEAN_TUNE[1];
  const ocean = createOcean(gl, { warp: tune.warp });
  /* The horizon variant is a perspective view OF the ocean; with no ocean there
     is nothing for the camera to look at, so the fallback is always the plan
     view regardless of what was asked for. */
  const v = ocean ? variant : 1;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, buildFrag(v, !!ocean));
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

  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uTime = gl.getUniformLocation(prog, 'uTime');
  const uPointer = gl.getUniformLocation(prog, 'uPointer');
  const uPointerAmt = gl.getUniformLocation(prog, 'uPointerAmt');
  const uPointerVel = gl.getUniformLocation(prog, 'uPointerVel');
  const uWake = gl.getUniformLocation(prog, 'uWake');
  const uDark = gl.getUniformLocation(prog, 'uDark');
  const uDarkTo = gl.getUniformLocation(prog, 'uDarkTo');
  const uSweep = gl.getUniformLocation(prog, 'uSweep');
  const uForm = gl.getUniformLocation(prog, 'uForm');
  const uSink = gl.getUniformLocation(prog, 'uSink');
  const uRipOn = gl.getUniformLocation(prog, 'uRipOn');
  const uRip = gl.getUniformLocation(prog, 'uRip[0]');
  const uLdir = gl.getUniformLocation(prog, 'uLdir');
  const uLhalf = gl.getUniformLocation(prog, 'uLhalf');
  const uContentHW = gl.getUniformLocation(prog, 'uContentHW');
  const uQuietTop = gl.getUniformLocation(prog, 'uQuietTop');
  const uNavY = gl.getUniformLocation(prog, 'uNavY');
  const uDisp = gl.getUniformLocation(prog, 'uDisp');
  const uRaw = gl.getUniformLocation(prog, 'uRaw');
  const uOScale = gl.getUniformLocation(prog, 'uOScale');
  const uOWarp = gl.getUniformLocation(prog, 'uOWarp');
  const uODrift = gl.getUniformLocation(prog, 'uODrift');
  const uON = gl.getUniformLocation(prog, 'uON');
  const grid = hero.querySelector<HTMLElement>('.hero__grid');
  const copyCol = grid?.firstElementChild as HTMLElement | null;
  const statCard = hero.querySelector<HTMLElement>('.statcard');

  /* ---- resolution ladder ----
     Two governors. A pixel budget caps total work; DPR alone is the wrong
     control at the top end, where a 5K panel at 2x asks for ~25M pixels a frame.
     Hard-edged line-work shows resolution loss far more readily than soft
     gradients do, and this field is almost nothing but hard line-work — the
     contours are the subject. The cap is set for them.
     ponytail: fixed steps, not a real adaptive controller. Ceiling: it only ever
     steps down, never recovers if the machine frees up. A rolling window that
     also steps back up is the upgrade if that ever shows. */
  /* Measured with a GPU timer query, not guessed: 2.094ms per megapixel on the
     machine this was built on. 2.01 / 3.69 / 5.01 MP came back at 2.095 / 2.094
     / 2.094, so it is linear in fill to within 0.05% and the budget is just the
     frame time divided by the rate — 16.7 / 2.094 = 7.9e6.

     That is UP from the smoke-and-wiring field's 4.4e6, and the reason is worth
     stating because it is counter-intuitive for a busier-looking picture: that
     shader spent four backward-advection samples times five routed runs on every
     fragment, and this one evaluates a single height field. Six noise
     evaluations (2 warp + 4 height) against its eleven-plus. The contours are
     cheap; it is the transport that was expensive.

     What the headroom buys, which is the whole point: a 1600x900 window on a 2x
     display now renders at a full 1:1 buffer where the previous field managed
     78%, a 4K panel at 1x lands at 98%, and a phone renders at its native 3x.
     Contour lines are the most resolution-sensitive content this canvas has ever
     carried, so the budget going up is a real gain in the thing that matters.

     Re-measure whenever the octave count, the warp, or the band density changes;
     those are the only terms that move this number. If a measurement ever forces
     a large cut, drop the height fbm to 3 octaves before dropping resolution.
     Losing an octave costs fine grain the contour lines are already carrying;
     losing resolution costs the lines themselves, which is the whole subject.

     Harness note: the reading is worthless unless the drawing buffer is
     allocated ONCE outside the timed batch. Resizing per draw put the three
     sizes 2x apart and destroyed the linearity the budget depends on. */
  const MAX_PIXELS = 7.9e6;
  const dpr = window.devicePixelRatio || 1;
  const STEPS = [...new Set([2, 1.5, 1, 0.75].map((s) => Math.min(dpr, s)))];
  let step = 0;

  function currentScale(): number {
    const cssW = canvas!.clientWidth || 1;
    const cssH = canvas!.clientHeight || 1;
    return Math.min(STEPS[step], Math.sqrt(MAX_PIXELS / (cssW * cssH)));
  }

  /* The field's composition guard is measured against the content column, which
     stops widening at --maxw while the frame keeps going. Read from layout
     rather than duplicating the token here, so it survives any change to --maxw
     or --pad-x. Once per resize, never per frame — getBoundingClientRect forces
     layout. */
  let contentHW = 1;
  let quietTop: [number, number] = [0.7, 0.55];
  let navY = 0.86;
  function measure(): void {
    const cssH = canvas!.clientHeight || 1;
    const w = grid ? grid.clientWidth : canvas!.clientWidth;
    contentHW = w / 2 / cssH;

    /* The nav damp strip's extent, like the quiet ceilings below: measured, not
       guessed. The nav is position:fixed and nothing ever transforms it, so its
       rect is safe to read — and because it is fixed, its viewport-relative
       bottom is also its position over the canvas at rest, when the hero is at
       the top of the page (the only time the nav is over the field at all). */
    const navEl = document.getElementById('nav');
    if (navEl) {
      const navBottom = navEl.getBoundingClientRect().bottom;
      const canvasTopRest = hero!.offsetTop + canvas!.offsetTop;
      navY = Math.min(1, Math.max(0.6, 1 - (navBottom - canvasTopRest) / cssH));
    }

    /* Expressed against the CANVAS box, not the hero's, and that is the point:
       the canvas is 124% of the hero height offset -12% under html.motion and
       plain inset:0 without it. Measuring against its own box makes the uniform
       correct in both without either being a special case, because uvy in the
       shader is exactly gl_FragCoord.y / uRes.y over this same box.

       Offsets rather than getBoundingClientRect, because reveal.ts scrubs a
       64px y transform onto .hero__grid across the hero's scroll-out. Rects
       include that, so a resize part-way down the page would measure the copy
       block 64px from where it rests and bake the wrong ceiling in. offsetTop
       is layout, not transform, so it reports the resting position always.
       Margin above each block so the guard covers the type rather than stopping
       at its cap height. */
    const gridTop = grid ? grid.offsetTop : 0;
    const canvasTop = canvas!.offsetTop;
    const topUvy = (el: HTMLElement | null, fallback: number): number =>
      el ? 1 - (gridTop + el.offsetTop - canvasTop) / cssH + 0.04 : fallback;
    quietTop = [topUvy(copyCol, 0.7), topUvy(statCard, 0.55)];
  }

  function resize(): void {
    const s = currentScale();
    const w = Math.max(1, Math.round(canvas!.clientWidth * s));
    const h = Math.max(1, Math.round(canvas!.clientHeight * s));
    if (canvas!.width === w && canvas!.height === h) return;
    canvas!.width = w;
    canvas!.height = h;
    gl!.viewport(0, 0, w, h);
    measure();
  }

  /* ---- teardown scaffolding ----
     Every listener this init() registers hangs off one AbortController and
     every observer lands in one list, so a lost context can strip the whole
     instance and webglcontextrestored can run a genuinely fresh init() —
     no doubled listeners, no ticker still drawing into a dead context. */
  const ac = new AbortController();
  const signal = ac.signal;
  const observers: Array<{ disconnect(): void }> = [];
  let stopTicker: () => void = () => {};
  const teardown = (): void => {
    stopTicker();
    for (const o of observers) o.disconnect();
    ac.abort();
    ocean?.dispose();
    canvas.classList.remove('is-live'); // the CSS gradient carries it
  };
  canvas.addEventListener(
    'webglcontextlost',
    (e) => {
      e.preventDefault();
      teardown();
    },
    { signal },
  );

  /* ---- theme, as a sweeping front ----
     One-directional: this file watches the attribute, theme.ts stays unaware of
     the canvas. A toggle expands a radial front from the toggle button — the
     incoming palette fills the inside — rather than lerping the whole frame.
     darkFrom/darkTo are the shader's uDark/uDarkTo; between sweeps they agree. */
  const root = document.documentElement;
  const isDark = (): number => (root.getAttribute('data-theme') === 'dark' ? 1 : 0);
  let darkFrom = isDark();
  let darkTo = darkFrom;
  const sweep = { on: false, t: 0, x: 0, y: 0, rmax: 2.5 };
  const SWEEP_S = 0.82; // a beat behind the 360ms CSS chrome fades, on purpose

  /* Client coords -> the shader's field coords. Against the CANVAS box, not the
     hero's: the canvas is the coordinate frame gl_FragCoord lives in (it bleeds
     124% for the parallax), and its rect includes the parallax transform, which
     is the visual truth a cursor or a tap lines up against. */
  const fieldXY = (cx: number, cy: number): [number, number] => {
    const r = canvas!.getBoundingClientRect();
    return [(cx - r.left - r.width / 2) / r.height, (r.height / 2 - (cy - r.top)) / r.height];
  };

  /* ---- ripple pool: three slots of (x, y, age s, amplitude), oldest recycled.
     The shader ages them via the z component; a slot dies when draw() sees its
     age pass RIP_LIFE and zeroes the amplitude. ---- */
  const rips = new Float32Array(12);
  let ripHead = 0;
  const RIP_LIFE = 2.6;
  const spawnRip = (cx: number, cy: number): void => {
    const [x, y] = fieldXY(cx, cy);
    const o = ripHead * 4;
    rips[o] = x; rips[o + 1] = y; rips[o + 2] = 0; rips[o + 3] = 0.13;
    ripHead = (ripHead + 1) % 3;
  };

  /* ---- pointer, spring-damped, with velocity for the wake ---- */
  const target = { x: 0, y: 0, amt: 0, vx: 0, vy: 0, wake: 0, sink: 0 };
  const eased = { x: 0, y: 0, amt: 0, vx: 0, vy: 0, wake: 0, sink: 0 };

  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && !reduceMotion) {
    let lastX = 0, lastY = 0, lastT = 0;
    const onMove = rafThrottle((e: PointerEvent) => {
      // Same normalisation the shader uses: y up, scaled by height.
      const [x, y] = fieldXY(e.clientX, e.clientY);
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
    hero.addEventListener('pointermove', onMove as EventListener, { passive: true, signal });
    hero.addEventListener('pointerleave', () => { target.amt = 0; target.wake = 0; }, { signal });
  }

  /* resize() only re-measures when the buffer changes size, which misses the one
     reflow that always happens: the webfont landing and re-laying-out the
     headline under it. One re-measure when fonts settle covers it. */
  document.fonts?.ready.then(measure);

  let time = 0;
  /* Formation clock. Reduced motion pre-seeds it complete; the animated path
     holds for 250ms while the is-live opacity fade lands (the empty sea and
     the CSS fallback gradient are the same picture, so nothing pops), then
     drains the sea over ~2.6s behind the CSS type entrance. */
  let formT = reduceMotion ? 1 : 0;
  let formWait = 250;

  function draw(dt: number): void {
    resize();
    /* The simulation runs first and leaves its own program bound, its own
       viewport set and its FBO detached — step() restores the framebuffer and
       viewport, but the program is ours to take back. Cheaper than having
       oceanfft save and restore state it cannot know the shape of. */
    if (ocean) {
      ocean.step(time * tune.time);
      gl!.useProgram(prog!);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, ocean.texDisp);
      gl!.activeTexture(gl!.TEXTURE1);
      gl!.bindTexture(gl!.TEXTURE_2D, ocean.texRaw);
      gl!.uniform1i(uDisp, 0);
      gl!.uniform1i(uRaw, 1);
      gl!.uniform1f(uOScale, tune.scale);
      // Scaled by the ocean's own 1/sigma, so retuning the wind or the patch
      // size does not silently rescale the warp along with the height.
      gl!.uniform1f(uOWarp, ocean.norm * tune.warp);
      gl!.uniform2f(uODrift, time * tune.drift, time * tune.drift * 0.4);
      gl!.uniform1f(uON, ocean.n);
    }
    // Lerp rather than snap — the same trailing feel as the magnetic buttons.
    const k = Math.min(1, dt * 0.006);
    eased.x += (target.x - eased.x) * k;
    eased.y += (target.y - eased.y) * k;
    eased.amt += (target.amt - eased.amt) * Math.min(1, dt * 0.004);
    eased.vx += (target.vx - eased.vx) * Math.min(1, dt * 0.012);
    eased.vy += (target.vy - eased.vy) * Math.min(1, dt * 0.012);
    eased.wake += (target.wake - eased.wake) * Math.min(1, dt * 0.010);
    // The submergence trails the scrub slightly so the sea has weight; the
    // 1.35 power at upload holds the landmass through the first stretch of
    // scroll and lets the sink accelerate once leaving is clearly the intent.
    target.sink = getHeroScroll();
    eased.sink += (target.sink - eased.sink) * Math.min(1, dt * 0.012);
    // The wake decays on its own, so a cursor that stops leaves a trail that
    // settles rather than a displacement that sticks.
    const decay = Math.pow(0.9955, dt);
    target.wake *= decay;
    target.vx *= decay;
    target.vy *= decay;

    // Formation: smoothstep-eased — a gentle first beat under the opacity
    // fade, the sweeping drain through the middle, a soft settle.
    if (formWait > 0) formWait -= dt;
    else if (formT < 1) formT = Math.min(1, formT + dt / 2600);
    const form = formT * formT * (3 - 2 * formT);

    // Theme front. Idle keeps the radius past rmax, so the whole frame reads
    // the incoming value — which equals the settled one between sweeps.
    let sweepR = sweep.rmax + 1;
    if (sweep.on) {
      sweep.t += dt / 1000;
      const sp = Math.min(1, sweep.t / SWEEP_S);
      const se = 1 - (1 - sp) * (1 - sp); // fast off the toggle, easing wide
      sweepR = -0.5 + (sweep.rmax + 0.5) * se;
      if (sp >= 1) { sweep.on = false; darkFrom = darkTo; }
    }

    // Age the ripples; a slot past its life zeroes out and frees the gate.
    let ripOn = 0;
    for (let i = 0; i < 3; i++) {
      const o = i * 4;
      if (rips[o + 3] > 0) {
        rips[o + 2] += dt / 1000;
        if (rips[o + 2] > RIP_LIFE) rips[o + 3] = 0;
        else ripOn = 1;
      }
    }

    // Living light: ±4 degrees about the vertical axis over ~26s. Rotating
    // BOTH the light and its half vector by the same angle keeps the pair
    // geometrically consistent, and time = 0 reproduces the old constants
    // exactly — which is what the reduced-motion frame renders.
    const th = 0.07 * Math.sin(time * 0.2417);
    const cs = Math.cos(th), sn = Math.sin(th);

    gl!.uniform2f(uRes, canvas!.width, canvas!.height);
    gl!.uniform1f(uTime, time);
    gl!.uniform2f(uPointer, eased.x, eased.y);
    gl!.uniform1f(uPointerAmt, eased.amt);
    gl!.uniform2f(uPointerVel, eased.vx, eased.vy);
    gl!.uniform1f(uWake, eased.wake);
    gl!.uniform1f(uDark, darkFrom);
    gl!.uniform1f(uDarkTo, darkTo);
    gl!.uniform3f(uSweep, sweep.x, sweep.y, sweepR);
    gl!.uniform1f(uForm, form);
    gl!.uniform1f(uSink, Math.pow(eased.sink, 1.35));
    gl!.uniform1f(uRipOn, ripOn);
    gl!.uniform4fv(uRip, rips);
    gl!.uniform3f(uLdir, -0.5620 * cs - 0.6484 * sn, -0.5620 * sn + 0.6484 * cs, 0.5133);
    gl!.uniform3f(uLhalf, -0.3517 * cs - 0.4058 * sn, -0.3517 * sn + 0.4058 * cs, 0.8437);
    gl!.uniform1f(uContentHW, contentHW);
    gl!.uniform2f(uQuietTop, quietTop[0], quietTop[1]);
    gl!.uniform1f(uNavY, navY);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
  }

  /* ---- static path: one frame, no ticker, no clock ---- */
  if (reduceMotion) {
    const still = (): void => {
      // No ticker to sweep on, so the theme snaps. formT is pre-seeded to 1,
      // so the one frame is the COMPLETE landscape, never a half-formed one.
      darkFrom = darkTo = isDark();
      draw(0);
    };
    measure();
    still();
    canvas.classList.add('is-live');
    // Observe the element, not the window: the canvas is 124%-height inside a
    // 100vh hero, so it changes size for reasons a resize event never reports.
    const ro = new ResizeObserver(still);
    ro.observe(canvas);
    const mo = new MutationObserver(still);
    mo.observe(root, { attributeFilter: ['data-theme'] });
    observers.push(ro, mo);
    return teardown;
  }

  /* A toggle while the ticker runs starts the sweep from the toggle button; a
     toggle while it is stopped (hero off-screen, tab hidden) snaps instead, so
     the field is never caught mid-front when it scrolls back into view. */
  const themeMo = new MutationObserver(() => {
    const to = isDark();
    if (to === darkTo) return; // attribute rewritten with the same value
    darkFrom = darkTo;         // a rapid re-toggle completes the old front instantly
    darkTo = to;
    if (!running) {
      darkFrom = to;
      return;
    }
    const toggle = document.getElementById('modeToggle');
    const r = canvas!.getBoundingClientRect();
    if (toggle) {
      const b = toggle.getBoundingClientRect();
      [sweep.x, sweep.y] = fieldXY(b.left + b.width / 2, b.top + b.height / 2);
    } else {
      // No toggle to be found — sweep from the top right, where it lives.
      sweep.x = 0.45 * (r.width / r.height);
      sweep.y = 0.45;
    }
    // Far enough to carry the soft edge past the frame's farthest corner.
    const hw = (0.5 * r.width) / r.height;
    sweep.rmax = Math.hypot(hw + Math.abs(sweep.x), 0.5 + Math.abs(sweep.y)) + 0.45;
    sweep.t = 0;
    sweep.on = true;
  });
  themeMo.observe(root, { attributeFilter: ['data-theme'] });
  observers.push(themeMo);

  /* ---- ripples: press with a mouse or pen, TAP on touch ----
     pointerdown on a touch screen fires at the start of every scroll flick, so
     touch waits for a pointerup that stayed put — a real tap. Deliberately NOT
     gated on the fine-pointer media query: this is the one field interaction
     phones get. */
  let tapX = 0, tapY = 0, tapT = -1e4;
  hero.addEventListener(
    'pointerdown',
    (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        tapX = e.clientX; tapY = e.clientY; tapT = performance.now();
      } else {
        spawnRip(e.clientX, e.clientY);
      }
    },
    { passive: true, signal },
  );
  hero.addEventListener(
    'pointerup',
    (e: PointerEvent) => {
      if (
        e.pointerType === 'touch' &&
        performance.now() - tapT < 350 &&
        Math.hypot(e.clientX - tapX, e.clientY - tapY) < 12
      ) {
        spawnRip(e.clientX, e.clientY);
      }
    },
    { passive: true, signal },
  );

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
  stopTicker = (): void => run(false);

  // No GPU work for a hero nobody is looking at.
  const io = new IntersectionObserver(([e]) => run(e.isIntersecting && !document.hidden));
  io.observe(hero);
  observers.push(io);
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) run(false);
    },
    { signal },
  );

  /* Explicit rather than relying on resize(): a re-init after a restored
     context finds the canvas already at the right buffer size, so resize()
     early-returns and would leave the composition guards at their defaults. */
  measure();
  draw(0);
  canvas.classList.add('is-live');
  run(true);
  return teardown;
}

/* ---- mounting ----
   init() is handed its elements rather than reading the document, which is what
   lets the variant lab mount the REAL renderer instead of a look-alike — so the
   variant chosen there is the variant that ships, guards and contrast included.
   Production mounts exactly one, on the page's single hero. */
export function mountHeroField(
  canvas: HTMLCanvasElement,
  hero: HTMLElement,
  variant: number = DEFAULT_VARIANT,
): () => void {
  let destroy = init(canvas, hero, variant);
  /* A restored context re-runs init() from scratch. The lost-context handler
     inside init() stripped the old instance's listeners, observers, ticker and
     GPU objects, so this is a clean second boot, not a doubling. */
  const onRestore = (): void => {
    destroy = init(canvas, hero, variant);
  };
  canvas.addEventListener('webglcontextrestored', onRestore);
  return () => {
    canvas.removeEventListener('webglcontextrestored', onRestore);
    destroy?.();
  };
}

/* No auto-mount on import any more, and that matters: reveal.ts imports
   the hero's scroll progress, and a side effect here would claim the hero
   canvas the moment anything imported this file — regardless of whether the
   WebGPU ocean had already taken it. heroocean.ts owns the decision and calls
   this. */
export function mountDefaultHeroField(): (() => void) | undefined {
  const c = document.querySelector<HTMLCanvasElement>('canvas.hero__slot');
  const h = document.querySelector<HTMLElement>('.hero');
  if (!c || !h || c.dataset.heroMounted !== undefined) return undefined;
  c.dataset.heroMounted = 'webgl2';
  return mountHeroField(c, h);
}
