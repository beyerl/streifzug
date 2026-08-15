// <search-box>: text input that emits `search-submit` with the typed place name.
// The host (map-app) does the geocoding and calls setStatus() back.
const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      position: absolute;
      top: calc(12px + var(--safe-top, 0px));
      left: 12px;
      right: 12px;
      z-index: 1000;
      display: block;
      pointer-events: none;
    }
    .wrap {
      pointer-events: auto;
      max-width: 460px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--panel, rgba(28,28,28,.92));
      color: var(--panel-fg, #f2f2f2);
      border: 1px solid var(--panel-border, rgba(255,255,255,.14));
      border-radius: 12px;
      padding: 8px 10px;
      backdrop-filter: blur(8px);
      box-shadow: 0 6px 20px rgba(0,0,0,.35);
    }
    svg { flex: 0 0 auto; opacity: .8; }
    input {
      flex: 1 1 auto;
      background: transparent;
      border: none;
      outline: none;
      color: inherit;
      font-size: 16px;
      min-width: 0;
    }
    input::placeholder { color: rgba(242,242,242,.5); }
    button {
      flex: 0 0 auto;
      background: transparent;
      border: none;
      color: inherit;
      cursor: pointer;
      padding: 4px;
      border-radius: 8px;
      display: none;
    }
    button:hover { background: rgba(255,255,255,.1); }
    .status {
      pointer-events: none;
      max-width: 460px;
      margin: 6px auto 0;
      font-size: 13px;
      text-align: center;
      color: rgba(242,242,242,.7);
      min-height: 16px;
    }
    .status.error { color: #ff8a6b; }
    .spinner {
      width: 16px; height: 16px;
      border: 2px solid rgba(255,255,255,.25);
      border-top-color: var(--accent, #e0532d);
      border-radius: 50%;
      animation: spin .7s linear infinite;
      display: none;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    :host([loading]) .spinner { display: block; }
    :host([loading]) .search-icon { display: none; }
  </style>
  <div class="wrap">
    <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="7"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
    <div class="spinner"></div>
    <input type="search" placeholder="Ort suchen…" enterkeyhint="search"
           autocomplete="off" autocapitalize="off" spellcheck="false" />
    <button type="button" title="Löschen" aria-label="Suche löschen">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  </div>
  <div class="status"></div>
`;

class SearchBox extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._input = this.shadowRoot.querySelector('input');
    this._clear = this.shadowRoot.querySelector('button');
    this._status = this.shadowRoot.querySelector('.status');
  }

  connectedCallback() {
    this._input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._submit();
    });
    this._input.addEventListener('input', () => {
      this._clear.style.display = this._input.value ? 'block' : 'none';
    });
    this._clear.addEventListener('click', () => {
      this._input.value = '';
      this._clear.style.display = 'none';
      this.setStatus('');
      this._input.focus();
    });
  }

  _submit() {
    const query = this._input.value.trim();
    if (!query) return;
    this._input.blur();
    this.dispatchEvent(
      new CustomEvent('search-submit', { detail: { query }, bubbles: true, composed: true })
    );
  }

  setLoading(on) {
    this.toggleAttribute('loading', !!on);
  }

  setStatus(text, isError = false) {
    this._status.textContent = text || '';
    this._status.classList.toggle('error', !!isError);
  }
}

customElements.define('search-box', SearchBox);
