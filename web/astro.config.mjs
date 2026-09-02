// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
// The hero's ocean is the vgpu fft-ocean example, whose .wgsl files import each
// other like modules (see src/ocean/ocean-common.wgsl). This is the loader vgpu
// ships for exactly that; without it Vite treats .wgsl as an opaque asset and
// hands the renderer a URL instead of a shader.
import wgsl from '@vgpu/wgsl/loader-vite';

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
  vite: { plugins: [wgsl()] },
});
