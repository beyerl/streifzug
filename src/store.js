// Persistent UI state in localStorage: map view, reveal strokes and markers.
const KEY = 'streifzug.state.v2';
const LEGACY_KEY = 'streifzug.state.v1';

const DEFAULT_STATE = {
  view: { center: [47.8095, 13.055], zoom: 13 }, // Salzburg
  tool: 'move',
  // Reveal strokes. Painting turns the grayscale map colored, erasing reverts
  // it. Rendered in order, so an 'erase' stroke cuts into earlier 'paint'.
  // [{ id, mode: 'paint' | 'erase', latlngs: [[lat,lng], ...], width, zoom }]
  strokes: [],
  markers: [], // [{ id, lat, lng, label }]
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// v1 stored colored polylines under `drawings`; treat each as a paint stroke so
// existing sketches survive the upgrade.
function migrateLegacy(parsed) {
  const zoom = (parsed.view && parsed.view.zoom) || DEFAULT_STATE.view.zoom;
  return (parsed.drawings || [])
    .filter((d) => Array.isArray(d.latlngs) && d.latlngs.length)
    .map((d) => ({
      id: d.id || Math.random().toString(36).slice(2),
      mode: 'paint',
      latlngs: d.latlngs,
      width: 36,
      zoom,
    }));
}

export function loadState() {
  try {
    let raw = localStorage.getItem(KEY);
    let parsed = raw ? JSON.parse(raw) : null;

    if (!parsed) {
      const legacyRaw = localStorage.getItem(LEGACY_KEY);
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw);
        parsed = { ...legacy, strokes: migrateLegacy(legacy) };
      }
    }
    if (!parsed) return clone(DEFAULT_STATE);

    return {
      ...clone(DEFAULT_STATE),
      ...parsed,
      view: { ...DEFAULT_STATE.view, ...(parsed.view || {}) },
      strokes: Array.isArray(parsed.strokes) ? parsed.strokes : [],
      markers: Array.isArray(parsed.markers) ? parsed.markers : [],
    };
  } catch (err) {
    console.warn('Could not read state, using defaults.', err);
    return clone(DEFAULT_STATE);
  }
}

let saveTimer = null;
export function saveState(state) {
  // Debounce writes (drawing produces a lot of updates).
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Could not persist state.', err);
    }
  }, 150);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
