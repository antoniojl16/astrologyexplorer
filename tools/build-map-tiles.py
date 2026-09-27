#!/usr/bin/env python3
# Orbital Study — Copyright (c) 2026 Antonio Juarez (@antoniojl16). All rights reserved. See LICENSE.
"""Cuts a whole-world picture into the Astrocartography map's image tiles.

    python3 tools/build-map-tiles.py <source image> <style name> [max zoom] [webp quality]

The source is a plate carrée (equirectangular) world image, 2:1, -180..180°, 90..-90°
(NASA Blue Marble, Natural Earth II, ...). It's reprojected to Web Mercator (the map's
projection, clipped at ±85.05°: in that projection only the rows move, so each output
row is interpolated from the source rows at its latitude), then cut into a pyramid of
256-pixel WebP tiles, tiles/<style>/<z>/<x>/<y>.webp, where level z is 256·2^z pixels
wide. Requires Pillow and NumPy.

The app's "relief" tiles: Natural Earth II with Shaded Relief, Water and Drainages,
1:10m (public domain), https://naciscdn.org/naturalearth/10m/raster/NE2_HR_LC_SR_W.zip —
    python3 tools/build-map-tiles.py NE2_HR_LC_SR_W/NE2_HR_LC_SR_W.tif relief 6 72
"""
import math, os, sys
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
source, style = sys.argv[1], sys.argv[2]
max_zoom = int(sys.argv[3]) if len(sys.argv) > 3 else 4
quality = int(sys.argv[4]) if len(sys.argv) > 4 else 72
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TILE = 256
size = TILE * 2 ** max_zoom

image = Image.open(source).convert("RGB")
# Downsample to the target width first (sharp, anti-aliased), keeping 2:1.
plate = np.asarray(image.resize((size, size // 2), Image.LANCZOS), dtype=np.float32)
rows = plate.shape[0]
# Web Mercator row j (pixel centre) → latitude → fractional source row.
y = math.pi * (1 - 2 * (np.arange(size) + 0.5) / size)
latitude = np.degrees(np.arctan(np.sinh(y)))
source_row = np.clip((90 - latitude) / 180 * rows - 0.5, 0, rows - 1)
low = np.floor(source_row).astype(int)
high = np.minimum(low + 1, rows - 1)
weight = (source_row - low)[:, None, None]
mercator = Image.fromarray(np.clip(plate[low] * (1 - weight) + plate[high] * weight, 0, 255).astype(np.uint8))

out_dir = os.path.join(root, "tiles", style)
totals = []
level_image = mercator
for zoom in range(max_zoom, -1, -1):
    count = 2 ** zoom
    if level_image.width != TILE * count:
        level_image = level_image.resize((TILE * count, TILE * count), Image.LANCZOS)
    level_bytes = 0
    for x in range(count):
        os.makedirs(os.path.join(out_dir, str(zoom), str(x)), exist_ok=True)
        for tile_y in range(count):
            tile = level_image.crop((x * TILE, tile_y * TILE, (x + 1) * TILE, (tile_y + 1) * TILE))
            path = os.path.join(out_dir, str(zoom), str(x), f"{tile_y}.webp")
            tile.save(path, "WEBP", quality=quality, method=6)
            level_bytes += os.path.getsize(path)
    totals.append((zoom, count * count, level_bytes))
for zoom, tiles, level_bytes in sorted(totals):
    print(f"{style} z{zoom}: {tiles} tiles, {level_bytes / 1e6:.2f} MB")
print(f"{style} total: {sum(t[2] for t in totals) / 1e6:.2f} MB")
