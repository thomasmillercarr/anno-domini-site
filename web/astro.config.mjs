// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Static marketing site. Vercel auto-detects Astro and builds the static output;
// no adapter is needed while output stays 'static'.
export default defineConfig({
  output: 'static',
  // TODO: confirm final domain — most likely annodom.com (os.partners was wrong).
  // This is the single source of truth: canonical, OG, JSON-LD schema and the
  // generated sitemap all derive their absolute URLs from this one value.
  site: 'https://annodom.com',
  // The stylesheet is the only render-blocking request on the page, and at
  // ~6.6KB gzipped it costs a full round trip to save. Two pages sharing one
  // sheet is not enough reuse to beat that, so inline it.
  build: { inlineStylesheets: 'always' },
  integrations: [sitemap()],
});
