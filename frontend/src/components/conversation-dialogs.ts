import { LitElement, css, html, nothing, type PropertyValues } from "lit";
export class ConversationDialogs extends LitElement {
  static properties = {
    renameOpen: { type: Boolean },
    deleteOpen: { type: Boolean },
    title: {},
    draft: {},
  };
  declare renameOpen: boolean;
  declare deleteOpen: boolean;
  declare title: string;
  declare draft: string;
  protected updated(changed: PropertyValues<this>) {
    if (changed.has("renameOpen") && this.renameOpen)
      this.renderRoot.querySelector<HTMLInputElement>("input")?.focus();
  }
  private closeOnBackdrop = (event: MouseEvent) => {
    if (event.target === event.currentTarget)
      this.dispatchEvent(
        new Event("dialogs-closed", { bubbles: true, composed: true }),
      );
  };
  render() {
    if (this.renameOpen)
      return html`<div class="overlay" @click=${this.closeOnBackdrop}>
        <div class="dialog" role="dialog" aria-label="Rename conversation">
          <form
            @submit=${(event: SubmitEvent) => {
              event.preventDefault();
              this.dispatchEvent(
                new CustomEvent("rename-confirmed", {
                  detail: this.draft,
                  bubbles: true,
                  composed: true,
                }),
              );
            }}
          >
            <h3>Rename conversation</h3>
            <input
              aria-label="Rename conversation"
              .value=${this.draft}
              @input=${(event: InputEvent) => this.dispatchEvent(new CustomEvent("rename-draft", { detail: (event.target as HTMLInputElement).value, bubbles: true, composed: true }))}
            />
            <footer>
              <button
                type="button"
                @click=${() => this.dispatchEvent(new Event("dialogs-closed", { bubbles: true, composed: true }))}
              >
                Cancel</button
              ><button ?disabled=${!this.draft.trim()}>Save</button>
            </footer>
          </form>
        </div>
      </div>`;
    if (this.deleteOpen)
      return html`<div class="overlay" @click=${this.closeOnBackdrop}>
        <div class="dialog" role="alertdialog" aria-label="Delete conversation">
          <h3>Delete conversation?</h3>
          <p>“${this.title || "Conversation"}” will be permanently deleted.</p>
          <p class="dialog-detail">This cannot be undone.</p>
          <footer>
            <button
              @click=${() => this.dispatchEvent(new Event("dialogs-closed", { bubbles: true, composed: true }))}
            >
              Cancel</button
            ><button
              class="danger"
              @click=${() => this.dispatchEvent(new Event("delete-confirmed", { bubbles: true, composed: true }))}
            >
              Delete
            </button>
          </footer>
        </div>
      </div>`;
    return nothing;
  }
  static styles = css`
    :host {
      position: absolute;
      z-index: 4;
      inset: 0;
      pointer-events: none;
    }
    .overlay {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      pointer-events: auto;
      background: #0004;
    }
    .dialog {
      width: min(420px, calc(100% - 24px));
      max-height: calc(100% - 24px);
      overflow: auto;
      box-sizing: border-box;
      border-radius: 15px;
      padding: 20px;
      border: 1px solid var(--divider-color);
      background: var(--card-background-color);
      box-shadow: 0 16px 40px #0005;
    }
    h3 {
      margin: 0 0 14px;
    }
    p {
      margin: 0 0 8px;
    }
    input {
      width: 100%;
      box-sizing: border-box;
      height: 42px;
      border: 1px solid var(--divider-color);
      border-radius: 10px;
      padding: 0 11px;
      color: inherit;
      background: var(--secondary-background-color);
      font: inherit;
    }
    input:focus-visible,
    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    footer {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      padding: 12px 0 0;
    }
    footer button {
      min-width: 76px;
      height: var(--aw-touch-size, 38px);
      border: 0;
      border-radius: 10px;
      padding: 0 13px;
      color: var(--text-primary-color, white);
      background: var(--primary-color, #1976d2);
      font: inherit;
    }
    footer button[type="button"] {
      color: inherit;
      background: transparent;
    }
    footer button:disabled {
      color: var(--primary-text-color, #202124);
      background: var(--secondary-background-color, #eeeeee);
      opacity: 1;
    }
    .dialog-detail {
      color: var(--secondary-text-color);
    }
    .danger {
      color: var(--text-primary-color, white);
      background: var(--error-color, #b3261e);
    }
  `;
}
if (!customElements.get("assist-workspace-dialogs"))
  customElements.define("assist-workspace-dialogs", ConversationDialogs);
