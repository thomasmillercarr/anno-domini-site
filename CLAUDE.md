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

It draws an **ASCII terrain**: a layered mountain silhouette rendered as marks on a character grid, on
a two-tone terminal palette. Angular, high contrast, minimal tonal range. **There is no bloom anywhere
in it**, and that is deliberate — an early version had glowing nodes pinned at fixed positions and
they were the thing that had to go.

Things to know before editing it:

- **The quantisation is the whole thing.** Everything that decides *what* to draw is evaluated at the
  **cell centre**, never at the fragment. Sample per-fragment instead and you get a swept field again —
  the same field, but reading as a topographic map rather than as character art. Only the ground
  gradient and the grain read the fragment, because both want to stay smooth across a cell.
- **One primitive covers the whole vocabulary.** Each cell draws a single capsule in cell-local device
  pixels, oriented along the flow. Its length carries the local density, and at length zero it
  degenerates to a dot — which *is* the empty-cell mark that makes the sky. No branch, no threshold,
  no glyph atlas. `reach` is the cell's half-extent along the mark direction, so a full-length mark
  spans its own cell exactly and butts against its neighbours: the long horizontal runs and the
  vertical columns are single-cell marks meeting end to end, not long lines.
- **Oriented marks cannot close into loops, and that lifted the constraint that shaped every earlier
  version.** An extremum in a coordinate whose iso-lines you draw *is* a closed contour, which is why
  the old line field needed a huge anisotropy (`p.y * 7.0`), a tiny node `PULL` of 0.20, and angle-
  space rays to draw a burst at all. Nothing draws a scalar field now, so the fans are simply the
  direction marks point, and the flow is free to swirl. Do not port those old constraints back in.
- **The direction is an ANGLE field, not the gradient of a scalar one.** A direct angle costs one fbm;
  differentiating a scalar costs three taps of one, and the angle is quantised immediately afterwards
  so the extra precision is thrown away. Marks run parallel to the range silhouette and swing off
  noise, with both effects fading with depth into the flank so the foreground settles into long
  horizontal runs.
- **Three octaves in `flowAngle`, and the third is not optional.** It contributes about ±11°, which
  straddles a 22.5° quantisation step, so it is precisely what scatters neighbouring cells into
  adjacent bins. Drop it and the marks comb into long uniform ribbons — smoother, ~10% cheaper, and no
  longer terrain. This was tried and reverted.
- **Back ranges sit higher AND swing harder.** Easy to get backwards: aerial perspective says distant
  things are *fainter*, not flatter, and the range meeting the sky is the one the eye reads as the
  silhouette. Give the back ranges small amplitude and the skyline goes flat and nothing below can
  rescue it.
- **The silhouette line recedes far less than the body it encloses** (`edge * (0.55 + 0.45*fade)` vs
  `flank * fade`). Fade both together and a back crest matches a front flank, and the four ranges wash
  into one band. The `break` in the ownership walk is the occlusion — frontmost claimant wins, free.
- **The faceting comes from the interpolation.** `ptri()` is a triangular-lattice noise whose
  barycentric weights are deliberately **not** smoothed, so the field is planar inside every triangle
  and the skyline is faceted rather than smoothly curved. Reintroduce the usual `f*f*(3-2f)` and it
  rounds off. Keep the octave count low for the same reason.
- **Everything accumulates in LINEAR light**, and the palette constants are already raised to 2.2.
  Never paste sRGB values into them. The tonemap is a highlight-only shoulder, deliberately not ACES.
- **The pulse floor has to sit high** (0.86). Line families overlapped, so a low floor still summed to
  a lit frame; one independent mark per cell does not, and the 0.55 that read as travelling light on
  lines reads as dim speckle here. The travelling part is the tail, not the base.
- **There is no Nyquist fade and none is needed.** The old line families had a period that could fall
  under 2px and moiré viciously. A mark is cell-sized by construction and can never approach it; the
  capsule's own ~1px AA edge is the whole story.
- **Aspect-awareness is load-bearing in three places**, all of which were wrong at first and only
  showed up on a portrait phone: `COLS` floors the cell size so a tall narrow canvas does not end up
  with ~50 columns of chunky tiles; node anchors are authored against a 16:9 half-width and rescaled,
  or five of six fall outside the frame and the sixth sits dead centre behind the headline; and the
  contrast guard's extents widen, because the copy is a column in the lower-left of a landscape frame
  but nearly the whole of a portrait one.
- **Contrast is load-bearing.** Measured across frames at 1600×900: sub 7.27:1, h1 12.34:1, CTA
  15.11:1, statcard 3.37:1 — all above the phase-4 line field they replaced (6.00 / 10.93 / 14.51 /
  3.10 by the identical method). Phone at 390×844: sub 6.52:1, h1 10.80:1. The statcard stays the
  weakest pairing — its frost is a *light* fill, so it sits as a mid-grey panel over the dark ground.
  `test-contrast.mjs` does **not** cover any of this; it only checks token pairs.
  The method is: inject CSS making the hero type transparent, screenshot several frames, measure each
  type rect's backdrop with `sharp`. The travelling light moves between frames, so a single reading is
  not trustworthy. Two traps: `.hero__h1 em` and the statcard's inline-styled SVG carry their own
  colour and survive a naive `color: transparent`, so they get measured as "backdrop" and the numbers
  come out meaningless; and the frost panel must **stay**, because the statcard text genuinely sits on
  it. Compare mean against mean — the worst-pixel column is a single hot mark behind a letter stroke
  and reads ~1.3:1 on every version of this shader, including the ones that shipped.
- **`.hero`'s CSS fallback gradient must track the shader's ground.** It is the no-WebGL and
  lost-context path, and if it still said bronze that path would look like a different site.
- **It runs off `gsap.ticker`**, which `scroll.ts` already drives in lockstep with Lenis. Do not open a
  second rAF loop; one clock is what keeps it feeling attached to the smooth scroll.
- **The canvas must never set its own transform** — `reveal.ts` scrubs `yPercent` on `.hero__slot` for
  the scroll parallax and the two would fight.
- **Reduced motion** renders exactly one frame, and takes `preserveDrawingBuffer` — without it that
  frame vanishes on the next re-raster.
- **Two perf governors.** `MAX_PIXELS` (5.5e6) caps total work, set from a GPU timer query: this
  shader costs ~2.75ms per megapixel (measured at 2.07 / 3.69 / 4.95 MP, all within 1% — it is
  genuinely linear in fill), so 5.5e6 is the largest buffer that fits a 16.7ms frame. Re-measure
  whenever the skyline walk or the flow noise changes; the octave count in `flowAngle` is the single
  biggest term. History: six line families cost 3.07ms/MP → 5.0e6, one family 2.54 → 6.0e6, the mark
  grid 2.75 → 5.5e6. At 5.5e6 a 3440-wide ultrawide renders at ~95%, which is invisible next to the
  flow texture that paid for it. It binds only at the top end. The frame-time ladder is the backstop and only steps
  **down**, on frames between 24ms and 300ms. Both bounds matter: below 24ms you are marking healthy
  60fps frames as slow, and above 300ms you are not measuring the GPU at all — Chrome throttles
  occluded windows to ~1fps without ever setting `document.hidden`, and without the upper bound the
  ladder quietly degrades the render while nobody is looking at it. It also ignores the first 90
  frames, since the load-time burst would otherwise do the same.

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
