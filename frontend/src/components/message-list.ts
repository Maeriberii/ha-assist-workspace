import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type {
  Conversation,
  ToolExecution,
  Turn,
  TurnNotice,
} from "../types/workspace.js";
import { copyLabel, copyText, type CopyState } from "../utils/clipboard.js";
import { renderMarkdown } from "../utils/markdown.js";
import type { VisualPart, VisualTurn } from "../utils/visual-turns.js";
import {
  FOLLOWING,
  detachForUpwardIntent,
  followForScroll,
  type FollowState,
  showUnreadForNewContent,
} from "../utils/scroll-follow.js";
import "./tool-summary.js";

export class MessageList extends LitElement {
  static properties = {
    conversation: { attribute: false },
    timelineRevision: { type: Number },
    expandedIds: { attribute: false },
    turn: { attribute: false },
    turnNotice: { attribute: false },
    loading: { type: Boolean },
    loadError: { type: Boolean },
    items: { attribute: false },
    showToolActivity: { type: Boolean },
  };
  declare conversation: Conversation | undefined;
  declare timelineRevision: number;
  declare expandedIds: Set<string>;
  declare turn: Turn | undefined;
  declare turnNotice: TurnNotice | undefined;
  declare loading: boolean;
  declare loadError: boolean;
  declare items: VisualTurn[];
  declare showToolActivity: boolean;
  private jumpRaf?: number;
  private jumpActive = false;
  private followState: FollowState = FOLLOWING;
  private conversationId?: string;
  private contentRevision = 0;
  private lastScrollTop = 0;
  private copyStates = new Map<string, CopyState>();
  private copyResetTimers = new Map<string, number>();
  private timeline() {
    return this.renderRoot.querySelector<HTMLElement>(".messages");
  }
  private onScroll = (event: Event) => {
    const target = event.currentTarget as HTMLElement;
    const scrollingUp = target.scrollTop < this.lastScrollTop;
    this.lastScrollTop = target.scrollTop;
    this.setFollowState(
      scrollingUp
        ? detachForUpwardIntent(this.followState)
        : followForScroll(target, this.followState),
    );
  };
  private setFollowState(next: FollowState) {
    if (
      next.detachedFromBottom === this.followState.detachedFromBottom &&
      next.hasUnread === this.followState.hasUnread
    )
      return;
    this.followState = next;
    this.requestUpdate();
  }
  private stopFollow = (event: WheelEvent | KeyboardEvent) => {
    if (
      (event instanceof WheelEvent && event.deltaY < 0) ||
      (event instanceof KeyboardEvent &&
        ["PageUp", "Home", "ArrowUp"].includes(event.key))
    ) {
      this.cancelJump();
      this.setFollowState(detachForUpwardIntent(this.followState));
    }
  };
  private onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "touch") this.touchStartY = event.clientY;
  };
  private touchStartY?: number;
  private onPointerMove = (event: PointerEvent) => {
    if (
      event.pointerType === "touch" &&
      this.touchStartY !== undefined &&
      event.clientY - this.touchStartY > 8
    ) {
      this.cancelJump();
      this.setFollowState(detachForUpwardIntent(this.followState));
      this.touchStartY = undefined;
    }
  };
  private onPointerUp = () => {
    this.touchStartY = undefined;
  };
  protected willUpdate(changed: PropertyValues<this>) {
    const conversationChanged =
      changed.has("conversation") &&
      this.conversationId !== this.conversation?.id;
    if (conversationChanged) {
      this.cancelJump();
      this.conversationId = this.conversation?.id;
      this.contentRevision = this.timelineRevision ?? 0;
      this.followState = FOLLOWING;
    } else if (changed.has("timelineRevision")) {
      const nextRevision = this.timelineRevision ?? 0;
      if (
        nextRevision !== this.contentRevision &&
        this.followState.detachedFromBottom
      )
        this.followState = showUnreadForNewContent(this.followState);
      this.contentRevision = nextRevision;
    }
  }
  protected updated() {
    const timeline = this.timeline();
    if (!this.jumpActive && !this.followState.detachedFromBottom && timeline) {
      timeline.scrollTop = timeline.scrollHeight;
      this.lastScrollTop = timeline.scrollTop;
    }
  }
  private scrollToLatest = () => {
    const timeline = this.timeline();
    this.followState = FOLLOWING;
    this.requestUpdate();
    if (!timeline) return;
    this.cancelJump();
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      timeline.scrollTop = timeline.scrollHeight;
      this.lastScrollTop = timeline.scrollTop;
      return;
    }
    const startedAt = performance.now();
    const startTop = timeline.scrollTop;
    this.jumpActive = true;
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 180);
      const eased = 1 - (1 - progress) ** 3;
      const target = Math.max(0, timeline.scrollHeight - timeline.clientHeight);
      timeline.scrollTop = startTop + (target - startTop) * eased;
      this.lastScrollTop = timeline.scrollTop;
      if (progress < 1) this.jumpRaf = requestAnimationFrame(step);
      else {
        timeline.scrollTop = timeline.scrollHeight;
        this.lastScrollTop = timeline.scrollTop;
        this.jumpActive = false;
        this.jumpRaf = undefined;
      }
    };
    this.jumpRaf = requestAnimationFrame(step);
  };
  private cancelJump() {
    if (this.jumpRaf !== undefined) cancelAnimationFrame(this.jumpRaf);
    this.jumpRaf = undefined;
    this.jumpActive = false;
  }
  disconnectedCallback() {
    this.cancelJump();
    for (const timer of this.copyResetTimers.values())
      window.clearTimeout(timer);
    super.disconnectedCallback();
  }
  private renderTools(
    conversation: Conversation,
    message: { id: string; tool_executions?: ToolExecution[] },
  ) {
    if (!this.showToolActivity || !message.tool_executions?.length)
      return nothing;
    return html`<assist-workspace-tool-summary
      .tools=${message.tool_executions}
      .expanded=${this.expandedIds?.has(`${conversation.id}:${message.id}`)}
      @tools-toggled=${(event: Event) => {
        event.stopPropagation();
        this.dispatchEvent(
          new CustomEvent("tools-toggled", {
            detail: message.id,
            bubbles: true,
            composed: true,
          }),
        );
      }}
      @tool-selected=${(event: CustomEvent<ToolExecution>) => {
        event.stopPropagation();
        this.dispatchEvent(
          new CustomEvent("tool-selected", {
            detail: { messageId: message.id, tool: event.detail },
            bubbles: true,
            composed: true,
          }),
        );
      }}
    ></assist-workspace-tool-summary>`;
  }
  private renderPart(conversation: Conversation, part: VisualPart) {
    if (part.kind === "content") {
      const message = part.message;
      return html`${message.visible_content ? html`<div class="content">${renderMarkdown(message.visible_content)}</div>` : nothing}${this.renderTools(conversation, message)}`;
    }
    if (!this.showToolActivity) return nothing;
    const key = `${conversation.id}:${part.id}`;
    return html`<assist-workspace-tool-summary
      .steps=${part.steps}
      .expanded=${this.expandedIds?.has(key)}
      @tools-toggled=${(event: Event) => {
        event.stopPropagation();
        this.dispatchEvent(
          new CustomEvent("tools-toggled", {
            detail: key,
            bubbles: true,
            composed: true,
          }),
        );
      }}
      @tool-selected=${(
        event: CustomEvent<{ messageId: string; tool: ToolExecution }>,
      ) => {
        event.stopPropagation();
        this.dispatchEvent(
          new CustomEvent("tool-selected", {
            detail: event.detail,
            bubbles: true,
            composed: true,
          }),
        );
      }}
    ></assist-workspace-tool-summary>`;
  }
  private copyButton(id: string, value: string) {
    const state = this.copyStates.get(id) ?? "idle";
    const label = copyLabel(state);
    return html`<button
      class="copy"
      aria-label=${state === "idle" ? "Copy message" : label}
      @click=${() => void this.copyMessage(id, value)}
    >
      ${label}
    </button>`;
  }
  private async copyMessage(id: string, value: string) {
    const succeeded = await copyText(value);
    this.copyStates.set(id, succeeded ? "copy-success" : "copy-failure");
    window.clearTimeout(this.copyResetTimers.get(id));
    this.copyResetTimers.set(
      id,
      window.setTimeout(() => {
        this.copyStates.delete(id);
        this.copyResetTimers.delete(id);
        this.requestUpdate();
      }, 1800),
    );
    this.requestUpdate();
  }
  render() {
    const conversation = this.conversation;
    if (!conversation && this.loading)
      return html`<div class="messages">
        <div class="empty" role="status">Loading conversation…</div>
      </div>`;
    if (!conversation && this.loadError)
      return html`<div class="messages">
        <div class="empty" role="alert">
          <h2>Couldn’t load this conversation.</h2>
          <button
            @click=${() => this.dispatchEvent(new Event("retry-load", { bubbles: true, composed: true }))}
          >
            Retry
          </button>
        </div>
      </div>`;
    if (!conversation)
      return html`<div class="messages">
        <div class="empty">
          <h2>Assist Workspace</h2>
          <p>What do you need to look at?</p>
        </div>
      </div>`;
    return html`<div
        class="messages"
        role="log"
        tabindex="0"
        @scroll=${this.onScroll}
        @wheel=${this.stopFollow}
        @keydown=${this.stopFollow}
        @pointerdown=${this.onPointerDown}
        @pointermove=${this.onPointerMove}
        @pointerup=${this.onPointerUp}
        @pointercancel=${this.onPointerUp}
      >
        ${repeat(
          this.items ?? [],
          (turn) => turn.id,
          (turn) =>
            turn.kind === "user"
              ? html`<article class="message user" data-timeline-id=${turn.id}>
                  <div class="user-stack">
                    <div class="content user-bubble">
                      ${turn.message.visible_content}
                    </div>
                    <div class="message-actions user-actions">
                      ${this.copyButton(`user:${turn.message.id}`, turn.message.visible_content)}
                    </div>
                  </div>
                </article>`
              : html`<article
                  class="message assistant"
                  data-timeline-id=${turn.id}
                >
                  ${turn.parts.map((part) => this.renderPart(conversation, part))}
                  ${
                    turn.segments.some((m) => m.visible_content)
                      ? html`<div class="message-actions assistant-actions">
                          ${this.copyButton(
                            `assistant:${turn.segments.map((m) => m.id).join(":")}`,
                            turn.segments
                              .map((m) => m.visible_content)
                              .filter(Boolean)
                              .join("\n\n"),
                          )}
                        </div>`
                      : nothing
                  }
                </article>`,
        )}
        ${this.turn && !this.turn.visibleTextStarted && !this.turn.terminal ? html`<div class="thinking" role="status" aria-live="polite">${this.turn.toolsRunning > 0 ? "Using tools" : "Working"} <i></i><i></i><i></i></div>` : nothing}
        ${this.turnNotice ? html`<div class="turn-outcome ${this.turnNotice.kind}" role="status">${this.turnNotice.kind === "failed" ? "Request failed" : "Stopped"}</div>` : nothing}
      </div>
      ${
        this.followState.detachedFromBottom
          ? html`<button
              class="jump-to-latest"
              aria-label="Jump to latest"
              @click=${this.scrollToLatest}
            >
              ${this.followState.hasUnread ? "↓ New messages" : "↓"}
            </button>`
          : nothing
      }`;
  }
  static styles = css`
    :host {
      min-height: 0;
      min-width: 0;
      height: 100%;
      display: block;
      position: relative;
    }
    .messages {
      position: relative;
      height: 100%;
      overflow: auto;
      box-sizing: border-box;
      padding: 28px clamp(16px, 4vw, 44px);
    }
    .message {
      line-height: 1.58;
    }
    .assistant {
      min-width: 0;
      max-width: 920px;
      margin: 0 0 20px;
    }
    .user {
      width: fit-content;
      max-width: var(--aw-user-max, min(72%, 720px));
      margin: 0 0 20px auto;
    }
    .user .content {
      min-width: 0;
      padding: 10px 14px;
      border-radius: 14px;
      background: var(--primary-color);
      color: var(--text-primary-color, white);
      overflow-wrap: anywhere;
    }
    .user-stack {
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      max-width: 100%;
    }
    .user-bubble {
      width: fit-content;
      max-width: 100%;
      box-sizing: border-box;
      margin-bottom: 0;
    }
    .message-actions {
      display: flex;
      color: var(--secondary-text-color);
      font-size: 0.78rem;
    }
    .user-actions {
      justify-content: flex-end;
      margin-top: 4px;
    }
    .assistant-actions {
      display: flex;
      margin: 4px 0 12px;
    }
    .copy {
      width: 88px;
      flex: 0 0 88px;
      min-height: 24px;
      padding: 2px 5px;
      border: 0;
      color: inherit;
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-weight: 400;
    }
    .assistant-actions .copy {
      text-align: left;
    }
    .user-actions .copy {
      text-align: right;
    }
    .content {
      min-width: 0;
      margin: 0 0 10px;
      overflow-wrap: anywhere;
    }
    .assistant .content {
      margin-bottom: 0;
    }
    .content p {
      margin: 0 0 12px;
      white-space: pre-wrap;
    }
    .content > :last-child {
      margin-bottom: 0;
    }
    .content :is(h1, h2, h3) {
      margin: 20px 0 10px;
      line-height: 1.25;
    }
    .content blockquote {
      margin: 12px 0;
      padding-left: 12px;
      border-left: 3px solid var(--primary-color);
      color: var(--secondary-text-color);
    }
    .content code {
      padding: 1px 4px;
      background: var(--secondary-background-color);
      border-radius: 4px;
    }
    .content pre {
      width: 100%;
      max-height: 360px;
      box-sizing: border-box;
      overflow: auto;
      padding: 12px;
      border-radius: 8px;
      background: var(--secondary-background-color);
    }
    .content table {
      display: block;
      max-width: 100%;
      overflow: auto;
      border-collapse: collapse;
    }
    .content img {
      max-width: 100%;
      height: auto;
    }
    .content a {
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .content th,
    .content td {
      padding: 7px 9px;
      border: 1px solid var(--divider-color);
    }
    .thinking {
      display: flex;
      gap: 5px;
      align-items: center;
      color: var(--secondary-text-color);
      font-size: 0.85rem;
    }
    .turn-outcome {
      margin: 8px 0;
      color: var(--secondary-text-color);
      font-size: 0.85rem;
    }
    .turn-outcome.failed {
      color: var(--error-color, #b3261e);
    }
    .thinking i {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: currentColor;
      animation: dots 1.1s infinite ease-in-out;
    }
    .thinking i:nth-of-type(2) {
      animation-delay: 0.15s;
    }
    .thinking i:nth-of-type(3) {
      animation-delay: 0.3s;
    }
    @keyframes dots {
      50% {
        transform: translateY(-3px);
        opacity: 0.45;
      }
    }
    .jump-to-latest {
      position: absolute;
      right: 16px;
      bottom: 16px;
      z-index: 2;
      min-width: var(--aw-touch-size, 32px);
      min-height: var(--aw-touch-size, 32px);
      border: 0;
      border-radius: 16px;
      padding: 7px 11px;
      color: var(--text-primary-color, white);
      background: var(--primary-color);
    }
    @media (prefers-reduced-motion: reduce) {
      .thinking i {
        animation: none;
      }
    }
  `;
}
if (!customElements.get("assist-workspace-message-list"))
  customElements.define("assist-workspace-message-list", MessageList);
