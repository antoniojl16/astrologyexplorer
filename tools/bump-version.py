#!/usr/bin/env python3
"""Stamps a new asset version into index.html, so browsers fetch fresh copies of the
scripts and stylesheets after a release instead of mixing cached old ones with new ones
(GitHub Pages lets browsers keep files for ten minutes).

Run before committing a release:   python3 tools/bump-version.py
It sets ORBITAL_VERSION (used for the files loaded on demand: places.js, world-map.js,
roads.js) and the ?v= on every local <script src> and <link href> to the current UTC time.
"""
import datetime
import pathlib
import re

index = pathlib.Path(__file__).resolve().parent.parent / "index.html"
version = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M")
text = index.read_text(encoding="utf-8")
text = re.sub(r'const ORBITAL_VERSION = "[^"]*"', f'const ORBITAL_VERSION = "{version}"', text)
text = re.sub(r'((?:src|href)="(?!https?:|//)[^"?]+\.(?:js|css))(?:\?v=[^"]*)?"', rf'\1?v={version}"', text)
index.write_text(text, encoding="utf-8")
print(f"Asset version {version}")
