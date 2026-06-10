# SEO/AEO Programme — Summary & Launch Checklist

**Date:** 2026-06-10 · **Scope:** Infrastructure + schema (first-pass, get-live audit). Body copy deliberately untouched (frozen placeholder; see CLAUDE.md). Source of truth: standard SEO/AEO best practice (the referenced `seo-knowledge-base/` does not exist in the repo).

---

## 1. Changes made

| Change | File | SEO/AEO impact |
|---|---|---|
| `robots.txt` allowing search + AI crawlers, with `Sitemap:` line | [web/public/robots.txt](web/public/robots.txt) | Explicitly admits Googlebot/Bingbot **and** GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Google-Extended → eligible for AI answer-engine citation (GEO). |
| XML sitemap via `@astrojs/sitemap` integration | [web/astro.config.mjs](web/astro.config.mjs) | Auto-generated `sitemap-index.xml`/`sitemap-0.xml`, URLs derived from `site` → faster, complete discovery. |
| `llms.txt` retrieval map | [web/public/llms.txt](web/public/llms.txt) | Clean Markdown entity summary + section map for LLM retrieval. |
| Domain centralised to one source (`site`), set to `annodom.com` (flagged TODO) | [web/astro.config.mjs](web/astro.config.mjs) | Canonical, OG, sitemap and schema all derive from one value → fixed `os.partners` error, one place to update on confirmation. |
| JSON-LD: Organization + WebSite + WebPage (`@graph`) | [web/src/components/Schema.astro](web/src/components/Schema.astro), wired in [web/src/layouts/Base.astro](web/src/layouts/Base.astro) | Machine-readable entity → rich-result eligibility + the single biggest lift for AI citation and E‑E‑A‑T. URLs derive from `Astro.site`. |
| OG/Twitter enhancements: `og:site_name`, `og:locale=en_GB`, `twitter:title`, `twitter:description`; `<html lang="en-GB">` | [web/src/layouts/Base.astro](web/src/layouts/Base.astro) | Better social cards + locale/language consistency with schema `inLanguage`. |
| Audit report | [AUDIT_BASELINE.md](AUDIT_BASELINE.md) | Baseline record: technical checklist, 7-dimension content score, entity audit, pre-launch SERP note. |

**Not done (deliberately):** no body-copy/H1/meta-wording edits, no FAQ section, no `Person` schema, no `sameAs`/`foundingDate` — these need real data or settled positioning and are recorded below / deferred to a future content pass.

---

## 2. 🚀 Pre-launch checklist (do before flipping live on Vercel)

**Hard blocker**
- [ ] **Confirm the final domain.** Then update 4 spots: `site` in [astro.config.mjs](web/astro.config.mjs), the `Sitemap:` host in [robots.txt](web/public/robots.txt), the host in [llms.txt](web/public/llms.txt), and the contact email in [site.ts](web/src/data/site.ts) (email is also changing). Canonical/OG/schema need no edit — they derive from `site`.

**Vercel / DNS config (dashboard, not code)**
- [ ] Pick one canonical host (apex `annodom.com` vs `www.`) and set a 301 redirect to it; force HTTPS. Avoids splitting ranking signals.

**Quick wins worth doing first**
- [ ] **Fix broken in-page nav.** Nav links `#approach`/`#about`/`#insights` and the hero CTA target anchor IDs that don't exist → dead nav + dead primary CTA. Needs deciding which section each maps to (content/IX call).
- [ ] **Dedicated 1200×630 OG image.** Current fallback `hero-banner.png` (1915×821) works but isn't an ideal social card.

**Post-launch (measurement — not blockers)**
- [ ] Verify domain in Google Search Console + Bing Webmaster Tools; submit the sitemap; request indexing.
- [ ] (Optional) Vercel Web Analytics / Speed Insights for Core Web Vitals.
- [ ] **Privacy policy** — never ported into `web/` (CLAUDE.md); footer links only a `mailto:`. Recreate as `web/src/pages/privacy.astro`, fill placeholders, link from footer. Legal, not SEO, but a real pre-launch gap.

---

## 3. Remaining manual tasks (need your data — do not fabricate)
- Real `sameAs` URLs for the Organization schema (LinkedIn company page, Companies House, Crunchbase, Google Business Profile). Add to [Schema.astro](web/src/components/Schema.astro) once known.
- `foundingDate` for the Organization, if you want it.
- A named founder/team member on the page → enables legitimate `Person` schema and closes the biggest E‑E‑A‑T gap (currently scored 3/10).
- Final contact email (changing alongside the domain).

## 4. Deferred — future content pass (gated on settling positioning)
The audit's weakest dimensions (search-intent 4/10, GEO/citation 3/10) need copy work that collides with the frozen placeholder copy and the unresolved recruitment-vs-broad-SMB voice. To be captured in a `CONTENT_RECOMMENDATIONS.md` when positioning is decided: query-matched H1/meta variants, an answer-first opening block, a visible FAQ section (+ matching `FAQPage` schema), question-shaped H2s, and 2–3 outbound authority citations. Plus a `SEO_TRACKING.md` for ongoing measurement.

## 5. Known risks
- **Wrong domain at launch** poisons every absolute URL (canonical/OG/sitemap/schema) — mitigated by the single-source `site` value, but the confirm step is mandatory.
- **Schema must keep matching visible content** — if a FAQ or founder is added later, add the matching schema then (and only then); never ship schema for content that isn't on the page.
