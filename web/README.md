# OS — Fractional AI Partner (production site)

The real, production landing page, built from the Claude Design wireframe in
`../agency-wireframe/` (kept alongside as the visual source of truth).

**Stack:** [Astro](https://astro.build) (static) · [GSAP](https://gsap.com) +
[Lenis](https://lenis.darkroom.engineering) for smooth scroll & section snapping · TypeScript.

## Commands

```bash
npm install      # once
npm run dev      # local dev at http://localhost:4321
npm run build    # static build → dist/
npm run preview  # serve the built dist/ locally
```

## How it's organised

- `src/data/site.ts` — **all copy, brand name, email, and nav links live here.** Everything is
  placeholder; edit this one file to swap in real content. No text is hard-coded in markup.
- `src/styles/os-site.css` — the design system (tokens, type roles, layout). Carried 1:1 from the
  wireframe; style against the *semantic* tokens (`--ground`, `--ink`, `--accent`…) so dark mode works.
- `src/layouts/Base.astro` — `<head>`, meta/OG, fonts, and the pre-paint theme init (no flash).
- `src/components/*.astro` — one component per page section, composed in `src/pages/index.astro`.
- `src/scripts/theme.ts` — light/dark toggle (persists to `localStorage`) + nav scroll-state.
- `src/scripts/scroll.ts` — Lenis smooth scroll, GSAP-synced **proximity section snapping** (settles
  to the nearest section top on pause; tall sections scroll freely), smooth anchor links, and a
  `prefers-reduced-motion` opt-out.
- `public/assets/` — the hero/manifesto/solution/proof images.

## Adding pages later

The nav links are on-page anchors today. To add real routes (About, Services, Contact), drop new
files in `src/pages/`, reuse `Base.astro` + the components, and point the `site.nav` hrefs at them.

## Deploy (Vercel)

Push to GitHub and import the repo into Vercel — it auto-detects Astro and runs `npm run build` to a
static output. Set the **Root Directory** to `web/` in the Vercel project settings. No adapter or
`vercel.json` needed while `output: 'static'`.
