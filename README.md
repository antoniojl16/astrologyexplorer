# Astrology Explorer

A local-first JavaScript prototype for exploring astrology charts, workspaces, and future Human Design / Gene Keys views.

## Run it

Open `index.html` directly in a modern browser. No build step or web server is required.

The prototype stores its state in browser `localStorage`. Use **Export workspace** regularly to create a portable JSON backup. Imported charts are added to the active workspace.

## Prototype scope

- 10 deterministic sample individual charts
- Local workspaces and workspace switching
- Chart library search and keyboard navigation
- Astrology wheel with seeded placeholder positions
- Birth and design-time (88 days prior) data retained together
- Unknown-time markers and uncertainty margins
- Chart timeline interaction without mutating birth data
- JSON import/export
- Light/dark mode and `?` keyboard guide

Planetary positions are intentionally placeholders until a local ephemeris engine is selected. The chart data model already carries planet, angle, speed, direction, house, and design-time metadata so that transition can be made without redesigning the UI.
