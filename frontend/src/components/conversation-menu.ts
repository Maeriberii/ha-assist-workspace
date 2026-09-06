import { LitElement, css, html, nothing } from "lit";
import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
} from "@floating-ui/dom";
export class ConversationMenu extends LitElement {
  static properties = { open: { type: Boolean }, anchor: { attribute: false } };
  declare open: boolean;
  declare anchor: HTMLElement | null;
  private cleanup?: () => void;
  private close = () =>
    this.dispatchEvent(
      new Event("menu-closed", { bubbles: true, composed: true }),
    );
  private onDocumentPointerDown = (event: PointerEvent) => {
    const menu = this.renderRoot.querySelector(".conversation-menu");
    if (this.open && menu && !event.composedPath().includes(menu)) this.close();
  };
  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("pointerdown", this.onDocumentPointerDown);
  }
  protected updated() {
    this.cleanup?.();
    const menu =
      this.renderRoot.querySelector<HTMLElement>(".conversation-menu");
    if (!this.open || !menu || !this.anchor) return;
    const rect = this.anchor.getBoundingClientRect();
    if (
      !this.anchor.isConnected ||
      !Number.isFinite(rect.x) ||
      !Number.isFinite(rect.y) ||
      !Number.isFinite(rect.width) ||
      !Number.isFinite(rect.height)
    ) {
      this.dispatchEvent(
        new Event("menu-anchor-invalid", { bubbles: true, composed: true }),
      );
      return;
    }
    const position = () =>
      computePosition(this.anchor!, menu, {
        strategy: "fixed",
        placement: "bottom-end",
        middleware: [offset(4), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) =>
        Object.assign(menu.style, { left: `${x}px`, top: `${y}px` }),
      );
    void position();
    this.cleanup = autoUpdate(this.anchor, menu, position);
  }
  disconnectedCallback() {
    this.cleanup?.();
    window.removeEventListener("pointerdown", this.onDocumentPointerDown);
    super.disconnectedCallback();
  }
  render() {
    return this.open
      ? html`<div class="conversation-menu" role="menu">
          <button
            @click=${() => this.dispatchEvent(new Event("rename-requested", { bubbles: true, composed: true }))}
          >
            Rename</button
          ><button
            @click=${() => this.dispatchEvent(new Event("delete-requested", { bubbles: true, composed: true }))}
          >
            Delete
          </button>
        </div>`
      : nothing;
  }
  static styles = css`
    :host {
      position: fixed;
      z-index: 5;
      inset: 0;
      pointer-events: none;
    }
    .conversation-menu {
      position: fixed;
      pointer-events: auto;
      display: grid;
      min-width: 136px;
      padding: 4px;
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      background: var(--card-background-color);
      box-shadow: 0 8px 22px #0003;
    }
    button {
      border: 0;
      padding: 8px;
      color: inherit;
      background: transparent;
      text-align: left;
    }
    button:hover {
      background: var(--secondary-background-color);
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: -2px;
    }
  `;
}
if (!customElements.get("assist-workspace-conversation-menu"))
  customElements.define("assist-workspace-conversation-menu", ConversationMenu);
