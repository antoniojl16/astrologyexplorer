# Orbital Study

A workspace for studying birth charts through four lenses — **Astrology**, **Human
Design**, **Gene Keys** and **Astrocartography** — on their own, over time, between two
people, across life cycles and against the events of a life.

© 2026 Antonio Juarez ([@antoniojl16](https://github.com/antoniojl16)). All rights
reserved — see [LICENSE](LICENSE).

## Run it

Open `index.html` in a modern browser. There's no build step and no server: it works
straight from disk (`file://`) or from any static host, and makes no network requests —
the fonts, map, relief imagery, roads, place list and time zone history are included (the
map data, image tiles and place list load as they're needed).

Charts and life events are stored in the browser's local storage, on that device only;
shared links never include life events. Use **Export workspace** to keep a JSON backup,
and **Import workspace** to bring charts and events back.

## What's inside

- **Chart library** — every chart in an Astrology or Human Design view, with a miniature
  chart, its key facts (Sun and Rising; Type, Authority, Profile, Definition), its number
  of life events, and an Edit button (where a chart can also be deleted).
- **Chart explorer** — the astrology wheel with each body's degree, sign and minutes,
  a positions list (planets and house cusps), aspects, filters and a timeline; the
  Human Design bodygraph and mandala with typology, Variable and PHS; the Gene Keys
  profile and Star Pearl; Astrocartography travel and local-space maps on a shaded-relief
  world map with city names and main roads, where clicked spots are saved with the chart
  and compared (nearest place, lines and intersections) in both views.
- **Life events** — moments, periods and places of a life, with people (other charts in
  the workspace, or anyone by name), roles, tags and notes, at any date precision (year,
  month, day or exact time). Birth and every cycle moment can be annotated with a place,
  tags and notes. The Life Events tab lists them, searches them, and browses them **by
  tag**: each moment's tight transits, and the slow-planet transits that recur across
  moments with the same tag.
- **Timeline explorer** — the same views for the current moment.
- **Pair explorer** — synastry wheel and cross-aspects, the Human Design composite with
  connection channels, side-by-side Gene Keys and paired maps, and both lives' events on
  one timeline, with shared events spanning both, filters and browsing by tag.
- **Cycle explorer** — exact returns and oppositions (Saturn, Jupiter, Uranus, Chiron,
  nodal) and any life event, with the natal chart and the moment compared in each
  system: a Summary of what was active (tight transits, Human Design gates and channels,
  Gene Keys, and the planetary lines at the moment's place), and a Life Timeline of
  birth, events and cycles, as a list and as a strip by age. **Transits · now** (also
  from the Chart explorer) sets the chart against the sky at this moment, to save to the
  Life Timeline in one click. Each moment's angles and houses are cast for its own place
  (an event's) or any other; Human Design and Gene Keys read it as a transit or a full chart.
- Birth-location search over ~70,000 places worldwide, filling in coordinates and time zone.
- Export selected charts from the library (with or without their life events, notes and
  tags; events shared with other charts only if asked). Importing a workspace file reviews
  charts already in the workspace first: skip, replace (adding the file's life events) or copy.
- Import workspace also reads charts from a CSV (Name, Date, Time, Timezone, City, Country), as
  other Human Design apps export them: each is placed and reviewed before import, with the
  birthplace's historical UTC offset by default, and tagged "imported".
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

The generated data files (`world-map.js`, `roads.js`, `tiles/`, `places.js`, `tz-history.js`) are rebuilt with
the scripts in [`tools/`](tools/). Orbital Study is an independent
project, not affiliated with Jovian Archive or Gene Keys Publishing, and is meant for
study and self-reflection rather than professional advice.
