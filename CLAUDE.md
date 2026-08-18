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
'https://os.partners'`. Deploys to **Vercel** (auto-detected, no adapter needed while output stays
static). Runtime deps: `gsap` (animation) and `lenis` (smooth scroll). There is no test suite or lint
config.

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
  (scroll-linked entrance choreography, gated on `html.motion`), `herofield.ts` (the generated hero
  backdrop — see below), `booker.ts` (the GSAP-Flip contact panel + Web3Forms submit). See the
  motion-layer notes for the `html.motion` gating pattern.
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

## The hero backdrop is generated, not photographed

The hero is **not an image**. `.hero__slot` is a `<canvas>` painted by
[`scripts/herofield.ts`](web/src/scripts/herofield.ts) — **one fullscreen quad, one program** — at the
display's own resolution. It replaced a 2675×1506 WebP that visibly blurred on any display wider than
its own pixel count. There is no hero image, no `site.hero.image`, and no hero preload in
`Base.astro` — do not reintroduce them.

It draws **digital smoke threaded through wiring**. A bus of five hard routed traces crosses the upper
half of the frame; smoke sheds off them, rises, rails along a trace where the flow runs near one, and
tears loose where a trace kinks. Two-tone: a near-flat dark warm ground and a single amber.

Things to know before editing it:

- **The smoke has no field of its own. It IS the wiring, transported.** The density source that the
  advection samples is the bus. That is the whole reason the two read as one system rather than as two
  layers alpha-blended, and it is the first thing to preserve. Give the smoke an independent noise
  field and you have built the thing this direction exists to avoid.
- **The advection accumulates ALONG the path; it does not sample the end of it.** Sampling the source
  at one backtracked point gives a displaced copy of the source, which is not a trail — it is the same
  shape somewhere else. Four samples with decaying weight is what turns a band around the wires into
  something that streams off them.
- **The sheath widens along the path.** Physically that is diffusion. Practically it is what keeps the
  trail continuous: the steps are much further apart than the sheath is wide, so a constant width draws
  the plume as a string of beads. This is also why the sample count cannot simply be reduced — three
  samples was tried, is 15% faster, and beads visibly.
- **Real iterated advection is impossible here** and the file says so. It needs state between frames,
  so a feedback texture, a second target and a second program. The one-pass substitute is per-fragment
  backward integration through an analytic field, with the velocity evaluated **once** and then rotated
  and shrunk along the path. Re-evaluating the flow per step is the naive form and roughly doubles the
  cost of the frame.
- **A run smokes where the charge is, not evenly along its length.** An even source is a curtain; it
  was one, and it draped over the upper half and buried the wiring. The emission reads the same phase
  the trace draws its pulse from, one term behind. Nothing extra is evaluated for it.
- **The faceted triangular noise that every earlier version used is GONE, and that is not a
  regression.** A piecewise-linear field has a piecewise-*constant* gradient: used as a stream function
  it gives every fragment inside a lattice triangle the same velocity, so they all backtrack identically
  and the frame fills with flat-shaded polygons with hard straight edges. And rendered as a level set
  rather than as iso-lines, a planar field simply *is* a flat polygon. The faceting was only ever
  invisible because nothing before this drew its levels. Value noise with a quintic fade replaces it;
  the crease comes from a **ridged** transform instead, which puts sharp creases on the zero set of a
  smooth field.
- **Every octave is rotated as well as scaled.** Value noise sits on a square lattice, its features
  align with the axes, and stacking octaves on the same axes draws tall axis-aligned rectangles across
  the frame. The ridged transform makes that much worse.
- **The stream function's gradient is analytic, not finite differences.** Three taps of a two-octave
  fbm is 6 noise evaluations for an approximate derivative; the closed form is 2 for an exact one. This
  is the single optimisation that has ever paid on this shader (4.42 → 3.72 ms/MP).
- **`busNear` uses vertical distance, not perpendicular distance; the drawn trace uses perpendicular.**
  The slope correction has discontinuities at every ramp boundary, and anything carrying them into a
  quantity evaluated along an advection path draws hard vertical seams down the full height of the
  frame — five runs times four ramp ends, and the frame is barred like a cage. The trace needs the
  correction because there a 40% width error is the difference between a machined join and a fat one,
  and its own extent confines the seam to the wire. The slope also has to ramp on and off **smoothly**
  over the ramp, not switch at its ends, for the same reason.
- **The composition puts the sources above the type.** The bus sits in the upper half because the
  headline is a column in the lower left and the statcard a panel in the lower right; the bottom of the
  frame is then quiet by construction rather than by clawing density back with the guard. The runs also
  terminate at staggered x, lowest soonest, so the cascade opens out over the headline's corner.
- **Everything accumulates in LINEAR light**, and the palette constants are already raised to 2.2.
  Never paste sRGB values into them. The tonemap is a highlight-only shoulder, deliberately not ACES.
- **No bloom.** The smoke's softness is density falloff, not energy spreading.
- **Aspect-awareness is load-bearing in three places**: the bus lifts on a portrait frame (the copy
  stops being a column and the statcard drops below it, so both take far more height); the step
  *heights* rescale with the half-width as well as the kink positions, or a phone routes the same climb
  over a third of the distance and the bus reads as a zigzag; and the guard's extents widen.
- **Contrast is load-bearing, and this version improved every pairing.** Measured mean-against-mean at
  1600×900: sub 7.83:1, h1 14.71:1, CTA 12.65:1, statcard 15.82:1 — against the ASCII terrain measured
  by the identical probe on the same machine: 6.91 / 12.58 / 11.90 / 3.37. Phone at 390×844: sub
  7.40:1, h1 13.23:1 (terrain 6.52 / 10.80). The statcard's jump is the **dark frost** described under
  the hero layout below, not the field.
  `test-contrast.mjs` does **not** cover any of this; it only checks token pairs.
  The method is: read the type rects and their computed colours, inject CSS making the hero type
  transparent, screenshot several frames, measure each rect's backdrop with `sharp`. The travelling
  charge moves between frames, so a single reading is not trustworthy. Three traps: `.hero__h1 em` and
  the statcard's inline-styled SVG carry their own colour and survive a naive `color: transparent`; the
  frost panel and the `.btn` fill must **stay**, because their text genuinely sits on them; and read the
  computed colours *before* injecting the probe CSS or they all come back transparent. Compare mean
  against mean — the worst-pixel column is a single hot mark behind a letter stroke and reads ~1.3:1 on
  every version of this shader, including the ones that shipped.
- **`.hero`'s CSS fallback gradient must track the shader's ground.** It is the no-WebGL and
  lost-context path, and its warm lift sits where the bus and its smoke collect.
- **It runs off `gsap.ticker`**, which `scroll.ts` already drives in lockstep with Lenis. Do not open a
  second rAF loop; one clock is what keeps it feeling attached to the smooth scroll.
- **The canvas must never set its own transform** — `reveal.ts` scrubs `yPercent` on `.hero__slot` for
  the scroll parallax and the two would fight.
- **Reduced motion** renders exactly one frame, and takes `preserveDrawingBuffer` — without it that
  frame vanishes on the next re-raster.
- **Two perf governors.** `MAX_PIXELS` (4.4e6) caps total work, set from a GPU timer query: this shader
  costs **3.795ms per megapixel** (measured at 2.01 / 3.69 / 5.01 MP, all within 0.1% — it is genuinely
  linear in fill), so 4.4e6 is the largest buffer that fits a 16.7ms frame. That is **down from the
  terrain's 5.5e6 and it is a real cost**: a 1600×900 window on a 2× display renders at ~78% where the
  terrain managed 88%, and a 3440-wide ultrawide at ~85% against 95%. A 1× desktop and a phone both
  still render 1:1. Advection is more expensive than a mark grid; the direction was chosen knowing that.
  History: six line families 3.07ms/MP → 5.0e6, one family 2.54 → 6.0e6, the mark grid 2.75 → 5.5e6,
  this 3.795 → 4.4e6.
  **Do not re-litigate the optimisation without the timer.** Measured at zero or worse: splitting the
  dead slope out of the routing (the compiler already eliminated it), merging the three per-run loops
  into one, a uniform branch around the pointer terms, and a 3σ early-out inside `busNear` (5% *slower*
  — the branch defeats the loop unrolling). Measured faster and rejected on looks: three advection
  samples (beading) and a sin-based hash (directional streaking). The noise is ~40% of the frame and
  almost nothing else registers.
  The frame-time ladder is the backstop and only steps **down**, on frames between 24ms and 300ms. Both
  bounds matter: below 24ms you are marking healthy 60fps frames as slow, and above 300ms you are not
  measuring the GPU at all — Chrome throttles occluded windows to ~1fps without ever setting
  `document.hidden`, and without the upper bound the ladder quietly degrades the render while nobody is
  looking at it. It also ignores the first 90 frames, since the load-time burst would otherwise do the
  same.

### The hero layout is composed around the field

Three things in [os-site.css](web/src/styles/os-site.css) belong to the hero composition, not to the
generic component they look like:

- **`.hero .statcard` overrides the `--frost-*` tokens to a dark fill.** `--frost-fill` is a *light*
  tint, so over a dark hero the statcard sat as a pale grey panel with near-white text on it — the
  weakest type pairing on the page at 3.37:1. Dark-on-dark takes it to 15.82:1 and it reads as smoked
  glass over the field rather than as a sticker on top of it. Scoped to `.statcard`, so the CTA pill is
  untouched, and the `@supports not (backdrop-filter)` fallback needs its own dark override or the
  generic near-opaque *light* tint undoes it.
- **`.hero__veil` is a wedge, not a band.** A flat full-width gradient is invisible over a still field
  and is the thing that looks pasted over a moving one, because it is the only part of the frame that
  never changes. It is now a wedge anchored under the type column plus a much lighter global floor, and
  it re-centres at ≤820px where the copy stops being a column.
- **`.hero`'s own background** is the no-WebGL fallback described above.

## ⚠ Outstanding before launch — privacy policy

The UK GDPR privacy notice **has now been ported** into the Astro build at
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
