#!/usr/bin/env python
"""
Subset the self-hosted Archivo woff2 files down to the character set this site
actually needs.

The upstream latin file is ~88KB and lands in the first network wave alongside
the LCP hero image, so it was taking more than half the critical bandwidth for
glyphs the site never renders.

Both variable axes are preserved as *ranges* — the design drives them hard via
font-variation-settings, so they must never be flattened to a static instance.
They are narrowed, though: the stylesheet only ever asks for wdth 96-125 and
wght 400-680, while the upstream font carries wdth 62-125 and wght 100-900. Most
of a variable font's weight is per-axis delta data, so clipping the unused ends
of the designspace saves far more than dropping glyphs does.

AXES below keeps headroom either side of what the CSS currently uses. If you set
a font-variation-settings value outside these ranges the browser will silently
clamp it — widen the range here and re-run rather than working around it.

The range below is deliberately wider than the current copy (which uses 84
glyphs): full Basic Latin, Latin-1 accents, and the punctuation/currency/arrows
the design uses. Editing copy should not be able to produce tofu.

Usage (needs: pip install fonttools brotli):
    python scripts/subset-fonts.py           # writes *-subset.woff2 next to the source
    python scripts/subset-fonts.py --check   # report sizes only, write nothing
"""

from __future__ import annotations

import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FONT_DIR = Path(__file__).resolve().parent.parent / "public" / "fonts"

# Axis ranges to keep, with headroom over what os-site.css actually requests
# (wdth 96-125, wght 400-680). Tuples are (min, max) — never a bare number,
# which would pin the axis and flatten the font.
AXES = {"wdth": (90, 125), "wght": (300, 700)}

# Keep in sync with the unicode-range declarations in src/styles/os-site.css.
UNICODES = ",".join(
    [
        "U+0020-007E",  # Basic Latin
        "U+00A0",  # nbsp
        "U+00A3",  # £
        "U+00A7",  # §
        "U+00A9",  # ©
        "U+00AB",
        "U+00BB",  # « »
        "U+00B0",  # °
        "U+00B7",  # ·  (used as the brand separator)
        "U+00C0-00FF",  # Latin-1 accented letters
        "U+0152-0153",  # Œ œ
        "U+2010-2014",  # hyphens, en/em dash
        "U+2018-201D",  # curly quotes
        "U+2020-2022",  # dagger, bullet
        "U+2026",  # …
        "U+2032-2033",  # prime, double prime
        "U+2039-203A",  # ‹ ›
        "U+20AC",  # €
        "U+2122",  # ™
        "U+2190",
        "U+2192",  # ← →  (the .mk button arrows)
    ]
)

SOURCES = [
    "archivo-latin-normal.woff2",
    "archivo-latin-italic.woff2",
]


def axes(font: TTFont) -> dict[str, tuple[float, float]]:
    if "fvar" not in font:
        return {}
    return {a.axisTag: (a.minValue, a.maxValue) for a in font["fvar"].axes}


def fmt(ax: dict[str, tuple[float, float]]) -> str:
    return ", ".join(f"{t} {lo:g}-{hi:g}" for t, (lo, hi) in ax.items()) or "static"


def build(src: Path, out: Path) -> None:
    font = TTFont(src)
    before_axes = axes(font)

    # Narrow, never pin: only axes this font actually has.
    limits = {tag: rng for tag, rng in AXES.items() if tag in before_axes}
    if limits:
        font = instancer.instantiateVariableFont(font, limits, inplace=True, updateFontNames=False)

    options = subset.Options(layout_features=["*"], name_IDs=["*"], flavor="woff2")
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=subset.parse_unicodes(UNICODES))
    subsetter.subset(font)

    font.flavor = "woff2"
    font.save(out)

    kept = axes(TTFont(out))
    # A pinned axis renders as a static cut and would silently flatten the
    # typography this design is built on — fail loudly rather than ship it.
    for tag in limits:
        assert tag in kept, f"{src.name}: axis {tag} was dropped"
        lo, hi = kept[tag]
        assert lo < hi, f"{src.name}: axis {tag} got pinned to {lo:g}"
    print(
        f"{src.name}: {src.stat().st_size / 1024:.1f}KB -> {out.stat().st_size / 1024:.1f}KB "
        f"({100 - out.stat().st_size * 100 // src.stat().st_size:d}% smaller)  axes: {fmt(kept)}"
    )


def main() -> int:
    check_only = "--check" in sys.argv
    missing = [n for n in SOURCES if not (FONT_DIR / n).exists()]
    if missing:
        print(f"missing source font(s): {', '.join(missing)}", file=sys.stderr)
        return 1

    for name in SOURCES:
        src = FONT_DIR / name
        out = FONT_DIR / name.replace(".woff2", "-subset.woff2")
        if check_only:
            if out.exists():
                print(f"{name}: subset is {out.stat().st_size / 1024:.1f}KB, axes: {fmt(axes(TTFont(out)))}")
            continue
        build(src, out)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
