/**
 * Ocean FFT — a Tessendorf deep-water surface, in WebGL2.
 *
 * Ported from the technique in https://vgpu.sh/examples/fft-ocean, which is
 * WebGPU compute (WGSL) and therefore could not be lifted as code. What ports is
 * the method, and it is the method that carries the motion:
 *
 *   1. A PHILLIPS SPECTRUM h0(k), built once on the CPU. Gaussian noise weighted
 *      by the wind spectrum, so every wavelength gets the energy the wind would
 *      actually put into it.
 *   2. EVOLVED IN FREQUENCY SPACE by the deep-water dispersion relation
 *      w = sqrt(g|k|): h(k,t) = h0(k)e^{iwt} + conj(h0(-k))e^{-iwt}. This is the
 *      whole point of the exercise. Every wavelength travels at its own speed, so
 *      the surface does not drift, it PROPAGATES — long swell rolling through
 *      faster short chop, crests overtaking and interfering. No amount of noise
 *      drifting reproduces that, because it is dispersion and noise has none.
 *   3. INVERSE FFT back to a displacement field, by Stockham autosort: log2(N)
 *      passes along x then log2(N) along y, ping-ponging between two textures.
 *   4. CHOPPY HORIZONTAL DISPLACEMENT D = -i(k/|k|)h, which is what turns round
 *      sine humps into the sharp crests and broad troughs an ocean actually has.
 *   5. FOAM from the Jacobian of that displacement: where J goes below 1 the
 *      surface is folding onto itself, and that is where whitewater lives.
 *
 * ---- what this file deliberately does not do ----
 *
 * The reference also runs half a million particles and a five-level HDR bloom
 * chain. Neither is here. Bloom is rejected on principle upstream (the crest glow
 * in the hero is a specular term, not energy spreading), and half a million
 * particles is not a marketing-hero budget.
 *
 * N is 256, not the reference's 512. We contour the result rather than render
 * metre-accurate water, so 8 Stockham passes an axis is ample and it quarters the
 * work. Raising it is a one-constant change if the detail is ever wanted.
 *
 * ---- packing: why this is 16 passes and not 32 ----
 *
 * Five real fields are wanted downstream (hy, Dx, Dz, and two slopes). An IFFT of
 * a Hermitian spectrum is real, and the transform is linear, so IFFT(A + iB)
 * carries A in its real part and B in its imaginary part — two real fields for
 * one complex channel. An RGBA texture holds two complex channels, so:
 *
 *     .rg = hy + i*Dx        .ba = Dz + i*0
 *
 * comes out of ONE 16-pass chain as a texel of (hy, Dx, Dz, 0). The .ba channel's
 * imaginary half is wasted; a second chain to fill it would cost more than the
 * two slopes cost to central-difference at 256^2 in the post pass, where the
 * field is band-limited and smooth and the difference is accurate.
 *
 * ---- outputs ----
 *
 *   texRaw  RGBA32F  (hy, Dx, Dz, 0)      raw, unnormalised — the warp source
 *   texDisp RGBA32F  (hy, sx, sz, foam)   normalised height, slopes, foam
 *
 * Both are NEAREST: the consumer needs C1 continuity for its contours and so
 * interpolates with its own quintic fade. Wrap is REPEAT, which is what makes
 * the patch tile, and the consumer's own wrap arithmetic matches it.
 *
 * ---- the normalisation is measured, not guessed ----
 *
 * For h(x) = sum_k h(k)e^{ikx}, Var(h) = sum_k E|h(k)|^2 = sum_k Ph(k). That sum
 * is available for free while h0 is being built, so `norm` is 1/sigma exactly and
 * the height field arrives at unit variance regardless of wind speed, patch size
 * or N. Without it every one of those constants would silently rescale the
 * amplitude and the hero's sea level would need re-tuning after each.
 */

const G = 9.81;

/* Tuning, from the reference's tuning.ts. These are calibration knobs, not
   constants of nature — the reference renders water in perspective and this
   renders contour lines over it, so they will not agree.
   DIR_POW is the one addition, and it is the important one: see the comment on
   the Phillips directional term. */
export interface OceanOpts {
  n?: number;         // grid resolution — must be a power of two
  patch?: number;     // patch size in metres
  wind?: number;      // wind speed m/s
  windAngle?: number; // radians
  amp?: number;       // Phillips amplitude
  choppy?: number;    // lambda — horizontal displacement scale
  dirPow?: number;    // directional exponent on (k.w)
  minWave?: number;   // metres — the short-wave cutoff. See the note on DEFAULTS.
  /* The uv scale the CONSUMER applies to the choppy displacement. The Jacobian
     is only meaningful once D is in the same units as the coordinate it
     displaces, and this file cannot know that scale — it is a framing decision
     made downstream. Passing it in is what makes the foam mean anything: with
     the raw IFFT magnitude instead, J came out tens of units from 1 and the foam
     term saturated over most of the frame, painting it solid cream. */
  warp?: number;
  loop?: number;      // seconds; dispersion is quantised to this period
  seed?: number;
}

const DEFAULTS: Required<OceanOpts> = {
  /* 256, matching the reference's grid but not its 512. The cutoff below damps
     everything past about wavenumber 15, so most of this grid carries nothing —
     which sounds wasteful and is the right trade anyway. What the resolution
     actually buys is TEXELS PER WAVELENGTH for the consumer's interpolation, not
     wavenumbers: the frame shows about a fifth of the patch, so 256 puts ~16px
     between samples of a feature 200px across. At 128 it was 32px and the
     quintic fade started showing as blobbing. */
  n: 256,
  patch: 200,
  wind: 12.9,
  windAngle: 4.83,
  amp: 1.3,
  choppy: 1.51,
  /* The reference uses 2, which is the textbook Phillips value and gives a broad
     directional spread — a realistic, messy sea. This field gets CONTOURED, and
     a broad spread means an isotropic-ish Gaussian random field, whose iso-lines
     close into rings around every local extremum. That is the concentric-whorl
     failure the hero's tilt-to-noise ratio exists to prevent. A higher exponent
     narrows the spread toward a single wind direction, which is what produces
     long crests running parallel across the frame — the same picture the tilt was
     faking by hand, arrived at from the physics instead. Expect to tune this. */
  /* 6 was the first attempt and it still drew closed rings. A Gaussian random
     field's iso-lines close around every extremum unless the directional
     spectrum is genuinely narrow, so this went to 20: near enough a single
     swell direction, which is what gives crests that run the width of the frame
     instead of curling back on themselves. */
  dirPow: 10,
  /* THE SINGLE MOST IMPORTANT DEPARTURE FROM THE REFERENCE, and it is forced by
     drawing iso-lines instead of shading.

     Phillips falls as 1/k^4, so the HEIGHT is dominated by long waves and looks
     fine. But contour spacing is set by SLOPE, and the slope spectrum is k^2
     times the height spectrum — which for Phillips is flat per octave, all the
     way to Nyquist. A shaded ocean hides that in its normals; iso-lines trace it
     directly, and the result is every band falling below a pixel across the
     whole frame. Not aliasing to be filtered away: the field genuinely has
     structure at every scale down to the grid, and the contours are honestly
     reporting it.

     The reference's l = 0.001*L is effectively no cutoff at all (17mm, against a
     grid spacing of over a metre). Here it is a real one: energy below minWave
     is suppressed, so the shortest wave the field carries is long enough to draw
     a contour band several pixels wide. 7m against a 200m patch keeps roughly 28
     wavenumbers an axis, which is still a rich sea and is what makes the
     landscape read as folded rather than as static.

     Worth knowing before tuning this: it moves the picture far less than it
     looks like it should. Measured, minWave 7 -> 20 shifts the field's
     characteristic length only 8.2m -> 11.0m, because the Gaussian rolloff
     leaves a tail and slope variance accumulates across the whole band. The
     control that actually sets how many undulations cross the frame is the
     consumer's sampling scale. This one sets how much fine structure exists to
     be sampled. */
  minWave: 13,
  warp: 0.018,
  loop: 200,
  seed: 0x9e3779b9,
};

const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) - 1.0;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const COMMON = `#version 300 es
precision highp float;
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
`;

/* h(k,t), and the two derived spectra, packed two-real-fields-per-complex-channel.

   The dispersion is QUANTISED to a loop period: w is snapped to a multiple of
   2pi/T, so after T seconds every wave is back in phase and the surface repeats
   exactly. That is not a visual nicety, it is what keeps this numerically sane —
   an unquantised sqrt(g|k|) drifts a float32 phase accumulator into visible
   stepping after a few minutes on a page people leave open. */
const FRAG_SPECTRUM = `${COMMON}
uniform sampler2D uH0;
uniform float uTime;
uniform float uN;
uniform float uPatch;
uniform float uChoppy;
uniform float uW0;      // 2pi / loop period
out vec4 fragColor;

void main() {
  vec2 n = gl_FragCoord.xy - 0.5;
  /* Wavenumbers in FFT ORDER: the second half of the axis is negative frequency.
     Storing them centred instead and correcting with a (-1)^(x+y) at the end is
     the textbook alternative, and it was the wrong one here — that correction
     only exists on the post pass's output, so the RAW ping-pong texture would
     come out modulated at Nyquist, and the raw texture is exactly what the
     choppy warp samples. Ordering the spectrum correctly costs one step() and
     leaves every output directly usable. */
  vec2 ki = n - step(uN * 0.5, n) * uN;
  vec2 k = 6.28318530718 * ki / uPatch;
  float km = max(length(k), 1e-4);

  vec4 h0 = texelFetch(uH0, ivec2(n), 0);   // h0(k).xy, conj(h0(-k)).zw

  float w = floor(sqrt(9.81 * km) / uW0) * uW0;
  float c = cos(w * uTime), s = sin(w * uTime);
  vec2 h = cmul(h0.xy, vec2(c, s)) + cmul(h0.zw, vec2(c, -s));

  // D = -i * (k/|k|) * h. Multiplying a complex by -i is a component swap.
  vec2 mih = vec2(h.y, -h.x);
  vec2 dx = mih * (k.x / km) * uChoppy;
  vec2 dz = mih * (k.y / km) * uChoppy;

  // chan0 = hy + i*Dx   ->   (hy.x - Dx.y, hy.y + Dx.x)
  // chan1 = Dz + i*0
  fragColor = vec4(h.x - dx.y, h.y + dx.x, dz);
}`;

/* Stockham autosort butterfly, one axis, one stage. Operates on both complex
   halves of the RGBA in the same pass — the twiddle is shared, so the second
   channel is two multiply-adds, not a second pass. */
const FRAG_FFT = `${COMMON}
uniform sampler2D uSrc;
uniform float uSub;     // subtransform size for this stage: 2, 4, ... N
uniform float uN;
uniform bool uHoriz;
out vec4 fragColor;

void main() {
  vec2 xy = gl_FragCoord.xy - 0.5;
  float index = uHoriz ? xy.x : xy.y;
  float half_ = uSub * 0.5;
  float even = floor(index / uSub) * half_ + mod(index, half_);

  ivec2 ce = uHoriz ? ivec2(int(even), int(xy.y)) : ivec2(int(xy.x), int(even));
  ivec2 co = ce + (uHoriz ? ivec2(int(uN * 0.5), 0) : ivec2(0, int(uN * 0.5)));

  vec4 a = texelFetch(uSrc, ce, 0);
  vec4 b = texelFetch(uSrc, co, 0);

  // +2pi is the INVERSE transform. The 1/N^2 it owes is folded into the
  // normalisation constant the post pass applies, so it is not paid here twice.
  float arg = 6.28318530718 * (index / uSub);
  vec2 tw = vec2(cos(arg), sin(arg));

  fragColor = a + vec4(cmul(tw, b.rg), cmul(tw, b.ba));
}`;

/* Slopes and foam, in one gather over the finished surface. */
const FRAG_POST = `${COMMON}
uniform sampler2D uSrc;
uniform float uN;
uniform float uNorm;    // 1/sigma, measured while h0 was built
uniform float uFold;    // Jacobian scale — the foam calibration knob
uniform float uFoamThr;
uniform float uFoamW;
out vec4 fragColor;

vec4 tap(ivec2 c) {
  int n = int(uN);
  return texelFetch(uSrc, ivec2((c.x + n) % n, (c.y + n) % n), 0);
}

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy - 0.5);
  vec4 m  = tap(c);
  vec4 px = tap(c + ivec2(1, 0));
  vec4 mx = tap(c - ivec2(1, 0));
  vec4 pz = tap(c + ivec2(0, 1));
  vec4 mz = tap(c - ivec2(0, 1));

  /* Slopes in units of d(height)/d(uv), so the sampler downstream can chain-rule
     them through its own coordinate scale exactly the way the noise field's
     analytic gradient used to be chain-ruled through the octave transforms. */
  float sx = (px.r - mx.r) * 0.5 * uN * uNorm;
  float sz = (pz.r - mz.r) * 0.5 * uN * uNorm;

  /* J = (1 + dDx/dx)(1 + dDz/dz) - (dDx/dz)(dDz/dx), the reference's formula.
     uFold carries the unit conversion from "IFFT output" to "fraction of a grid
     cell", which depends on amplitude, patch size and N together — so it is one
     measured knob rather than three constants that have to agree. */
  float dxx = (px.g - mx.g) * 0.5 * uFold;
  float dzz = (pz.b - mz.b) * 0.5 * uFold;
  float dxz = (pz.g - mz.g) * 0.5 * uFold;
  float dzx = (px.b - mx.b) * 0.5 * uFold;
  float J = (1.0 + dxx) * (1.0 + dzz) - dxz * dzx;
  float foam = 1.0 - smoothstep(uFoamThr, uFoamThr + uFoamW, J);

  fragColor = vec4(m.r * uNorm, sx, sz, foam);
}`;

/** Deterministic PRNG — the sea should be the same sea on every load. */
function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function compile(gl: WebGL2RenderingContext, src: string, type: number): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('[oceanfft]', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: WebGLShader, fsrc: string): WebGLProgram | null {
  const fs = compile(gl, fsrc, gl.FRAGMENT_SHADER);
  if (!fs) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn('[oceanfft]', gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

function tex(gl: WebGL2RenderingContext, n: number, fmt: number, data: Float32Array | null, type: number): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, fmt, n, n, 0, gl.RGBA, type, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  /* NEAREST throughout. The consumer interpolates in the shader with a quintic
     fade, because hardware bilinear is only C0 and this field is drawn as
     iso-lines, which trace the gradient — so hardware filtering was never going
     to be usable here and 32F linear filtering needs an extension anyway. */
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  return t;
}

export interface Ocean {
  /** Runs the spectrum, the 2*log2(N) butterflies and the post pass. */
  step(t: number): void;
  /** RGBA16F (hy, Dx, Dz, 0) — raw IFFT output, the choppy-warp source. */
  texRaw: WebGLTexture;
  /** RGBA16F (hy, sx, sz, foam) — normalised, ready to sample. */
  texDisp: WebGLTexture;
  /** Height normalisation, 1/sigma. The warp scale downstream needs it. */
  norm: number;
  /** Grid resolution, so the sampler downstream can size its own fade. */
  n: number;
  dispose(): void;
}

/**
 * Returns null when the GPU cannot render to float, which is the caller's cue to
 * fall back. Everything here is allocated once; step() allocates nothing.
 *
 * Assumes a VAO is already bound (the caller's fullscreen setup) — some drivers
 * refuse a draw with none, even with zero attributes.
 */
export function createOcean(gl: WebGL2RenderingContext, opts: OceanOpts = {}): Ocean | null {
  // RGBA16F is the render target; this extension is what makes it colour-renderable.
  if (!gl.getExtension('EXT_color_buffer_float')) return null;

  const o = { ...DEFAULTS, ...opts };
  const N = o.n;
  const stages = Math.log2(N);
  if (!Number.isInteger(stages)) return null;

  const vs = compile(gl, VERT, gl.VERTEX_SHADER);
  if (!vs) return null;
  const pSpec = link(gl, vs, FRAG_SPECTRUM);
  const pFft = link(gl, vs, FRAG_FFT);
  const pPost = link(gl, vs, FRAG_POST);
  gl.deleteShader(vs);
  if (!pSpec || !pFft || !pPost) return null;

  /* ---- h0, on the CPU, once ----
     Phillips exactly as the reference states it, plus the directional exponent.
     The variance accumulates in the same loop, which is what makes the
     normalisation exact rather than a tuned magic number. */
  const rnd = mulberry32(o.seed);
  const h0 = new Float32Array(N * N * 4);
  const wx = Math.cos(o.windAngle);
  const wz = Math.sin(o.windAngle);
  const Lw = (o.wind * o.wind) / G;
  const small = o.minWave / (2 * Math.PI);
  const twoPiL = (2 * Math.PI) / o.patch;

  // Pass one: h0(k) into .xy, and the running variance.
  let variance = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      // FFT order, matching the spectrum shader: indices past N/2 are negative.
      const kx = twoPiL * (i < N / 2 ? i : i - N);
      const kz = twoPiL * (j < N / 2 ? j : j - N);
      const km = Math.hypot(kx, kz);
      let ph = 0;
      if (km > 1e-6) {
        const dot = (kx / km) * wx + (kz / km) * wz;
        ph =
          (o.amp * Math.exp(-1 / (km * km * Lw * Lw))) / km ** 4 *
          Math.pow(Math.abs(dot), o.dirPow) *
          Math.exp(-km * km * small * small);
        if (dot < 0) ph *= 0.07;
      }
      variance += ph;
      // Box-Muller, scaled by sqrt(Ph/2) — the 1/sqrt(2) of the standard form.
      const u1 = Math.max(rnd(), 1e-9);
      const r = Math.sqrt(-2 * Math.log(u1)) * Math.sqrt(ph / 2);
      const th = 2 * Math.PI * rnd();
      const p = (j * N + i) * 4;
      h0[p] = r * Math.cos(th);
      h0[p + 1] = r * Math.sin(th);
    }
  }

  // Pass two: conj(h0(-k)) into .zw. In FFT order -k lives at (N - m) % N, and
  // index 0 is DC and N/2 is Nyquist — both their own negatives on the lattice.
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const q = (((N - j) % N) * N + ((N - i) % N)) * 4;
      const p = (j * N + i) * 4;
      h0[p + 2] = h0[q];
      h0[p + 3] = -h0[q + 1];
    }
  }
  const norm = variance > 0 ? 1 / Math.sqrt(variance) : 1;

  /* Every stage is 32F, including the ping-pong. Half float looked like the
     obvious economy at 128x128 and it is not: the butterfly accumulates the
     whole spectrum into a running sum, so the intermediate magnitudes are far
     larger than the final surface, and 11 mantissa bits at that magnitude
     quantise the OUTPUT into visible terraces. Contours draw terraces as hard
     steps. At this resolution the whole set is 1MB — there is nothing to save. */
  const texH0 = tex(gl, N, gl.RGBA32F, h0, gl.FLOAT);
  const ping = tex(gl, N, gl.RGBA32F, null, gl.FLOAT);
  const pong = tex(gl, N, gl.RGBA32F, null, gl.FLOAT);
  const texDisp = tex(gl, N, gl.RGBA32F, null, gl.FLOAT);
  const fbo = gl.createFramebuffer()!;

  const u = (p: WebGLProgram, name: string) => gl.getUniformLocation(p, name);
  const uSpec = { h0: u(pSpec, 'uH0'), t: u(pSpec, 'uTime'), n: u(pSpec, 'uN'), patch: u(pSpec, 'uPatch'), ch: u(pSpec, 'uChoppy'), w0: u(pSpec, 'uW0') };
  const uFft = { src: u(pFft, 'uSrc'), sub: u(pFft, 'uSub'), n: u(pFft, 'uN'), h: u(pFft, 'uHoriz') };
  const uPost = { src: u(pPost, 'uSrc'), n: u(pPost, 'uN'), norm: u(pPost, 'uNorm'), fold: u(pPost, 'uFold'), thr: u(pPost, 'uFoamThr'), fw: u(pPost, 'uFoamW') };

  /* D reaches the consumer as raw * norm * warp, in uv; multiplying by N puts it
     in grid cells, which is the space the central difference is taken in. So
     dD/dx is genuinely dimensionless and J is genuinely a Jacobian. */
  const FOLD = norm * o.warp * N;
  /* The reference thresholds at J < 0.8. Its sea is choppier than this one and
     its foam is drawn as spray on shaded water; here the same threshold has foam
     over half the frame, and here foam SATURATES CONTOUR LINES. Narrower and
     later, so it marks real convergence rather than merely converging-ish. */
  const FOAM_THR = 0.15;
  const FOAM_W = 0.35;

  const w0 = (2 * Math.PI) / o.loop;
  let last: WebGLTexture = ping;

  const target = (t: WebGLTexture): void => {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  };

  function step(t: number): void {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, N, N);
    gl.activeTexture(gl.TEXTURE0);

    // 1. spectrum -> ping
    gl.useProgram(pSpec);
    gl.bindTexture(gl.TEXTURE_2D, texH0);
    gl.uniform1i(uSpec.h0, 0);
    gl.uniform1f(uSpec.t, t);
    gl.uniform1f(uSpec.n, N);
    gl.uniform1f(uSpec.patch, o.patch);
    gl.uniform1f(uSpec.ch, o.choppy);
    gl.uniform1f(uSpec.w0, w0);
    target(ping);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 2. Stockham: log2(N) stages along x, then log2(N) along y.
    gl.useProgram(pFft);
    gl.uniform1i(uFft.src, 0);
    gl.uniform1f(uFft.n, N);
    let src = ping;
    let dst = pong;
    for (let axis = 0; axis < 2; axis++) {
      gl.uniform1i(uFft.h, axis === 0 ? 1 : 0);
      for (let s = 0; s < stages; s++) {
        gl.uniform1f(uFft.sub, 2 ** (s + 1));
        gl.bindTexture(gl.TEXTURE_2D, src);
        target(dst);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const swap = src;
        src = dst;
        dst = swap;
      }
    }
    last = src; // the final write landed here

    // 3. slopes + foam + fftshift -> texDisp
    gl.useProgram(pPost);
    gl.bindTexture(gl.TEXTURE_2D, last);
    gl.uniform1i(uPost.src, 0);
    gl.uniform1f(uPost.n, N);
    gl.uniform1f(uPost.norm, norm);
    gl.uniform1f(uPost.fold, FOLD);
    gl.uniform1f(uPost.thr, FOAM_THR);
    gl.uniform1f(uPost.fw, FOAM_W);
    target(texDisp);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Hand the pipeline back the way it was found. The caller re-binds its own
    // program and viewport each frame, but leaving a 256x256 viewport and a
    // bound FBO behind is the kind of state leak that shows up three files away.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    // texRaw follows the ping-pong, so republish it every step.
    ocean.texRaw = last;
  }

  const ocean: Ocean = {
    step,
    texRaw: ping,
    texDisp,
    norm,
    n: N,
    dispose(): void {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(texH0);
      gl.deleteTexture(ping);
      gl.deleteTexture(pong);
      gl.deleteTexture(texDisp);
      gl.deleteProgram(pSpec);
      gl.deleteProgram(pFft);
      gl.deleteProgram(pPost);
    },
  };
  return ocean;
}
