// @ts-check
import { defineConfig } from 'astro/config';

// Static marketing site. Vercel auto-detects Astro and builds the static output;
// no adapter is needed while output stays 'static'.
export default defineConfig({
  output: 'static',
  site: 'https://os.partners',
});
