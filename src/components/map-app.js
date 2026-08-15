// <map-app>: the whole application. Owns the Leaflet map, the paint/erase reveal
// tool, the markers and the overlay UI, mirroring everything into localStorage.
//
// The "reveal" effect: the base tiles are rendered grayscale. A second, colored
// copy of the tiles sits on top, masked by an SVG whose white areas are the
// painted strokes and black areas the erased ones. So painting turns the map
// from black & white to color, and erasing turns it back.
import L from 'leaflet';
import { loadState, saveState, uid } from '../store.js';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende';

const BRUSH_WIDTH = 40; // reveal brush diameter, in screen px at draw time
const ERASE_WIDTH = 48;
const HISTORY_LIMIT = 5; // undo depth

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
    this._maskId = 'reveal-mask-' + Math.random().toString(36).slice(2, 8);
    this._past = []; // undo snapshots (most recent last), capped at HISTORY_LIMIT
    this._future = []; // redo snapshots

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

    // Base grayscale tiles.
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTR }).addTo(this._map);

    // Colored copy on a pane above, masked to the painted areas only.
    this._map.createPane('reveal');
    const revealPane = this._map.getPane('reveal');
    revealPane.style.zIndex = 250;
    revealPane.style.pointerEvents = 'none';
    L.tileLayer(TILE_URL, { maxZoom: 19, pane: 'reveal' }).addTo(this._map);
    this._buildMaskEl(revealPane);

    this._markerLayer = L.layerGroup().addTo(this._map);

    // Overlay UI.
    this._search = document.createElement('search-box');
    this._toolbar = document.createElement('tool-bar');
    this._zoom = document.createElement('zoom-controls');
    this._history = document.createElement('history-controls');
    this.append(this._search, this._toolbar, this._zoom, this._history);

    this._restore();
    this._wireEvents();
    this._setTool(this._state.tool || 'move');
    this._refreshMask();
    this._updateHistoryButtons();

    // The map is created before layout settles; nudge it once painted.
    requestAnimationFrame(() => this._map.invalidateSize());
  }

  // ----- reveal mask --------------------------------------------------------

  _buildMaskEl(revealPane) {
    // A hidden SVG holding the mask definition. Coordinates are Leaflet layer
    // points (userSpaceOnUse), matching how the panes are positioned. Built
    // node-by-node so every element lands in the SVG namespace.
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    // Keep a 1×1 footprint (not 0×0 / display:none) so some WebViews keep the
    // <mask> resource live and referenceable. The mask content lives in <defs>
    // and is never painted anyway.
    svg.setAttribute('width', '1');
    svg.setAttribute('height', '1');
    svg.style.cssText =
      'position:absolute;top:0;left:0;width:1px;height:1px;overflow:hidden;pointer-events:none;';

    const defs = document.createElementNS(NS, 'defs');
    const mask = document.createElementNS(NS, 'mask');
    mask.setAttribute('id', this._maskId);
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    mask.setAttribute('maskContentUnits', 'userSpaceOnUse');
    mask.setAttribute('x', '-500000');
    mask.setAttribute('y', '-500000');
    mask.setAttribute('width', '1000000');
    mask.setAttribute('height', '1000000');

    this._maskG = document.createElementNS(NS, 'g');
    mask.appendChild(this._maskG);
    defs.appendChild(mask);
    svg.appendChild(defs);
    this.appendChild(svg);

    this._revealPane = revealPane;
    this._applyMaskRef();
  }

  // Reference the mask by an ABSOLUTE same-document URL rather than a bare
  // `url(#id)`. The Android System WebView (Capacitor serves from
  // https://localhost/) fails to resolve the bare fragment for CSS masks,
  // leaving the colored layer unmasked; the absolute form resolves everywhere.
  _applyMaskRef() {
    const ref = `url("${location.href.split('#')[0]}#${this._maskId}")`;
    this._revealPane.style.webkitMaskImage = ref;
    this._revealPane.style.maskImage = ref;
  }

  // Build the SVG path `d` for one stroke, in current layer points.
  _strokeD(stroke) {
    let d = '';
    for (const [lat, lng] of stroke.latlngs) {
      const p = this._map.latLngToLayerPoint([lat, lng]);
      d += (d ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
    }
    // A single point still needs to render as a dot (round cap, zero-length).
    if (stroke.latlngs.length === 1) {
      const p = this._map.latLngToLayerPoint(stroke.latlngs[0]);
      d = `M${p.x.toFixed(1)} ${p.y.toFixed(1)}L${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }
    return d;
  }

  // Brush width scales with zoom so a stroke covers a stable ground area.
  _strokeWidth(stroke) {
    return stroke.width * Math.pow(2, this._map.getZoom() - stroke.zoom);
  }

  _pathEl(stroke) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', stroke.mode === 'erase' ? '#000' : '#fff');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-width', this._strokeWidth(stroke).toFixed(1));
    path.setAttribute('d', this._strokeD(stroke));
    return path;
  }

  // Rebuild every stroke (after zoom, undo/redo, restore).
  _refreshMask() {
    this._maskG.textContent = '';
    for (const stroke of this._state.strokes) {
      this._maskG.appendChild(this._pathEl(stroke));
    }
  }

  // ----- persistence / restore ---------------------------------------------

  _persistView() {
    const c = this._map.getCenter();
    this._state.view = { center: [c.lat, c.lng], zoom: this._map.getZoom() };
    saveState(this._state);
  }

  _restore() {
    for (const m of this._state.markers) this._createMarker(m);
  }

  _snapshot() {
    return this._state.strokes.map((s) => ({ ...s, latlngs: s.latlngs.slice() }));
  }

  // ----- undo / redo --------------------------------------------------------

  _commitStroke(stroke) {
    this._past.push(this._snapshot()); // state before the new stroke
    if (this._past.length > HISTORY_LIMIT) this._past.shift();
    this._future = [];
    this._state.strokes.push(stroke);
    saveState(this._state);
    this._updateHistoryButtons();
  }

  _undo() {
    if (!this._past.length) return;
    this._future.push(this._snapshot());
    this._state.strokes = this._past.pop();
    this._afterHistory();
  }

  _redo() {
    if (!this._future.length) return;
    this._past.push(this._snapshot());
    if (this._past.length > HISTORY_LIMIT) this._past.shift();
    this._state.strokes = this._future.pop();
    this._afterHistory();
  }

  _afterHistory() {
    saveState(this._state);
    this._refreshMask();
    this._updateHistoryButtons();
  }

  _updateHistoryButtons() {
    this._history.setState(this._past.length > 0, this._future.length > 0);
  }

  // ----- event wiring -------------------------------------------------------

  _wireEvents() {
    this._map.on('moveend', () => this._persistView());
    // Layer points change on zoom; re-project the mask to keep it aligned.
    this._map.on('zoomend viewreset', () => {
      this._persistView();
      this._refreshMask();
    });
    this._map.on('click', (e) => this._onMapClick(e));

    this._search.addEventListener('search-submit', (e) => this._onSearch(e.detail.query));
    this._toolbar.addEventListener('tool-change', (e) => this._setTool(e.detail.tool));
    this._zoom.addEventListener('zoom-in', () => this._map.zoomIn());
    this._zoom.addEventListener('zoom-out', () => this._map.zoomOut());
    this._history.addEventListener('undo', () => this._undo());
    this._history.addEventListener('redo', () => this._redo());

    // Painting/erasing uses raw pointer events on the map container.
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

    const painting = tool === 'draw' || tool === 'erase';
    // While painting, dragging must yield to the finger and markers stop
    // swallowing pointer events so strokes can pass over them.
    if (painting) this._map.dragging.disable();
    else this._map.dragging.enable();
    const markerPane = this._map.getPane('markerPane');
    if (markerPane) markerPane.style.pointerEvents = painting ? 'none' : '';
  }

  // ----- painting / erasing -------------------------------------------------

  _onPointerDown(e) {
    const tool = this._state.tool;
    if ((tool !== 'draw' && tool !== 'erase') || !e.isPrimary || this._activePointer != null) {
      return;
    }
    this._activePointer = e.pointerId;
    const pt = this._map.mouseEventToContainerPoint(e);
    this._lastPt = pt;
    const ll = this._map.containerPointToLatLng(pt);
    this._stroke = {
      id: uid(),
      mode: tool === 'erase' ? 'erase' : 'paint',
      latlngs: [[ll.lat, ll.lng]],
      width: tool === 'erase' ? ERASE_WIDTH : BRUSH_WIDTH,
      zoom: this._map.getZoom(),
    };
    this._strokePath = this._pathEl(this._stroke);
    this._maskG.appendChild(this._strokePath);
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
    this._strokePath.setAttribute('d', this._strokeD(this._stroke));
  }

  _onPointerUp(e) {
    if (!this._stroke || e.pointerId !== this._activePointer) return;
    // Even a single tap reveals/erases a dot, so every stroke is kept.
    this._commitStroke(this._stroke);
    this._resetStroke();
  }

  _cancelStroke() {
    if (this._strokePath) this._strokePath.remove();
    this._resetStroke();
  }

  _resetStroke() {
    this._stroke = null;
    this._strokePath = null;
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
