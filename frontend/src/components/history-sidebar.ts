import { LitElement, css, html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type {
  ConversationSummary,
  HighlightRange,
  SearchHit,
} from "../types/workspace.js";

export class HistorySidebar extends LitElement {
  static properties = {
    conversations: { attribute: false },
    searchHits: { attribute: false },
    activeId: {},
    query: {},
    searchPending: { type: Boolean },
    searchError: { type: Boolean },
    runningIds: { attribute: false },
  };
  declare conversations: ConversationSummary[];
  declare searchHits: SearchHit[];
  declare activeId: string | null;
  declare query: string;
  declare searchPending: boolean;
  declare searchError: boolean;
  declare runningIds: Set<string>;
  private label(item: ConversationSummary) {
    const date = item.updated_at ? new Date(item.updated_at) : new Date();
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    return date.toDateString() === today.toDateString()
      ? "Today"
      : date.toDateString() === yesterday.toDateString()
        ? "Yesterday"
        : "Older";
  }
  private highlighted(text: string, match?: HighlightRange) {
    if (!match) return text;
    return html`${text.slice(0, match.start)}<mark>${text.slice(match.start, match.end)}</mark>${text.slice(match.end)}`;
  }
  private row(item: ConversationSummary, searchMode: boolean, hit?: SearchHit) {
    const range = hit?.highlight_ranges?.[0];
    return html`<div
      class="chat-row ${item.id === this.activeId ? "selected" : ""}"
    >
      <button
        class="chat-title"
        @click=${() => this.dispatchEvent(new CustomEvent("select-conversation", { detail: item.id, bubbles: true, composed: true }))}
      >
        <span class="result-title"
          >${this.highlighted(
            item.title,
            hit?.match_type === "title" ? range : undefined,
          )}</span
        >
        ${hit?.snippet ? html`<span class="result-snippet">${this.highlighted(hit.snippet, hit.match_type === "message" ? range : undefined)}</span>` : nothing}
        ${this.runningIds?.has(item.id) ? html`<span class="running-dot" aria-label="Running">●</span>` : nothing}
      </button>
      <button
        class="chat-menu"
        aria-label="Conversation actions"
        @click=${(event: Event) => this.dispatchEvent(new CustomEvent("menu-conversation", { detail: { id: item.id, anchor: event.currentTarget }, bubbles: true, composed: true }))}
      >
        ⋯
      </button>
    </div>`;
  }
  render() {
    let previous = "";
    const searchMode = Boolean(this.query?.trim());
    return html`<button
        class="new-chat"
        @click=${() => this.dispatchEvent(new Event("new-chat", { bubbles: true, composed: true }))}
      >
        <span aria-hidden="true">＋</span> New chat</button
      ><label class="search"
        ><span aria-hidden="true">⌕</span
        ><input
          aria-label="Search chats"
          .value=${this.query ?? ""}
          @input=${(event: InputEvent) => this.dispatchEvent(new CustomEvent("search-changed", { detail: (event.target as HTMLInputElement).value, bubbles: true, composed: true }))}
          placeholder="Search chats"
        />${this.query ? html`<button class="clear-search" aria-label="Clear search" @click=${() => this.dispatchEvent(new CustomEvent("search-changed", { detail: "", bubbles: true, composed: true }))}>×</button>` : nothing}</label
      >
      <div class="history">
        ${searchMode ? html`<h3 class="search-heading">Search results</h3>` : nothing}
        ${searchMode && this.searchPending ? html`<p class="search-status" role="status">Searching…</p>` : nothing}
        ${searchMode && !this.searchPending && this.searchError ? html`<p class="no-results" role="alert">Search failed</p>` : nothing}
        ${searchMode && !this.searchPending && !this.searchError && !this.searchHits?.length ? html`<p class="no-results">No results</p>` : nothing}
        ${
          searchMode
            ? repeat(
                this.searchHits ?? [],
                (hit) => hit.conversation.id,
                (hit) => this.row(hit.conversation, true, hit),
              )
            : repeat(
                this.conversations ?? [],
                (item) => item.id,
                (item) => {
                  const label = this.label(item);
                  const heading =
                    label !== previous
                      ? ((previous = label),
                        html`<h3 class="history-heading">${label}</h3>`)
                      : nothing;
                  return html`${heading}${this.row(item, false)}`;
                },
              )
        }
      </div>`;
  }
  static styles = css`
    :host {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      gap: 8px;
      padding: 10px;
      box-sizing: border-box;
    }
    .history {
      min-height: 0;
      overflow: auto;
    }
    .new-chat,
    .search {
      min-height: var(--aw-touch-size, 40px);
      border-radius: 9px;
      padding: 0 10px;
      color: inherit;
    }
    .new-chat {
      display: flex;
      align-items: center;
      gap: 8px;
      border: 0;
      background: transparent;
      text-align: left;
      font: inherit;
      cursor: pointer;
    }
    .new-chat:hover,
    .new-chat:focus-visible {
      background: var(--secondary-background-color);
      outline: none;
    }
    .search {
      display: flex;
      align-items: center;
      gap: 7px;
      background: var(--secondary-background-color);
    }
    .search input {
      min-width: 0;
      flex: 1;
      border: 0;
      outline: none;
      color: inherit;
      background: transparent;
      font: inherit;
    }
    .clear-search {
      min-width: var(--aw-touch-size, 28px);
      min-height: var(--aw-touch-size, 28px);
      border: 0;
      color: inherit;
      background: transparent;
      cursor: pointer;
    }
    .chat-row {
      display: flex;
      width: 100%;
    }
    .chat-title {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: normal;
      padding: 9px;
      border: 0;
      color: inherit;
      background: transparent;
      text-align: left;
    }
    .chat-menu {
      min-width: var(--aw-touch-size, 32px);
      min-height: var(--aw-touch-size, 32px);
      border: 0;
      color: inherit;
      background: transparent;
    }
    .selected {
      background: var(--secondary-background-color);
      box-shadow: inset 2px 0 var(--primary-color);
    }
    .history-heading {
      margin: 16px 8px 6px;
      color: var(--secondary-text-color);
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .search-heading {
      margin: 12px 8px 8px;
      font-size: 0.85rem;
    }
    .no-results {
      margin: 24px 8px;
      color: var(--secondary-text-color);
    }
    .search-status {
      margin: 24px 8px;
      color: var(--secondary-text-color);
    }
    .result-title,
    .result-snippet {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .result-title {
      white-space: nowrap;
    }
    .result-snippet {
      margin-top: 3px;
      color: var(--secondary-text-color);
      font-size: 0.78rem;
      line-height: 1.35;
    }
    mark {
      color: inherit;
      background: color-mix(in srgb, var(--primary-color) 24%, transparent);
      border-radius: 2px;
    }
    .running-dot {
      margin-left: 6px;
      color: var(--primary-color);
      font-size: 0.65rem;
    }
  `;
}
if (!customElements.get("assist-workspace-history"))
  customElements.define("assist-workspace-history", HistorySidebar);
