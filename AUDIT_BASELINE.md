# AUDIT_BASELINE — Anno Domini site

**Date:** 2026-06-10
**Page audited:** single-page Astro site (`web/`), `output: 'static'`, deploys to Vercel.
**Configured domain:** `https://os.partners` (⚠ wrong — real domain unconfirmed, most likely `annodom.com`).
**Method:** static source inspection of `web/src/`. No live URL crawled (site not yet launched). Source-of-truth note: the referenced `seo-knowledge-base/` does **not** exist in the repo; this audit uses standard current SEO/AEO best practice.

> Scope reminder: body copy in [web/src/data/site.ts](web/src/data/site.ts) is **deliberately frozen placeholder** with an unresolved positioning/voice contradiction. Content findings below are recorded but **deferred to `CONTENT_RECOMMENDATIONS.md`**, not actioned.

---

## 0A. Technical baseline

| Check | Status | Notes |
|---|---|---|
| Tech stack identified | PASS | Astro 5, static output, single page, Vercel. Runtime deps: gsap, lenis. |
| `robots.txt` present | **MISSING** | No `web/public/robots.txt`. AI + search crawlers have no explicit directive. |
| AI crawlers (GPTBot/ClaudeBot/PerplexityBot/Google-Extended) | **MISSING** | No robots.txt → not explicitly allowed (and no `llms.txt` retrieval map). |
| `llms.txt` present | **MISSING** | No `web/public/llms.txt`. |
| `sitemap.xml` present | **MISSING** | No sitemap; not referenced anywhere. |
| Canonical tag | PASS | Self-referencing, absolute, derived from `Astro.site` — [Base.astro:11,24](web/src/layouts/Base.astro). Will be correct once domain is fixed. |
| Meta title | PASS | `Anno Domini — A Fractional AI Partner` (37 chars, <60). Brand-led; primary keyword/service not front-loaded (content note). |
| Meta description | PASS | 156 chars (borderline; target ≤155). Present, answer-forward. [site.ts:64](web/src/data/site.ts). |
| Open Graph tags | WARNING | `og:type/title/description/url/image` present; **missing** `og:site_name`, `og:locale`. [Base.astro:27-31](web/src/layouts/Base.astro). |
| OG image | WARNING | Uses `hero-banner.png` (1915×821, ~2.33:1). Renders, but not the ideal 1200×630 (1.9:1); no dedicated social card. |
| `twitter:card` | PASS | `summary_large_image`. Missing explicit `twitter:title`/`twitter:description` (fall back to OG — acceptable). |
| Single H1 | PASS | Exactly one — Hero "Infrastructure that returns *agency*." [Hero.astro:12](web/src/components/Hero.astro). |
| H2/H3 hierarchy | PASS | One H2 per section (Manifesto, Solution, Proof, CTA…), logical order, no skipped levels. |
| JSON-LD schema | **MISSING** | No structured data anywhere. Biggest single gap for both rich results and AI citation. |
| Image alt text | PASS | All `<img>` have descriptive `alt` (Hero, Manifesto, Solution device, Proof ×3, logos). |
| Internal links | **FAIL** | Nav links `#approach` / `#about` / `#insights` and hero CTA `#approach` target anchor IDs that **exist nowhere** in the components → in-page navigation is broken. |
| Image loading strategy | PASS | Below-fold images `loading="lazy"`; hero `fetchpriority="high"` (correct). |
| `width`/`height` on images | WARNING | No intrinsic dimensions set → potential CLS. Fix interacts with `object-fit` CSS; flagged for visual verification, not auto-applied. |
| Mobile viewport meta | PASS | `width=device-width, initial-scale=1.0`. [Base.astro:19](web/src/layouts/Base.astro). |
| HTTPS | PASS (assumed) | Vercel serves HTTPS by default; confirm on launch. |
| Render-blocking JS | PASS | Behaviour scripts bundled + deferred; only the tiny no-FOUC theme script is inline (intentional). |
| Duplicate titles/meta across pages | N/A | Single-page site. (Privacy policy page still un-ported — see CLAUDE.md.) |

### Prioritised issue list
- **Critical:** No JSON-LD schema · No robots.txt (AI crawlers not addressed) · Wrong/unconfirmed domain in config (poisons canonical/OG/schema/sitemap until fixed).
- **High:** No sitemap · No llms.txt · Broken in-page nav anchors (`#approach`/`#about`/`#insights`).
- **Medium:** OG missing `site_name`/`locale`; no dedicated 1200×630 OG image · Meta description 1 char over target.
- **Low:** No `width`/`height` on images (CLS) · No `twitter:title`/`twitter:description`.

---

## 0B. Content baseline score (7 dimensions)

> Scored on the **current placeholder copy**. The known recruitment-vs-broad-SMB voice contradiction caps several dimensions; resolving positioning is the precondition for raising them.

| # | Dimension | Score | Justification |
|---|---|---|---|
| 1 | Search intent alignment | 4/10 | H1 is an abstract brand line ("Infrastructure that returns agency"), not a query-matched statement of what is sold. A first-time visitor doesn't immediately learn "AI automation partner for UK SMBs". |
| 2 | Semantic coverage | 5/10 | Touches automation, AI operating system, workflows, CV screening, pipeline. But the recruitment-specific examples conflict with the broad-SMB framing, diluting topical clarity. |
| 3 | Information gain | 5/10 | The "already running inside a real business / built before any external client" proof angle is genuinely differentiated; undercut by vague metrics ("18.2 hrs" with no source) and placeholder feel. |
| 4 | E‑E‑A‑T signals | 3/10 | No named founder/author, no real client names/logos, no verifiable results, no `sameAs` profiles, no schema. Experience is asserted, not evidenced. |
| 5 | Structural quality | 7/10 | Clean section structure, single H1, scannable H2s, numbered "How it works" steps. Headings are topic-labels, not question-shaped (weak for AEO). |
| 6 | GEO / citation-friendliness | 3/10 | No FAQ, no schema, no answer-first opening block, ≤1 verifiable stat, no outbound authority links, no llms.txt. Low extractability for AI engines. |
| 7 | Technical quality | 7/10 | Fast static Astro, good meta/canonical/OG baseline, lazy images, alt text. Held back by missing schema/robots/sitemap and the domain config error. |

**Lowest (highest-priority) dimensions:** E‑E‑A‑T (4), GEO (6), Search-intent (1) — the first two are addressable by the infra+schema track now; intent depends on the deferred copy work.

---

## 0C. SERP baseline (pre-launch)

Site is **not yet live** on a confirmed domain, so no query can rank and a live SERP/Perplexity citation test is not yet meaningful. Inferred target queries (to be confirmed with positioning):

| Inferred target query | Current position | Note |
|---|---|---|
| "fractional AI partner UK" | Not ranking | Domain not live/indexed. |
| "AI automation for small businesses UK" | Not ranking | — |
| "custom AI tools for SMBs" | Not ranking | — |
| "AI operating system for business" | Not ranking | — |
| "automate internal workflows agency" | Not ranking | — |

→ A live SERP + Perplexity citation baseline is scheduled as the **first weekly check** in `SEO_TRACKING.md`, to run once the domain is live and indexed.

---

## 0D. Entity audit

- **Primary entity:** *Anno Domini* — a fractional AI partner that installs custom AI operating systems inside (UK SMB) businesses. The name is used consistently (`brand`, `brandFull`, footer, copyright).
- **Entity definition for machines:** **absent.** No `Organization`/`WebSite`/`WebPage` JSON-LD, so search/AI engines must infer the entity from prose alone.
- **`sameAs` / external identity links:** **none.** No LinkedIn, Wikidata, Crunchbase, Companies House, or Google Business Profile links anywhere. Entity is unconnected to the wider knowledge graph.
- **Person / author entity:** **none named.** No founder or team member appears on the page → an E‑E‑A‑T gap (and blocks any legitimate `Person` schema; will not be fabricated).
- **Contact identity:** single `mailto:hello@os.partners` (Nav, Footer). No enquiry form exists yet (privacy policy in CLAUDE.md assumes one).

**Entity actions (in the infra+schema track):** add `Organization` + `WebSite` + `WebPage` JSON-LD with consistent naming; leave `sameAs`/`foundingDate` as flagged blanks pending real URLs; recommend (do not fabricate) a named founder section for E‑E‑A‑T.

---

## Summary

Foundations are clean (fast static build, correct head meta, accessible images, single H1) but the page is **invisible to the structured-data and AI-retrieval layer**: no schema, no robots.txt, no sitemap, no llms.txt — plus a **wrong configured domain** that would poison every absolute URL on launch, and **broken in-page nav anchors**. All of these are fixable in the infrastructure + schema track without touching the frozen copy. The content-quality ceiling (intent, E‑E‑A‑T evidence, AEO extractability) is gated on resolving positioning and is deferred to `CONTENT_RECOMMENDATIONS.md`.
