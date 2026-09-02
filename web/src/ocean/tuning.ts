/**
 * Canonical parameter table copied from front/fft-ocean-1 DEFAULT_SETTINGS,
 * settings constants, uniform-packing, and bloom-pass.
 */
export const OCEAN_TUNING = {
  simulation: {
    oceanSize: 200,
    worldSize: 400,
    timeScale: 0.6,
    spectrumTimeScale: 0.5,
    windSpeed: 12.9,
    windAngle: 4.83,
    amplitude: 1.3,
    choppiness: 1.51,
    displacementScale: 0.005,
    foamThreshold: 0,
  },
  particles: {
    /* ADAPTED. The example draws one particle per simulation texel, hard-wired
       as `instances: resolution * resolution` — 262,144 of them at 512². That is
       1.57M triangles a frame and it measured 2.6ms, which does not shrink with
       the screen: it was the same cost on a phone as on a 4K panel, and after
       the simulation and bloom were dealt with it became the largest single term
       in the frame.

       The stride decouples particle count from simulation fidelity: the water is
       still simulated at 512², but only every Nth texel gets a particle. 2 means
       a quarter as many. pointSize is scaled by the stride to compensate, so the
       total area covered — and therefore the brightness of the water — stays put
       rather than thinning out; the points are simply larger and fewer.

       It is NOT free, and the split below is why. At a desktop's device pixel
       ratio a stride of 2 puts roughly one particle every 21 screen pixels, and
       the water stops reading as a continuous mist: you see discrete dots and
       grid moiré, which is the exact quality this hero was chosen for. On a
       phone the same stride lands about one particle every 13 pixels, and those
       pixels are around a third the physical size — so the structure that is
       obvious on a monitor is invisible in the hand, while the frame budget is
       far tighter. Full density where it can be seen, stride where it cannot.

       Set both to 1 to restore the example's exact particle count. */
    particleStride: 1,
    particleStrideCoarse: 2,
    pointSize: 0.75,
    fadeNear: 60,
    fadeFar: 250,
    fadePower: 3.2,
    oceanColor: [
      0.003035269835488375, 0.003035269835488375, 0.003035269835488375, 0,
    ] as const,
    neonColor: [1, 1, 1, 0] as const,
    foamColor: [1, 1, 1, 0] as const,
  },
  camera: {
    // Gallery reframe: the docs canvas is much taller than front's hero strip.
    // Raising and backing off the rig keeps the horizon in the upper third.
    eye: [0, 30, 90] as const,
    target: [0, 5, 55] as const,
    // ADAPTED. The example is framed for a gallery canvas with nothing on top of
    // it. This hero has the nav pinned to the top of the frame with no frost
    // until the page scrolls, and at the example's -10 the horizon sits above
    // the canvas entirely — so the densest, brightest part of the water, the far
    // field just under the horizon, lands exactly at nav height. Pitching the rig
    // up drops the horizon to roughly a fifth of the way down, which puts open
    // sky behind the nav and moves the bright band clear of both the links and
    // the headline. The sky is genuinely open, not painted: the scene target
    // clears transparent, so what shows through above the horizon is the hero's
    // own CSS gradient in whichever theme is active.
    pitchDegrees: 3,
    fovDegrees: 90,
    near: 0.1,
    far: 2000,
  },
  bloom: {
    threshold: 0.3,
    smoothWidth: 0.01,
    strength: 0.08,
    radius: 0.46,
    levels: 5,
    kernelRadii: [6, 10, 14, 18, 22] as const,
    /* ADAPTED. The pyramid starts at half the render buffer and every level
       halves from there, so the whole chain's cost scales with the buffer —
       measured at 1.31ms per megapixel, which made bloom the largest single term
       on any large display (6.82ms of a 13.3ms frame at 1920x1080 @1.6x) and put
       a 4K panel over budget on bloom alone.

       Capping the BASE width decouples it: above this the pyramid stops growing
       and bloom becomes near-constant instead of linear in pixels. Nothing is
       lost that bloom cares about — it is a blur, and the kernel radii are in
       texels, so a smaller base simply spreads the glow slightly wider relative
       to the frame. 960 leaves every buffer at or under 1920 wide untouched
       (they were already clamped by the 0.5 factor), so this only ever bites on
       the displays that needed it. */
    baseMaxWidth: 960,
  },
} as const;

/** Matches front's `gaussianCoefficients`: sigma=radius/3, no normalization pass. */
export function gaussianCoefficients(kernelRadius: number): readonly number[] {
  return Array.from({ length: 24 }, (_, index) =>
    index < kernelRadius
      ? (0.39894 * Math.exp((-0.5 * index * index) / (kernelRadius / 3) ** 2)) /
        (kernelRadius / 3)
      : 0
  );
}
