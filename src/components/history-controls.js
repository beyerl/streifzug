// <history-controls>: undo / redo buttons for the paint & erase strokes.
// Emits `undo` / `redo`; the host enables/disables them via setState().
const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      position: absolute;
      left: 12px;
      bottom: calc(18px + var(--safe-bottom, 0px));
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
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: var(--panel-fg, #f2f2f2);
      cursor: pointer;
    }
    button:hover:not(:disabled) { background: rgba(255,255,255,.08); }
    button:active:not(:disabled) { background: var(--accent, #e0532d); color: #fff; }
    button:disabled { opacity: .35; cursor: default; }
    .divider { height: 1px; background: var(--panel-border, rgba(255,255,255,.14)); }
    svg { width: 22px; height: 22px; }
  </style>
  <div class="stack">
    <button type="button" class="undo" title="Rückgängig" aria-label="Rückgängig" disabled>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 7v6h6"></path>
        <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
      </svg>
    </button>
    <div class="divider"></div>
    <button type="button" class="redo" title="Wiederherstellen" aria-label="Wiederherstellen" disabled>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 7v6h-6"></path>
        <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"></path>
      </svg>
    </button>
  </div>
`;

class HistoryControls extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._undo = this.shadowRoot.querySelector('.undo');
    this._redo = this.shadowRoot.querySelector('.redo');
  }

  connectedCallback() {
    this._undo.addEventListener('click', () =>
      this.dispatchEvent(new CustomEvent('undo', { bubbles: true, composed: true }))
    );
    this._redo.addEventListener('click', () =>
      this.dispatchEvent(new CustomEvent('redo', { bubbles: true, composed: true }))
    );
  }

  setState(canUndo, canRedo) {
    this._undo.disabled = !canUndo;
    this._redo.disabled = !canRedo;
  }
}

customElements.define('history-controls', HistoryControls);
