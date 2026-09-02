# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The marketing site for **"Anno Domini — A Fractional AI Partner"** has been **built out in full** as
an **Astro site under [`web/`](web/)**. That is the canonical, deployable implementation — it is what
you edit.

The [`agency-wireframe/`](agency-wireframe/) folder is the **original Claude Design export** the build
came from. Treat it as **historical reference** — design intent, brand notes, and source assets — not
the build target. Do **not** edit the prototype HTML/CSS/JS to change the live site; those files no
longer drive anything. (See "Historical reference" at the bottom.)

If a request is ambiguous about *which* layer to touch (live Astro build vs. the old export) or about
scope, ask before implementing.

## Build & run

Real build system — run everything from inside [`web/`](web/):

- `npm install` — install dependencies
- `npm run dev` — Astro dev server (`astro dev`)
- `npm run build` — static build (`astro build`)
- `npm run preview` — preview the built output

Stack: **Astro 5**, `output: 'static'` (see [web/astro.config.mjs](web/astro.config.mjs)), `site:
'https://annodom.com'`. Deploys to **Vercel** from `main` (auto-detected, no adapter needed while
output stays static). Runtime deps: `gsap` (animation), `lenis` (smooth scroll) and `vgpu` (the WebGPU
hero — see below); dev deps `@astrojs/sitemap` and `@webgpu/types`. `astro.config.mjs` also registers
`@vgpu/wgsl/loader-vite`, without which the hero's `.wgsl` modules do not resolve.

Checks, such as they are: `npx tsc --noEmit` and `node test-contrast.mjs` (WCAG AA on the light-theme
token pairs). There is no test suite or lint config. `src/scripts/pointer.ts` has two long-standing
`TS2352` cast complaints that predate all current work — they are not a regression.

## Project structure (`web/src/`)

- [`pages/index.astro`](web/src/pages/index.astro) — the single page; composes the section components
  in order: Nav → Hero → Manifesto → Problem → Solution → BuildMenu → HowItWorks → Ladder → Proof →
  CTA → Footer → Booker (the Booker contact panel renders last, outside the page flow).
- [`pages/privacy.astro`](web/src/pages/privacy.astro) — the UK GDPR privacy notice at `/privacy`,
  footer-linked and sharing `Base.astro` + the Booker panel (still a draft — see pre-launch note below).
- [`layouts/Base.astro`](web/src/layouts/Base.astro) — `<html>`/`<head>` shell: meta/OG/canonical, a
  **font preload** for the subset Archivo woff2 (self-hosted, so there is no preconnect), a
  **no-FOUC inline script** (restores `localStorage['os-theme']` and
  sets `html.motion` before paint — this is the single gate for the whole motion layer), and the
  client scripts, deferred to `requestIdleCallback`.
- [`data/site.ts`](web/src/data/site.ts) — **single source of truth for all copy.** Every component
  reads from the exported `site` object; nothing is hard-coded in markup. To change wording, edit this
  file only.
- [`styles/os-site.css`](web/src/styles/os-site.css) — the entire design system (tokens, type roles,
  layout helpers, component styles). Originally ported 1:1 from the prototype; it has since gained the
  self-hosted `@font-face` block, the motion layer, press states, and the reduced-motion /
  high-contrast blocks.
- `scripts/` — client behaviour, bundled and imported by `Base.astro`: `theme.ts` (dark-mode toggle
  persisted to `os-theme`, **plus the nav `.scrolled` / `.on-hero` states**, driven by two
  `IntersectionObserver` sentinels rather than a scroll listener), `scroll.ts` (Lenis smooth scroll and
  smooth in-page anchors; exposes `window.__lenis` for scroll-lock), `statcard.ts` (hero stat counter),
  `pointer.ts` (magnetic cursor / parallax; also exports the shared `rafThrottle`), `reveal.ts`
  (scroll-linked entrance choreography, gated on `html.motion`), `booker.ts` (the GSAP-Flip contact
  panel + Web3Forms submit). See the motion-layer notes for the `html.motion` gating pattern.
- The hero backdrop, which is its own subsystem — see the section below:
  `heroocean.ts` (picks the renderer and owns the ticker/visibility gating; the only one `Base.astro`
  imports), `heroscroll.ts` (three lines of scroll state, deliberately separate), `herofield.ts` (the
  WebGL2 fallback) and `oceanfft.ts` (its FFT height source).
- [`ocean/`](web/src/ocean/) — the vgpu fft-ocean example, pulled rather than reimplemented. Treat it
  as vendored: keep it close to upstream and put site-specific behaviour in `heroocean.ts` instead.
- `components/` — one `.astro` per section, each importing `site` for its copy.

## Content lives in `site.ts`

[`web/src/data/site.ts`](web/src/data/site.ts) is the only file to touch for copy.

The copy is **written and coherent** — it is no longer the wireframe's placeholder text. It is written
against `WEBSITE-COPY-SOURCE.md` (the offer), and that document's §0 voice rules apply to every string
in the file: British English, no exclamation marks, no em/en dashes used as a pause (commas or full
stops instead; hyphenated compounds are fine), understated, the catch stated rather than hidden.
Match that voice when editing.

The ladder is **Founding Build → The Audit → The Retainer** under the heading "Three ways in", and the
CTA is the soft "Start a conversation". The wireframe's recruitment-oriented sections and its
transactional CTA were rewritten out some time ago; if you find a description of them anywhere, it is
stale.

## Design system (`web/src/styles/os-site.css`)

The whole visual system is token-driven from `:root`. Style against the **semantic** tokens, never raw
palette, so theming holds:

- **Theming**: light is default (`<html data-theme="light">`). `[data-theme="dark"]` overrides the
  same semantic tokens. `scripts/theme.ts` flips `data-theme` and persists to `localStorage['os-theme']`;
  `Base.astro`'s inline script restores it before paint. Semantic tokens (`--ground`, `--surface`,
  `--ink`, `--ink-soft`, `--ink-mute`, `--accent`, `--accent-warm`, `--support`, `--frost-*`,
  `--on-img`/`--on-img-mute`) reference raw palette tokens (`--bone`, `--linen`, `--sand`, `--timber`,
  `--clay`, `--sage`, `--charcoal`).
- **Motion**: one easing token, `--ease` (`cubic-bezier(.22, 1, .36, 1)`, a quintic decelerate). Every
  transition and keyframe uses it; durations stay per-component. Do not reintroduce the bare `ease`
  keyword — it is ease-in-out, and mixing the two is what made transitions meant to match visibly
  differ. The one deliberate exception is the statcard's 1100ms line draw.
- **Press**: `:active` states live in one block near the `:focus-visible` rules. They ride the
  independent `scale` property, never `transform`, so they compose with the magnetic translate on
  `.btn`. Press-in is 90ms against the slower hover ease; the release settles on the base duration.
- **Typography**: a single variable font, **Archivo**, **self-hosted** from `web/public/fonts/` via the
  `@font-face` block at the top of `os-site.css` (subset by `scripts/subset-fonts.py`; preloaded in
  `Base.astro`, no third-party round-trip). The design leans hard on variable-font axes —
  `font-variation-settings` sets width (`wdth` 62–125) and weight (`wght`) per type role (`.display`,
  `.display-xl`, `.label`, `.body`, `.lede`, etc.). Preserve the exact axis values; they carry the brand.
- **Frosted glass** (`.frost`, `.btn`) uses `backdrop-filter: blur(...)` over the imagery behind it.
  The `--frost-*` tokens and `--on-img` / `--on-img-mute` (light type over imagery) are central to the look.
- **Rhythm**: `--pad-x`, `--band`, `--maxw` plus `clamp()` everywhere drive fluid sizing. Layout
  helpers: `.wrap` (horizontal padding), `.band` (vertical section padding), `.inner` (max width +
  centering). Breakpoints at 1080px, 820px, 540px.
- **Hairlines**: `--hair` / `--hair-soft` at `--hair-w` (1px).

## The hero backdrop is the vgpu "Particles ocean"

The hero is **not an image and not a fragment shader**. `.hero__slot` is a `<canvas>` running the
[vgpu fft-ocean example](https://vgpu.sh/examples/fft-ocean) on **WebGPU**: a 512² Phillips spectrum
evolved by deep-water dispersion, an 18-pass Stockham inverse FFT, 262,144 instanced particles riding
the resulting displacement, and a five-level HDR bloom chain. There is no hero image, no
`site.hero.image`, and no hero preload in `Base.astro` — do not reintroduce them.

The example's own files live in [`web/src/ocean/`](web/src/ocean/), **pulled, not reimplemented**, and
kept as close to upstream as possible. `index.tsx` (a React wrapper) was dropped; everything else is
the example's code.

### Re-pulling the source

`npx vgpu examples pull fft-ocean` **fails on Windows** with
`VGPU-EXAMPLES-FILESYSTEM: Safe destination storage is unsupported on win32`. The same files are
published as a markdown manifest at `https://vgpu.sh/examples/fft-ocean/source.md` — one heading per
file with a fenced block under it. Fetch with curl and split on that.

`.wgsl` files in this example **import each other like modules**, so `astro.config.mjs` registers
`@vgpu/wgsl/loader-vite`. Without it Vite treats them as opaque assets and hands the renderer a URL
instead of a shader. Types come from `@vgpu/wgsl/wgsl-types` plus `@webgpu/types`, wired in
[`web/src/ocean/env.d.ts`](web/src/ocean/env.d.ts) and `tsconfig.json`.

### The four adaptations, all in `renderer.ts`

Everything else — the graph, the Stockham stage table, `prewarm`, the resize rebuild, `dispose`, and
the `runCleanups` error discipline — is untouched upstream code. **Resource cleanup in particular is
deliberately not modified**: `dispose` is idempotent, a resize generation counter drops stale graphs,
`destroyTargets` tears down in reverse allocation order, and `runCleanups` reports the first failure
without skipping later ones.

1. **No `frameLoop`.** The page has one clock — `gsap.ticker`, which `scroll.ts` drives in lockstep
   with Lenis — so the loop is an exported `step(dt)` and `clock.advance()` claims the frame's tick.
   vgpu documents this as the supported way to hand it an external ticker. Do not open a second rAF
   loop.
2. **`onFirstFrame`**, so the canvas fades in over its CSS gradient only once there is something to
   fade to.
3. **Camera pitch −10 → 3** in `tuning.ts`. The example is framed for a gallery canvas with nothing on
   top of it. At −10 the horizon sits above the canvas entirely, putting the brightest part of the
   water — the dense far field just under the horizon — at nav height, where the nav has no frost
   until the page scrolls. At 3 the horizon lands about a fifth down.
4. **The simulation runs at 30Hz** (`SIM_INTERVAL`), not once per drawn frame. `setDynamics` takes an
   absolute time, so a skipped step costs the water nothing — the next one lands it where the wall
   clock says it should be.

### The `.hero` CSS gradient is the SKY, not just a fallback

The scene target clears transparent and the particles are additive, so above the horizon and between
the particles **the visitor is looking at `.hero`'s own gradient**. This is what makes the hero read as
the brand rather than as a black demo — white foam over deep maroon in dark, sunlit spray over coral in
light. It still doubles as the no-WebGPU/no-WebGL path, so the two uses have to agree.

The light gradient was darkened deliberately and **not uniformly**. Near-black hero ink sits on it, so
darkening costs type contrast — but not evenly. The bottom two thirds, where the headline, sub-label
and CTA sit, had 14.3:1 of headroom. The top stop is where the nav links sit with no frost, and that is
the pairing nearest the line, so it barely moves. Measured against the bare gradient, which is
conservative — the particles are additive and lift whatever they land on:

| | h1 / CTA | sub (muted) | at 24% | nav links |
|---|---|---|---|---|
| was | 14.34 | 12.80 | 13.12 | 5.46 |
| now | 11.50 | 10.37 | 10.78 | 5.37 |

**The nav links against the top stop are the binding constraint.** Darkening the light hero further
fails there first.

### Performance — measured, and where the cost actually is

Measured with vgpu's **GPU timestamp timer** per pass, on an Intel Iris Xe (gen-12lp) integrated GPU.
Wall-clock rAF deltas are worthless in an automated browser: an occluded window is throttled to ~1fps
without `document.hidden` ever being set, and reads ~1000ms per frame. Use a timer query.

GPU ms, worst frame / mean (worst = the frame the simulation runs on):

| | before | after |
|---|---|---|
| 1440×810 @1x | 7.08 | 7.14 / 5.77 |
| 1440×810 @1.6x | 9.70 | 8.65 / 7.19 |
| 1920×1080 @1.6x | 13.30 | 9.37 / 7.86 |
| iPhone 390×844 @1.6x | 6.55 | 5.18 / 3.54 |
| Android 412×915 @1.6x | 6.82 | 4.92 / 3.56 |

**The thing to understand before optimising this again: most of the cost is FIXED and does not shrink
with the screen.** The 512² simulation and the particle draw cost the same on a phone as on a 4K panel,
because one is a fixed-size job and the other is geometry-bound, not fill-bound. Only bloom scaled with
resolution. Three changes came out of that:

- **Simulation at 30Hz** — halves its share, invisible at `timeScale 0.6 × spectrumTimeScale 0.5`.
- **Bloom pyramid base capped at 960px wide** (`bloom.baseMaxWidth`) instead of always half the buffer.
  Bloom was linear in pixels at 1.31 ms/MP and is now nearly constant; 6.82 → 2.88ms at 1920×1080@1.6x.
  It is a blur and its kernel radii are in texels, so the only effect is a slightly wider glow. Buffers
  at or under 1920 wide are untouched.
- **`particleStride`, coarse pointers only.** This one is **not free**, and the split is the point. At a
  desktop's pixel ratio a stride of 2 puts a particle every ~21 screen pixels and the water stops
  reading as a continuous mist — discrete dots and grid moiré, which is the quality the hero was chosen
  for. On a phone the same stride is a particle every ~13 pixels at roughly a third the physical size,
  invisible, while the frame budget is far tighter. **Desktop keeps all 262,144; phones draw 65,536**
  (2.69 → 0.72ms). `pointSize` scales with the stride so total coverage — and the brightness of the
  water — is unchanged.

Still on the table: `OCEAN_RESOLUTION` 512 → 256 would take the simulation from 2.7ms to ~0.6ms, but it
quarters the grid the particles sample, so it is a look decision rather than a free one.

### The fallback chain

**WebGPU → the WebGL2 contour field → the CSS gradient.**
[`scripts/heroocean.ts`](web/src/scripts/heroocean.ts) owns the decision and is the only hero renderer
`Base.astro` imports. It checks `navigator.gpu` **and** that an adapter actually resolves — a browser
can expose the API with no usable adapter — and dynamically imports one renderer or the other, so the
loser is never downloaded. It also stops the ticker below the fold via an IntersectionObserver
**without disposing the graph**, because rebuilding it costs h0, 18 pipelines and the bloom pyramid.

[`scripts/herofield.ts`](web/src/scripts/herofield.ts) is that fallback: the previous hero, a
single-pass WebGL2 contour landscape. Its height comes from
[`scripts/oceanfft.ts`](web/src/scripts/oceanfft.ts), a WebGL2 port of the same FFT technique (Phillips
spectrum, Stockham IFFT, Jacobian foam at 256²), which falls back again to a domain-warped value-noise
fbm where `EXT_color_buffer_float` is missing. Two things learned building it that are easy to trip
over again:

- **GLSL's `%` is undefined for negative operands**, and half a centred frame has negative texel
  indices. Use `mod()`. The symptom is hard axis-aligned rectangles across the frame.
- **Phillips' slope spectrum is flat to Nyquist.** Shaded water hides that in its normals; iso-lines
  report it directly and every contour band falls below a pixel. It needs a real short-wave cutoff —
  the reference's `l = 0.001·L` is 17mm against a 1m grid, i.e. no cutoff at all.

### Things that no longer exist

The contour field's choreography — **formation, scroll submergence, the theme sweep front, and pressure
ripples** — has no equivalent on the WebGPU path. `reveal.ts` still feeds
[`scripts/heroscroll.ts`](web/src/scripts/heroscroll.ts) from the hero's ScrollTrigger, and the WebGL2
fallback still reads it, but the ocean ignores it. If any of that is wanted back it has to be built
against the ocean, not recovered.

`setHeroScroll` lives in its own module for a reason: `reveal.ts` always loads, and importing it from
`herofield.ts` dragged the whole WebGL2 fallback (~20KB gzipped) into every visitor's bundle including
the majority running the ocean. Keep it separate.

### The hero layout is composed around the field

The light theme's hero is **light**, so hero type is **dark ink over it** — the reverse of every other
full-bleed section on the page. These things in [os-site.css](web/src/styles/os-site.css) belong to the
hero composition, not to the generic component they look like:

- **`--on-img` / `--on-img-mute` are overridden SCOPED to `.hero` and `.nav.on-hero`, never at `:root`.**
  Those are global tokens, and `.mpanel`, `.principle`, `.device__panel` and the `.io-*` labels all
  still sit on dark photography. Redefining them globally inverts type that is still correct. The dark
  theme puts both back to the light-on-image values, because the hero goes deep there.
  `--on-img` is near-black (`#12100E`) rather than a soft charcoal, and the mute alphas are high (0.94
  light / 0.88 dark), because the nav links have to clear AA with no frost until the page scrolls.
- **Anything that hardcoded `rgba(246,242,234,…)` derives from `currentColor`** via `color-mix`:
  `.btn--onimg`, `.nav.on-hero .btn`, `.nav.on-hero .nav-toggle`, `.hero__h1 em`, and the statcard SVG's
  `stroke`/`fill` (now `currentColor`, since `.statcard` already sets `color: var(--on-img)`). A literal
  survives both the theme flip and the contrast probe's colour override, which is exactly how it hides.
  This also gave `.hero__h1 em` the `prefers-contrast` response it never had.
- **`.nav.on-hero` does not invert the logo.** The mark artwork is dark and must stay dark over the
  light hero; `[data-theme="dark"] .os-mark__img` already covers the case where the hero is deep.
- **`.hero .statcard`'s dark frost is scoped to the dark theme.** `--frost-fill` is a *light* tint,
  which over the light coral ground is the correct pairing, so the light theme needs no override at all.
- **`.hero__veil` is a wedge, not a band**, and it inverts with the theme. A flat full-width gradient is
  invisible over a still field and is the thing that looks pasted over a moving one, because it is the
  only part of the frame that never changes. It re-centres at ≤820px where the copy stops being a
  column — both the light and dark variants.
- **`.hero :focus-visible`'s halo flips too** — a light ring over the pale ground, the dark ring under
  `[data-theme="dark"]`.

### Measuring type contrast over the hero

`test-contrast.mjs` does **not** cover any of this; it only checks token pairs, and it needs no changes
because every hero override is scoped rather than applied to the global tokens. To measure type against
the live backdrop: read the type rects and their computed colours, inject CSS making the hero type
transparent, screenshot several frames, measure each rect's backdrop with `sharp`. Five traps:

1. **Use glyph rects, not element boxes.** A `<p>` spans its column, so its right half is empty space
   the letters never cover. A `Range` over the contents gives one tight rect per line.
2. **Read the computed colours *before* injecting the probe CSS**, or they all come back transparent.
3. **Wait ~900ms after a theme switch before reading colours.** `.btn` and `.nav-link` both transition
   `color` over 360ms, so an immediate read reports the *outgoing* theme's value.
4. `.hero__h1 em` and the statcard SVG carry their own colour and survive a naive `color: transparent`.
   The frost panel and the `.btn` fill must **stay** — text genuinely sits on them.
5. The backdrop moves, so a single frame is not trustworthy; compare mean against mean.

## ⚠ LIVE WITH PLACEHOLDERS — privacy policy

**This is now shipping.** `main` was merged and deployed with the notice still in draft, so the
placeholders below are publicly visible at `/privacy` on a live UK GDPR notice. That was a deliberate
call, not an oversight, but it is the highest-priority outstanding item on the site.

The notice lives in the Astro build at
[`web/src/pages/privacy.astro`](web/src/pages/privacy.astro) (live at `/privacy`), is **linked from the
footer** ([web/src/components/Footer.astro](web/src/components/Footer.astro)) and from the Booker panel's
consent line, and the contact email now reads from `site.ts`. The page is still a **draft** — these
items remain before launch:

1. **Fill the remaining `[PLACEHOLDER]` tokens**: `[COMPANY LEGAL NAME]`, `[COMPANY NUMBER — if a
   registered company]`, `[REGISTERED / POSTAL ADDRESS]`, `[RETENTION PERIOD ...]` (§6), and the
   `[DATE — set on launch]` "Last updated" value. (The `[CONTACT EMAIL]` placeholder is already
   resolved — it reads from `site.ts`.)
2. Remove the visible `.draft-note` banner and the top-of-file `TODO BEFORE LAUNCH` comment.
3. The ICO contact details (§9) are real and correct — leave them as-is.
4. The enquiry form now exists — it's the **Booker** contact panel, which POSTs to **Web3Forms** (the
   policy discloses Web3Forms + Google Workspace as processors). The lawful basis is
   legitimate-interest enquiry handling; if collection ever changes to a marketing/newsletter list, the
   basis must change to explicit consent (with an unsubscribe mechanism).

## Historical reference — the `agency-wireframe/` export

This folder is the Claude Design handoff the build came from. It is **not** the live site; keep it for
provenance and assets.

- **`project/OS - Website.html` + `os-site.css`** — the prototype the Astro build was made from
  (sections match the build). The build's [os-site.css](web/src/styles/os-site.css) is ported from here
  1:1, except the design-tool `<image-slot>` rules now target real `<img>` and the gradient placeholder
  fallbacks were dropped.
- **`project/Landing Page Wireframe.html`** — an earlier, self-contained iteration with inlined styles
  and *different* brand tokens. Superseded; reference only.
- **`project/image-slot.js`** — a Claude Design custom element (`<image-slot>`) for filling mockup
  images. **Design-tool infrastructure, not shipped** — the Astro build already replaced it with
  ordinary `<img>`. Ignore it unless you specifically need to understand the old prototype.
- **`project/assets/`** — the original PNG background/proof images. These are **no longer the live
  assets**: the shipped versions are `.webp` in [`web/src/assets/`](web/src/assets/), imported by
  `site.ts` so `astro:assets` can emit width/height and a responsive srcset at build time. Keep this
  folder as the source provenance only. (`web/public/assets/` now holds just `og.jpg`, referenced by
  `Base.astro` for the social card — everything else moved out of `public/`.) The **hero** is the
  exception: it is no longer an image at all in either place, only `project/assets/` provenance —
  see "The hero backdrop is generated" above.
- **`project/uploads/` and `project/screenshots/`** — design-process scratch (user uploads, scan/fix/v2/v3
  iteration shots). Not part of the site; ignore unless referenced.
