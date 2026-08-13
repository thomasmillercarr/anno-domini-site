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
[`scripts/herofield.ts`](web/src/scripts/herofield.ts): one fullscreen quad, one WebGL2 fragment
shader, rendered at the display's own resolution. It replaced a 2675×1506 WebP that visibly blurred
on any display wider than its own pixel count. There is no hero image, no `site.hero.image`, and no
hero preload in `Base.astro` — do not reintroduce them.

Things to know before editing it:

- **Contrast is load-bearing.** The headline, sub-label and CTA are light type over this, under
  `.hero__veil`. The shader's `guard` term and lower-left fog bank exist to keep that legible, and the
  palette anchors (`SKY` / `CORE` / `FOG`) are sampled from the photograph it replaced so the type
  contrast did not regress. Measured against that baseline: sub 2.41:1 (was 2.26), h1 4.91:1 (was
  4.53), CTA 6.16:1 (was 6.22). Lighten any of it and you are trading away legibility. Note
  `test-contrast.mjs` does **not** cover this — it only checks token pairs.
- **Filaments are iso-lines of a warped *coordinate*, not of the noise.** Iso-lines of isotropic fbm
  are closed loops and read as a contour map. Strand width is set from `fwidth()` so it stays fixed in
  screen pixels at any DPR — that is what keeps it sharp, and why harmonics fade out past Nyquist.
- **It runs off `gsap.ticker`**, which `scroll.ts` already drives in lockstep with Lenis. Do not open a
  second rAF loop; one clock is what keeps it feeling attached to the smooth scroll.
- **The canvas must never set its own transform** — `reveal.ts` scrubs `yPercent` on `.hero__slot` for
  the scroll parallax and the two would fight.
- **Fallbacks**: no WebGL2, or a lost context, drops to the CSS gradient on `.hero`, which is built
  from the same palette and is a complete design on its own. Reduced motion renders exactly one frame
  (and takes `preserveDrawingBuffer`, without which that frame vanishes on the next re-raster).
- The resolution ladder only ever steps **down**, on frames slower than 24ms. Keep that threshold well
  clear of the 16.7ms a healthy 60fps frame takes, or it walks straight to the lowest resolution and
  reintroduces the blur this replaced.

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
