# Orbital Study

A workspace for studying birth charts through four lenses — **Astrology**, **Human
Design**, **Gene Keys** and **Astrocartography** — on their own, over time, between two
people and across life cycles.

© 2026 Antonio Juarez ([@antoniojl16](https://github.com/antoniojl16)). All rights
reserved — see [LICENSE](LICENSE).

## Run it

Open `index.html` in a modern browser. There's no build step and no server: it works
straight from disk (`file://`) or from any static host, and makes no network requests —
the fonts, map, place list and time zone history are included (the map and place list
load the first time they're needed).

Charts are stored in the browser's local storage, on that device only. Use **Export
workspace** to keep a JSON backup, and **Import workspace** to bring charts back.

## What's inside

- **Chart library** — every chart in an Astrology or Human Design view, with a miniature
  chart and its key facts (Sun and Rising; Type, Authority, Profile, Definition).
- **Chart explorer** — the astrology wheel with aspects, filters and a timeline; the
  Human Design bodygraph and mandala with typology, Variable and PHS; the Gene Keys
  profile and Star Pearl; Astrocartography travel and local-space maps.
- **Timeline explorer** — the same views for the current moment.
- **Pair explorer** — synastry wheel and cross-aspects, the Human Design composite with
  connection channels, side-by-side Gene Keys and paired maps.
- **Cycle explorer** — exact returns and oppositions (Saturn, Jupiter, Uranus, Chiron,
  nodal) with the natal chart and the cycle moment compared in each system.
- Birth-location search over ~70,000 places worldwide, filling in coordinates and time zone.
- Direct links for every view (`#/chart/<name>/<system>/<view>`), keyboard shortcuts
  (press `?`), light and dark themes.

## Accuracy

Positions come from [Astronomy Engine](https://github.com/cosinekitty/astronomy). Checked
against the Swiss Ephemeris, the Sun, Moon and planets agree to within about 20
arcseconds; the lunar nodes and mean Lilith to within half an arcminute; cycle dates to
within hours. Birth times use the IANA time zone database with daylight saving; births
before 1970 also get the historical time zones browsers omit, and before standard time
the birthplace's own local mean time. Chiron, which Astronomy Engine doesn't cover, is simulated from
[NASA JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) starting states under the
Sun's and giant planets' gravity, and agrees with JPL to within a few arcseconds from
1800 to 2200.

## Credits and notices

See [LICENSE](LICENSE) for third-party components and data (Astronomy Engine, Natural
Earth, GeoNames, the IANA Time Zone Database, NASA JPL Horizons, and the bundled DM Mono,
Manrope and Playfair Display fonts) and trademark notices. Place data © GeoNames,
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The generated data files (`world-map.js`, `places.js`, `tz-history.js`) are rebuilt with
the scripts in [`tools/`](tools/). Orbital Study is an independent
project, not affiliated with Jovian Archive or Gene Keys Publishing, and is meant for
study and self-reflection rather than professional advice.
