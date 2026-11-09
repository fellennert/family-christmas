#!/usr/bin/env python3
"""
Draws the app icons into public/icons/ (a simple gold-starred Christmas tree on
deep green). Only needed if you want to change the icon; the PNGs are
committed. Requires Pillow:  python3 -m pip install pillow

    python3 scripts/generate_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

PINE = (31, 77, 58)
TREE = (58, 140, 92)
TREE_DARK = (44, 112, 74)
TRUNK = (110, 72, 40)
GOLD = (201, 162, 39)
CRANBERRY = (155, 27, 48)
CREAM = (251, 246, 236)

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"


def star(draw, cx, cy, r, fill):
    import math

    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        rad = r if i % 2 == 0 else r * 0.45
        pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    draw.polygon(pts, fill=fill)


def draw_icon(size: int, safe: float) -> Image.Image:
    """`safe` = fraction of the canvas the artwork may use (maskable needs ~0.8)."""
    scale = 4  # supersample for smooth edges
    s = size * scale
    img = Image.new("RGB", (s, s), PINE)
    d = ImageDraw.Draw(img)

    art = s * safe
    ox = (s - art) / 2
    oy = (s - art) / 2

    def P(x, y):  # artwork coordinates 0..1 -> pixels
        return (ox + x * art, oy + y * art)

    # Three stacked triangles.
    tiers = [(0.18, 0.46, 0.30), (0.32, 0.64, 0.38), (0.48, 0.84, 0.46)]
    for i, (top, bottom, half) in enumerate(tiers):
        d.polygon([P(0.5, top), P(0.5 - half, bottom), P(0.5 + half, bottom)],
                  fill=TREE if i % 2 == 0 else TREE_DARK)
    d.rectangle([P(0.44, 0.84), P(0.56, 0.95)], fill=TRUNK)

    # Baubles.
    for (x, y, c) in [(0.40, 0.42, CRANBERRY), (0.60, 0.58, GOLD), (0.36, 0.74, GOLD),
                      (0.62, 0.78, CRANBERRY), (0.50, 0.55, CREAM)]:
        r = art * 0.035
        cx, cy = P(x, y)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)

    cx, cy = P(0.5, 0.15)
    star(d, cx, cy, art * 0.09, GOLD)

    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    draw_icon(192, 0.92).save(OUT / "icon-192.png", optimize=True)
    draw_icon(512, 0.92).save(OUT / "icon-512.png", optimize=True)
    draw_icon(512, 0.72).save(OUT / "icon-maskable-512.png", optimize=True)
    draw_icon(180, 0.86).save(OUT / "apple-touch-icon.png", optimize=True)
    draw_icon(48, 0.95).save(OUT.parent / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("Icons written to", OUT)


if __name__ == "__main__":
    main()
