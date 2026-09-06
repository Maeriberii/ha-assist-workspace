import { LitElement, html, nothing, type PropertyValues } from "lit";
import "./assist-workspace-editor.js";
import "./components/workspace-composer.js";
import "./components/history-sidebar.js";
import "./components/tool-inspector.js";
import "./components/conversation-dialogs.js";
import "./components/message-list.js";
import "./components/conversation-menu.js";
import { WorkspaceApi } from "./api/workspace-api.js";
import { createTurnId } from "./utils/turn-id.js";
import { ConversationCache } from "./state/conversation-cache.js";
import { reduceTurnEvent } from "./state/conversation-reducer.js";
import { DraftStore } from "./state/draft-store.js";
import { SearchSession } from "./state/search-session.js";
import { TurnRegistry } from "./state/turn-registry.js";
import { workspaceStyles } from "./styles/workspace-styles.js";
import { groupVisualTurns } from "./utils/visual-turns.js";
import { configValue, type AssistWorkspaceConfig } from "./config.js";
import type {
  Agent,
  Hass,
  InspectorSelection,
  SearchHit,
  Turn,
  TurnEvent,
  TurnNotice,
} from "./types/workspace.js";
declare global {
  interface Window {
    customCards?: Array<Record<string, string>>;
  }
}
const storageKey = "assist-workspace:ui";
type LayoutMode = "compact" | "medium" | "wide";
type DetailLoadState =
  | { kind: "idle" }
  | { kind: "loading"; conversationId: string }
  | { kind: "error"; conversationId: string };
const layoutModeForWidth = (width: number): LayoutMode =>
  width < 700 ? "compact" : width < 1100 ? "medium" : "wide";

export class AssistWorkspaceCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
  };
  declare hass?: Hass;
  declare config?: AssistWorkspaceConfig;
  // Server data; it never owns local navigation or transient presentation state.
  private cache = new ConversationCache();
  private agents: Agent[] = [];
  private turns = new TurnRegistry();
  // Local UI state.
  private search = new SearchSession<SearchHit>(() => this.requestUpdate());
  private sidebarCollapsed = false;
  private sidebarPreferenceExplicit = false;
  private sidebarOpen = false;
  private fullscreen = false;
  private draftStore?: DraftStore;
  private expandedToolGroups = new Set<string>();
  private openConversationMenu: string | null = null;
  private conversationMenuAnchor: HTMLElement | null = null;
  private renameDialogConversationId: string | null = null;
  private renameDraft = "";
  private deleteDialogConversationId: string | null = null;
  private toolInspectorSelection: InspectorSelection | null = null;
  private toolInspectorOpen = false;
  private inspectorRaf?: number;
  private toolInspectorTab: "request" | "response" | "metadata" = "request";
  private turnNotices = new Map<string, TurnNotice>();
  private refreshGeneration = 0;
  private selectionGeneration = 0;
  private detailRequestGeneration = new Map<string, number>();
  private detailLoadState: DetailLoadState = { kind: "idle" };
  private initialLoadError = false;
  private initialLoadStarted = false;
  private knownConnection?: Hass["connection"];
  private layoutMode: LayoutMode = "compact";
  private layoutReady = false;
  private layoutObserver?: ResizeObserver;
  private api?: WorkspaceApi;

  static getConfigElement() {
    return document.createElement("assist-workspace-editor");
  }
  static getStubConfig() {
    return { type: "custom:assist-workspace-card", agent_id: "" };
  }
  setConfig(config: AssistWorkspaceConfig) {
    this.config = config;
    if (this.draftStore)
      this.draftStore.setPersistence(configValue(config, "keep_drafts"));
    if (!configValue(config, "show_tool_activity")) this.closeToolInspector();
  }
  getGridOptions() {
    return { rows: 8, columns: 12, min_rows: 5, min_columns: 4 };
  }
  connectedCallback() {
    const initialWidth = this.getBoundingClientRect().width;
    if (initialWidth > 0) this.layoutMode = layoutModeForWidth(initialWidth);
    super.connectedCallback();
    this.restoreLocalUi();
    this.draftStore ??= new DraftStore(
      localStorage,
      storageKey,
      () =>
        this.sidebarPreferenceExplicit
          ? { sidebarCollapsed: this.sidebarCollapsed }
          : {},
      configValue(this.config, "keep_drafts"),
    );
    this.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keydown", this.onKeyDown);
    if (typeof ResizeObserver !== "undefined") {
      this.layoutObserver = new ResizeObserver(([entry]) => {
        const next = layoutModeForWidth(entry.contentRect.width);
        const changed = next !== this.layoutMode;
        this.layoutMode = next;
        if (changed) {
          this.openConversationMenu = null;
          this.conversationMenuAnchor = null;
        }
        if (!this.layoutReady || changed) {
          this.layoutReady = true;
          this.requestUpdate();
        }
      });
      this.layoutObserver.observe(this);
    }
    this.ensureInitialLoad();
  }
  disconnectedCallback() {
    if (this.inspectorRaf !== undefined)
      cancelAnimationFrame(this.inspectorRaf);
    this.turns.clear();
    this.draftStore?.flush();
    this.search.cancel();
    this.layoutObserver?.disconnect();
    this.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keydown", this.onKeyDown);
    super.disconnectedCallback();
  }
  private onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    if (this.renameDialogConversationId) this.renameDialogConversationId = null;
    else if (this.deleteDialogConversationId)
      this.deleteDialogConversationId = null;
    else if (this.openConversationMenu) {
      this.openConversationMenu = null;
      this.conversationMenuAnchor = null;
    } else if (this.toolInspectorSelection) this.closeToolInspector();
    else if (this.sidebarOpen) this.sidebarOpen = false;
    else if (this.fullscreen) this.fullscreen = false;
    else return;
    event.stopPropagation();
    this.requestUpdate();
  };
  private closeConversationMenu = () => {
    this.openConversationMenu = null;
    this.conversationMenuAnchor = null;
    this.requestUpdate();
  };
  protected updated(changed: PropertyValues<this>) {
    if (!changed.has("hass") || !this.hass) return;
    this.api?.updateHass(this.hass);
    if (!this.initialLoadStarted) this.ensureInitialLoad();
    else if (this.knownConnection !== this.hass.connection) {
      const affected = this.turns.conversationIds;
      this.turns.clear();
      this.knownConnection = this.hass.connection;
      void this.refreshServerData();
      for (const id of affected) void this.loadConversationDetail(id);
    }
  }
  private ensureInitialLoad() {
    if (!this.hass || this.initialLoadStarted) return;
    this.initialLoadStarted = true;
    this.knownConnection = this.hass.connection;
    this.api = new WorkspaceApi(this.hass);
    void this.refreshServerData();
  }
  private get activeConversation() {
    return this.cache.activeDetail;
  }
  private get draftKey() {
    return this.cache.activeId ?? "__new__";
  }
  private get draft() {
    return this.draftStore?.get(this.draftKey) ?? "";
  }
  private get agentId() {
    return this.activeConversation?.agent_id ?? this.config?.agent_id ?? "";
  }
  private get runningForActiveConversation() {
    return this.cache.activeId ? this.turns.has(this.cache.activeId) : false;
  }
  private get effectiveLayoutMode(): LayoutMode {
    return this.fullscreen
      ? layoutModeForWidth(document.documentElement.clientWidth - 24)
      : this.layoutMode;
  }
  private get selectedTool() {
    const selection = this.toolInspectorSelection;
    if (!selection) return undefined;
    return this.cache.resolveTool(
      selection.conversationId,
      selection.messageId,
      selection.toolId,
    );
  }
  private get timelineItems() {
    return this.activeConversation
      ? groupVisualTurns(this.activeConversation.messages)
      : [];
  }
  private restoreLocalUi() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
      if (Object.prototype.hasOwnProperty.call(value, "sidebarCollapsed")) {
        this.sidebarCollapsed = Boolean(value.sidebarCollapsed);
        this.sidebarPreferenceExplicit = true;
      } else
        this.sidebarCollapsed =
          configValue(this.config, "default_sidebar_state") === "collapsed";
    } catch {
      /* Browser preferences are optional. */
    }
  }
  private async refreshServerData() {
    if (!this.api) return;
    const generation = ++this.refreshGeneration;
    const [listedResult, agentsResult] = await Promise.allSettled([
      this.api.listConversations(),
      this.api.listAgents(),
    ]);
    if (generation !== this.refreshGeneration) return;
    if (listedResult.status === "fulfilled") {
      this.initialLoadError = false;
      const listed = listedResult.value;
      // Keep locally active/background details while reconnecting.  A summary
      // refresh may race with a turn that has not been persisted yet.
      this.cache.replaceSummaries(listed, new Set(this.turns.conversationIds));
      // Initial loading is the only list-refresh path allowed to choose a conversation.
      if (this.cache.activeId === undefined)
        this.cache.activeId = configValue(this.config, "open_last_conversation")
          ? (this.cache.summaries[0]?.id ?? null)
          : null;
      if (this.cache.activeId && !this.cache.activeDetail)
        void this.loadConversationDetail(this.cache.activeId);
    } else if (this.cache.activeId === undefined) {
      this.initialLoadError = true;
    }
    if (agentsResult.status === "fulfilled") this.agents = agentsResult.value;
    if (this.toolInspectorSelection && !this.selectedTool)
      this.closeToolInspector();
    this.requestUpdate();
  }
  private agentName() {
    return (
      this.agents.find((agent) => agent.id === this.agentId)?.name ??
      (this.agentId || "Assist")
    );
  }
  private selectConversation = async (id: string) => {
    if (!this.api || id === this.cache.activeId) return;
    const previousId = this.cache.activeId;
    if (previousId && !this.cache.getDetail(previousId))
      this.detailRequestGeneration.set(
        previousId,
        (this.detailRequestGeneration.get(previousId) ?? 0) + 1,
      );
    const searchResult = this.search.state.results.find(
      (item) => item.conversation.id === id,
    );
    if (searchResult && !this.cache.getSummary(id))
      this.cache.rename(searchResult.conversation);
    ++this.selectionGeneration;
    this.initialLoadError = false;
    this.detailLoadState = { kind: "idle" };
    this.cache.activeId = id;
    this.sidebarOpen = false;
    this.closeTransientUi();
    this.requestUpdate();
    if (!this.cache.getDetail(id)) await this.loadConversationDetail(id);
  };
  private async loadConversationDetail(id: string) {
    if (!this.api) return;
    const generation = (this.detailRequestGeneration.get(id) ?? 0) + 1;
    this.detailRequestGeneration.set(id, generation);
    const isActive = () => this.cache.activeId === id;
    if (isActive()) {
      this.detailLoadState = { kind: "loading", conversationId: id };
      this.requestUpdate();
    }
    try {
      const found = await this.api.getConversation(id);
      if (generation !== this.detailRequestGeneration.get(id)) return;
      this.cache.setDetail(found);
      if (isActive()) this.detailLoadState = { kind: "idle" };
    } catch {
      if (generation === this.detailRequestGeneration.get(id) && isActive())
        this.detailLoadState = { kind: "error", conversationId: id };
    } finally {
      this.requestUpdate();
    }
  }
  private retryDetail = () => {
    if (this.initialLoadError) {
      void this.refreshServerData();
      return;
    }
    const id = this.cache.activeId;
    if (id) void this.loadConversationDetail(id);
  };
  private enterNewChat = () => {
    ++this.selectionGeneration;
    if (this.cache.activeId && !this.cache.getDetail(this.cache.activeId))
      this.detailRequestGeneration.set(
        this.cache.activeId,
        (this.detailRequestGeneration.get(this.cache.activeId) ?? 0) + 1,
      );
    this.detailLoadState = { kind: "idle" };
    this.initialLoadError = false;
    this.cache.activeId = null;
    this.sidebarOpen = false;
    this.closeTransientUi();
    this.requestUpdate();
  };
  private updateDraft = (event: CustomEvent<string>) => {
    this.draftStore?.set(this.draftKey, event.detail);
    this.requestUpdate();
  };
  private updateSearch = (event: CustomEvent<string>) => {
    this.search.update(event.detail, (query) =>
      this.api ? this.api.searchConversations(query) : Promise.resolve([]),
    );
  };
  private toggleSidebar = () => {
    this.closeConversationMenu();
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.sidebarPreferenceExplicit = true;
    this.draftStore?.flush();
    this.requestUpdate();
  };
  private openHistory = () => {
    this.closeConversationMenu();
    if (this.effectiveLayoutMode === "compact") {
      this.sidebarOpen = !this.sidebarOpen;
      this.requestUpdate();
      return;
    }
    this.toggleSidebar();
  };
  private toggleFullscreen = () => {
    this.closeConversationMenu();
    this.fullscreen = !this.fullscreen;
    this.requestUpdate();
  };
  private closeTransientUi() {
    this.openConversationMenu = null;
    this.conversationMenuAnchor = null;
    this.closeToolInspector();
    this.renameDialogConversationId = null;
    this.deleteDialogConversationId = null;
  }
  private reducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }
  private openToolInspector(selection: InspectorSelection) {
    if (this.inspectorRaf !== undefined)
      cancelAnimationFrame(this.inspectorRaf);
    const wasOpen = this.toolInspectorOpen;
    this.toolInspectorSelection = selection;
    if (wasOpen) {
      this.requestUpdate();
      return;
    }
    this.toolInspectorOpen = false;
    this.requestUpdate();
    void this.updateComplete.then(() => {
      this.inspectorRaf = requestAnimationFrame(() => {
        this.inspectorRaf = undefined;
        if (!this.toolInspectorSelection) return;
        this.toolInspectorOpen = true;
        this.requestUpdate();
      });
    });
  }
  private closeToolInspector() {
    if (!this.toolInspectorSelection) return;
    if (this.inspectorRaf !== undefined)
      cancelAnimationFrame(this.inspectorRaf);
    this.inspectorRaf = undefined;
    this.toolInspectorOpen = false;
    if (this.reducedMotion()) this.toolInspectorSelection = null;
    this.requestUpdate();
  }
  private finalizeToolInspectorClose = () => {
    if (!this.toolInspectorOpen) {
      this.toolInspectorSelection = null;
      this.requestUpdate();
    }
  };
  private groupKey(conversationId: string, messageId: string) {
    return messageId.startsWith(`${conversationId}:`)
      ? messageId
      : `${conversationId}:${messageId}`;
  }
  private toggleTools(conversationId: string, messageId: string) {
    const key = this.groupKey(conversationId, messageId);
    const next = new Set(this.expandedToolGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.expandedToolGroups = next;
    this.requestUpdate();
  }

  private async send() {
    const submittedDraftKey = this.draftKey;
    const text = this.draft.trim();
    if (
      !this.api ||
      !text ||
      this.runningForActiveConversation ||
      !this.agentId ||
      (this.cache.activeId !== null &&
        (this.cache.activeId === undefined || !this.activeConversation))
    )
      return;
    let conversation = this.activeConversation;
    if (!conversation) {
      const created = await this.api.createConversation(this.agentId);
      conversation = created;
      this.cache.setDetail(created);
      this.cache.activeId = created.id;
      this.draftStore?.rekey(submittedDraftKey, created.id, true);
    }
    const turn: Turn = {
      id: createTurnId(),
      conversationId: conversation.id,
      terminal: false,
      thinking: false,
      visibleTextStarted: false,
      toolsRunning: 0,
      submittedDraftKey: conversation.id,
    };
    this.turns.start(turn);
    this.turnNotices.delete(turn.conversationId);
    this.requestUpdate();
    try {
      const unsubscribe = await this.api.runTurn(
        turn.conversationId,
        turn.id,
        text,
        (message) => this.onTurnEvent(turn, message),
      );
      if (this.turns.isCurrent(turn) && !turn.terminal)
        turn.unsubscribe = unsubscribe;
      else unsubscribe();
    } catch {
      // Keep the draft: the backend did not acknowledge turn_started.
      this.turnNotices.set(turn.conversationId, { kind: "failed" });
      this.finishTurn(turn);
    }
  }
  private stop = () => {
    const turn = this.cache.activeId
      ? this.turns.get(this.cache.activeId)
      : undefined;
    if (!turn) return;
    // The subscription cleanup is not the cancellation mechanism.  Ask the
    // authenticated backend to cancel its task and wait for its terminal event.
    // A transport failure still releases the composer instead of leaving it
    // disabled forever, while the durable backend state remains authoritative.
    void this.api
      ?.cancelTurn(turn.conversationId, turn.id)
      .catch(() => this.finishTurn(turn));
  };
  private finishTurn(turn: Turn) {
    if (!this.turns.finish(turn)) return;
    this.requestUpdate();
  }
  private onTurnEvent(turn: Turn, event: TurnEvent) {
    if (
      !event ||
      turn.terminal ||
      event.turn_id !== turn.id ||
      event.conversation_id !== turn.conversationId
    )
      return;
    const conversation = this.cache.getDetail(turn.conversationId);
    if (!conversation) return;
    const reduced = reduceTurnEvent(conversation, turn, event);
    Object.assign(turn, reduced.turn);
    this.cache.applyTimeline(reduced.conversation, reduced.timelineChanged);
    const summary = "summary" in event ? event.summary : undefined;
    if (summary) this.cache.applySummary(summary);
    if (
      event.event === "turn_started" ||
      event.event === "turn_completed" ||
      event.event === "turn_failed" ||
      event.event === "turn_stopped"
    )
      this.draftStore?.clear(turn.submittedDraftKey ?? this.draftKey, true);
    if (this.toolInspectorSelection && !this.selectedTool)
      this.closeToolInspector();
    if (reduced.terminalOutcome === "completed")
      this.turnNotices.delete(turn.conversationId);
    else if (reduced.terminalOutcome)
      this.turnNotices.set(turn.conversationId, reduced.terminalOutcome);
    if (reduced.terminalOutcome) this.finishTurn(turn);
    else this.requestUpdate();
  }
  private openRename(id: string) {
    this.renameDialogConversationId = id;
    this.renameDraft = this.cache.getSummary(id)?.title ?? "";
    this.openConversationMenu = null;
    this.requestUpdate();
  }
  private async saveRename(event: SubmitEvent) {
    event.preventDefault();
    const id = this.renameDialogConversationId;
    const title = this.renameDraft.trim();
    if (!this.api || !id || !title) return;
    const updated = await this.api.renameConversation(id, title);
    this.cache.rename(updated);
    this.renameDialogConversationId = null;
    this.requestUpdate();
  }
  private async deleteConversation() {
    const id = this.deleteDialogConversationId;
    if (!this.api || !id) return;
    const wasActive = this.cache.activeId === id;
    await this.api.deleteConversation(id);
    this.cache.delete(id);
    this.search.state.results = this.search.state.results.filter(
      (item) => item.conversation.id !== id,
    );
    this.turnNotices.delete(id);
    const runningTurn = this.turns.get(id);
    if (runningTurn) this.turns.finish(runningTurn);
    this.expandedToolGroups = new Set(
      [...this.expandedToolGroups].filter((key) => !key.startsWith(`${id}:`)),
    );
    this.draftStore?.clear(id, true);
    if (this.toolInspectorSelection?.conversationId === id)
      this.closeToolInspector();
    this.deleteDialogConversationId = null;
    this.detailRequestGeneration.set(
      id,
      (this.detailRequestGeneration.get(id) ?? 0) + 1,
    );
    if (wasActive) {
      this.detailLoadState = { kind: "idle" };
      this.initialLoadError = false;
    }
    this.requestUpdate();
    if (this.cache.activeId && !this.cache.activeDetail)
      void this.loadConversationDetail(this.cache.activeId);
  }

  private requestDelete(id: string | null) {
    if (!id) return;
    this.openConversationMenu = null;
    if (configValue(this.config, "confirm_delete")) {
      this.deleteDialogConversationId = id;
      this.requestUpdate();
    } else {
      this.deleteDialogConversationId = id;
      void this.deleteConversation();
    }
  }

  render() {
    const active = this.activeConversation;
    const running = this.runningForActiveConversation;
    const detailUnavailable =
      this.cache.activeId !== null &&
      (this.cache.activeId === undefined || !active);
    return html`<section
      class="workspace ${this.effectiveLayoutMode} ${this.layoutReady ? "layout-ready" : ""} ${this.sidebarCollapsed ? "sidebar-collapsed" : ""} ${this.fullscreen ? "fullscreen" : ""} ${this.sidebarOpen ? "sidebar-open" : ""}"
    >
      <header class="workspace-header">
        <button @click=${this.openHistory} aria-label="History">☰</button
        ><strong>Assist Workspace</strong>
        ${
          configValue(this.config, "show_assistant_name")
            ? html`<span class="agent" title=${this.agentId}
                >${this.agentName()}</span
              >`
            : nothing
        }
        <button
          @click=${this.toggleFullscreen}
          aria-label=${this.fullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          ${this.fullscreen ? "×" : "⛶"}
        </button>
      </header>
      <div class="layout">
        <aside class="sidebar">
          <assist-workspace-history
            .conversations=${this.cache.summaries}
            .searchHits=${this.search.state.results}
            .activeId=${this.cache.activeId ?? null}
            .query=${this.search.state.query}
            .searchPending=${this.search.state.pending}
            .searchError=${this.search.state.error}
            .runningIds=${new Set(this.cache.summaries.filter((item) => this.turns.has(item.id)).map((item) => item.id))}
            @new-chat=${this.enterNewChat}
            @search-changed=${this.updateSearch}
            @select-conversation=${(event: CustomEvent<string>) => void this.selectConversation(event.detail)}
            @menu-conversation=${(
              event: CustomEvent<{ id: string; anchor: HTMLElement }>,
            ) => {
              this.openConversationMenu = event.detail.id;
              this.conversationMenuAnchor = event.detail.anchor;
              this.requestUpdate();
            }}
          ></assist-workspace-history>
        </aside>
        <main>
          <assist-workspace-message-list
            .conversation=${active}
            .items=${this.timelineItems}
            .showToolActivity=${configValue(this.config, "show_tool_activity")}
            .loading=${this.cache.activeId != null && this.detailLoadState.kind === "loading" && this.detailLoadState.conversationId === this.cache.activeId}
            .loadError=${this.initialLoadError || (this.cache.activeId != null && this.detailLoadState.kind === "error" && this.detailLoadState.conversationId === this.cache.activeId)}
            @retry-load=${this.retryDetail}
            .expandedIds=${this.expandedToolGroups}
            .timelineRevision=${this.cache.getRevision(this.cache.activeId)}
            .turn=${this.cache.activeId ? this.turns.get(this.cache.activeId) : undefined}
            .turnNotice=${this.cache.activeId ? this.turnNotices.get(this.cache.activeId) : undefined}
            @tools-toggled=${(event: CustomEvent<string>) => active && this.toggleTools(active.id, event.detail)}
            @tool-selected=${(
              event: CustomEvent<{
                messageId: string;
                tool: import("./types/workspace.js").ToolExecution;
              }>,
            ) => {
              if (!active) return;
              this.openToolInspector({
                conversationId: active.id,
                messageId: event.detail.messageId,
                toolId: event.detail.tool.id,
              });
              this.toolInspectorTab = "request";
              this.requestUpdate();
            }}
          ></assist-workspace-message-list>
          <footer>
            <assist-workspace-composer
              .draft=${this.draft}
              .running=${running}
              .textareaDisabled=${!this.agentId || detailUnavailable}
              .canSend=${Boolean(this.draft.trim() && this.agentId && !running && !detailUnavailable)}
              .enterSends=${configValue(this.config, "enter_sends")}
              @draft-changed=${this.updateDraft}
              @send-requested=${() => void this.send()}
              @stop-requested=${this.stop}
            ></assist-workspace-composer>
          </footer>
        </main>
        ${
          this.toolInspectorSelection && this.selectedTool
            ? html`<assist-workspace-tool-inspector
                ?open=${this.toolInspectorOpen}
                .selection=${this.toolInspectorSelection}
                .tool=${this.selectedTool}
                .tab=${this.toolInspectorTab}
                @inspector-closed=${() => {
                  this.closeToolInspector();
                }}
                @inspector-transition-ended=${this.finalizeToolInspectorClose}
                @inspector-tab=${(
                  event: CustomEvent<"request" | "response" | "metadata">,
                ) => {
                  this.toolInspectorTab = event.detail;
                  this.requestUpdate();
                }}
              ></assist-workspace-tool-inspector>`
            : nothing
        }
      </div>
      <assist-workspace-conversation-menu
        .open=${Boolean(this.openConversationMenu)}
        .anchor=${this.conversationMenuAnchor}
        @menu-closed=${this.closeConversationMenu}
        @menu-anchor-invalid=${this.closeConversationMenu}
        @rename-requested=${() => this.openConversationMenu && this.openRename(this.openConversationMenu)}
        @delete-requested=${() => this.requestDelete(this.openConversationMenu)}
      ></assist-workspace-conversation-menu>
      <assist-workspace-dialogs
        .renameOpen=${Boolean(this.renameDialogConversationId)}
        .deleteOpen=${Boolean(this.deleteDialogConversationId)}
        .title=${this.deleteDialogConversationId ? (this.cache.getSummary(this.deleteDialogConversationId)?.title ?? "") : ""}
        .draft=${this.renameDraft}
        @rename-draft=${(event: CustomEvent<string>) => {
          this.renameDraft = event.detail;
          this.requestUpdate();
        }}
        @rename-confirmed=${() => void this.saveRename(new SubmitEvent("submit"))}
        @delete-confirmed=${() => void this.deleteConversation()}
        @dialogs-closed=${() => {
          this.renameDialogConversationId = null;
          this.deleteDialogConversationId = null;
          this.requestUpdate();
        }}
      ></assist-workspace-dialogs>
    </section>`;
  }
  static styles = workspaceStyles;
}
if (!customElements.get("assist-workspace-card"))
  customElements.define("assist-workspace-card", AssistWorkspaceCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "assist-workspace-card",
  name: "Assist Workspace",
  description: "Durable chat workspace",
});
