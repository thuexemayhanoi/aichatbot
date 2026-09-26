#!/usr/bin/env python3
"""
Deterministic PNG icon generator for the MotoAI PWA.

Produces the raster icons referenced by manifest.webmanifest:
  assets/icons/icon-192.png          (any, 192x192)
  assets/icons/icon-512.png          (any, 512x512)
  assets/icons/icon-maskable-512.png  (maskable: glyph inside 80% safe zone)

Pure stdlib (zlib + struct) — no PIL, runs in CI and locally.
The design mirrors assets/icons/icon.svg (indigo rounded tile,
white motorbike glyph) using simple analytic geometry.
"""
import struct
import zlib
from pathlib import Path

INDIGO = (79, 70, 229)  # #4f46e5
WHITE = (255, 255, 255)
SIZE = 512


def write_png(path, size, pixels):
    """pixels: list of (r, g, b, a) rows, top-left first."""

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + b"".join(struct.pack("BBBB", *px) for px in row) for row in pixels)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def rounded_tile(x, y, size, radius):
    """Inside rounded-rect mask (anti-aliased via distance, simple supersample-free edge)."""
    r = radius
    cx, cy = min(max(x, r), size - r), min(max(y, r), size - r)
    dx, dy = x - cx, y - cy
    return dx * dx + dy * dy <= r * r


def dist_to_segment(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    t = max(0.0, min(1.0, (vx * wx + vy * wy) / (vx * vx + vy * vy)))
    dx, dy = px - (ax + t * vx), py - (ay + t * vy)
    return (dx * dx + dy * dy) ** 0.5


def render(scale=1.0):
    """scale shrinks the glyph for the maskable safe zone (80% => 0.8)."""
    s = SIZE
    u = s / 512.0 * scale  # unit
    cx = s / 2.0

    # glyph geometry in the 512 design grid (mirrors icon.svg), centered
    w1, w2 = (160 * u + cx - s / 2 * scale), 0
    def P(px, py):  # map design point -> canvas (centered)
        return cx + (px - 256) * u, cx + (py - 256) * u

    wheels = [P(160, 344), P(352, 344)]
    wheel_r, stroke = 64 * u, 12 * u
    lamp = P(344, 216)
    lamp_r = 18 * u
    strokes = [
        # (points, half-width)
        ([(160, 344), (240, 344), (288, 216), (344, 216)], stroke),
        ([(288, 216), (344, 216), (352, 344)], stroke),
        ([(216, 168), (312, 168)], 10 * u),
    ]

    rows = []
    for py in range(s):
        row = []
        pyf = py + 0.5
        for px in range(s):
            pxf = px + 0.5
            if not rounded_tile(pxf, pyf, s, s * 0.1875):
                row.append((0, 0, 0, 0))
                continue
            color = INDIGO
            # wheels: ring = |dist - r| <= stroke
            for wx, wy in wheels:
                d = ((pxf - wx) ** 2 + (pyf - wy) ** 2) ** 0.5
                if abs(d - wheel_r) <= stroke:
                    color = WHITE
            # strokes
            for pts, hw in strokes:
                mapped = [P(a, b) for a, b in pts]
                for i in range(len(mapped) - 1):
                    if dist_to_segment(pxf, pyf, *mapped[i], *mapped[i + 1]) <= hw:
                        color = WHITE
            # headlamp
            dx, dy = pxf - lamp[0], pyf - lamp[1]
            if dx * dx + dy * dy <= lamp_r * lamp_r:
                color = WHITE
            row.append((*color, 255))
        rows.append(row)
    return rows


def main():
    out_dir = Path(__file__).resolve().parent.parent / "assets" / "icons"
    out_dir.mkdir(parents=True, exist_ok=True)
    write_png(out_dir / "icon-512.png", SIZE, render(1.0))
    write_png(out_dir / "icon-192.png", 192, [row[::512 // 192 * (512 // 192) ] for row in render(1.0)[::512 // 192 * (512 // 192)]] if False else downsample(render(1.0), 192))
    write_png(out_dir / "icon-maskable-512.png", SIZE, render(0.8))
    print("icons generated:", [p.name for p in sorted(out_dir.glob("*.png"))])


def downsample(rows, size):
    step = len(rows) // size
    return [[rows[y * step][x * step] for x in range(size)] for y in range(size)]


if __name__ == "__main__":
    main()
