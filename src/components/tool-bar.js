// <tool-bar>: bottom-centred tool switcher. Exactly one tool is active at a
// time; picking one emits `tool-change` with { tool: 'move' | 'draw' | 'marker' }.
const TOOLS = [
  {
    id: 'move',
    label: 'Verschieben',
    // hand / pan
    icon: `<path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>`,
  },
  {
    id: 'draw',
    label: 'Zeichnen',
    // pencil
    icon: `<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>`,
  },
  {
    id: 'erase',
    label: 'Radieren',
    // eraser
    icon: `<path d="M20 20H8.5L3.5 15a2 2 0 0 1 0-2.8l8-8a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8L14 20"/><path d="M8.5 20 16 12.5"/>`,
  },
  {
    id: 'marker',
    label: 'Marker',
    // map pin
    icon: `<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>`,
  },
];

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      bottom: calc(18px + var(--safe-bottom, 0px));
      z-index: 1000;
      display: block;
    }
    .bar {
      display: flex;
      gap: 4px;
      padding: 6px;
      background: var(--panel, rgba(28,28,28,.92));
      border: 1px solid var(--panel-border, rgba(255,255,255,.14));
      border-radius: 16px;
      backdrop-filter: blur(8px);
      box-shadow: 0 6px 20px rgba(0,0,0,.35);
    }
    button {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      width: 60px;
      padding: 8px 2px;
      background: transparent;
      border: none;
      border-radius: 12px;
      color: var(--panel-fg, #f2f2f2);
      cursor: pointer;
      font-size: 11px;
      transition: background .15s ease, color .15s ease;
    }
    button:hover { background: rgba(255,255,255,.08); }
    button[aria-pressed="true"] {
      background: var(--accent, #e0532d);
      color: #fff;
    }
    svg { width: 22px; height: 22px; }
  </style>
  <div class="bar" role="toolbar" aria-label="Werkzeuge"></div>
`;

class ToolBar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._buttons = new Map();
    const bar = this.shadowRoot.querySelector('.bar');
    for (const tool of TOOLS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = tool.label;
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML =
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
        `stroke-linecap="round" stroke-linejoin="round">${tool.icon}</svg>` +
        `<span>${tool.label}</span>`;
      btn.addEventListener('click', () => this._select(tool.id));
      bar.appendChild(btn);
      this._buttons.set(tool.id, btn);
    }
  }

  _select(tool) {
    this.setActive(tool);
    this.dispatchEvent(
      new CustomEvent('tool-change', { detail: { tool }, bubbles: true, composed: true })
    );
  }

  setActive(tool) {
    for (const [id, btn] of this._buttons) {
      btn.setAttribute('aria-pressed', String(id === tool));
    }
  }
}

customElements.define('tool-bar', ToolBar);
