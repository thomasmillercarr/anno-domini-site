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
 * Digital smoke drifting through wiring. A bus of hard routed traces crosses the
 * upper half of the frame; smoke sheds off them and rises, railing along a trace
 * where it runs close to one and tearing loose where the trace kinks.
 *
 *   1. A BUS of five routed runs, each a mostly-horizontal staircase with two 45
 *      degree steps. Charge travels each run leftward on its own phase, and each
 *      run terminates at its own x — the lower ones soonest, so the cascade opens
 *      out and leaves the headline's corner clear.
 *   2. A DIVERGENCE-FREE VELOCITY FIELD from a stream function: v = rot90(grad
 *      psi). Divergence-free is not decoration — a field with sinks piles smoke
 *      into blobs, and blobs are what makes procedural smoke look like fog.
 *   3. SMOKE BY BACKWARD ADVECTION. From each fragment, walk backwards along that
 *      velocity and ask what was there. The density source is the bus itself, so
 *      the smoke is not an independent layer that happens to sit near the wiring:
 *      it is the wiring, transported. A fragment high above the bus backtracks
 *      down into it and picks up density, which is where the plumes come from.
 *   4. The velocity is BENT TOWARD A RUN near one, so flow rails along a trace.
 *      At a 45 degree kink the alignment turns faster than the advection path
 *      does, and the smoke tears off — the shed at the junctions is not authored,
 *      it falls out of the coupling.
 *   5. The pointer injects a vortex and a push into the same field, and energises
 *      the charge on whichever run it is near, downstream only.
 *
 * ---- why the advection is shaped this way ----
 *
 * Real iterated advection is impossible here and there is no point pretending
 * otherwise: it needs state carried between frames, so a feedback texture, a
 * second target and a second program. The one-pass substitute is to walk
 * backwards through an ANALYTIC field per fragment.
 *
 * The naive form of that re-evaluates the velocity at every step, which is three
 * taps of an fbm per step and puts this shader at roughly twice the cost of the
 * terrain it replaces — straight into the resolution ladder, which is the blur
 * this whole file exists to avoid. So the velocity is evaluated ONCE and then
 * rotated and shrunk analytically along the path: a logarithmic spiral arc. The
 * streaks curve, which is the part that reads as advected, and the field costs
 * one evaluation. Do not "improve" this by sampling the flow per step without
 * re-measuring; it is the single largest term in the frame.
 *
 * ---- one pass ----
 *
 * Bloom was the only reason this ever had five passes, two HDR ping-pong targets
 * and a float-extension branch. Without it, everything is a single fullscreen
 * quad, and the tonemap and grain happen inline at the end. Accumulation is still
 * in linear light: doing it in gamma space is what makes bright areas go chalky
 * grey instead of hot, and that is a physical error, not a taste.
 *
 * ---- behaviour ----
 *
 *   - Runs off gsap.ticker, which scroll.ts already drives in lockstep with
 *     Lenis. One clock for the page — a second rAF loop is what makes canvas
 *     work feel detached from smooth scroll.
 *   - The pointer bends the field and drags a short wake behind it. All input is
 *     lerped, never applied raw.
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

   PHOSPHOR is the trace colour: an amber between --timber and --accent-warm,
   deliberately NOT the near-white of --on-img so the wiring never competes with
   the headline over it. SMOKE is dimmer again and more desaturated, and its
   ceiling is the number that decides the type contrast — the headline sits on
   whatever the smoke leaves behind. */
const vec3 GROUND_L = vec3(0.0094, 0.0066, 0.0040); /* #1A1611 */
const vec3 LIFT_L   = vec3(0.0330, 0.0250, 0.0165); /* #302820, top of frame  */
const vec3 PHOS_L   = vec3(0.8126, 0.4884, 0.2120); /* #E8B87E, the trace tone */
const vec3 SMOKE_L  = vec3(0.0420, 0.0320, 0.0212); /* dim desaturated warm    */

/* ---- the bus ----
   Five runs. RY is where a run starts at the left, RK packs its two 45 degree
   steps as (x1, dy1, x2, dy2) with x as a fraction of the half-width, so the
   routing rescales with the frame instead of walking off the side of a phone.
   Every step is positive, so a run climbs to the right — read right to left, the
   way the charge travels, they descend.

   The band sits in the upper half on purpose. The headline is a column in the
   lower left and the statcard is a panel in the lower right; putting the sources
   above both of them means the bottom of the frame is quiet by construction
   rather than by clawing density back with the contrast guard. */
const int RUNS = 5;
const float RY[5] = float[5](0.055, 0.130, 0.205, 0.285, 0.360);
const vec4  RK[5] = vec4[5](
  vec4(-0.34, 0.055,  0.46, 0.040),
  vec4( 0.12, 0.048, -0.62, 0.032),
  vec4(-0.06, 0.052,  0.68, 0.045),
  vec4( 0.52, 0.040, -0.28, 0.050),
  vec4( 0.30, 0.046, -0.70, 0.038)
);

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

/* Value noise with a quintic fade — C2, so its gradient is C1.
 *
 * Every previous version of this file used a piecewise-LINEAR triangular
 * lattice, deliberately unsmoothed, because a planar field has straight
 * iso-lines and straight iso-lines are what made the terrain and the weave look
 * faceted rather than rounded. That virtue does not survive the change of
 * subject, and the reason is worth writing down because it looks like a
 * regression otherwise:
 *
 *   - A piecewise-linear field has a piecewise-CONSTANT gradient. Used as a
 *     stream function it gives every fragment inside a lattice triangle the
 *     identical velocity, so they all backtrack along the same vector and stamp
 *     the source in the same place. The frame fills with flat-shaded polygons
 *     with hard straight edges. This was tried; it is unmistakable.
 *   - Rendered as a level set rather than as iso-lines, a planar field IS a flat
 *     polygon. The faceting was never visible as facets before because nothing
 *     ever drew its levels.
 *
 * So the lattice noise is gone, and the crease it used to provide comes from the
 * ridged transform below instead, which puts sharp creases on the zero set of a
 * smooth field rather than on the edges of a lattice.
 */
float vnoise(vec2 p) {
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/* Value AND its exact gradient, as (value, d/dx, d/dy).
 *
 * The stream function needs a gradient, and the obvious way to get one is three
 * taps of the fbm and two subtractions. That is 3x the noise for a derivative
 * that is only approximate. Value noise on a lattice is a bilinear form in the
 * faded coordinates, so its derivative is closed-form: the same four corner
 * hashes, plus the derivative of the quintic, for about a third more work than
 * the value alone. Measured, the flow term was 6 noise evaluations a fragment
 * and is now 2 — and the gradient is exact rather than epsilon-limited. */
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
   axis-aligned rectangles across the frame. The ridged transform below makes
   that far worse, because it turns the lattice's gentle bias into a crease.
   One rotation per octave decorrelates them and it is free. */
const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);

/* Ridged fbm. 1 - |2n| peaks on the zero set of the noise, which is a curve, so
   squaring it leaves thin sharp filaments rather than blobs — the crease the
   faceted lattice used to give, on a field smooth enough to differentiate. */
float fbmR(vec2 p, int oct) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < oct; i++) {
    float n = 1.0 - abs(vnoise(p) * 2.0);
    s += a * n * n;
    p = ROT * p * 2.11; a *= 0.5;
  }
  return s;
}

/* The centreline of one run at x, plus its slope.
 *
 * Two clamped ramps, each of width |dy| so the connector is exactly 45 degrees
 * on screen — the field coordinates are isotropic, both axes divided by the
 * canvas height, so equal run and rise really is 45 and not merely close.
 *
 * The slope comes back because the perpendicular distance to a line of gradient
 * m is the vertical distance over sqrt(1 + m*m). Skip that and the diagonal
 * connectors draw sqrt(2) times too thick, which is exactly the join that is
 * meant to look machined. */
/* The centreline alone. busNear calls this twenty times a fragment and never
   looks at the slope, and the slope is four smoothsteps — worth about a fifth of
   the frame on its own if the compiler does not manage to eliminate it, which is
   not a thing to leave to the compiler at this call count. */
float runMid(float x, int i, float hw) {
  vec4 k = RK[i];
  k.yw *= clamp(hw / 0.889, 0.55, 1.0);
  return RY[i]
       + k.y * clamp((x - k.x * hw) / abs(k.y), 0.0, 1.0)
       + k.w * clamp((x - k.z * hw) / abs(k.w), 0.0, 1.0);
}

float runY(float x, int i, float hw, out float slope) {
  vec4 k = RK[i];
  /* The step HEIGHTS rescale with the frame too, not just the kink positions.
     Leave them absolute and a portrait frame routes the same climb over a third
     of the horizontal distance, so the bus stops reading as a bus and starts
     reading as a zigzag — the connectors dominate and the flat runs between them
     nearly vanish. Authored against a 16:9 half-width, floored so the steps do
     not disappear entirely. */
  k.yw *= clamp(hw / 0.889, 0.55, 1.0);
  float w1 = abs(k.y), w2 = abs(k.w);
  float x1 = k.x * hw, x2 = k.z * hw;
  float t1 = clamp((x - x1) / w1, 0.0, 1.0);
  float t2 = clamp((x - x2) / w2, 0.0, 1.0);
  /* The slope has to ramp on and off SMOOTHLY, over most of the ramp, not
     switch at its ends. It feeds 1/sqrt(1+m*m), so a switch moves the distance
     metric by 30% within a fragment or two — and anything derived from it is
     evaluated all along an advection path, so a step there draws a hard vertical
     seam down the entire height of the frame at every kink. Five runs, four ramp
     ends each, and the frame is barred like a cage. Ramping over a third of the
     ramp on each side rounds the join at a scale below the trace width and the
     seams go. */
  slope = sign(k.y) * (smoothstep(0.0, 0.35, t1) - smoothstep(0.65, 1.0, t1))
        + sign(k.w) * (smoothstep(0.0, 0.35, t2) - smoothstep(0.65, 1.0, t2));
  return RY[i] + k.y * t1 + k.w * t2;
}

/* How close q is to the bus, as a smoke source.
 *
 * This is the density field the advection samples, and it is the whole reason
 * the smoke and the wiring read as one thing: there is no independent smoke
 * field. What drifts through the frame is this, transported.
 *
 * The sheath is TIGHT — about a thirtieth of the frame height. A wide one needs
 * no transport to be visible, so it just sits there as a band around the wires
 * and the whole exercise collapses into a fog card. Tight means the only way
 * smoke reaches the top of the frame is by being carried there. */
float busNear(vec2 q, float hw, float lift, float k, float t) {
  float m = 0.0;
  for (int i = 0; i < RUNS; i++) {
    /* A run does not smoke evenly along its length. An even source is a curtain
       — it was one, and it draped over the whole upper half and buried the
       wiring behind it. It smokes WHERE THE CHARGE IS, on the same phase the
       trace draws its pulse from, one term behind so the plume trails the pulse
       rather than sitting on it. Nothing new is evaluated for this: it is the
       charge, read a second time. */
    float emit = 0.22 + 0.95 * smoothstep(0.30, 1.0,
      sin((hw - q.x) * 5.6 - t * 0.85 + float(i) * 2.3 - 0.9) * 0.5 + 0.5);
    /* Vertical distance, NOT perpendicular distance. Correcting for the slope
       would make the sheath sqrt(2) times narrower over the 45 degree segments,
       which is invisible on something this soft — and it would drag the slope
       term, and every discontinuity in it, into a quantity that is evaluated at
       four points along an advection path. The trace itself is drawn with the
       correction because there a 40% width error is the whole difference between
       a machined join and a fat one. */
    float d = q.y - (runMid(q.x, i, hw) + lift);
    m = max(m, exp(-d * d * k) * emit);
  }
  return m;
}

/* Divergence-free velocity from a stream function. v = (dpsi/dy, -dpsi/dx) has
   zero divergence identically, so the flow has no sinks for smoke to pile into —
   which is the difference between drifting sheets and a field of soft blobs.
   Two octaves, exact gradients, evaluated ONCE per fragment. */
const float FS = 1.62;
vec2 flow(vec2 q, float t) {
  vec2  w = q * FS + vec2(t * 0.021, -t * 0.013);
  vec2  g = vec2(0.0);
  mat2  m = mat2(1.0);   // accumulated domain transform, for the chain rule
  vec2  pp = w;
  float a = 0.5;
  for (int i = 0; i < 2; i++) {
    vec3 n = vnoiseD(pp);
    // Each octave is read at m*w, so its contribution to d/dw is (dn/dpp) * m.
    g += a * (n.yz * m);
    m  = 2.07 * ROT * m;
    pp = 2.07 * ROT * pp;
    a *= 0.5;
  }
  g *= FS;               // and w = q * FS
  return vec2(g.y, -g.x);
}

/* Highlight-only shoulder. Identity below K, then a smooth C1 roll to 1.0.
   Deliberately NOT ACES: ACES desaturates and pulls midtones down, and the
   midtones here are what the type contrast is measured against. */
const float K = 0.55;
vec3 tone(vec3 x) {
  vec3 s = vec3(K) + (1.0 - K) * (1.0 - exp(-(x - K) / (1.0 - K)));
  return mix(x, s, step(vec3(K), x));
}

void main() {
  float hw  = 0.5 * uRes.x / uRes.y;
  float t   = uTime;
  vec2  p   = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float uvy = gl_FragCoord.y / uRes.y;

  /* A portrait frame is a different composition, not a cropped one: the copy
     stops being a column and spans the width, and the statcard drops below it
     rather than sitting beside it, so both take far more of the height. The bus
     lifts out of the way rather than the guard fighting it afterwards. */
  float narrow = 1.0 - smoothstep(0.55, 0.80, hw);
  float lift   = 0.10 * narrow;

  /* ---- pointer, as a disturbance in the flow ----
     A vortex plus a push along the recent travel. Both are added to the velocity
     rather than to the density, so the cursor moves smoke that is already there
     instead of painting new smoke — which is the difference between parting it
     and drawing on it. */
  /* Gated on the uniform, not on anything per-fragment. uPointerAmt is the same
     for every fragment in the draw, so this is uniform control flow and the
     whole block is skipped for free — which is the common case on a desktop and
     the only case on a phone, where there is no fine pointer at all. It takes
     four exp calls and a normalize out of every fragment when nothing is
     hovering. */
  bool  hover = uPointerAmt > 0.002;
  vec2  swirl = vec2(0.0);
  vec2  push  = vec2(0.0);
  if (hover) {
    vec2  pd  = p - uPointer;
    float pr2 = dot(pd, pd);
    swirl = vec2(-pd.y, pd.x) * exp(-pr2 * 11.0) * uPointerAmt * 2.6;
    push  = uPointerVel * exp(-pr2 * 14.0) * uWake * 0.55;
  }

  /* ---- velocity at this fragment ---- */
  /* The turbulent term has to be COMPARABLE to the drift, not a perturbation on
     it. Scaled down to a tenth it averages out over the length of an advection
     path and every fragment ends up backtracking along nearly the same vector,
     which draws the source once, softly, everywhere — a wash. At parity the
     paths diverge and the plumes acquire shape. */
  vec2 v = flow(p, t) * 0.52 + vec2(-0.24, 0.33) + swirl + push;

  /* ---- one walk over the runs ----
     The flow alignment, the drawn trace and the sheath the smoke starts from all
     want the same five centrelines at the same x. Computed in three separate
     loops that is fifteen evaluations of the routing per fragment for five
     distinct answers, and the routing is the second largest term in the frame
     after the noise. One loop, kept.

     Bending the flow toward a nearby run is the coupling. The alignment falls
     off over about a tenth of the frame height, so a fragment near a trace
     inherits that trace's direction and one between two traces is back on the
     open field. */
  float aW = 0.0;
  vec2  aD = vec2(0.0);
  float trace = 0.0;
  float wTrace = max(0.9, 0.0016 * uRes.y);

  for (int i = 0; i < RUNS; i++) {
    float sl;
    float ry = runY(p.x, i, hw, sl) + lift;
    float inv = inversesqrt(1.0 + sl * sl);
    float da  = (p.y - ry) * inv;

    float w = exp(-da * da * 90.0);
    // Charge runs leftward, so the tangent points that way too.
    aD += normalize(vec2(-1.0, -sl)) * w;
    aW += w;

    /* Junction pads. The kink is where the routing does something, so it is
       where a real board puts copper — and it doubles as the visual cue for the
       point the smoke tears off. */
    vec4 k = RK[i];
    float a1 = (p.x - k.x * hw) * 26.0;
    float a2 = (p.x - k.z * hw) * 26.0;
    float pad = exp(-a1 * a1) + exp(-a2 * a2);
    float ww = wTrace * (1.0 + 1.5 * pad);
    float m  = 1.0 - smoothstep(ww - 0.6, ww + 0.6, abs(da) * uRes.y);

    /* Each run ends at its own x. The lower runs stop soonest, so the bus opens
       out toward the left and the headline's corner is the emptiest part of the
       frame. */
    float endx = (-0.90 + 0.16 * float(4 - i)) * hw;
    m *= smoothstep(endx, endx + 0.22, p.x);

    /* Charge, travelling left, each run on its own phase. */
    float ph = (hw - p.x) * 5.6 - t * 0.85 + float(i) * 2.3;
    float pulse = smoothstep(0.55, 1.0, sin(ph) * 0.5 + 0.5);

    float ener = 0.0;
    if (hover) {
      /* The pointer energises the run it is nearest, and only downstream of
         itself — the tail is six times longer to the left than to the right, so
         the brightening reads as charge running away from the cursor rather than
         as a lamp switched on under it. */
      float du = p.x - uPointer.x;
      float dyp = uPointer.y - ry;
      ener = uPointerAmt * exp(-dyp * dyp * 70.0)
           * exp(-du * du * (du > 0.0 ? 55.0 : 9.0));
    }

    trace += m * (0.26 + 0.85 * pulse * pulse + 1.10 * ener);
  }
  trace = min(trace, 2.2);

  aW = clamp(aW, 0.0, 1.0);
  if (aW > 0.002) v = mix(v, normalize(aD) * (0.62 + 0.5 * aW), aW * 0.72);

  /* ---- backward advection ----
     Walk back along the velocity, turning it a little and shrinking it each step
     so the path is an arc rather than a straight smear, and ACCUMULATE the
     source along the way.

     The accumulation is the part that matters. Sampling the source at one
     backtracked point gives a displaced copy of the source, which is not a
     trail — it is the same shape somewhere else. A trail is the integral of the
     source along the path, so every step contributes and the weight decays
     behind. That single difference is what turns a band around the wires into
     something that streams off them. */
  const float STEP   = 0.255;
  const float THETA  = 0.21;
  const float SHRINK = 0.92;
  float cs = cos(THETA), sn = sin(THETA);

  /* The path starts AT the fragment. Without that first sample the nearest
     smoke to a wire is one whole step downwind of it, so the wires come out
     scrubbed clean with the smoke hanging off to one side — two things again,
     which is the failure this direction exists to avoid. The zeroth sample is
     the sheath still attached to the trace and the rest is what has left it.

     The sheath WIDENS along the path, and that is doing two jobs. Physically it
     is diffusion: smoke that left the wire a while ago has spread. Practically
     it is what keeps the trail continuous — the steps are far enough apart to
     reach the top of the frame in four samples, which is much further than the
     sheath is wide, so a constant width would draw the plume as a string of
     separate beads. Widen it and consecutive samples overlap into one taper. */
  vec2  q = p, vv = v;
  float wid = 620.0, wgt = 1.0;
  float smoke = busNear(q, hw, lift, wid, t);
  for (int i = 0; i < 3; i++) {
    q -= vv * STEP;
    vv = vec2(vv.x * cs - vv.y * sn, vv.x * sn + vv.y * cs) * SHRINK;
    wgt *= 0.74;
    wid *= 0.42;
    smoke += wgt * busNear(q, hw, lift, wid, t);
  }
  smoke *= 0.50;

  /* The carve is what makes it wisps rather than a plume.
     It is sampled at the FAR end of the advection path, not at the fragment, so
     neighbouring fragments read it at points that the flow has pulled apart —
     the noise stretches along the streamlines by itself and never needs a
     direction of its own. Three octaves, on the same faceted lattice, so the
     strands crease rather than curve.
     High contrast on purpose: a gentle multiply modulates smoke, it does not
     cut it into strands, and modulated smoke is fog. */
  const float F2 = 3.4;
  float nz    = fbmR(q * F2 + vec2(t * 0.03, -t * 0.012), 3);
  float carve = smoothstep(0.34, 0.78, nz);
  smoke *= 0.10 + 1.65 * carve;

  /* Smoke that left the bus earlier than the path reaches back. The advection
     covers about a third of the frame height, and a plume that stops there reads
     as a fringe on the wires rather than as something filling the frame. So the
     bus also smears analytically: slow decay upward, fast decay downward,
     because smoke rises and because the bottom of the frame is where the type
     is. Same source, same carve, longer memory — not a second layer, and kept
     well under the advected term so it can never become the thing you see. */
  float above = p.y - (0.20 + lift);
  float haze  = exp(-max(above, 0.0) * 1.7) * exp(-max(-above, 0.0) * 9.0);
  smoke += 0.10 * haze * carve;

  /* Haze the extremes so the field has no visible edge, measured against the
     actual half-width so an ultrawide fades at its own edges. */
  float edge = smoothstep(1.02, 0.60, abs(p.x) / hw);
  smoke *= edge;
  trace *= edge;

  /* ---- contrast guard ----
     The headline, sub-label and CTA are light type over this, under .hero__veil.
     The composition already keeps the sources above them, so this is gentler
     than the terrain needed — but it is not gone, because the flow is free to
     wander down there and the guard is what stops one stray plume from taking a
     line of the headline with it. Both extents are aspect-aware, and the
     vertical one matters most: the copy is a column in the lower left of a
     landscape frame and nearly the whole of a portrait one. */
  float guard = 1.0 - 0.55
    * mix(1.0 - smoothstep(-0.50, 0.55, p.x / hw), 1.0, narrow)
    * (1.0 - smoothstep(0.06, mix(0.62, 0.96, narrow), uvy));

  smoke = clamp(smoke, 0.0, 1.0) * guard * mix(1.0, 0.82, narrow);
  trace *= guard;

  /* ---- assemble, in linear ---- */
  vec3 col = mix(GROUND_L, LIFT_L, smoothstep(-0.05, 1.05, uvy));
  col += SMOKE_L * smoke;
  col += PHOS_L * trace * 0.55;

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
     gradients do, and this field has both: the traces care about every pixel,
     the smoke would not notice half of them. The cap is set for the traces.
     ponytail: fixed steps, not a real adaptive controller. Ceiling: it only ever
     steps down, never recovers if the machine frees up. A rolling window that
     also steps back up is the upgrade if that ever shows. */
  /* Measured with a GPU timer query, not guessed: 3.795ms per megapixel on the
     machine this was built on (2.01 / 3.69 / 5.01 MP all landed within 0.1%, so
     it is genuinely linear in fill), which makes 4.4e6 the largest buffer that
     still fits a 16.7ms frame. That is DOWN from the ASCII terrain's 5.5e6 and
     it is a real cost, stated rather than buried: a 1600x900 window on a 2x
     display renders at about 78% where the terrain managed 88%, and a 3440-wide
     ultrawide at 85% where the terrain managed 95%. A 1x desktop and a phone
     both still render 1:1. Advection is simply more expensive than a mark grid.

     What the 4.4e6 already reflects, so nobody re-treads it:
       - The stream function's gradient is analytic, not three finite-difference
         taps of an fbm. That alone took 4.42 -> 3.72; it is the one optimisation
         here that paid, and it improved the field as well as the cost.
       - Three things that looked obvious and measured at zero or worse, all
         re-checked with the timer: splitting the dead slope out of the routing
         (the compiler was already eliminating it), merging the three per-run
         loops into one, and a uniform branch around the pointer terms. GPU
         intuition about ALU count is not worth much here; the noise is 40% of
         the frame and almost nothing else registers.
       - A 3-sigma early-out inside busNear made it 5% SLOWER — the branch costs
         more than the exp it skips once it defeats the loop unrolling.
       - Two cuts that did pay in time and were rejected on looks: three
         advection samples instead of four (15% faster, visibly beaded, the
         plumes read as repeated stamps) and a sin-based hash (9% faster,
         directional streaking that turns the wisps glassy and vertical).

     Re-measure whenever the advection sample count or the noise changes; those
     are the only two terms that have ever moved this number. */
  const MAX_PIXELS = 4.4e6;
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
