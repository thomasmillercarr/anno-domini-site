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
 * An ASCII terrain: a layered mountain silhouette rendered as marks on a
 * character grid, on a two-tone terminal palette.
 *
 *   1. A CHARACTER GRID with a constant row count. Everything that decides what
 *      to draw is evaluated at the CELL CENTRE, never at the fragment, and that
 *      single substitution is what makes this read as character art rather than
 *      as a topographic map. Constant rows rather than a constant cell size in
 *      pixels means a larger display draws the same composition more sharply
 *      instead of drawing more and smaller marks, which is the whole point here.
 *   2. FOUR DEPTH RANGES. Each skyline comes from the same piecewise-LINEAR
 *      triangular-lattice noise the flow does, so the silhouette is faceted; the
 *      nearest range whose skyline sits above a cell claims it, and that early
 *      exit is the occlusion. Ranges further back sit higher, flatter, fainter.
 *      A cell above every skyline is sky.
 *   3. ONE MARK PER CELL: a capsule in cell-local device pixels, oriented along
 *      the flow and quantised to a handful of angles. Its length carries the
 *      local density, and at length zero it degenerates to the empty-cell dot —
 *      one primitive for the whole vocabulary, no branch, no threshold.
 *   4. Light travels the field. Each cell hashes its own brightness on a cubic
 *      tail and its own pulse phase, and each range is offset so the wave never
 *      sweeps all four in unison.
 *   5. Nodes are radial fans the marks turn to follow. They are drawn, never
 *      lit — there is no bloom anywhere in this shader.
 *
 * Oriented marks cannot close into a loop, and that lifts the constraint which
 * shaped every earlier version of this file: an extremum in a coordinate whose
 * iso-lines you draw IS a closed contour, so node strength had to stay tiny and
 * the anisotropy enormous to keep rings out of the frame. Nothing draws a scalar
 * field any more, so the fans can be as strong as the reference shows and the
 * flow is free to swirl.
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

const float PI = 3.14159265;

/* Palette, LINEAR — the sRGB values in the comments are the authored colours,
   these are those raised to 2.2. Every mix below happens in linear light, so
   never paste sRGB values in here.

   Two tones and almost nothing between them. GROUND is a near-flat dark warm,
   PHOSPHOR is the single mark colour: an amber sitting between --timber and
   --accent-warm, deliberately NOT the near-white of --on-img so the marks never
   compete with the headline sitting on top of them. */
const vec3 GROUND_L = vec3(0.0094, 0.0066, 0.0040); /* #1A1611 */
const vec3 LIFT_L   = vec3(0.0330, 0.0250, 0.0165); /* #302820, top of frame  */
const vec3 PHOS_L   = vec3(0.8126, 0.4884, 0.2120); /* #E8B87E, the mark tone */

/* The character grid. A CONSTANT ROW COUNT, not a constant cell size in pixels:
   a larger display then draws the same composition more sharply rather than
   drawing more and smaller marks, so the layout stops depending on the display
   at all. ASPECT is the terminal cell ratio, taller than it is wide.

   COLS is the floor that keeps that honest on a portrait phone. Rows alone set
   the cell from the height, and on a tall narrow canvas that leaves about fifty
   columns — coarse enough that the marks stop reading as text and start reading
   as tiles. Taking whichever of the two gives the smaller cell means the grid
   stays fine in both directions, and on any landscape frame the row count still
   binds, so the desktop composition is untouched. */
const float ROWS   = 72.0;
const float COLS   = 78.0;
const float ASPECT = 0.55;

/* Orientations are quantised, which is most of why this reads as character art.
   A stroke is symmetric under 180 degrees, so the quantiser runs over PI, and
   SEG = 8 gives 22.5 degree steps. SEG = 4 is the literal dash/slash/pipe set
   and reads more like a terminal, but larger steps pop harder as the field
   turns, and it turns continuously. */
const float SEG = 8.0;

/* Depth ranges, nearest first. */
const int LAYERS = 4;

/* Burst nodes: xy anchor, z = strength. Marks turn to fan radially out of these;
   nothing glows. Each wanders on its own slow path so none of them sit still.
   They sit on and above the skyline, and the bottom-left stays deliberately
   empty: the headline is there. */
const int NODES = 6;
const vec3 NODE[6] = vec3[6](
  vec3(-0.68, 0.02, 0.65),
  vec3(-0.30, 0.13, 0.50),
  vec3( 0.03, 0.00, 0.70),
  vec3( 0.34, 0.15, 0.55),
  vec3( 0.60, 0.04, 0.85),
  vec3( 0.79, 0.17, 0.60)
);

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

/* The skyline of one range, in canvas uv-y.
 *
 * Ranges further back sit higher AND swing harder. That ordering is the one that
 * matters and it is easy to get backwards: aerial perspective says distant
 * things are fainter, not that they are flatter, and the range that meets the
 * sky is the one whose profile the eye reads as the silhouette. Give the back
 * ranges the small amplitude and the skyline goes flat, the frame loses its
 * drama, and no amount of tuning below will put it back.
 *
 * The bases are spaced tighter than the amplitudes, so the profiles interleave:
 * a far peak pushes up between two nearer ones and the nearer range shows
 * through wherever it dips, which is where the depth comes from.
 *
 * The profile is fbmTri, so the silhouette is faceted the same way the flow is,
 * and each range drifts at its own rate so the skyline never locks into one
 * shape. This is called once per range in the ownership walk and once more for
 * the slope, so keep it cheap — two octaves is the budget. */
float ridge(float x, float lay, float t) {
  float amp = 0.10 + lay * 0.075;
  return 0.395 + lay * 0.070
       + amp * fbmTri(vec2(x * (2.40 + lay * 0.55) + t * (1.4 - lay * 0.25), lay * 5.7 + 2.3), 2);
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
  float halfW = 0.5 * uRes.x / uRes.y;
  float t     = uTime * 0.045;
  float uvy   = gl_FragCoord.y / uRes.y;

  /* --- the character grid ---
     Everything that decides WHAT to draw is evaluated at the cell centre, never
     at the fragment. That one substitution is the quantisation, and it is what
     separates character art from a swept field. Only the ground gradient and the
     grain read the fragment, because both want to stay smooth across a cell. */
  float cellH = min(uRes.y / ROWS, uRes.x / (ASPECT * COLS));
  vec2  cell  = vec2(cellH * ASPECT, cellH);
  vec2  ci    = floor(gl_FragCoord.xy / cell);
  vec2  cf    = fract(gl_FragCoord.xy / cell) - 0.5;
  vec2  cpx   = (ci + 0.5) * cell;
  /* Cell centre in field coords: y in [-0.5, 0.5], x scaled by aspect. */
  vec2  pc    = (cpx - 0.5 * uRes) / uRes.y;
  float uvyc  = cpx.y / uRes.y;

  /* --- which range owns this cell ---
     Walk front to back and stop at the first skyline sitting above the cell. The
     early exit IS the occlusion: a range behind a nearer one never gets the
     chance to claim the cell, so the silhouettes stack into real depth for
     nothing. A cell above every skyline is sky, and draws only its empty dot. */
  float lay = -1.0;
  float h   = 0.0;
  for (int i = 0; i < LAYERS; i++) {
    float fi = float(i);
    float hi = ridge(pc.x, fi, t);
    if (uvyc < hi) { lay = fi; h = hi; break; }
  }

  /* Per-cell identity, stable because it hashes the cell index. */
  float hb  = hash12(ci + 0.5);
  float jit = fract(hb * 17.0);

  vec2  dir  = vec2(1.0, 0.0);
  float dens = 0.0;

  if (lay >= 0.0) {
    /* --- flow direction ---
       Marks run parallel to the range silhouette, so a slope reads as a slope,
       and swing off a noise field on top of that so the flow is organic rather
       than a set of parallel rules.

       This is an ANGLE field, not the gradient of a scalar one. Nothing draws a
       scalar field any more, only marks, so there is no reason to build one and
       differentiate it: a direct angle costs a single fbm where a gradient costs
       three taps of one, and the angle is quantised immediately afterwards so
       the extra precision would have been thrown away regardless. */
    const float E = 0.006;
    float slope = (ridge(pc.x + E, lay, t) - h) / E;
    float depth = max(h - uvyc, 0.0);
    /* Three octaves, and the third is not optional however much it looks like
       cheap detail under a 22.5 degree quantiser. It contributes roughly plus or
       minus 11 degrees, which straddles a quantisation step, so it is precisely
       what scatters neighbouring cells into adjacent bins. Drop it and the marks
       comb into long uniform ribbons: smoother, cheaper, and no longer terrain.
       It costs about 10% of the frame and it is worth it. */
    float n = fbmTri(vec2(pc.x * 1.45 + t * 1.6, depth * 3.2 + lay * 6.1), 3);
    /* Both the silhouette slope and the swing fall away with depth into the
       flank, so marks hug the skyline where they meet it and settle toward long
       horizontal runs far below it — which is what the foreground is. */
    float hug = exp(-depth * 2.6);
    float a = atan(slope) * hug + (0.42 + 2.55 * hug) * n;
    dir = vec2(cos(a), sin(a));

    /* --- density ---
       A TIGHT bright edge immediately under the skyline over a much softer body.
       The two terms are what make the depth legible: a range reads as a distinct
       plane because its crest is a hard line against the fainter flank of the
       range behind it, not because the silhouettes differ. One smooth falloff
       instead of two blurs every boundary and the whole set collapses back into
       a single wash.

       The nearest range also keeps a foreground floor, biased to the right. That
       is where the long horizontal runs come from, and biasing it is what keeps
       the lower-left open for the headline — shaping the composition around the
       type rather than leaning on the contrast guard to claw it back. */
    float edge  = 1.0 - smoothstep(0.0, 3.2 / ROWS, depth);
    float flank = 0.62 * exp(-depth * 1.4);
    float fore  = 0.46 * smoothstep(-0.30, 0.70, pc.x / halfW) * step(lay, 0.5);
    /* The silhouette line recedes far less than the body it encloses. That is
       how landscape line-work reads depth: every ridge stays drawn, while the
       mass behind each one drops away. Fading both together washes the four
       ranges into one band, because a back crest then matches a front flank. */
    float fade = exp(-lay * 0.26);
    dens = max(edge * (0.55 + 0.45 * fade), max(flank, fore) * fade);
  }

  /* --- bursts: direction and density, never light ---
     A radial fan used to be the hardest thing in this shader. Iso-lines cannot
     radiate from a point without a critical point there, and that critical point
     draws as a ring, which is why node strength was capped at 0.20 and why an
     earlier version had to build its rays in angle space. Marks have no such
     constraint, so this is simply the direction they point. */
  const float BURST = 1.30;
  float bw = 0.0;
  vec2  bd = vec2(0.0);
  for (int i = 0; i < NODES; i++) {
    float fi = float(i);
    // Wandering, not orbiting: two incommensurate rates per axis so the path
    // never closes and no node sits still.
    /* Anchors are authored against a 16:9 half-width and rescaled to whatever
       this frame actually is. Left in absolute field coords they do not travel:
       a portrait phone sees only x within about +/-0.23, so five of the six fall
       outside the frame and the sixth sits dead centre, directly behind the
       headline. */
    vec2 c = vec2(NODE[i].x * halfW / 0.889, NODE[i].y) + vec2(
      0.085 * sin(uTime * 0.061 + fi * 1.7) + 0.045 * sin(uTime * 0.023 + fi * 4.1),
      0.055 * cos(uTime * 0.048 + fi * 2.3) + 0.030 * cos(uTime * 0.019 + fi * 0.7)
    );
    vec2  dd = pc - c;
    float r2 = dot(dd, dd);
    /* Tight. A fan wide enough to be seen from across the frame is a fan that
       overlaps its neighbours, and six overlapping fans are just noise. */
    if (r2 > 0.11) continue;
    float w = exp(-r2 * 42.0) * NODE[i].z;
    bd += normalize(dd + vec2(1e-5)) * w;
    bw += w;
  }

  /* --- pointer: a fan of its own, plus a wake along its recent direction --- */
  vec2  pd  = pc - uPointer;
  float pr2 = dot(pd, pd);
  float pA  = exp(-pr2 * 8.0) * uPointerAmt * 0.85;
  bd += normalize(pd + vec2(1e-5)) * pA;
  bw += pA;
  float wk = exp(-pr2 * 12.0) * uWake * 0.55;
  bd += normalize(uPointerVel + vec2(1e-5)) * wk;
  bw += wk;

  if (bw > 0.002) {
    vec2 bn = normalize(bd + vec2(1e-6));
    /* A mark is symmetric under 180 degrees, so an opposed pair has to be folded
       onto the same side before blending or the two cancel into an arbitrary
       direction, which shows up as a seam through the middle of every fan. */
    if (dot(bn, dir) < 0.0) bn = -bn;
    dir   = normalize(mix(dir, bn, clamp(bw * BURST, 0.0, 1.0)));
    dens += bw * 0.45;
  }

  /* Haze the extremes so the field has no visible edge, measured against the
     actual half-width so an ultrawide fades at its own edges. */
  dens *= smoothstep(1.02, 0.62, abs(pc.x) / halfW);

  /* A portrait frame is a different composition, not a cropped one: the copy
     spans its whole width rather than sitting in a column, and the field has far
     less room to breathe around it. So the guard stops being left-biased and the
     whole field steps back. */
  float narrow = 1.0 - smoothstep(0.55, 0.80, halfW);
  dens *= mix(1.0, 0.52, narrow);
  dens  = clamp(dens, 0.0, 1.0);

  /* --- contrast guard ---
     The headline, sub-label and CTA are light type over this, under .hero__veil.
     On a dark ground that is a much easier position than it was on bronze, so
     this is gentler than it needed to be before — but it is not gone. Do not
     weaken it without re-running the contrast probe.

     Both extents are aspect-aware, and the vertical one matters most: the copy
     is a column in the lower-left of a landscape frame but nearly the whole of a
     portrait one, so a band tuned to the desktop stops short and leaves the
     phone headline sitting on bare field. */
  float guard = 1.0 - 0.68
    * mix(1.0 - smoothstep(-0.50, 0.55, pc.x / halfW), 1.0, narrow)
    * (1.0 - smoothstep(0.06, mix(0.62, 0.96, narrow), uvyc));

  /* --- one mark per cell ---
     Quantise the orientation, then draw a capsule in cell-local DEVICE PIXELS.

     reach is the cell's half-extent along the mark direction, so a full-length
     mark exactly spans its own cell and butts against its neighbours: the long
     horizontal runs and the vertical columns are single-cell marks meeting end
     to end, not long lines. At length zero the capsule degenerates to a dot,
     which is the empty-cell mark — one primitive for the whole vocabulary, no
     branch and no threshold.

     Width is a fraction of the cell with a pixel floor, so the mark keeps its
     apparent weight as the grid scales and never thins away on a short viewport.
     There is no Nyquist fade here and none is needed: an earlier version drew
     line families whose period could fall under 2px and moire viciously, but a
     mark is cell-sized by construction and can never approach it. */
  float ang = atan(dir.y, dir.x);
  ang = floor(ang * (SEG / PI) + 0.5) * (PI / SEG);
  vec2  d = vec2(cos(ang), sin(ang));
  vec2  m = cf * cell;
  float reach = 0.5 / max(abs(d.x) / cell.x, abs(d.y) / cell.y);
  float L = reach * clamp(dens * (0.85 + 0.55 * jit), 0.0, 1.10);
  float W = max(0.085 * cell.y, 0.9);
  float r = length(vec2(max(abs(dot(m, d)) - L, 0.0), abs(dot(m, vec2(-d.y, d.x)))));
  float mark = 1.0 - smoothstep(W - 0.6, W + 0.6, r);

  /* Light travels the field. Each cell hashes its own brightness on a cubic tail
     — a few hot, most faint — and its own pulse phase, and each range carries an
     offset so the wave never sweeps all four in unison. The empty-cell dot sits
     at a flat low value and never pulses: the sky in the reference is still. */
  float along = pc.x * 5.0 + lay * 2.7 - uTime * 0.34;
  /* The pulse floor has to sit high. Line families overlapped, so a low floor
     still summed to a lit frame; one independent mark per cell does not, and the
     same 0.55 that read as travelling light on lines reads as a dim speckle
     here. The travelling part is the tail, not the base. */
  float pulse = 0.86 + 1.40 * smoothstep(0.62, 0.98, sin(along + hb * 39.0) * 0.5 + 0.5);
  float ink   = mix(0.10, (0.42 + 1.15 * hb * hb * hb) * pulse, dens);

  /* --- assemble, in linear --- */
  vec3 col = mix(GROUND_L, LIFT_L, smoothstep(-0.05, 1.05, uvy));
  col += PHOS_L * (mark * ink * guard);

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
  /* Measured with a GPU timer query, not guessed: ~2.75ms per megapixel on the
     machine this was built on (2.07 / 3.69 / 4.95 MP all landed within 1%, so it
     is genuinely linear in fill), which makes 5.5e6 the largest buffer that
     still fits a 16.7ms frame. The mark grid costs a little more than the line
     families it replaced — the skyline walk and the flow noise are more work per
     fragment than three harmonics of one coordinate were — so this comes down
     from 6.0e6. A 3440-wide ultrawide therefore renders at about 95% rather than
     1:1, which is invisible next to the flow texture that paid for it.
     Re-measure whenever the skyline walk or the flow noise changes; the octave
     count in flowAngle is the single biggest term. Still only binds at the top
     end: a 1x desktop never reaches it and a phone at 3x keeps the full 2x cap. */
  const MAX_PIXELS = 5.5e6;
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
