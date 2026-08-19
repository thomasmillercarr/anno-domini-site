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

It draws a **contoured relief landscape**: a folded, eroded landmass carved by dense cream iso-lines
over a soft dusty ground. Coral bodies, deep red in the troughs, cream blowing out along the lit
crests. The contour bands migrate across the surface while the folds themselves slowly reshape.

On top of the field sits a **choreographed statement layer** — five moves, all of them uniforms and
a little ALU, zero new per-fragment noise evaluations, so the pixel budget below is untouched:

- **Formation** (`uForm`): the first ~2.9s after the ticker starts drain the sea to surface the
  landmass — highest peaks first, flooding in from the upper right along the tilt — while the
  contour lines etch in from hairlines and the specular arrives last. At `uForm = 0` the frame is
  the bare sky gradient, which is what the CSS fallback paints, so the `is-live` fade is seamless.
  The CSS type entrance is untouched and owns the first beat; the world assembles behind it.
- **Submergence** (`uSink`): reveal.ts feeds the hero's scroll-out progress into the exported
  `setHeroScroll()` from the *same* ScrollTrigger that scrubs the parallax — the sea rises and
  swallows the landmass as the visitor leaves, and gives it back on the way up. No scroll listener
  in herofield.ts, no second trigger.
- **Pressure ripples** (`uRip[3]`, gated by `uRipOn`): a mouse/pen press — or on touch a real tap,
  pointerup within 350ms/12px so scroll flicks never fire — drops a travelling gaussian ring into
  the *height*, with its analytic gradient added to the shading normal: the contours and lighting
  genuinely wave outward, it is not a colour overlay. Three pooled slots, oldest recycled; the
  whole block is uniform-gated so idle frames skip it. This is the one field interaction phones get.
- **Theme sweep** (`uDark`/`uDarkTo` + `uSweep`): the theme change is a radial front expanding from
  the toggle button over ~0.82s — night crosses the landscape — replacing the old whole-frame
  temporal lerp. A toggle while the ticker is stopped (hero off-screen, tab hidden) snaps instead,
  so the field is never caught mid-front when it scrolls back in. Idle frames have
  `uDarkTo == uDark` and the mix collapses to the settled value.
- **Living light** (`uLdir`/`uLhalf`): the light direction orbits ±4° over ~26s so crest highlights
  crawl along the ridges at idle. Both vectors are rotated by the same angle on the JS side, and
  `time = 0` reproduces the old constants exactly — which is what the reduced-motion frame renders.

Pointer input (bulge, wake, ripples, sweep origin) is normalised against the **canvas box, not the
hero's** — the canvas is the shader's coordinate frame (it bleeds 124% for the parallax), and its
rect includes the parallax transform, which is the visual truth a cursor lines up against.

Things to know before editing it:

- **The ratio of `TILT` to `NAMP` is the whole look, and it is the first thing to preserve.** An fbm
  has no preferred direction, so its iso-lines close into rings around every local extremum: contour a
  plain fbm and you get concentric whorls and little eyes, which is marbled paper. A plane has
  perfectly parallel iso-lines and no character at all. What the reference actually is, is a **plane,
  warped** — long lines running roughly parallel across the frame, folded into sweeping curves,
  closing into a lens shape only occasionally. That comes from letting the tilt dominate the height
  about **3:1** and putting the character in the **domain warp**, which bends parallel bands without
  creating new extrema for them to close around. Pushing `NAMP` up toward `TILT` was tried; the rings
  come straight back.
- **The contours are deliberately allowed to SATURATE to solid cream, and that is not aliasing.** The
  line is drawn with `smoothstep(0, fwidth(c), …)`, so its edge softness tracks how fast the bands
  cross the screen. Where a slope is steep enough that a band spans under a pixel, that smoothstep
  cannot resolve anything and coverage tends to the mean — flat grey. The `max` against
  `smoothstep(0.20, 0.58, aa)` takes it the rest of the way to solid cream. That wash along the crests
  is the most recognisable thing about the look. Do not "fix" it by pinning the line width.
- **The domain warp is divergence-free** (`v = rot90(grad psi)`), not an arbitrary noise vector. A warp
  with sinks bunches the iso-lines into knots.
- **The shading gradient deliberately excludes the tilt.** The tilt is a constant, so folding it into
  the normal lights the whole frame from one fixed angle regardless of the local surface — a flat wash
  across the picture instead of modelling. What catches the light is the deviation from the plane.
- **Shading uses `gSoft`, the first two octaves only.** The full gradient is dominated by the finest
  octave and lighting a surface with it looks sandblasted with no readable form. The fine detail is
  already carried by the contour lines. Splitting it out inside the same loop costs no extra noise.
- **The fbm gain is 0.53, not 0.5.** At 0.5 the slope is near-uniform across the frame, the contours
  come out evenly spaced everywhere, and it reads as a survey map. The extra weight on the fine octaves
  is what makes some stretches pack tight and blow out while others open into broad coral — and what
  erodes the silhouette into fingers.
- **Every octave is rotated as well as scaled.** Value noise sits on a square lattice and its features
  align with the axes; stacking octaves on the same axes draws tall axis-aligned rectangles. Contours
  make that unmissable, because they trace the iso-lines directly.
- **Gradients are analytic, not finite differences.** `vnoiseD` returns value and exact derivative from
  the same four corner hashes. Three taps of an fbm is 3× the noise for a worse answer.
- **The composition guards are MEASURED from layout, not hard-coded**, and this is the correction that
  matters most. `uContentHW` is the real `.hero__grid` half-width and `uQuietTop` the real top edge of
  the copy column and the statcard, in the canvas's own coordinates. Two separate bugs came from magic
  numbers here: a guard in *frame* coordinates protects empty margin on an ultrawide while leaving the
  statcard on open terrain (the layout caps at `--maxw` and centres), and a fixed vertical ceiling that
  looked right at 900px tall put the sub-label on bare terrain at 586px — measured at 4.05:1. There is
  no constant that is correct at every viewport.
  The measurement uses **`offsetTop`, not `getBoundingClientRect`**, because `reveal.ts` scrubs a 64px
  y transform onto `.hero__grid`; rects include it, so a resize part-way down the page would bake in
  the wrong ceiling. It also re-runs on `document.fonts.ready`, since the webfont landing is the one
  reflow that changes the headline without changing the buffer size.
- **The nav guard is MEASURED and THEME-WEIGHTED, and both halves were paid for.** The nav is pinned
  to the top of the frame where the mass sits and has no frost until it scrolls. Raising sea level
  there would carve the landmass off the top edge, the best part of the composition, so the guard
  works on the marks instead — but its extent is now `uNavY`, the nav's real bottom edge read in
  `measure()`, because the hard-coded `0.86` it replaced was the same class of bug as the other
  magic-number guards: the nav is a fixed-height bar over a viewport-relative canvas, so at real
  viewport heights the link glyphs sat *below* the damped strip, and a 20-second watch caught the
  migrating copper crests taking the dark theme's links to 3.0:1. And the damp is weighted by the
  per-fragment theme value, because the themes fail in opposite directions: dark puts near-white
  type over the field, so it mutes the bright marks (lines 84%, specular 95% — the specular half
  matters most, a crest blowout with the highlight on it is the brightest thing the field produces);
  light puts near-black ink over it, and muting the lines there UNCOVERS bare coral and deep
  troughs — measured, the ink went to 3.6:1 the moment the lines were damped — so light keeps every
  line and lifts the troughs toward the coral mid-tone instead. Weighted by `dk`, a theme sweep
  carries the right guard across with the front.
- **Everything accumulates in LINEAR light**, and the palette constants are already raised to 2.2.
  Never paste sRGB values into them. The tonemap is a highlight-only shoulder with **K = 0.80** — high
  because this palette is high-key, and a shoulder starting at 0.55 compresses the cream lines, which
  are the brightest thing in the frame and the whole subject. Deliberately not ACES.
- **No bloom.** The crest glow is a specular term, not energy spreading.
- **Two palettes, selected per-fragment by the theme front** (`uDark` is the settled value, `uDarkTo`
  the incoming one, `uSweep` the front — see the statement layer above). The coupling is
  one-directional: `herofield.ts` watches `data-theme` with a `MutationObserver`; `theme.ts` knows
  nothing about the canvas. Under reduced motion the same observer calls `draw(0)` with both values
  snapped, since there is no ticker to sweep on.
  The dark palette's line and crest tones are **deliberately darker than the obvious rose-gold**: the
  dark theme puts near-white type over this, and a brighter copper took the nav links to 4.50:1.
- **`.hero`'s CSS fallback gradient must track the shader's ground**, in both themes. It is the no-WebGL
  and lost-context path.
- **It runs off `gsap.ticker`**, which `scroll.ts` already drives in lockstep with Lenis. Do not open a
  second rAF loop; one clock is what keeps it feeling attached to the smooth scroll.
- **The canvas must never set its own transform** — `reveal.ts` scrubs `yPercent` on `.hero__slot` for
  the scroll parallax and the two would fight.
- **Reduced motion** renders exactly one frame — a COMPLETE one, `uForm` pre-seeded to 1, never a
  half-formed landscape — and takes `preserveDrawingBuffer`, without which that frame vanishes on
  the next re-raster. Verified by forcing the flag, re-rastering, and reading the buffer back.
- **A lost context tears down, a restored one re-boots.** Every listener hangs off one
  AbortController and every observer lands in one list, so `webglcontextlost` strips the instance
  down to the CSS gradient and `webglcontextrestored` re-runs `init()` as a clean second boot — no
  doubled listeners, no ticker drawing into a dead context. `measure()` is called explicitly in
  `init()` because a re-init finds the canvas already at the right buffer size, so `resize()`
  early-returns and would leave the composition guards at their defaults.
- **Perf: 2.094 ms/MP, so `MAX_PIXELS` is 7.9e6.** Measured with a GPU timer query at 2.01 / 3.69 /
  5.01 MP, which came back at 2.095 / 2.094 / 2.094 — linear in fill to within 0.05%, so the budget is
  just 16.7 / 2.094. That is **up** from the smoke-and-wiring field's 4.4e6, which is counter-intuitive
  for a busier-looking picture: that shader spent four backward-advection samples times five routed
  runs per fragment, and this evaluates a single height field — 6 noise evaluations (2 warp + 4 height)
  against its eleven-plus. The contours are cheap; it was the transport that was expensive. A 1600×900
  window on a 2× display now renders at a full 1:1 buffer where the previous field managed 78%, a 4K
  panel at 1× lands at 98%, and a phone renders at its native 3×.
  When measuring, the drawing buffer must be allocated **once outside the timed batch** — resizing per
  draw put the three sizes 2× apart and destroyed the linearity the budget depends on.
  If a future measurement forces a cut, drop the height fbm to 3 octaves **before** dropping
  resolution: an octave costs fine grain the contour lines already carry, resolution costs the lines.
  The frame-time ladder is the backstop and only steps **down**, on frames between 24ms and 300ms. Both
  bounds matter: below 24ms you are marking healthy 60fps frames as slow, and above 300ms you are not
  measuring the GPU at all — Chrome throttles occluded windows to ~1fps without ever setting
  `document.hidden`. It also ignores the first 90 frames, since the load-time burst would do the same.
- **Contrast, measured — and the honest headline is that a light field caps it.** Near-white on
  near-black could reach 14.71:1 for the h1; charcoal on coral and cream cannot, because the palette's
  mid-tones set the ceiling. Every pairing clears AA in both themes with room, but the h1 is lower than
  the field it replaced and that is inherent to the direction, not a tuning failure.
  Measured at 1282×586, mean-against-mean, against **tight glyph rects** (see below):

  | | sub | h1 | h1 em | CTA | statcard | nav link |
  |---|---|---|---|---|---|---|
  | light | 6.38 | 7.78–10.80 | 6.31 | 15.08 | 12.64 | 5.68 |
  | dark | 6.73 | 9.30–15.76 | 8.69 | 16.33 | 15.25 | 6.45 |

  **Re-measured after the statement layer landed** (1440×810, buffer-sampled under the glyph rects,
  minimum over a 20-second watch so the migrating bands are caught at their worst — a stricter bar
  than the table above, which is typical frames): light nav 7.29 / sub 7.24 / h1 8.26 / em 5.55;
  dark nav 6.21 / h1 9.81 / em 8.30. The dark sub reads 4.25 on the *bare buffer*, but the buffer
  probe deliberately excludes `.hero__veil`, whose dark wedge holds ≥0.12 near-black alpha at the
  sub's corner and lifts the real rendered figure past ~5.2 — the buffer numbers are conservative by
  construction. Two of those minimums exist only because of the theme-weighted `uNavY` guard above;
  before it, the 20s watch caught dark nav at 2.99 and (with lines damped) light nav at 3.61. The
  settled frame is otherwise unchanged by the statement layer; the living light is the only term
  that moves the settled distribution and its swing never approached AA.

  `test-contrast.mjs` does **not** cover any of this; it only checks token pairs, and it needs no
  changes here because every hero override is scoped rather than applied to the global tokens.
  The method: read the type rects and their computed colours, inject CSS making the hero type
  transparent, screenshot several frames, measure each rect's backdrop with `sharp`. Five traps:
  1. **Use glyph rects, not element boxes.** A `<p>` spans its column, so its right half is empty space
     the letters never cover — measuring that blames backdrop the reader never sees. A `Range` over the
     contents gives one tight rect per line. This moved the sub by over a point.
  2. **Read the computed colours *before* injecting the probe CSS**, or they all come back transparent.
  3. **Wait ~900ms after a theme switch before reading colours.** `.btn` and `.nav-link` both transition
     `color` over 360ms, so an immediate read reports the *outgoing* theme's value and looks exactly
     like a cascade bug. This cost a diagnostic pass.
  4. `.hero__h1 em` and the statcard SVG carry their own colour and survive a naive `color: transparent`.
     The frost panel and the `.btn` fill must **stay** — text genuinely sits on them.
  5. The field moves, so a single frame is not trustworthy; and compare mean against mean, because the
     worst-pixel column is a single hot mark behind a letter stroke and reads ~1.3:1 on every version of
     this shader, including the ones that shipped.

### The hero layout is composed around the field

The light theme's hero field is **light**, so hero type is **dark ink over it** — the reverse of every
other full-bleed section on the page. These things in [os-site.css](web/src/styles/os-site.css) belong
to the hero composition, not to the generic component they look like:

- **`--on-img` / `--on-img-mute` are overridden SCOPED to `.hero` and `.nav.on-hero`, never at `:root`.**
  Those are global tokens, and `.mpanel`, `.principle`, `.device__panel` and the `.io-*` labels all
  still sit on dark photography. Redefining them globally inverts type that is still correct. The dark
  theme puts both back to the light-on-image values, because the field goes deep there.
  `--on-img` is near-black (`#12100E`) rather than a soft charcoal, and the mute alphas are high (0.94
  light / 0.88 dark), because the nav links have to clear AA against bare coral — the darkest thing the
  field puts under type — with no frost until the page scrolls.
- **Anything that hardcoded `rgba(246,242,234,…)` now derives from `currentColor`** via `color-mix`:
  `.btn--onimg`, `.nav.on-hero .btn`, `.nav.on-hero .nav-toggle`, `.hero__h1 em`, and the statcard SVG's
  `stroke`/`fill` (now `currentColor`, since `.statcard` already sets `color: var(--on-img)`). A literal
  survives both the theme flip and the contrast probe's colour override, which is exactly how it hides.
  This also gave `.hero__h1 em` the `prefers-contrast` response it never had.
- **`.nav.on-hero` no longer inverts the logo.** The mark artwork is dark and must stay dark over the
  light field; `[data-theme="dark"] .os-mark__img` already covers the case where the hero is deep.
- **`.hero .statcard`'s dark frost is now scoped to the dark theme.** `--frost-fill` is a *light* tint,
  which over the light coral field is the correct pairing, so the light theme needs no override at all.
  The dark override and its `@supports not (backdrop-filter)` companion both survive under
  `[data-theme="dark"]`.
- **`.hero__veil` is a wedge, not a band**, and it inverts with the theme: a light scrim over the coral
  field, the original dark one under `[data-theme="dark"]`. A flat full-width gradient is invisible over
  a still field and is the thing that looks pasted over a moving one, because it is the only part of the
  frame that never changes. It re-centres at ≤820px where the copy stops being a column — both the light
  and dark variants.
- **`.hero :focus-visible`'s halo flips too** — a light ring over the pale field, the dark ring under
  `[data-theme="dark"]`.
- **`.hero`'s own background** is the no-WebGL fallback described above, in both themes.

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
