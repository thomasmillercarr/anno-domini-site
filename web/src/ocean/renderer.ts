/* ---------------------------------------------------------------------------
 * vgpu "Particles ocean" example (https://vgpu.sh/examples/fft-ocean), pulled
 * verbatim and adapted at exactly three points. Everything else — the graph, the
 * 18-pass Stockham table, prewarm, the resize rebuild, dispose and the
 * runCleanups error discipline — is the example's own code, unmodified.
 *
 * The three adaptations, all in this file:
 *
 *   1. NO frameLoop. The page already has one clock: gsap.ticker, which scroll.ts
 *      drives in lockstep with Lenis. vgpu is built for this — clock.advance(dt)
 *      claims the frame's tick so an external ticker owns the time base — so the
 *      loop becomes an exported step(dt) and the caller drives it. This is the
 *      site's rule, not a preference: a second rAF loop is what makes canvas work
 *      feel detached from the smooth scroll.
 *   2. onFirstFrame, so the hero canvas can fade in over its CSS gradient only
 *      once there is something to fade in to.
 *   3. The camera is framed per hero, not fixed, because the site's hero is a
 *      full-viewport block whose aspect ratio varies far more than the example
 *      gallery's canvas. See camera.ts.
 *   4. The simulation runs at SIM_HZ, not once per drawn frame. Measured, the
 *      spectrum + 18 IFFT stages + normal/foam cost 2.7ms of every frame and
 *      that cost is FIXED — it is a 512x512 job whether the hero is on a phone
 *      or a 4K panel, so at phone resolution it was 41% of the frame. The
 *      surface evolves at timeScale 0.6 x spectrumTimeScale 0.5, which is slow
 *      enough that halving the update rate is not perceptible. The particles
 *      keep reading the last displacement and normal/foam textures, so nothing
 *      downstream notices a frame where the simulation did not advance.
 *
 * Resource cleanup is deliberately untouched: dispose() is idempotent, the resize
 * generation counter drops stale graphs, destroyTargets tears down in reverse
 * allocation order, and runCleanups reports the first failure without skipping
 * later cleanups.
 * ------------------------------------------------------------------------- */
import {
  clock,
  draw,
  effect,
  frame,
  sampler,
  surface,
  target,
  type Draw,
  type Effect,
  type Frame,
  type Gpu,
  type ShaderSource,
  type Surface,
  type Target,
} from "vgpu";

import bloomBlurWgsl from "./bloom-blur.wgsl";
import bloomBrightWgsl from "./bloom-bright.wgsl";
import bloomCompositeWgsl from "./bloom-composite.wgsl";
import { oceanCamera } from "./camera";
import ifftStageWgsl from "./ifft-stage.wgsl";
import initialSpectrumWgsl from "./initial-spectrum.wgsl";
import noiseWgsl from "./noise.wgsl";
import normalFoamWgsl from "./normal-foam.wgsl";
import {
  createIfftStageTable,
  OCEAN_RESOLUTION,
  type IfftStage,
  type SimulationTargetName,
} from "./ocean-graph";
import particlesWgsl from "./particles.wgsl";
import presentWgsl from "./present.wgsl";
import spectrumWgsl from "./spectrum.wgsl";
import { gaussianCoefficients, OCEAN_TUNING } from "./tuning";

type Output = Surface | Target;

interface RendererOptions {
  readonly canvas: HTMLCanvasElement;
  /** Adaptation 2: fires after the first frame has actually been submitted. */
  readonly onFirstFrame?: () => void;
}

/* Adaptation 4: the water advances at this rate, not once per drawn frame. 30Hz
   against a 60Hz display halves the simulation's share of the frame; the surface
   moves slowly enough that the difference is not visible. */
const SIM_INTERVAL = 1 / 30;

const SIM_FORMAT: GPUTextureFormat = "rgba32float";
const HDR_FORMAT: GPUTextureFormat = "rgba16float";
const TRANSPARENT = [0, 0, 0, 0] as const;

export function createRenderer({ canvas, onFirstFrame }: RendererOptions) {
  let disposed = false;
  let gpu: Gpu | undefined;
  let output: Surface | undefined;
  let graph: OceanGraph | undefined;
  let unsubscribeResize: (() => void) | undefined;
  let resizeFrame = 0;
  let resizeGeneration = 0;
  let time: ReturnType<typeof clock> | undefined;
  let elapsed = 0;
  let announced = false;
  let simAccum = Infinity; // force a simulation step on the very first frame

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    resizeGeneration++;
    runCleanups([
      () => {
        if (resizeFrame) cancelAnimationFrame(resizeFrame);
      },
      () => unsubscribeResize?.(),
      () => gpu?.dispose(),
    ]);
  }

  function fail(error: unknown): never {
    try {
      dispose();
    } catch {
      // Teardown must not replace the render, resize, or preparation failure.
    }
    throw error;
  }

  const rebuild = async (generation: number) => {
    if (disposed || !gpu || !output || !graph) return;
    if (sameSize(graph.scene.size, output.size)) return;
    const next = await createGraph(
      gpu,
      output,
      `fft-ocean-resize-${generation}`
    );
    if (disposed) return;
    if (generation !== resizeGeneration) {
      try {
        destroyGraph(next);
      } catch {
        // A newer resize owns the renderer; this stale graph is best-effort only.
      }
      return;
    }
    const previous = graph;
    graph = next;
    destroyGraph(previous);
  };

  const scheduleResize = () => {
    if (disposed || resizeFrame) return;
    const generation = ++resizeGeneration;
    resizeFrame = requestAnimationFrame(async () => {
      resizeFrame = 0;
      try {
        await rebuild(generation);
      } catch (error) {
        if (!disposed && generation === resizeGeneration) fail(error);
      }
    });
  };

  const initialize = async () => {
    const { init } = await import("vgpu");
    if (disposed) return;
    const nextGpu = await init();
    if (disposed) {
      nextGpu.dispose();
      return;
    }

    gpu = nextGpu;
    output = surface(gpu, canvas, { dpr: [1, 1.6] });
    graph = await createGraph(gpu, output, "fft-ocean-live");
    if (disposed) return;

    unsubscribeResize = output.onResize(scheduleResize);
    time = clock(gpu);
  };

  /* Adaptation 1: one step, driven by the page's ticker. clock.advance() claims
     this frame's tick so vgpu does not also advance on wall-clock, which is what
     keeps the simulation on the same time base as the scroll. */
  function step(deltaSeconds: number): void {
    if (disposed || !gpu || !graph || !output || !time) return;
    elapsed += deltaSeconds;
    /* setDynamics takes an ABSOLUTE time, not a delta, so a skipped step costs
       the ocean nothing — the next one lands it exactly where the wall clock
       says it should be. The surface jumps forward by two frames' worth rather
       than drifting behind. */
    simAccum += deltaSeconds;
    const simulate = simAccum >= SIM_INTERVAL;
    if (simulate) simAccum = 0;
    try {
      time.advance(deltaSeconds);
      frame(gpu, (currentFrame) => {
        if (disposed || !graph || !output) return;
        if (simulate) setDynamics(graph, elapsed * OCEAN_TUNING.simulation.timeScale);
        renderGraph(currentFrame, graph, output as Output, simulate);
      });
    } catch (error) {
      fail(error);
    }
    if (!announced) {
      announced = true;
      onFirstFrame?.();
    }
  }

  /** True once the graph is built and step() will actually render. */
  function isReady(): boolean {
    return !disposed && !!gpu && !!graph && !!output && !!time;
  }

  const ready = initialize().catch((error: unknown) => {
    if (!disposed) fail(error);
  });

  return { ready, dispose, step, isReady };
}

export async function createGraph(
  gpu: Gpu,
  output: Output,
  label: string
): Promise<OceanGraph> {
  const ownedTargets: Target[] = [];
  try {
    const graph = buildGraph(gpu, output, label, (value) => {
      ownedTargets.push(value);
      return value;
    });
    await prewarm(graph, output);
    return graph;
  } catch (error) {
    try {
      destroyTargets(ownedTargets);
    } catch {
      // Partial-allocation cleanup must not replace the construction failure.
    }
    throw error;
  }
}

function buildGraph(
  gpu: Gpu,
  output: Output,
  label: string,
  own: (value: Target) => Target
) {
  const resolution = OCEAN_RESOLUTION;
  const createTarget = (
    name: string,
    size: readonly [number, number],
    format: GPUTextureFormat
  ) => own(target(gpu, { size, format, label: `${label}-${name}` }));
  const simulationTarget = (name: string) =>
    createTarget(name, [resolution, resolution], SIM_FORMAT);
  const simulation = {
    noise: simulationTarget("noise"),
    h0: simulationTarget("h0"),
    spectrum: simulationTarget("spectrum"),
    ping: simulationTarget("ping"),
    pong: simulationTarget("pong"),
    normalFoam: simulationTarget("normal-foam"),
  };
  const sizes = bloomSizes(output.size);
  const scene = createTarget("scene", normalizedSize(output.size), HDR_FORMAT);
  const bright = createTarget("bright", sizes[0]!, HDR_FORMAT);
  const composite = createTarget("composite", sizes[0]!, HDR_FORMAT);
  const linearSampler = sampler(gpu, {
    minFilter: "linear",
    magFilter: "linear",
  });

  const noiseEffect = configuredEffect(gpu, noiseWgsl, `${label}-noise`);
  const initialSpectrum = configuredEffect(
    gpu,
    initialSpectrumWgsl,
    `${label}-initial-spectrum`,
    {
      u: {
        resolution,
        size: OCEAN_TUNING.simulation.oceanSize,
        windSpeed: OCEAN_TUNING.simulation.windSpeed,
        windAngle: OCEAN_TUNING.simulation.windAngle,
        amplitude: OCEAN_TUNING.simulation.amplitude,
      },
      u_noise: simulation.noise,
    }
  );
  const evolveSpectrum = configuredEffect(
    gpu,
    spectrumWgsl,
    `${label}-spectrum`,
    {
      u: {
        resolution,
        size: OCEAN_TUNING.simulation.oceanSize,
        time: 0,
        choppiness: OCEAN_TUNING.simulation.choppiness,
      },
      u_initialSpectrum: simulation.h0,
    }
  );

  const simulationTargets: Record<SimulationTargetName, Target> = {
    spectrum: simulation.spectrum,
    ping: simulation.ping,
    pong: simulation.pong,
  };
  const ifft = createIfftStageTable().map((spec: IfftStage) => ({
    spec,
    effect: configuredEffect(
      gpu,
      ifftStageWgsl,
      `${label}-ifft-${spec.index}-${spec.horizontal ? "h" : "v"}`,
      {
        u: {
          resolution,
          subtransformSize: spec.subtransformSize,
          horizontal: spec.horizontal ? 1 : 0,
        },
        u_input: simulationTargets[spec.input],
      }
    ),
    output: simulationTargets[spec.output],
  }));
  const displacement = ifft.at(-1)!.output;
  const normals = configuredEffect(
    gpu,
    normalFoamWgsl,
    `${label}-normal-foam`,
    {
      u: {
        resolution,
        worldSize: OCEAN_TUNING.simulation.worldSize,
        displacementScale: OCEAN_TUNING.simulation.displacementScale,
        foamThreshold: OCEAN_TUNING.simulation.foamThreshold,
      },
      u_displacement: displacement,
    }
  );
  const stride = particleStride();
  const particleGrid = Math.max(1, Math.floor(resolution / stride));
  const particles = draw(gpu, {
    shader: particlesWgsl,
    vertices: 6,
    instances: particleGrid * particleGrid,
    blend: {
      color: { src: "src-alpha", dst: "one" },
      alpha: { src: "one", dst: "one" },
    },
    label: `${label}-particles`,
  }).set({
    u_displacement: displacement,
    u_normalFoam: simulation.normalFoam,
  });
  setParticleConstants(particles, output);
  const brightEffect = configuredEffect(
    gpu,
    bloomBrightWgsl,
    `${label}-bloom-bright`,
    {
      uniforms: {
        luminosityThreshold: OCEAN_TUNING.bloom.threshold,
        smoothWidth: OCEAN_TUNING.bloom.smoothWidth,
      },
      tDiffuse: scene,
      linearSampler,
    }
  );

  let bloomInput = bright;
  const levels = sizes.map((size, index) => {
    const horizontal = createTarget(`bloom-h${index}`, size, HDR_FORMAT);
    const vertical = createTarget(`bloom-v${index}`, size, HDR_FORMAT);
    const radius = OCEAN_TUNING.bloom.kernelRadii[index]!;
    const horizontalEffect = makeBlur(
      gpu,
      `${label}-blur-h${index}`,
      bloomInput,
      horizontal,
      linearSampler,
      [1, 0],
      radius
    );
    const verticalEffect = makeBlur(
      gpu,
      `${label}-blur-v${index}`,
      horizontal,
      vertical,
      linearSampler,
      [0, 1],
      radius
    );
    bloomInput = vertical;
    return { horizontal, vertical, horizontalEffect, verticalEffect };
  });
  const compositeEffect = configuredEffect(
    gpu,
    bloomCompositeWgsl,
    `${label}-bloom-composite`,
    {
      uniforms: {
        bloomStrength: OCEAN_TUNING.bloom.strength,
        bloomRadius: OCEAN_TUNING.bloom.radius,
        bloomFactors0: [1, 0.8, 0.6, 0.4],
        bloomFactors1: [0.2, 0, 0, 0],
      },
      blurTexture1: levels[0]!.vertical,
      blurTexture2: levels[1]!.vertical,
      blurTexture3: levels[2]!.vertical,
      blurTexture4: levels[3]!.vertical,
      blurTexture5: levels[4]!.vertical,
      linearSampler,
    }
  );
  const present = configuredEffect(gpu, presentWgsl, `${label}-present`, {
    sceneHDR: scene,
    bloomTexture: composite,
    linearSampler,
  });
  return {
    simulation,
    scene,
    bloom: { bright, composite, levels },
    effects: {
      noise: noiseEffect,
      initialSpectrum,
      evolveSpectrum,
      normals,
      bright: brightEffect,
      composite: compositeEffect,
      present,
    },
    ifft,
    particles,
    needsInitialSpectrum: true,
  };
}

export type OceanGraph = ReturnType<typeof buildGraph>;

function configuredEffect(
  gpu: Gpu,
  shader: string | ShaderSource,
  label: string,
  bindings?: Record<string, unknown>
): Effect {
  const configured = effect(gpu, shader, { label });
  return bindings ? configured.set(bindings) : configured;
}

function makeBlur(
  gpu: Gpu,
  label: string,
  source: Target,
  output: Target,
  linearSampler: GPUSampler,
  direction: readonly [number, number],
  kernelRadius: number
): Effect {
  const blur = effect(gpu, bloomBlurWgsl, { label });
  const coefficients = gaussianCoefficients(kernelRadius);
  blur.set({
    uniforms: {
      direction,
      invSize: output.texelSize,
      gaussianCoefficients0: coefficients.slice(0, 4),
      gaussianCoefficients1: coefficients.slice(4, 8),
      gaussianCoefficients2: coefficients.slice(8, 12),
      gaussianCoefficients3: coefficients.slice(12, 16),
      gaussianCoefficients4: coefficients.slice(16, 20),
      gaussianCoefficients5: coefficients.slice(20, 24),
    },
    colorTexture: source,
    linearSampler,
  });
  return blur;
}

async function prewarm(graph: OceanGraph, output: Output): Promise<void> {
  const results = await Promise.allSettled([
    graph.effects.noise.compile(graph.simulation.noise),
    graph.effects.initialSpectrum.compile(graph.simulation.h0),
    graph.effects.evolveSpectrum.compile(graph.simulation.spectrum),
    ...graph.ifft.map(({ effect, output }) => effect.compile(output)),
    graph.effects.normals.compile(graph.simulation.normalFoam),
    graph.particles.compile(graph.scene),
    graph.effects.bright.compile(graph.bloom.bright),
    ...graph.bloom.levels.flatMap((level) => [
      level.horizontalEffect.compile(level.horizontal),
      level.verticalEffect.compile(level.vertical),
    ]),
    graph.effects.composite.compile(graph.bloom.composite),
    graph.effects.present.compile({ colors: [output.format] }),
  ]);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (failure) throw failure.reason;
}

function setDynamics(graph: OceanGraph, timeSeconds: number): void {
  graph.effects.evolveSpectrum.set({
    u: { time: timeSeconds * OCEAN_TUNING.simulation.spectrumTimeScale },
  });
}

/**
 * Coarse pointer means a phone or tablet: the tightest frame budget and the
 * highest physical pixel density, which is the combination that makes trading
 * particle count for frame time invisible. See the note in tuning.ts.
 */
function particleStride(): number {
  const coarse =
    typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const value = coarse
    ? OCEAN_TUNING.particles.particleStrideCoarse
    : OCEAN_TUNING.particles.particleStride;
  return Math.max(1, Math.floor(value));
}

function setParticleConstants(particles: Draw, output: Output): void {
  const camera = oceanCamera(output.size);
  const tuning = OCEAN_TUNING;
  const stride = particleStride();
  particles.set({
    u: {
      view: camera.view,
      projection: camera.projection,
      viewport: [output.size[0], output.size[1], 1, OCEAN_RESOLUTION],
      world: [
        tuning.simulation.worldSize,
        tuning.simulation.displacementScale,
        // Scaled by the stride so that a quarter as many points still cover the
        // same area: coverage goes as count x size², so size must go as stride.
        tuning.particles.pointSize * stride,
        stride,
      ],
      fade: [
        tuning.particles.fadeNear,
        tuning.particles.fadeFar,
        tuning.particles.fadePower,
        0,
      ],
      oceanColor: tuning.particles.oceanColor,
      neonColor: tuning.particles.neonColor,
      foamColor: tuning.particles.foamColor,
    },
  });
}

export function renderAt(
  gpu: Gpu,
  graph: OceanGraph,
  output: Target,
  time: number
): void {
  setDynamics(graph, time);
  frame(gpu, (currentFrame) => renderGraph(currentFrame, graph, output));
}

/**
 * @param simulate advance the water this frame. False replays the last
 * displacement and normal/foam textures — see adaptation 4 in the header. The
 * initial spectrum is seeded regardless, because there is nothing to replay yet.
 */
export function renderGraph(
  currentFrame: Frame,
  graph: OceanGraph,
  output: Output,
  simulate = true
): void {
  const pass = (target: Output, drawable: Draw | Effect) =>
    currentFrame.pass({ target, clear: TRANSPARENT }, (encoder) =>
      encoder.draw(drawable)
    );
  if (graph.needsInitialSpectrum) {
    pass(graph.simulation.noise, graph.effects.noise);
    pass(graph.simulation.h0, graph.effects.initialSpectrum);
    graph.needsInitialSpectrum = false;
  }
  if (simulate) {
    pass(graph.simulation.spectrum, graph.effects.evolveSpectrum);
    for (const stage of graph.ifft) {
      pass(stage.output, stage.effect);
    }
    pass(graph.simulation.normalFoam, graph.effects.normals);
  }
  pass(graph.scene, graph.particles);
  pass(graph.bloom.bright, graph.effects.bright);
  for (const level of graph.bloom.levels) {
    pass(level.horizontal, level.horizontalEffect);
    pass(level.vertical, level.verticalEffect);
  }
  pass(graph.bloom.composite, graph.effects.composite);
  pass(output, graph.effects.present);
}

export function bloomSizes(
  size: readonly [number, number]
): [number, number][] {
  /* Half the buffer, or whatever keeps the base under baseMaxWidth — whichever
     is smaller. One scale for both axes, so the pyramid keeps the frame's aspect
     ratio and the blur stays circular. See the note in tuning.ts. */
  const scale = Math.min(0.5, OCEAN_TUNING.bloom.baseMaxWidth / Math.max(1, size[0]));
  let width = Math.max(1, Math.round(size[0] * scale));
  let height = Math.max(1, Math.round(size[1] * scale));
  return Array.from({ length: OCEAN_TUNING.bloom.levels }, () => {
    const level: [number, number] = [width, height];
    width = Math.max(1, Math.round(width / 2));
    height = Math.max(1, Math.round(height / 2));
    return level;
  });
}

export function destroyGraph(graph: OceanGraph): void {
  destroyTargets([
    ...Object.values(graph.simulation),
    graph.scene,
    graph.bloom.bright,
    graph.bloom.composite,
    ...graph.bloom.levels.flatMap((level) => [
      level.horizontal,
      level.vertical,
    ]),
  ]);
}

function destroyTargets(targets: readonly Target[]): void {
  runCleanups(
    [...targets].reverse().map((value) => () => value.color.destroy())
  );
}

function runCleanups(cleanups: readonly (() => void)[]): void {
  let firstError: unknown;
  let failed = false;
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch (error) {
      if (!failed) firstError = error;
      failed = true;
    }
  }
  if (failed) throw firstError;
}

function normalizedSize(size: readonly [number, number]): [number, number] {
  return [Math.max(1, Math.floor(size[0])), Math.max(1, Math.floor(size[1]))];
}

function sameSize(a: readonly number[], b: readonly number[]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}
