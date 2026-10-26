"""Draws the app icons (no dependencies): a falu-red longhouse under a night sky with aurora, by a fjord."""
import math, struct, zlib, sys

def png(w, h, rows):
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def lerp(a, b, t):
    t = max(0, min(1, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

def color(u, v):
    sky = lerp((14, 26, 45), (38, 70, 96), v / 0.62)
    band = math.sin(u * 7 + 1.2) * 0.05 + 0.2
    a = max(0, 1 - abs(v - band) / 0.13)
    c = lerp(sky, (80, 235, 170), a * 0.55)
    if v > 0.62:                                   # fjord
        c = lerp((30, 62, 84), (18, 40, 58), (v - 0.62) / 0.38)
        if abs(((v * 40) % 2) - 1) < 0.1 and 0.3 < u < 0.7: c = lerp(c, (140, 190, 210), 0.4)
    if v > 0.55 and v < 0.66 and u < 0.9:          # shore
        c = (88, 120, 70) if v < 0.6 else (216, 201, 155)
    # house
    if 0.28 <= u <= 0.72 and 0.4 <= v <= 0.6:
        c = (150, 44, 34)
        if 0.46 <= u <= 0.54 and 0.48 <= v: c = (58, 38, 24)
        if (0.33 < u < 0.4 or 0.6 < u < 0.67) and 0.45 < v < 0.52: c = (255, 205, 110)
    ry = 0.4 - (0.5 - abs(u - 0.5)) * 0.0 - (0.22 - abs(u - 0.5)) * 0.9
    if 0.24 <= u <= 0.76 and ry - 0.0 <= v <= 0.41 and abs(u - 0.5) <= 0.26 and v > 0.2 + abs(u - 0.5) * 0.9:
        c = (70, 98, 52)
    return tuple(int(x) for x in c)

def make(size, path):
    ss = 3
    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            acc = [0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    c = color((x + (sx + .5) / ss) / size, (y + (sy + .5) / ss) / size)
                    for i in range(3): acc[i] += c[i]
            row.extend(int(a / (ss * ss)) for a in acc)
        rows.append(row)
    with open(path, 'wb') as f:
        f.write(png(size, size, rows))

out = sys.argv[1] if len(sys.argv) > 1 else 'icons'
for s, n in ((180, 'apple-touch-icon'), (192, 'icon-192'), (512, 'icon-512')):
    make(s, f'{out}/{n}.png')
print('icons written')
