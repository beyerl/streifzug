// Persistent UI state in localStorage: map view, drawings and markers.
const KEY = 'streifzug.state.v1';

const DEFAULT_STATE = {
  view: { center: [47.8095, 13.055], zoom: 13 }, // Salzburg
  tool: 'move',
  drawings: [], // [{ id, color, latlngs: [[lat,lng], ...] }]
  markers: [], // [{ id, lat, lng, label }]
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      ...clone(DEFAULT_STATE),
      ...parsed,
      view: { ...DEFAULT_STATE.view, ...(parsed.view || {}) },
      drawings: Array.isArray(parsed.drawings) ? parsed.drawings : [],
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
