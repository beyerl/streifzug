# Streifzug 🗺️

A black-and-white map for **drawing the areas you've already explored** and
**marking places you still want to visit**.

Built with vanilla JS Web Components, [Leaflet](https://leafletjs.com/) over
OpenStreetMap tiles, and [Capacitor](https://capacitorjs.com/) for the Android
build. The whole UI state — map view, drawings and markers — lives in
`localStorage`, so it survives reloads.

## Features

- **Grayscale map** — OSM tiles rendered black & white by default.
- **Search** — type a place name to fly the map there (Nominatim geocoding).
- **Zoom** — on-screen `+`/`−` buttons plus native pinch/scroll gestures.
- **Toolbar** (one tool active at a time):
  - **Verschieben** (move, default) — pan the map.
  - **Zeichnen** (draw) — paint over the map with your finger/mouse to turn those
    areas **from black & white to full colour** (a second, colour copy of the
    tiles, composited per-tile in a canvas so only painted pixels stay coloured —
    no SVG/CSS mask, which is why it also works in the Android WebView). The
    reveal reprojects and persists across zoom.
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

## Android

```bash
npm run build
npx cap add android   # first time only – scaffolds the native project
npx cap sync android
npx cap open android  # or: (cd android && ./gradlew assembleDebug)
```

The native `android/` project is generated (not committed) and rebuilt in CI.

## CI / Deployment

Two GitHub Actions workflows:

- **`deploy-pages.yml`** — builds the web app and publishes `dist/` to
  **GitHub Pages** on every push to `main`.
  (Enable Pages → *Source: GitHub Actions* in the repo settings.)
- **`android-build.yml`** — builds a **debug APK** on pushes to `main` and on
  `v*` tags, uploaded as a workflow artifact.

The Vite `base` is `./` so the same build works both under a GitHub Pages
project path and inside the Capacitor WebView.

## License

MIT
