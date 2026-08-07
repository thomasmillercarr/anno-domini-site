/**
 * WCAG contrast check for the light-theme token pairs that Lighthouse flagged.
 *
 * Reads the real hex values out of os-site.css rather than restating them, so
 * this fails if someone edits a token back below threshold.
 *
 *   node test-contrast.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./src/styles/os-site.css', import.meta.url), 'utf8');

const LIGHT = css.slice(css.indexOf(':root {'), css.indexOf('[data-theme="dark"]'));
const DARK = css.slice(css.indexOf('[data-theme="dark"]'), css.indexOf('/* ---------- RESET'));

/**
 * Read `--name` from one theme block, following one level of var() indirection
 * (e.g. --accent-ink: var(--timber) in dark) back to a literal hex.
 */
function token(name, block = LIGHT) {
  const m = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  assert.ok(m, `token --${name} not found in this theme block`);
  const value = m[1].trim();
  if (value.startsWith('#')) return value;
  const ref = value.match(/var\(\s*--([\w-]+)\s*\)/);
  assert.ok(ref, `token --${name} is neither a hex nor a var(): ${value}`);
  // Raw palette tokens only ever live in :root.
  return token(ref[1], LIGHT);
}

const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}

function ratio(fg, bg) {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** Flatten `pct` of `fg` over `bg` — matches the color-mix on the .live badge. */
function mix(fg, bg, pct) {
  const ch = (i) => {
    const f = parseInt(fg.slice(i, i + 2), 16);
    const b = parseInt(bg.slice(i, i + 2), 16);
    return Math.round(f * pct + b * (1 - pct))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${ch(1)}${ch(3)}${ch(5)}`;
}

const AA = 4.5; // normal-sized text

/** background: color-mix(in srgb, var(--accent) 12%, transparent) over the ground. */
const liveTint = (ground, accent) => mix(accent, ground, 0.12);

const cases = [];
for (const [theme, block] of [
  ['light', LIGHT],
  ['dark', DARK],
]) {
  const ground = token('ground', block);
  const accentInk = token('accent-ink', block);
  cases.push(
    [`${theme}: --ink-mute on --ground (.menu__text, .label)`, token('ink-mute', block), ground, AA],
    [`${theme}: --accent-ink on --ground (.step__num, .menu__gtitle, .proof__bar b)`, accentInk, ground, AA],
    [`${theme}: --accent-ink on the .live tint`, accentInk, liveTint(ground, token('accent', block)), AA],
    [`${theme}: --ink-soft on --ground (body copy)`, token('ink-soft', block), ground, AA],
  );
}

let failed = 0;
for (const [label, fg, bg, min] of cases) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2)}:1  (need ${min})  ${label}  [${fg} on ${bg}]`);
}

assert.equal(failed, 0, `${failed} light-theme contrast pair(s) below WCAG AA`);
console.log('\nAll light-theme text pairs clear WCAG AA.');
