// <map-app>: the whole application. Owns the Leaflet map, the drawing/marker
// tools, the overlay UI (search, toolbar, zoom) and keeps everything mirrored
// into localStorage via the store. Rendered in light DOM so the global Leaflet
// stylesheet and styles.css apply to the map container.
import L from 'leaflet';
import { loadState, saveState, uid } from '../store.js';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende';

// Each new stroke rotates through these so overlapping areas stay legible.
const DRAW_COLORS = ['#e0532d', '#2d9ee0', '#38b000', '#b5179e', '#ffb703'];

const MARKER_ICON = L.divIcon({
  className: 'sk-marker',
  html: `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 39C15 39 27 24.5 27 13.5C27 6.6 21.6 1 15 1C8.4 1 3 6.6 3 13.5C3 24.5 15 39 15 39Z"
          fill="#e0532d" stroke="#fff" stroke-width="2"/>
    <circle cx="15" cy="13.5" r="4.5" fill="#fff"/>
  </svg>`,
  iconSize: [30, 40],
  iconAnchor: [15, 39],
  popupAnchor: [0, -34],
  tooltipAnchor: [0, -34],
});

class MapApp extends HTMLElement {
  connectedCallback() {
    this._state = loadState();
    this._colorIdx = 0;

    // Map lives in light DOM so Leaflet's CSS (loaded globally) can reach it.
    this._mapEl = document.createElement('div');
    this._mapEl.id = 'map';
    this.appendChild(this._mapEl);

    this._map = L.map(this._mapEl, {
      center: this._state.view.center,
      zoom: this._state.view.zoom,
      zoomControl: false,
      zoomSnap: 0.5,
      // Pinch-to-zoom and one-finger pan come for free from Leaflet.
    });
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTR }).addTo(this._map);

    this._drawLayer = L.layerGroup().addTo(this._map);
    this._markerLayer = L.layerGroup().addTo(this._map);

    // Overlay UI.
    this._search = document.createElement('search-box');
    this._toolbar = document.createElement('tool-bar');
    this._zoom = document.createElement('zoom-controls');
    this.append(this._search, this._toolbar, this._zoom);

    this._restore();
    this._wireEvents();
    this._setTool(this._state.tool || 'move');

    // The map is created before layout settles; nudge it once painted.
    requestAnimationFrame(() => this._map.invalidateSize());
  }

  // ----- persistence helpers ------------------------------------------------

  _persistView() {
    const c = this._map.getCenter();
    this._state.view = { center: [c.lat, c.lng], zoom: this._map.getZoom() };
    saveState(this._state);
  }

  _restore() {
    for (const d of this._state.drawings) {
      L.polyline(d.latlngs, this._strokeStyle(d.color)).addTo(this._drawLayer);
    }
    for (const m of this._state.markers) {
      this._createMarker(m);
    }
  }

  _strokeStyle(color) {
    return { color, weight: 5, opacity: 0.85, lineCap: 'round', lineJoin: 'round' };
  }

  // ----- event wiring -------------------------------------------------------

  _wireEvents() {
    this._map.on('moveend zoomend', () => this._persistView());
    this._map.on('click', (e) => this._onMapClick(e));

    this._search.addEventListener('search-submit', (e) => this._onSearch(e.detail.query));
    this._toolbar.addEventListener('tool-change', (e) => this._setTool(e.detail.tool));
    this._zoom.addEventListener('zoom-in', () => this._map.zoomIn());
    this._zoom.addEventListener('zoom-out', () => this._map.zoomOut());

    // Drawing uses raw pointer events on the map container so a single finger
    // paints a stroke while the tool is active.
    this._mapEl.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    this._mapEl.addEventListener('pointermove', (e) => this._onPointerMove(e));
    this._mapEl.addEventListener('pointerup', (e) => this._onPointerUp(e));
    this._mapEl.addEventListener('pointercancel', () => this._cancelStroke());
  }

  // ----- tools --------------------------------------------------------------

  _setTool(tool) {
    this._state.tool = tool;
    saveState(this._state);
    this.dataset.tool = tool;
    this._toolbar.setActive(tool);

    const drawing = tool === 'draw';
    // In draw mode dragging must yield to the finger; markers stop swallowing
    // pointer events so strokes can pass over them.
    if (drawing) this._map.dragging.disable();
    else this._map.dragging.enable();
    const markerPane = this._map.getPane('markerPane');
    if (markerPane) markerPane.style.pointerEvents = drawing ? 'none' : '';
  }

  // ----- drawing ------------------------------------------------------------

  _onPointerDown(e) {
    if (this._state.tool !== 'draw' || !e.isPrimary || this._activePointer != null) return;
    this._activePointer = e.pointerId;
    const pt = this._map.mouseEventToContainerPoint(e);
    this._lastPt = pt;
    const ll = this._map.containerPointToLatLng(pt);
    const color = DRAW_COLORS[this._colorIdx++ % DRAW_COLORS.length];
    this._stroke = { id: uid(), color, latlngs: [[ll.lat, ll.lng]] };
    this._strokeLine = L.polyline([ll], this._strokeStyle(color)).addTo(this._drawLayer);
    try {
      this._mapEl.setPointerCapture(e.pointerId);
    } catch (_) {
      /* capture is best-effort */
    }
    e.preventDefault();
  }

  _onPointerMove(e) {
    if (!this._stroke || e.pointerId !== this._activePointer) return;
    const pt = this._map.mouseEventToContainerPoint(e);
    if (this._lastPt && pt.distanceTo(this._lastPt) < 2) return; // skip jitter
    this._lastPt = pt;
    const ll = this._map.containerPointToLatLng(pt);
    this._stroke.latlngs.push([ll.lat, ll.lng]);
    this._strokeLine.addLatLng(ll);
  }

  _onPointerUp(e) {
    if (!this._stroke || e.pointerId !== this._activePointer) return;
    if (this._stroke.latlngs.length > 1) {
      this._state.drawings.push(this._stroke);
      saveState(this._state);
    } else {
      this._drawLayer.removeLayer(this._strokeLine); // a lone tap is not a stroke
    }
    this._resetStroke();
  }

  _cancelStroke() {
    if (this._strokeLine) this._drawLayer.removeLayer(this._strokeLine);
    this._resetStroke();
  }

  _resetStroke() {
    this._stroke = null;
    this._strokeLine = null;
    this._activePointer = null;
    this._lastPt = null;
  }

  // ----- markers ------------------------------------------------------------

  _onMapClick(e) {
    if (this._state.tool !== 'marker') return;
    const data = { id: uid(), lat: e.latlng.lat, lng: e.latlng.lng, label: '' };
    this._state.markers.push(data);
    saveState(this._state);
    const marker = this._createMarker(data);
    this._openLabelPopup(marker);
  }

  _createMarker(data) {
    const marker = L.marker([data.lat, data.lng], { icon: MARKER_ICON });
    marker._skId = data.id;
    marker.addTo(this._markerLayer);
    this._applyLabel(marker, data.label, /*persist*/ false);
    marker.on('click', () => this._openLabelPopup(marker));
    // Long-press on touch and right-click on desktop both fire contextmenu.
    marker.on('contextmenu', (e) => {
      L.DomEvent.stop(e);
      this._openDeletePopup(marker);
    });
    return marker;
  }

  _markerState(marker) {
    return this._state.markers.find((m) => m.id === marker._skId);
  }

  _applyLabel(marker, label, persist = true) {
    const state = this._markerState(marker);
    if (state) state.label = label;
    marker.unbindTooltip();
    if (label) {
      marker.bindTooltip(label, {
        permanent: true,
        direction: 'top',
        className: 'sk-tip',
        offset: [0, -6],
      });
    }
    if (persist) saveState(this._state);
  }

  _removeMarker(marker) {
    marker.closePopup();
    this._markerLayer.removeLayer(marker);
    this._state.markers = this._state.markers.filter((m) => m.id !== marker._skId);
    saveState(this._state);
  }

  _openLabelPopup(marker) {
    const state = this._markerState(marker);
    const wrap = document.createElement('div');
    wrap.className = 'sk-popup';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Beschriftung…';
    input.value = state ? state.label : '';

    const row = document.createElement('div');
    row.className = 'sk-row';
    const save = document.createElement('button');
    save.className = 'sk-btn primary';
    save.textContent = 'Speichern';
    const del = document.createElement('button');
    del.className = 'sk-btn danger';
    del.textContent = 'Löschen';

    const commit = () => {
      this._applyLabel(marker, input.value.trim());
      marker.closePopup();
    };
    save.addEventListener('click', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
    });
    del.addEventListener('click', () => this._removeMarker(marker));

    row.append(save, del);
    wrap.append(input, row);

    marker.bindPopup(wrap, { minWidth: 200, closeButton: true }).openPopup();
    setTimeout(() => input.focus(), 30);
  }

  _openDeletePopup(marker) {
    this._selectMarker(marker);
    const state = this._markerState(marker);
    const wrap = document.createElement('div');
    wrap.className = 'sk-popup';

    const msg = document.createElement('div');
    msg.className = 'sk-msg';
    msg.textContent = `${(state && state.label) || 'Marker'} löschen?`;

    const row = document.createElement('div');
    row.className = 'sk-row';
    const del = document.createElement('button');
    del.className = 'sk-btn danger';
    del.textContent = 'Löschen';
    const cancel = document.createElement('button');
    cancel.className = 'sk-btn';
    cancel.textContent = 'Abbrechen';
    del.addEventListener('click', () => this._removeMarker(marker));
    cancel.addEventListener('click', () => marker.closePopup());

    row.append(del, cancel);
    wrap.append(msg, row);

    marker.bindPopup(wrap, { minWidth: 180, closeButton: false }).openPopup();
    marker.once('popupclose', () => this._deselectMarker(marker));
  }

  _selectMarker(marker) {
    if (marker._icon) marker._icon.classList.add('marker-selected');
  }

  _deselectMarker(marker) {
    if (marker._icon) marker._icon.classList.remove('marker-selected');
  }

  // ----- search -------------------------------------------------------------

  async _onSearch(query) {
    this._search.setLoading(true);
    this._search.setStatus('');
    try {
      const url =
        'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' +
        encodeURIComponent(query);
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data.length) {
        this._search.setStatus('Kein Ort gefunden.', true);
        return;
      }
      const hit = data[0];
      if (hit.boundingbox) {
        const [s, n, w, e] = hit.boundingbox.map(Number);
        this._map.fitBounds(
          [
            [s, w],
            [n, e],
          ],
          { maxZoom: 16, padding: [24, 24] }
        );
      } else {
        this._map.setView([+hit.lat, +hit.lon], 14);
      }
      this._search.setStatus(hit.display_name.split(',').slice(0, 2).join(',').trim());
    } catch (err) {
      console.warn('Geocoding failed', err);
      this._search.setStatus('Suche fehlgeschlagen.', true);
    } finally {
      this._search.setLoading(false);
    }
  }
}

customElements.define('map-app', MapApp);
