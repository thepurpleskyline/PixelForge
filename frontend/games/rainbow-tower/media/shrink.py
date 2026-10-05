#!/usr/bin/env python3
"""Squeeze a PNG under a byte cap without changing its pixel dimensions.

Tries lossless optimisation first, then palette quantisation with progressively
fewer colours, and keeps the first result that fits. Used by make.mjs.
"""
import sys
from PIL import Image

path, cap = sys.argv[1], int(sys.argv[2])
img = Image.open(path).convert("RGB")
w, h = img.size

def size_of(im, **kw):
    im.save(path, "PNG", optimize=True, **kw)
    import os
    return os.path.getsize(path)

best = size_of(img)                                  # lossless, optimised
used = "24-bit"
if best > cap:
    for colors in (256, 224, 192, 160, 128, 96, 64, 48, 32):
        q = img.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
        n = size_of(q)
        if n <= cap:
            best, used = n, f"{colors}-colour palette"
            break
    else:
        print(f"  {path}: could NOT reach {cap} B (smallest {best} B)")
        sys.exit(1)

check = Image.open(path)
assert check.size == (w, h), f"dimensions changed: {check.size} != {(w,h)}"
print(f"  {path}: {best} B / {cap} B cap  ({used}, {w}x{h})")
