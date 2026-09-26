#!/usr/bin/env python3
"""
gen-icons.py — deterministic PWA raster icon generator (stdlib only).

Renders the same design as assets/icons/icon.svg (indigo tile, white motorbike
glyph) to PNG without any third-party dependency (no PIL, no cairo):

  assets/icons/icon-192.png          (any)
  assets/icons/icon-512.png          (any)
  assets/icons/icon-maskable-512.png (maskable: full-bleed tile, content
                                      scaled to the 80% safe zone)

Pure integer/float math + zlib PNG encoder → byte-stable output: running
this twice produces identical bytes (CI relies on this for the
"commit icons only if changed" step).

Run:  python3 tools/gen-icons.py   (from repo root; paths are fixed)
"""

import os
import struct
import zlib

# --- design (512x512 viewBox coordinates, mirrors icon.svg) ---------------
BG = (79, 70, 229, 255)    # #4f46e5
FG = (255, 255, 255, 255)  # white glyph

TILE_RADIUS = 96.0
WHEELS = [(160.0, 344.0, 64.0, 24.0)] + [(352.0, 344.0, 64.0, 24.0)]  # (x,y,r,stroke)
CIRCLE_FILLS = [(344.0, 216.0, 18.0)]
# Polylines rendered as strokes with round caps/joins.
STROKES = [
    ([(160.0, 344.0), (240.0, 344.0), (288.0, 216.0), (344.0, 216.0)], 24.0),
    ([(288.0, 216.0), (344.0, 216.0), (352.0, 344.0)], 24.0),
    ([(216.0, 168.0), (312.0, 168.0)], 20.0),
]
SS = 3  # supersampling factor per axis (3x3 → smooth, still fast)


def dist_seg(px, py, ax, ay, bx, by):
    """Distance from point (px,py) to segment (ax,ay)-(bx,by)."""
    dx, dy = bx - ax, by - ay
    length2 = dx * dx + dy * dy
    if length2 == 0.0:
        return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
    t = ((px - ax) * dx + (py - ay) * dy) / length2
    if t < 0.0:
        t = 0.0
    elif t > 1.0:
        t = 1.0
    qx, qy = ax + t * dx, ay + t * dy
    return ((px - qx) ** 2 + (py - qy) ** 2) ** 0.5


def glyph_hits(x, y):
    """True when 512-space point (x,y) is covered by the white glyph."""
    for cx, cy, r, stroke in WHEELS:
        if abs(((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 - r) <= stroke / 2.0:
            return True
    for cx, cy, r in CIRCLE_FILLS:
        if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
            return True
    for points, width in STROKES:
        half = width / 2.0
        for i in range(len(points) - 1):
            ax, ay = points[i]
            bx, by = points[i + 1]
            if dist_seg(x, y, ax, ay, bx, by) <= half:
                return True
        # round caps
        for ax, ay in (points[0], points[-1]):
            if (x - ax) ** 2 + (y - ay) ** 2 <= half * half:
                return True
    return False

def render(size, maskable):
    """Return RGBA rows for a size x size icon."""
    # Tile radius in 512 space: rounded for "any", full-bleed for maskable.
    radius512 = 0.0 if maskable else TILE_RADIUS
    # maskable: shrink glyph into the 80% safe zone, keep full-bleed tile.
    glyph_scale = 0.8 if maskable else 1.0
    center = 256.0
    pixels = []
    inv = 512.0 / (size * SS)
    for py in range(size):
        row = bytearray()
        for px in range(size):
            bg_cover = 0
            fg_cover = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = (px * SS + sx + 0.5) * inv
                    y = (py * SS + sy + 0.5) * inv
                    if _tile(x, y, radius512):
                        bg_cover += 1
                    gx = center + (x - center) / glyph_scale
                    gy = center + (y - center) / glyph_scale
                    if glyph_hits(gx, gy):
                        fg_cover += 1
            total = SS * SS
            if fg_cover:
                a = round(255 * fg_cover / total)
                row.extend(FG[:3]); row.append(a)
            elif bg_cover:
                row.extend(BG[:3]); row.append(255)
            else:
                row.extend((0, 0, 0, 0))
        pixels.append(bytes(row))
    return pixels


def _tile(x, y, radius512):
    """Rounded-square coverage test in 512 space (0 radius = full square)."""
    if radius512 <= 0.0:
        return 0.0 <= x <= 512.0 and 0.0 <= y <= 512.0
    rx = min(max(x, radius512), 512.0 - radius512)
    ry = min(max(y, radius512), 512.0 - radius512)
    return (x - rx) ** 2 + (y - ry) ** 2 <= radius512 * radius512


def write_png(path, size, pixels):
    """Minimal deterministic PNG encoder (RGBA, filter 0, zlib)."""
    raw = bytearray()
    stride = size * 4
    for row in pixels:
        raw.append(0)  # filter type: none
        raw.extend(row)
    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) +
           chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b''))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as fh:
        fh.write(png)
    return len(png)


def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(here, 'assets', 'icons')
    targets = [
        ('icon-192.png', 192, False),
        ('icon-512.png', 512, False),
        ('icon-maskable-512.png', 512, True),
    ]
    for name, size, maskable in targets:
        pixels = render(size, maskable)
        n = write_png(os.path.join(out_dir, name), size, pixels)
        print(f'{name}: {size}x{size}{" maskable" if maskable else ""} -> {n} bytes')


if __name__ == '__main__':
    main()
