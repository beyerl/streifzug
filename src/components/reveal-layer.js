// RevealLayer: a Leaflet GridLayer that shows the map in COLOR only inside the
// painted areas, letting the grayscale base map show through everywhere else.
//
// Why a canvas layer instead of a CSS mask: masking a Leaflet tile pane with an
// SVG <mask> works in desktop browsers but not in the Android WebView, which
// won't clip the tiles' hardware-composited layers to an ancestor mask. Doing
// the compositing inside each tile's own <canvas> sidesteps that entirely and
// needs only canvas 2D — universally supported.
//
// Each tile canvas draws the colored tile image, then uses canvas compositing to
// keep only the pixels covered by 'paint' strokes (destination-in) minus the
// 'erase' strokes. No CORS is needed: we only display the canvas, never read its
// pixels, so a cross-origin (tainted) tile is fine.
import L from 'leaflet';

export const RevealLayer = L.GridLayer.extend({
  initialize(tileUrl, options) {
    L.GridLayer.prototype.initialize.call(this, options);
    this._tileUrl = tileUrl;
    this._subdomains = (options && options.subdomains) || 'abc';
    this._strokes = [];
    this._imgCache = new Map(); // url -> { img, loaded }
    this._liveTiles = new Map(); // tileKey -> { canvas, coords }
  },

  // Replace the stroke set and recomposite every on-screen tile (cheap: images
  // are cached, so no refetching).
  setStrokes(strokes) {
    this._strokes = strokes || [];
    for (const { canvas, coords } of this._liveTiles.values()) {
      this._composite(canvas, coords);
    }
  },

  createTile(coords, done) {
    const size = this.getTileSize();
    const canvas = document.createElement('canvas');
    canvas.width = size.x;
    canvas.height = size.y;

    const key = this._tileCoordsToKey(coords);
    this._liveTiles.set(key, { canvas, coords });

    this._loadImage(this._tileUrlFor(coords), (img) => {
      canvas._img = img; // null on error → tile stays transparent
      this._composite(canvas, coords);
      done(null, canvas);
    });
    return canvas;
  },

  // Drop cached references when Leaflet unloads a tile.
  _removeTile(key) {
    this._liveTiles.delete(key);
    L.GridLayer.prototype._removeTile.call(this, key);
  },

  _tileUrlFor(coords) {
    const s = this._subdomains[Math.abs(coords.x + coords.y) % this._subdomains.length];
    return this._tileUrl
      .replace('{s}', s)
      .replace('{z}', coords.z)
      .replace('{x}', coords.x)
      .replace('{y}', coords.y);
  },

  _loadImage(url, cb) {
    const cached = this._imgCache.get(url);
    if (cached && cached.loaded) return cb(cached.img);
    if (cached) {
      cached.cbs.push(cb);
      return;
    }
    const img = new Image();
    const rec = { img, loaded: false, cbs: [cb] };
    this._imgCache.set(url, rec);
    // Soft cap so long panning sessions don't grow the cache without bound.
    if (this._imgCache.size > 400) {
      const oldest = this._imgCache.keys().next().value;
      if (oldest !== url) this._imgCache.delete(oldest);
    }
    img.onload = () => {
      rec.loaded = true;
      rec.cbs.forEach((fn) => fn(img));
      rec.cbs = [];
    };
    img.onerror = () => {
      rec.loaded = true;
      rec.img = null;
      rec.cbs.forEach((fn) => fn(null));
      rec.cbs = [];
    };
    img.src = url;
  },

  _composite(canvas, coords) {
    const size = this.getTileSize();
    const ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size.x, size.y);
    if (!canvas._img) return; // nothing loaded yet → transparent, base shows

    ctx.drawImage(canvas._img, 0, 0, size.x, size.y);

    // Keep only the painted region: build the reveal alpha in a buffer, then
    // intersect it with the color tile.
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(this._buildMask(coords), 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  },

  // Alpha buffer for this tile: union(paint) minus union(erase), in tile-local
  // pixels at the tile's own zoom.
  _buildMask(coords) {
    const size = this.getTileSize();
    const buf = document.createElement('canvas');
    buf.width = size.x;
    buf.height = size.y;
    const ctx = buf.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';

    const originX = coords.x * size.x;
    const originY = coords.y * size.y;

    for (const st of this._strokes) {
      const scale = Math.pow(2, coords.z - st.zoom);
      const w = Math.max(1, st.width * scale);
      // Paint adds to the mask; erase cuts it back out.
      ctx.globalCompositeOperation = st.mode === 'erase' ? 'destination-out' : 'source-over';
      ctx.lineWidth = w;

      if (st.latlngs.length === 1) {
        const p = this._map.project(st.latlngs[0], coords.z);
        ctx.beginPath();
        ctx.arc(p.x - originX, p.y - originY, w / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      let first = true;
      for (const [lat, lng] of st.latlngs) {
        const p = this._map.project([lat, lng], coords.z);
        const x = p.x - originX;
        const y = p.y - originY;
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
    return buf;
  },
});
