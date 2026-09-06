import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import "@alenaksu/json-viewer";
import type { ToolExecution } from "../types/workspace.js";
import { copyLabel, copyText, type CopyState } from "../utils/clipboard.js";
import { prettyJson } from "../utils/json.js";
import { toolLabel } from "../utils/tool-label.js";

export class ToolInspector extends LitElement {
  static properties = {
    selection: { attribute: false },
    tool: { attribute: false },
    tab: {},
    open: { type: Boolean, reflect: true },
  };
  declare selection: unknown;
  declare tool: ToolExecution | null;
  declare tab: "request" | "response" | "metadata";
  declare open: boolean;
  private copyState: CopyState = "idle";
  private copyResetTimer?: number;
  protected willUpdate(changed: PropertyValues<this>) {
    if (changed.has("selection") || changed.has("tool") || changed.has("tab")) {
      this.copyState = "idle";
      window.clearTimeout(this.copyResetTimer);
    }
  }
  protected updated() {
    const viewer = this.renderRoot.querySelector("json-viewer");
    if (viewer) {
      viewer.setAttribute("role", "tree");
      viewer.setAttribute("aria-label", "Tool JSON");
    }
  }
  disconnectedCallback() {
    window.clearTimeout(this.copyResetTimer);
    super.disconnectedCallback();
  }
  private async copyJson(value: unknown) {
    const succeeded = await copyText(prettyJson(value));
    this.copyState = succeeded ? "copy-success" : "copy-failure";
    window.clearTimeout(this.copyResetTimer);
    this.copyResetTimer = window.setTimeout(() => {
      this.copyState = "idle";
      this.requestUpdate();
    }, 1800);
    this.requestUpdate();
  }
  render() {
    const tool = this.tool;
    if (!tool) return nothing;
    const value =
      this.tab === "request"
        ? tool.request
        : this.tab === "response"
          ? tool.response
          : {
              raw_name: tool.name,
              status: tool.status,
              ...tool.metadata,
            };
    if (this.tab === "metadata") {
      if (tool.duration_ms !== undefined)
        (value as Record<string, unknown>).duration_ms = tool.duration_ms;
      if (tool.started_at)
        (value as Record<string, unknown>).started_at = tool.started_at;
      if (tool.finished_at)
        (value as Record<string, unknown>).finished_at = tool.finished_at;
    }
    return html`<div
      class="inspector"
      role="dialog"
      aria-label="Tool inspector"
      @transitionend=${(event: TransitionEvent) => {
        if (
          event.target === event.currentTarget &&
          event.propertyName === "transform" &&
          !this.open
        )
          this.dispatchEvent(
            new Event("inspector-transition-ended", {
              bubbles: true,
              composed: true,
            }),
          );
      }}
    >
      <header>
        <strong>${toolLabel(tool).qualified}</strong
        ><button
          @click=${() => this.dispatchEvent(new Event("inspector-closed", { bubbles: true, composed: true }))}
          aria-label="Close tool inspector"
        >
          ✕
        </button>
      </header>
      <nav aria-label="Inspector tabs">
        ${(["request", "response", "metadata"] as const).map((tab) => html`<button class=${this.tab === tab ? "selected" : ""} @click=${() => this.dispatchEvent(new CustomEvent("inspector-tab", { detail: tab, bubbles: true, composed: true }))}>${tab[0].toUpperCase() + tab.slice(1)}</button>`)}
      </nav>
      <div class="inspector-content">
        <div class="json-header">
          <span>JSON</span
          ><button
            aria-label="Copy JSON"
            @click=${() => void this.copyJson(value)}
          >
            ${copyLabel(this.copyState)}
          </button>
        </div>
        <json-viewer .data=${value ?? null}></json-viewer>
      </div>
    </div>`;
  }
  static styles = css`
    :host {
      min-width: 0;
      display: block;
      overflow: visible;
    }
    .inspector {
      transform: translateX(100%);
      transition: transform var(--aw-motion-panel-close, 120ms)
        var(--aw-ease-panel, ease);
    }
    :host([open]) .inspector {
      transform: translateX(0);
      transition-duration: var(--aw-motion-panel-open, 160ms);
    }
    .inspector {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      border-left: 1px solid var(--divider-color);
      background: var(--card-background-color);
      box-shadow: -12px 0 30px #0003;
    }
    header {
      min-width: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: 10px;
    }
    header strong {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    nav {
      display: flex;
      gap: 4px;
      padding: 0 10px;
      border-bottom: 1px solid var(--divider-color);
    }
    nav button {
      border: 0;
      border-bottom: 2px solid transparent;
      padding: 8px 10px;
      color: var(--secondary-text-color);
      background: transparent;
      cursor: pointer;
    }
    nav button.selected {
      border-color: var(--primary-color);
      color: var(--primary-text-color);
    }
    header button {
      flex: 0 0 auto;
      width: var(--aw-touch-size, 32px);
      height: var(--aw-touch-size, 32px);
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: inherit;
    }
    .inspector-content {
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      padding: 8px;
    }
    .json-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 6px;
      color: var(--secondary-text-color);
      font-size: 0.78rem;
    }
    .json-header button {
      border: 0;
      border-radius: 6px;
      width: 88px;
      height: 26px;
      padding: 2px 4px;
      color: inherit;
      background: transparent;
      cursor: pointer;
      text-align: right;
      font: inherit;
    }
    .json-header button:hover,
    .json-header button:focus-visible {
      background: var(--secondary-background-color);
    }
    .json-header button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 1px;
    }
    json-viewer {
      width: 100%;
      box-sizing: border-box;
      min-height: 0;
      margin: 0;
      padding: 12px;
      overflow: auto;
      --background-color: var(--card-background-color, transparent);
      --color: var(--primary-text-color, #202124);
      --property-color: var(--aw-json-key, #027c9b);
      --string-color: var(--aw-json-string, #2e7d32);
      --number-color: var(--aw-json-number, #b26a00);
      --boolean-color: var(--aw-json-boolean, #7c4dff);
      --null-color: var(--aw-json-null, #6b7280);
      --preview-color: var(--secondary-text-color, #6b7280);
      --indentguide-color: var(--divider-color, #d0d5dd);
      --indentguide-color-active: var(--primary-color, #027c9b);
    }
    @media (prefers-reduced-motion: reduce) {
      .inspector {
        transition: none;
      }
    }
  `;
}
if (!customElements.get("assist-workspace-tool-inspector"))
  customElements.define("assist-workspace-tool-inspector", ToolInspector);
