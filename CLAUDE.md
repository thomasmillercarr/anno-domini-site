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
  in order: Nav → Hero → Manifesto → Problem → Solution → HowItWorks → Ladder → Proof → CTA → Footer.
- [`layouts/Base.astro`](web/src/layouts/Base.astro) — `<html>`/`<head>` shell: meta/OG/canonical,
  font preconnect, a **no-FOUC inline theme script** (reads `localStorage['os-theme']` before paint),
  and the bundled deferred client scripts.
- [`data/site.ts`](web/src/data/site.ts) — **single source of truth for all copy.** Every component
  reads from the exported `site` object; nothing is hard-coded in markup. To change wording, edit this
  file only.
- [`styles/os-site.css`](web/src/styles/os-site.css) — the entire design system (tokens, type roles,
  layout helpers, component styles). Ported 1:1 from the prototype.
- `scripts/` — client behaviour, bundled and imported by `Base.astro`: `theme.ts` (dark-mode toggle,
  persists to `os-theme`), `scroll.ts` (Lenis smooth scroll + nav scroll states), `statcard.ts` (hero
  stat counter).
- `components/` — one `.astro` per section, each importing `site` for its copy.

## Content lives in `site.ts` — and is still placeholder

[`web/src/data/site.ts`](web/src/data/site.ts) is the only file to touch for copy. **Its own header
flags that the content is placeholder copy carried over verbatim from the Claude Design wireframe.**
This matters because the page currently has **two strata of copy that don't share a voice**:

- A **newer brand layer** (intentional, post-import): brand `Anno Domini`, the hero headline
  *"Infrastructure that returns agency,"* the whole Manifesto section, the footer lines. Abstract,
  craft-led, "precision that feels grown."
- An **unedited imported layer**: the Problem, Solution, HowItWorks, Ladder, Proof, and CTA sections
  are the wireframe's original recruitment-specific copy (CV screening, "JD Generator," the
  Session→Audit→Project→Retainer ladder, "Book a session").

The seam between these two is the source of the known positioning/voice contradictions
(recruitment-specific vs. broad-SMB positioning; soft-enquiry intent vs. a transactional "Book a
session" CTA + tiered ladder). A copy rewrite to resolve this is **outstanding** — when doing it, edit
`site.ts` only and settle the target reader + voice first.

## Design system (`web/src/styles/os-site.css`)

The whole visual system is token-driven from `:root`. Style against the **semantic** tokens, never raw
palette, so theming holds:

- **Theming**: light is default (`<html data-theme="light">`). `[data-theme="dark"]` overrides the
  same semantic tokens. `scripts/theme.ts` flips `data-theme` and persists to `localStorage['os-theme']`;
  `Base.astro`'s inline script restores it before paint. Semantic tokens (`--ground`, `--surface`,
  `--ink`, `--ink-soft`, `--ink-mute`, `--accent`, `--accent-warm`, `--support`, `--frost-*`,
  `--on-img`/`--on-img-mute`) reference raw palette tokens (`--bone`, `--linen`, `--sand`, `--timber`,
  `--clay`, `--sage`, `--charcoal`).
- **Typography**: a single variable font, **Archivo**, loaded from Google Fonts via `@import` at the
  top of `os-site.css` (with preconnect in `Base.astro`). The design leans hard on variable-font axes —
  `font-variation-settings` sets width (`wdth` 62–125) and weight (`wght`) per type role (`.display`,
  `.display-xl`, `.label`, `.body`, `.lede`, etc.). Preserve the exact axis values; they carry the brand.
- **Frosted glass** (`.frost`, `.btn`) uses `backdrop-filter: blur(...)` over photographic backgrounds.
  The `--frost-*` tokens and `--on-img` / `--on-img-mute` (light type over photos) are central to the look.
- **Rhythm**: `--pad-x`, `--band`, `--maxw` plus `clamp()` everywhere drive fluid sizing. Layout
  helpers: `.wrap` (horizontal padding), `.band` (vertical section padding), `.inner` (max width +
  centering). Breakpoints at 1080px, 820px, 540px.
- **Hairlines**: `--hair` / `--hair-soft` at `--hair-w` (1px).

## ⚠ Outstanding before launch — privacy policy

A UK GDPR privacy notice was written, but it currently **exists only in the old export** at
[`agency-wireframe/project/privacy-policy.html`](agency-wireframe/project/privacy-policy.html) — it was
**never ported into the `web/` Astro build**, and the live footer
([web/src/components/Footer.astro](web/src/components/Footer.astro)) links only a `mailto:`, not the
policy. Before launch:

1. **Recreate the policy as a page in `web/`** (e.g. `web/src/pages/privacy.astro`) and **link it from
   the footer.**
2. **Fill every `[PLACEHOLDER]`**: `[COMPANY LEGAL NAME]`, `[COMPANY NUMBER — if a registered
   company]`, `[REGISTERED / POSTAL ADDRESS]`, `[CONTACT EMAIL]` (appears in §1, §7, and two `mailto:`
   links), `[RETENTION PERIOD ...]` (§6), and the `[DATE — set on launch]` "Last updated" value.
3. Remove the visible `.draft-note` banner and the top-of-file `TODO BEFORE LAUNCH` comment.
4. The ICO contact details (§9) are real and correct — leave them as-is.
5. The notice assumes email is collected via a **contact/enquiry form that does not yet exist** (the
   site currently has only a `mailto:`). When that form is built, link this policy near its submit
   button. If collection ever changes to a marketing/newsletter list, the lawful basis must change to
   explicit consent (with an unsubscribe mechanism) — the current notice only covers legitimate-interest
   enquiry handling.

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
- **`project/assets/`** — the real background/proof images (`hero-banner.png`, `manifesto-bg.png`,
  `solution-bg.png`, `proof-1..3-*.png`). These are the live assets, referenced by `site.ts` and served
  from `web/public/assets/`.
- **`project/uploads/` and `project/screenshots/`** — design-process scratch (user uploads, scan/fix/v2/v3
  iteration shots). Not part of the site; ignore unless referenced.
