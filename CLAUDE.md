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

It draws a **faceted line field on a two-tone terminal palette**: angular, high contrast, minimal
tonal range. ASCII as a discipline, not as literal glyphs. **There is no bloom anywhere in it**, and
that is deliberate — an earlier version had glowing nodes pinned at fixed positions and they were the
thing that had to go.

Things to know before editing it:

- **The faceting comes from the interpolation.** `ptri()` is a triangular-lattice noise whose
  barycentric weights are deliberately **not** smoothed. That makes the field planar inside every
  triangle, and iso-lines of a planar field are straight segments that kink only on lattice edges.
  Reintroduce the usual `f*f*(3-2f)` and every contour goes back to being a smooth curve. Keep the
  octave count low, too — each extra octave subdivides the facets and enough of them converge back on
  a smooth field.
- **Three line families at 60°** read the same warped point: one dense dominant family carrying the
  topographic reading, two lighter ones crossing it. The weight ratio between them is the main dial
  for how severe this looks. The warp amplitude must stay well under the projection scale `S` —
  comparable values pile the lines into a scribble.
- **Everything accumulates in LINEAR light**, and the palette constants are already raised to 2.2.
  Never paste sRGB values into them. The tonemap is a highlight-only shoulder, deliberately not ACES.
- **Line width is fixed in screen pixels** via `fwidth`, which is what keeps it sharp at any DPR.
  Harmonics fade out past Nyquist — do not remove that fade. Hard-edged lines moiré far more viciously
  than soft ones, so it is doing more work here than it was when the field was atmospheric.
- **Per-line identity is what stops it reading as a uniform grid.** Each line hashes brightness (cubic
  tail), width, pulse phase and whether it runs dashed, off `floor(v)`.
- **Nodes are drawn, never lit.** They are only places the lines crowd toward, and they wander.
  Keep `PULL` small: a radial pull competing with the base slope closes an iso-line into a ring at the
  radius where they cancel, which reads as a tree knot around every node.
- **Contrast is load-bearing**, though the dark ground makes it a far easier position than the bronze
  one did. Worst case, measured across frames: sub 6.90:1, h1 12.14:1, CTA 11.08:1, statcard 3.31:1.
  The statcard stays the weakest pairing — its frost is a *light* fill, so it sits as a mid-grey panel
  over the dark ground. `test-contrast.mjs` does **not** cover any of this; it only checks token pairs.
  The method is: inject CSS making the hero type transparent, screenshot several frames, measure each
  type rect's backdrop with `sharp`, take the worst. The travelling light moves between frames, so a
  single reading is not trustworthy.
- **`.hero`'s CSS fallback gradient must track the shader's ground.** It is the no-WebGL and
  lost-context path, and if it still said bronze that path would look like a different site.
- **It runs off `gsap.ticker`**, which `scroll.ts` already drives in lockstep with Lenis. Do not open a
  second rAF loop; one clock is what keeps it feeling attached to the smooth scroll.
- **The canvas must never set its own transform** — `reveal.ts` scrubs `yPercent` on `.hero__slot` for
  the scroll parallax and the two would fight.
- **Reduced motion** renders exactly one frame, and takes `preserveDrawingBuffer` — without it that
  frame vanishes on the next re-raster.
- **Two perf governors.** `MAX_PIXELS` (5.0e6) caps total work, set from a GPU timer query: this
  shader costs ~3.07ms per megapixel, so 5.0e6 is the largest buffer that fits a 16.7ms frame with
  headroom. It binds only at the top end. The frame-time ladder is the backstop and only steps
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
