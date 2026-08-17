# Streifzug 🗺️

A black-and-white map for **drawing the areas you've already explored** and
**marking places you still want to visit**.

Built with vanilla JS Web Components and [Leaflet](https://leafletjs.com/) over
OpenStreetMap tiles. The whole UI state — map view, drawings and markers — lives
in `localStorage`, so it survives reloads.

## Features

- **Grayscale map** — OSM tiles rendered black & white by default.
- **Search** — type a place name to fly the map there (Nominatim geocoding).
- **Zoom** — on-screen `+`/`−` buttons plus native pinch/scroll gestures.
- **Toolbar** (one tool active at a time):
  - **Verschieben** (move, default) — pan the map.
  - **Zeichnen** (draw) — paint over the map with your finger/mouse to turn those
    areas **from black & white to full colour** (a second, colour copy of the
    tiles revealed through an SVG mask). The reveal reprojects and persists across
    zoom.
  - **Radieren** (erase) — paint back over coloured areas to return them to
    black & white.
  - **Marker** — tap to drop a labelled pin. **Long-press** a marker (or
    right-click on desktop) to select and delete it.
- **Undo / redo** — 5 steps of history for paint & erase strokes (bottom-left).
- **Persistence** — everything is saved to `localStorage` under `streifzug.state.v2`
  (v1 sketches are migrated automatically).

## Develop

```bash
npm install
npm run dev      # Vite dev server
npm run build    # production build into dist/
npm run preview  # serve the built dist/
```

## CI / Deployment

- **`deploy-pages.yml`** — builds the web app and publishes `dist/` to
  **GitHub Pages** on every push to `main`.
  (Enable Pages → *Source: GitHub Actions* in the repo settings.)

The Vite `base` is `./` so the build works under a GitHub Pages project path.

## License

MIT
