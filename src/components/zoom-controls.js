// <zoom-controls>: stacked +/- buttons on the right edge. Emits `zoom-in` /
// `zoom-out`; pinch gestures are handled by Leaflet itself, this is the
// button fallback the spec asks for.
const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 1000;
      display: block;
    }
    .stack {
      display: flex;
      flex-direction: column;
      background: var(--panel, rgba(28,28,28,.92));
      border: 1px solid var(--panel-border, rgba(255,255,255,.14));
      border-radius: 14px;
      overflow: hidden;
      backdrop-filter: blur(8px);
      box-shadow: 0 6px 20px rgba(0,0,0,.35);
    }
    button {
      width: 48px;
      height: 48px;
      background: transparent;
      border: none;
      color: var(--panel-fg, #f2f2f2);
      font-size: 24px;
      line-height: 1;
      cursor: pointer;
    }
    button:hover { background: rgba(255,255,255,.08); }
    button:active { background: var(--accent, #e0532d); color: #fff; }
    .divider { height: 1px; background: var(--panel-border, rgba(255,255,255,.14)); }
  </style>
  <div class="stack">
    <button type="button" class="in" title="Vergrößern" aria-label="Vergrößern">+</button>
    <div class="divider"></div>
    <button type="button" class="out" title="Verkleinern" aria-label="Verkleinern">&minus;</button>
  </div>
`;

class ZoomControls extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  connectedCallback() {
    this.shadowRoot.querySelector('.in').addEventListener('click', () =>
      this.dispatchEvent(new CustomEvent('zoom-in', { bubbles: true, composed: true }))
    );
    this.shadowRoot.querySelector('.out').addEventListener('click', () =>
      this.dispatchEvent(new CustomEvent('zoom-out', { bubbles: true, composed: true }))
    );
  }
}

customElements.define('zoom-controls', ZoomControls);
