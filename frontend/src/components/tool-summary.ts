import { LitElement, css, html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { Message, ToolExecution } from "../types/workspace.js";
import { toolLabel } from "../utils/tool-label.js";
import { clusterDurationMs, type ToolStep } from "../utils/visual-turns.js";

export class ToolSummary extends LitElement {
  static properties = {
    tools: { attribute: false },
    expanded: { type: Boolean },
    steps: { attribute: false },
  };
  declare tools: ToolExecution[];
  declare expanded: boolean;
  declare steps?: ToolStep[];
  render() {
    const steps =
      this.steps ??
      (this.tools ? [{ message: {} as Message, tools: this.tools }] : []);
    const tools = steps.flatMap((step) => step.tools);
    if (!tools.length) return nothing;
    const duration = this.steps
      ? clusterDurationMs({ kind: "tool-cluster", id: "summary", steps })
      : undefined;
    const shown = tools.slice(0, 3);
    const extra = tools.length - shown.length;
    const statusLabel = (tool: ToolExecution) =>
      `${toolLabel(tool).qualified}: ${tool.status ?? "running"}`;
    return html`<section class="tool-group">
      <button
        class="tool-summary"
        @click=${() => this.dispatchEvent(new Event("tools-toggled", { bubbles: true, composed: true }))}
        aria-expanded=${this.expanded}
      >
        <span class="chips"
          >${repeat(
            shown,
            (tool) => tool.id,
            (tool) =>
              html`<span
                class="chip ${tool.status ?? "running"}"
                title=${statusLabel(tool)}
                aria-label=${statusLabel(tool)}
                >${tool.status === "completed" ? "✓" : tool.status === "failed" ? "!" : tool.status === "cancelled" ? "×" : "•"}</span
              >`,
          )}${extra ? html`<span class="more">+${extra}</span>` : nothing}</span
        >
        ${tools.length} tool${tools.length === 1 ? "" : "s"} · ${steps.length}
        step${steps.length === 1 ? "" : "s"}${duration !== undefined ? ` · ${(duration / 1000).toFixed(1)} s` : ""}</button
      >${
        this.expanded
          ? html`<div class="tool-list">
              ${repeat(
                steps,
                (_step, index) => `step:${index}`,
                (step, index) =>
                  html`<div class="step">
                    <strong>Step ${index + 1}</strong>${repeat(
                      step.tools,
                      (tool) => tool.id,
                      (tool) =>
                        html`<button
                          class="tool-row"
                          @click=${() => this.dispatchEvent(new CustomEvent("tool-selected", { detail: this.steps ? { messageId: step.message.id, tool } : tool, bubbles: true, composed: true }))}
                        >
                          ${toolLabel(tool).qualified}<span
                            >${tool.status ?? "running"}</span
                          >
                        </button>`,
                    )}
                  </div>`,
              )}
            </div>`
          : nothing
      }
    </section>`;
  }
  static styles = css`
    :host {
      display: block;
      min-width: 0;
      margin-top: 8px;
    }
    .tool-summary,
    .tool-row {
      border: 0;
      color: var(--secondary-text-color);
      background: transparent;
    }
    .tool-summary {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 4px 0;
      cursor: pointer;
    }
    .chips {
      display: inline-flex;
      gap: 4px;
    }
    .chip {
      display: grid;
      width: 18px;
      height: 18px;
      place-items: center;
      border-radius: 50%;
      color: var(--primary-text-color);
      background: var(--secondary-text-color);
      font-size: 0.72rem;
      font-weight: 700;
    }
    .chip.running {
      background: var(--primary-color);
      animation: tool-pulse 1.4s infinite;
    }
    .chip.completed {
      background: var(--success-color, #2e7d32);
    }
    .chip.failed {
      background: var(--error-color);
    }
    .chip.cancelled {
      background: var(--secondary-text-color);
    }
    @keyframes tool-pulse {
      50% {
        opacity: 0.55;
        transform: scale(0.9);
      }
    }
    .tool-row {
      display: flex;
      min-width: 0;
      width: 100%;
      gap: 8px;
      justify-content: space-between;
      padding: 6px;
      text-align: left;
      overflow-wrap: anywhere;
    }
    .tool-row span {
      flex: 0 0 auto;
    }
    .step {
      display: grid;
      gap: 2px;
      margin-top: 6px;
    }
    .step strong {
      padding: 4px 6px;
      font-size: 0.78rem;
      color: var(--secondary-text-color);
    }
    @media (prefers-reduced-motion: reduce) {
      .chip.running {
        animation: none;
      }
    }
  `;
}
if (!customElements.get("assist-workspace-tool-summary"))
  customElements.define("assist-workspace-tool-summary", ToolSummary);
