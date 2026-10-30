import { LitElement, css, html, type PropertyValues } from "lit";

export class WorkspaceComposer extends LitElement {
  static properties = {
    draft: {},
    running: { type: Boolean },
    textareaDisabled: { type: Boolean },
    canSend: { type: Boolean },
    enterSends: { type: Boolean },
  };
  declare draft: string;
  declare running: boolean;
  declare textareaDisabled: boolean;
  declare canSend: boolean;
  declare enterSends: boolean;
  private composing = false;
  private resize(textarea: HTMLTextAreaElement) {
    textarea.style.height = "48px";
    textarea.style.height = `${Math.max(48, Math.min(textarea.scrollHeight, 144))}px`;
  }
  protected updated(changed: PropertyValues<this>) {
    if (changed.has("draft")) {
      const textarea =
        this.renderRoot.querySelector<HTMLTextAreaElement>("textarea");
      if (textarea) this.resize(textarea);
    }
  }
  private input(event: InputEvent) {
    const textarea = event.target as HTMLTextAreaElement;
    this.resize(textarea);
    this.canSend =
      Boolean(textarea.value.trim()) && !this.running && !this.textareaDisabled;
    this.requestUpdate();
    this.dispatchEvent(
      new CustomEvent("draft-changed", {
        detail: textarea.value,
        bubbles: true,
        composed: true,
      }),
    );
  }
  render() {
    return html`<div class="composer-shell">
      <textarea
        aria-label="Ask Assist"
        .value=${this.draft ?? ""}
        ?disabled=${this.textareaDisabled}
        @input=${this.input}
        @compositionstart=${() => (this.composing = true)}
        @compositionend=${() => (this.composing = false)}
        @keydown=${(event: KeyboardEvent) => {
          if (
            event.key === "Enter" &&
            (this.enterSends
              ? !event.shiftKey
              : event.ctrlKey || event.metaKey) &&
            !event.isComposing &&
            !this.composing &&
            this.canSend
          ) {
            event.preventDefault();
            this.dispatchEvent(
              new CustomEvent("send-requested", {
                bubbles: true,
                composed: true,
              }),
            );
          }
        }}
      ></textarea
      ><button
        class="send"
        aria-label=${this.running ? "Stop" : "Send"}
        title=${this.running ? "Stop" : "Send"}
        ?disabled=${this.running ? false : !this.canSend}
        @click=${() => this.dispatchEvent(new CustomEvent(this.running ? "stop-requested" : "send-requested", { bubbles: true, composed: true }))}
      >
        ${this.running ? "■" : "↑"}
      </button>
    </div>`;
  }
  static styles = css`
    :host {
      display: block;
      padding: 12px;
      border-top: 1px solid var(--divider-color);
    }
    .composer-shell {
      position: relative;
      display: grid;
      min-height: 48px;
      border: 1px solid var(--divider-color);
      border-radius: 12px;
      background: var(--secondary-background-color);
    }
    .composer-shell:focus-within {
      border-color: var(--primary-color);
      box-shadow: 0 0 0 1px var(--primary-color);
    }
    textarea {
      min-width: 0;
      box-sizing: border-box;
      height: 48px;
      min-height: 48px;
      max-height: 144px;
      padding: 12px 52px 12px 12px;
      resize: none;
      overflow-y: auto;
      color: inherit;
      background: transparent;
      border: 0;
      font-family: inherit;
      font-size: 16px;
      font-weight: 400;
      line-height: 1.5;
      letter-spacing: normal;
    }
    textarea:focus {
      outline: none;
    }
    .send {
      position: absolute;
      right: 8px;
      bottom: 8px;
      width: var(--aw-touch-size, 34px);
      height: var(--aw-touch-size, 34px);
      border: 0;
      border-radius: 50%;
      color: var(--text-primary-color, white);
      background: var(--primary-color);
      font: inherit;
      line-height: 1;
      cursor: pointer;
    }
    .send:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  `;
}
if (!customElements.get("assist-workspace-composer"))
  customElements.define("assist-workspace-composer", WorkspaceComposer);
