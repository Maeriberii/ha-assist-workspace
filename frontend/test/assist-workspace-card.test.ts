import { beforeEach, describe, expect, test } from "vitest";
import "../src/assist-workspace-card.js";
import { createTurnId } from "../src/utils/turn-id.js";

type Conversation = {
  id: string;
  agent_id: string;
  title: string;
  messages: any[];
};

const summary = (item: Conversation) => ({
  id: item.id,
  agent_id: item.agent_id,
  title: item.title,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  message_count: item.messages.length,
});

let conversations: Conversation[];
let callbacks: Array<(message: any) => void>;
let creates: any[];
let calls: any[];
let cancels: any[];
let getConversation: ((id: string) => Promise<Conversation>) | undefined;
let rejectSubscription = false;

const wait = async (card: any) => {
  await Promise.resolve();
  await card.updateComplete;
};
const input = (node: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  node.value = value;
  node.dispatchEvent(
    new InputEvent("input", { bubbles: true, composed: true }),
  );
};

function makeHass() {
  return {
    callWS: async (message: any) => {
      calls.push(message);
      if (message.type === "conversation/agent/list")
        return {
          agents: [{ id: "conversation.codex_assist", name: "Codex Assist" }],
        };
      if (message.type === "assist_workspace/conversation/list")
        return { conversations: structuredClone(conversations.map(summary)) };
      if (message.type === "assist_workspace/conversation/search") {
        const query = String(message.query).toLocaleLowerCase();
        return {
          hits: conversations
            .filter(
              (item) =>
                item.title.toLocaleLowerCase().includes(query) ||
                item.messages.some((entry) =>
                  entry.visible_content.toLocaleLowerCase().includes(query),
                ),
            )
            .map((item) => ({
              conversation: summary(item),
              match_type: "title",
              highlight_ranges: [{ start: 0, end: query.length }],
            })),
        };
      }
      if (message.type === "assist_workspace/conversation/get") {
        if (getConversation) return getConversation(message.conversation_id);
        return structuredClone(
          conversations.find((item) => item.id === message.conversation_id),
        );
      }
      if (message.type === "assist_workspace/conversation/create") {
        const created = {
          id: `new-${creates.length + 1}`,
          agent_id: message.agent_id,
          title: "New chat",
          messages: [],
        };
        creates.push(created);
        conversations = [created, ...conversations];
        return structuredClone(created);
      }
      if (message.type === "assist_workspace/conversation/rename") {
        const item = conversations.find(
          (conversation) => conversation.id === message.conversation_id,
        )!;
        item.title = message.title;
        return structuredClone(summary(item));
      }
      if (message.type === "assist_workspace/conversation/delete") {
        conversations = conversations.filter(
          (conversation) => conversation.id !== message.conversation_id,
        );
        return {};
      }
      if (message.type === "assist_workspace/turn/cancel") {
        cancels.push(message);
        return {};
      }
      throw new Error(`Unexpected ${message.type}`);
    },
    connection: {
      subscribeMessage: async (callback: (message: any) => void) => {
        if (rejectSubscription) throw new Error("transport unavailable");
        callbacks.push(callback);
        return () => undefined;
      },
    },
  };
}

async function mount() {
  const card = document.createElement("assist-workspace-card") as any;
  card.config = { agent_id: "conversation.codex_assist" };
  card.hass = makeHass();
  document.body.append(card);
  for (let attempt = 0; attempt < 4; attempt += 1) await wait(card);
  return card;
}
const root = (card: any) => card.shadowRoot as ShadowRoot;
const componentRoot = (card: any, name: string) =>
  root(card).querySelector<HTMLElement>(name)!.shadowRoot!;
const composerRoot = (card: any) =>
  componentRoot(card, "assist-workspace-composer");
const sidebarRoot = (card: any) =>
  componentRoot(card, "assist-workspace-history");
const messagesRoot = (card: any) =>
  componentRoot(card, "assist-workspace-message-list");
const inspectorRoot = (card: any) =>
  componentRoot(card, "assist-workspace-tool-inspector");
const dialogsRoot = (card: any) =>
  componentRoot(card, "assist-workspace-dialogs");
const menuRoot = (card: any) =>
  componentRoot(card, "assist-workspace-conversation-menu");
const toolsRoot = (card: any) =>
  messagesRoot(card).querySelector<HTMLElement>(
    "assist-workspace-tool-summary",
  )!.shadowRoot!;
const emit = async (card: any, event: any) => {
  callbacks.at(-1)!(event);
  await wait(card);
};

beforeEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  callbacks = [];
  creates = [];
  calls = [];
  cancels = [];
  getConversation = undefined;
  rejectSubscription = false;
  conversations = [
    {
      id: "a",
      agent_id: "conversation.codex_assist",
      title: "Alpha",
      messages: [{ id: "au", role: "user", visible_content: "old A" }],
    },
    {
      id: "b",
      agent_id: "conversation.codex_assist",
      title: "Bravo",
      messages: [{ id: "bu", role: "user", visible_content: "old B" }],
    },
  ];
});

describe("stable Lit interaction state", () => {
  test("implements the Lovelace setConfig contract", async () => {
    const card = document.createElement("assist-workspace-card") as any;
    card.setConfig({ agent_id: "conversation.codex_assist" });
    expect(card.config).toEqual({ agent_id: "conversation.codex_assist" });
  });

  test("does not render a stray header chevron", async () => {
    const card = await mount();
    expect(
      root(card).querySelector(".workspace-header")?.textContent,
    ).not.toContain(">");
  });

  test("accepts the real HA subscribeMessage payload without an extra wrapper", async () => {
    const card = await mount();
    const textarea =
      composerRoot(card).querySelector<HTMLTextAreaElement>("textarea")!;
    input(textarea, "hello from HA");
    await wait(card);
    composerRoot(card).querySelector<HTMLButtonElement>(".send")!.click();
    await wait(card);
    const turn = (card as any).turns.get("a");
    await emit(card, {
      event: "turn_started",
      turn_id: turn.id,
      conversation_id: "a",
      user_message: "live-user",
      text: "hello from HA",
    });
    await emit(card, {
      event: "assistant_delta",
      turn_id: turn.id,
      conversation_id: "a",
      message_id: "live-assistant",
      delta: "streamed response",
    });
    expect(
      [...messagesRoot(card).querySelectorAll(".message.user")].at(-1)
        ?.textContent,
    ).toContain("hello from HA");
    expect(
      [...messagesRoot(card).querySelectorAll(".message.assistant")].at(-1)
        ?.textContent,
    ).toContain("streamed response");
    await emit(card, {
      event: "turn_completed",
      turn_id: turn.id,
      conversation_id: "a",
    });
    expect(
      composerRoot(card).querySelector(".send")?.getAttribute("aria-label"),
    ).toBe("Send");
  });

  test("realtime first-turn summary updates the sidebar and survives later events", async () => {
    const card = await mount();
    const textarea =
      composerRoot(card).querySelector<HTMLTextAreaElement>("textarea")!;
    input(textarea, "Привет!");
    await wait(card);
    composerRoot(card).querySelector<HTMLButtonElement>(".send")!.click();
    await wait(card);
    const turn = (card as any).turns.get("a");
    const turnSummary = {
      ...summary(conversations[0]),
      title: "Привет!",
      updated_at: "2026-09-06T12:00:01Z",
      message_count: 2,
    };
    await emit(card, {
      event: "turn_started",
      turn_id: turn.id,
      conversation_id: "a",
      user_message: "live-user",
      text: "Привет!",
      summary: turnSummary,
    });
    expect(sidebarRoot(card).textContent).toContain("Привет!");
    expect((card as any).cache.activeDetail.title).toBe("Привет!");
    await emit(card, {
      event: "assistant_delta",
      turn_id: turn.id,
      conversation_id: "a",
      message_id: "live-assistant",
      delta: "ответ",
    });
    await emit(card, {
      event: "tool_started",
      turn_id: turn.id,
      conversation_id: "a",
      message_id: "live-tool",
      tool: { id: "tool", name: "calendar.search" },
    });
    await emit(card, {
      event: "tool_finished",
      turn_id: turn.id,
      conversation_id: "a",
      message_id: "live-tool",
      tool: { id: "tool", name: "calendar.search", status: "completed" },
    });
    await emit(card, {
      event: "turn_completed",
      turn_id: turn.id,
      conversation_id: "a",
      messages: [],
      summary: turnSummary,
    });
    expect(sidebarRoot(card).textContent).toContain("Привет!");
    expect((card as any).cache.activeDetail.title).toBe("Привет!");
  });

  test("shows transient activity from turn start through the first visible answer", async () => {
    const card = await mount();
    const textarea =
      composerRoot(card).querySelector<HTMLTextAreaElement>("textarea")!;
    input(textarea, "show activity");
    await wait(card);
    composerRoot(card).querySelector<HTMLButtonElement>(".send")!.click();
    await wait(card);
    const turn = (card as any).turns.get("a");
    await emit(card, {
      event: "turn_started",
      turn_id: turn.id,
      conversation_id: "a",
      user_message: "activity-user",
      text: "show activity",
    });
    expect(
      messagesRoot(card).querySelector(".thinking")?.textContent,
    ).toContain("Working");
    await emit(card, {
      event: "tool_started",
      turn_id: turn.id,
      conversation_id: "a",
      message_id: "tool-only",
      tool: { id: "call", name: "calendar.search" },
    });
    expect(
      messagesRoot(card).querySelector(".thinking")?.textContent,
    ).toContain("Using tools");
    expect(
      messagesRoot(card).querySelectorAll(".message.assistant"),
    ).toHaveLength(1);
    await emit(card, {
      event: "assistant_delta",
      turn_id: turn.id,
      conversation_id: "a",
      message_id: "final",
      delta: "Visible answer",
    });
    expect(messagesRoot(card).querySelector(".thinking")).toBeNull();
    await emit(card, {
      event: "turn_completed",
      turn_id: turn.id,
      conversation_id: "a",
    });
    expect(messagesRoot(card).querySelector(".thinking")).toBeNull();
  });

  test("turn ids have a non-secure-context fallback", () => {
    const randomUuid = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: undefined,
    });
    expect(createTurnId()).toMatch(/^turn-/);
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: randomUuid,
    });
  });

  test("New Chat and another composer remain usable while A runs", async () => {
    const card = await mount();
    const aComposer =
      composerRoot(card).querySelector<HTMLTextAreaElement>("textarea")!;
    input(aComposer, "run A");
    await wait(card);
    composerRoot(card).querySelector<HTMLButtonElement>(".send")!.click();
    await wait(card);
    sidebarRoot(card).querySelector<HTMLButtonElement>(".new-chat")!.click();
    await wait(card);
    const newComposer =
      composerRoot(card).querySelector<HTMLTextAreaElement>("textarea")!;
    expect(newComposer.disabled).toBe(false);
    input(newComposer, "run new");
    await wait(card);
    composerRoot(card).querySelector<HTMLButtonElement>(".send")!.click();
    await wait(card);
    expect(creates).toHaveLength(1);
    expect((card as any).turns.size).toBe(2);
  });

  test("composer keeps its node, focus and value in transient, historical and collapsed layouts", async () => {
    const card = await mount();
    for (const mode of ["transient", "historical", "collapsed"]) {
      if (mode === "transient")
        sidebarRoot(card)
          .querySelector<HTMLButtonElement>(".new-chat")!
          .click();
      if (mode === "historical")
        sidebarRoot(card)
          .querySelectorAll<HTMLButtonElement>(".chat-title")[1]
          .click();
      if (mode === "collapsed")
        root(card)
          .querySelector<HTMLButtonElement>("[aria-label=History]")!
          .click();
      await wait(card);
      const textarea =
        composerRoot(card).querySelector<HTMLTextAreaElement>("textarea")!;
      textarea.focus();
      let expected = "";
      for (const char of "привет") {
        expected += char;
        input(textarea, expected);
        await wait(card);
        conversations = structuredClone(conversations);
        await (card as any).refreshServerData();
        await wait(card);
        expect(composerRoot(card).querySelector("textarea")).toBe(textarea);
        expect(composerRoot(card).activeElement).toBe(textarea);
        expect(textarea.value).toBe(expected);
      }
    }
  });

  test("search keeps its node and does not navigate while history refreshes", async () => {
    const card = await mount();
    const search = sidebarRoot(card).querySelector<HTMLInputElement>(
      "[aria-label='Search chats']",
    )!;
    search.focus();
    let expected = "";
    for (const char of "привет") {
      expected += char;
      input(search, expected);
      await wait(card);
      await (card as any).refreshServerData();
      await wait(card);
      expect(
        sidebarRoot(card).querySelector("[aria-label='Search chats']"),
      ).toBe(search);
      expect(sidebarRoot(card).activeElement).toBe(search);
      expect(search.value).toBe(expected);
    }
    input(search, "");
    await wait(card);
    expect(
      sidebarRoot(card).querySelector(".chat-row.selected")?.textContent,
    ).toContain("Alpha");
  });

  test("background A events and refreshes cannot steal navigation from B", async () => {
    const card = await mount();
    sidebarRoot(card)
      .querySelectorAll<HTMLButtonElement>(".chat-title")[1]
      .click();
    await wait(card);
    (card as any).onTurnEvent(
      { id: "turn-a", conversationId: "a", terminal: false },
      {
        event: "assistant_delta",
        turn_id: "turn-a",
        conversation_id: "a",
        message_id: "ax",
        delta: "background",
      },
    );
    await (card as any).refreshServerData();
    await wait(card);
    expect(
      sidebarRoot(card).querySelector(".chat-row.selected")?.textContent,
    ).toContain("Bravo");
  });

  test("background detail reconciliation does not show loading for the active chat", async () => {
    let resolveB: ((conversation: Conversation) => void) | undefined;
    getConversation = (id) =>
      id === "b"
        ? new Promise((resolve) => {
            resolveB = resolve;
          })
        : Promise.resolve(structuredClone(conversations[0]));
    const card = await mount();
    void (card as any).loadConversationDetail("b");
    await wait(card);
    const messageList = root(card).querySelector<HTMLElement>(
      "assist-workspace-message-list",
    ) as any;
    expect(messageList.loading).toBe(false);
    expect(messageList.loadError).toBe(false);
    resolveB!(structuredClone(conversations[1]));
    await wait(card);
    expect((card as any).cache.activeId).toBe("a");
  });

  test("a transport failure before turn_started preserves existing and New Chat drafts", async () => {
    const card = await mount();
    const textarea =
      composerRoot(card).querySelector<HTMLTextAreaElement>("textarea")!;
    input(textarea, "existing draft");
    await wait(card);
    rejectSubscription = true;
    composerRoot(card).querySelector<HTMLButtonElement>(".send")!.click();
    await wait(card);
    expect(textarea.value).toBe("existing draft");

    (card as any).enterNewChat();
    await wait(card);
    input(textarea, "new chat draft");
    await wait(card);
    composerRoot(card).querySelector<HTMLButtonElement>(".send")!.click();
    await wait(card);
    expect(
      composerRoot(card).querySelector<HTMLTextAreaElement>("textarea")!.value,
    ).toBe("new chat draft");
  });

  test("background turn events do not clear an unrelated New Chat draft", async () => {
    const card = await mount();
    const textarea =
      composerRoot(card).querySelector<HTMLTextAreaElement>("textarea")!;
    input(textarea, "background request");
    await wait(card);
    composerRoot(card).querySelector<HTMLButtonElement>(".send")!.click();
    await wait(card);
    const turn = (card as any).turns.get("a");

    (card as any).enterNewChat();
    await wait(card);
    input(textarea, "не потеряй меня");
    await wait(card);

    for (const event of [
      {
        event: "assistant_delta",
        message_id: "background-answer",
        delta: "answer",
      },
      {
        event: "tool_started",
        message_id: "background-tool",
        tool: { id: "tool", name: "calendar.search" },
      },
      {
        event: "tool_finished",
        message_id: "background-tool",
        tool: { id: "tool", name: "calendar.search", status: "completed" },
      },
      { event: "turn_completed", messages: [] },
    ]) {
      await emit(card, {
        ...event,
        turn_id: turn.id,
        conversation_id: "a",
      });
      expect(
        composerRoot(card).querySelector<HTMLTextAreaElement>("textarea")!
          .value,
      ).toBe("не потеряй меня");
    }
  });

  test("selects a conversation locally before its background refresh resolves", async () => {
    let resolveGet: ((conversation: Conversation) => void) | undefined;
    getConversation = () =>
      new Promise((resolve) => {
        resolveGet = resolve;
      });
    const card = await mount();
    sidebarRoot(card)
      .querySelectorAll<HTMLButtonElement>(".chat-title")[1]
      .click();
    await wait(card);
    expect(
      sidebarRoot(card).querySelector(".chat-row.selected")?.textContent,
    ).toContain("Bravo");
    resolveGet!(structuredClone(conversations[1]));
    await wait(card);
  });

  test("ignores a stale conversation refresh after rapid A to B selection", async () => {
    const resolves = new Map<string, (conversation: Conversation) => void>();
    getConversation = (id) =>
      new Promise((resolve) => {
        resolves.set(id, resolve);
      });
    const card = await mount();
    const chats =
      sidebarRoot(card).querySelectorAll<HTMLButtonElement>(".chat-title");
    chats[1].click();
    await wait(card);
    chats[0].click();
    await wait(card);
    resolves.get("b")!({
      ...structuredClone(conversations[1]),
      title: "Stale Bravo",
    });
    await wait(card);
    expect(
      sidebarRoot(card).querySelector(".chat-row.selected")?.textContent,
    ).toContain("Alpha");
    expect(sidebarRoot(card).textContent).not.toContain("Stale Bravo");
    resolves.get("a")!(structuredClone(conversations[0]));
    await wait(card);
  });

  test("tool expansion and inspector survive unrelated refresh", async () => {
    conversations[0].messages.push({
      id: "at",
      role: "assistant",
      visible_content: "done",
      tool_executions: [
        {
          id: "call-1",
          name: "ha_admin_tools.restart",
          request: { token: "[REDACTED]" },
          response: { truncated: true },
          duration_ms: 12,
          status: "completed",
        },
      ],
    });
    const card = await mount();
    toolsRoot(card).querySelector<HTMLButtonElement>(".tool-summary")!.click();
    await wait(card);
    expect(toolsRoot(card).querySelector(".tool-row")).not.toBeNull();
    await (card as any).refreshServerData();
    await wait(card);
    expect(toolsRoot(card).querySelector(".tool-row")).not.toBeNull();
    toolsRoot(card).querySelector<HTMLButtonElement>(".tool-row")!.click();
    await wait(card);
    expect(inspectorRoot(card).querySelector("json-viewer")).not.toBeNull();
  });

  test("rename and delete dialogs remain mounted through server updates", async () => {
    const card = await mount();
    sidebarRoot(card).querySelector<HTMLButtonElement>(".chat-menu")!.click();
    await wait(card);
    [
      ...menuRoot(card).querySelectorAll<HTMLButtonElement>(
        "[role=menu] button",
      ),
    ]
      .find((button) => button.textContent?.trim() === "Rename")!
      .click();
    await wait(card);
    const rename = dialogsRoot(card).querySelector<HTMLInputElement>(
      "[aria-label='Rename conversation']",
    )!;
    rename.focus();
    input(rename, "Renamed");
    await wait(card);
    await (card as any).refreshServerData();
    await wait(card);
    expect(
      dialogsRoot(card).querySelector("[aria-label='Rename conversation']"),
    ).toBe(rename);
    expect(dialogsRoot(card).activeElement).toBe(rename);
    expect(rename.value).toBe("Renamed");
    dialogsRoot(card)
      .querySelector<HTMLButtonElement>("button[type=button]")!
      .click();
    await wait(card);
    sidebarRoot(card).querySelector<HTMLButtonElement>(".chat-menu")!.click();
    await wait(card);
    [
      ...menuRoot(card).querySelectorAll<HTMLButtonElement>(
        "[role=menu] button",
      ),
    ]
      .find((button) => button.textContent?.trim() === "Delete")!
      .click();
    await wait(card);
    await (card as any).refreshServerData();
    await wait(card);
    expect(
      dialogsRoot(card).querySelector("[role=alertdialog]"),
    ).not.toBeNull();
  });

  test("anchored menu closes on outside click and dialogs close only on their backdrop", async () => {
    const card = await mount();
    sidebarRoot(card).querySelector<HTMLButtonElement>(".chat-menu")!.click();
    await wait(card);
    expect(menuRoot(card).querySelector("[role=menu]")).not.toBeNull();
    window.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await wait(card);
    expect(
      root(card)
        .querySelector("assist-workspace-conversation-menu")
        ?.getAttribute("open"),
    ).toBeNull();

    sidebarRoot(card).querySelector<HTMLButtonElement>(".chat-menu")!.click();
    await wait(card);
    const menu = root(card).querySelector<any>(
      "assist-workspace-conversation-menu",
    )!;
    menu.anchor.remove();
    menu.requestUpdate();
    await menu.updateComplete;
    await wait(card);
    expect(menu.getAttribute("open")).toBeNull();

    sidebarRoot(card).querySelector<HTMLButtonElement>(".chat-menu")!.click();
    await wait(card);
    menuRoot(card)
      .querySelector<HTMLButtonElement>("[role=menu] button")!
      .click();
    await wait(card);
    const overlay = dialogsRoot(card).querySelector<HTMLElement>(".overlay")!;
    overlay.dispatchEvent(
      new MouseEvent("click", { bubbles: true, composed: true }),
    );
    await wait(card);
    expect(dialogsRoot(card).querySelector(".overlay")).toBeNull();
  });

  test("new chat stays local until first send, and terminal events restore Send", async () => {
    const card = await mount();
    sidebarRoot(card).querySelector<HTMLButtonElement>(".new-chat")!.click();
    await wait(card);
    expect(creates).toHaveLength(0);
    expect(sidebarRoot(card).querySelectorAll(".chat-row")).toHaveLength(2);
    const textarea =
      composerRoot(card).querySelector<HTMLTextAreaElement>("textarea")!;
    input(textarea, "hello");
    await wait(card);
    expect(creates).toHaveLength(0);
    composerRoot(card).querySelector<HTMLButtonElement>(".send")!.click();
    await wait(card);
    expect(creates).toHaveLength(1);
    expect(
      composerRoot(card).querySelector(".send")?.getAttribute("aria-label"),
    ).toBe("Stop");
    const turn = (card as any).turns.get("new-1");
    await emit(card, {
      event: "turn_started",
      turn_id: turn.id,
      conversation_id: turn.conversationId,
      user_message: "first-user",
      text: "hello",
    });
    expect(messagesRoot(card).querySelectorAll(".message.user")).toHaveLength(
      1,
    );
    await emit(card, {
      event: "turn_completed",
      turn_id: turn.id,
      conversation_id: turn.conversationId,
    });
    expect(
      composerRoot(card).querySelector(".send")?.getAttribute("aria-label"),
    ).toBe("Send");
    await emit(card, {
      event: "assistant_delta",
      turn_id: turn.turn_id,
      conversation_id: turn.conversation_id,
      message_id: "late",
      delta: "late",
    });
    expect(
      composerRoot(card).querySelector(".send")?.getAttribute("aria-label"),
    ).toBe("Send");
    input(textarea, "again");
    await wait(card);
    composerRoot(card).querySelector<HTMLButtonElement>(".send")!.click();
    await wait(card);
    const retryTurn = (card as any).turns.get("new-1");
    composerRoot(card).querySelector<HTMLButtonElement>(".send")!.click();
    await wait(card);
    await emit(card, {
      event: "turn_stopped",
      turn_id: retryTurn.id,
      conversation_id: retryTurn.conversationId,
    });
    expect(
      composerRoot(card).querySelector(".send")?.getAttribute("aria-label"),
    ).toBe("Send");
  });

  test("Stop requests backend cancellation and waits for its terminal event", async () => {
    const card = await mount();
    const textarea =
      composerRoot(card).querySelector<HTMLTextAreaElement>("textarea")!;
    input(textarea, "stop this");
    await wait(card);
    composerRoot(card).querySelector<HTMLButtonElement>(".send")!.click();
    await wait(card);
    const turn = (card as any).turns.get("a");
    composerRoot(card).querySelector<HTMLButtonElement>(".send")!.click();
    await wait(card);
    expect(cancels).toEqual([
      {
        type: "assist_workspace/turn/cancel",
        conversation_id: turn.conversationId,
        turn_id: turn.id,
      },
    ]);
    expect(
      composerRoot(card).querySelector(".send")?.getAttribute("aria-label"),
    ).toBe("Stop");
    await emit(card, {
      event: "turn_stopped",
      turn_id: turn.id,
      conversation_id: turn.conversationId,
    });
    expect(
      composerRoot(card).querySelector(".send")?.getAttribute("aria-label"),
    ).toBe("Send");
  });

  test("renders Markdown as inert content with copyable fenced code", async () => {
    conversations[0].messages.push({
      id: "safe-markdown",
      role: "assistant",
      visible_content:
        "A [safe link](https://example.com) and <img src=x onerror=alert(1)>\n\n```yaml\nentity_id: light.kitchen\n```",
    });
    const card = await mount();
    expect(messagesRoot(card).querySelector("script")).toBeNull();
    expect(messagesRoot(card).querySelector("img")).toBeNull();
    expect(messagesRoot(card).querySelector("pre code")?.textContent).toContain(
      "light.kitchen",
    );
    expect(
      messagesRoot(card).querySelector(".content a")?.getAttribute("href"),
    ).toContain("example.com");
  });

  test("does not reload history for an equivalent hass object", async () => {
    const card = await mount();
    const initialLists = calls.filter(
      (call) => call.type === "assist_workspace/conversation/list",
    ).length;
    card.hass = { ...card.hass, states: { unrelated: true } };
    await wait(card);
    await wait(card);
    expect(
      calls.filter(
        (call) => call.type === "assist_workspace/conversation/list",
      ),
    ).toHaveLength(initialLists);
    await (card as any).refreshServerData();
    expect(
      calls.filter(
        (call) => call.type === "assist_workspace/conversation/list",
      ),
    ).toHaveLength(initialLists + 1);
  });

  test("starts with summaries and lazily loads only the active detail", async () => {
    const card = await mount();
    expect(
      calls.filter(
        (call) => call.type === "assist_workspace/conversation/list",
      ),
    ).toHaveLength(1);
    expect(
      calls
        .filter((call) => call.type === "assist_workspace/conversation/get")
        .map((call) => call.conversation_id),
    ).toEqual(["a"]);
    expect((card as any).cache.getDetail("a")).toBeDefined();
    expect((card as any).cache.getDetail("b")).toBeUndefined();
  });

  test("loads a selected detail once and reuses it on revisit", async () => {
    const card = await mount();
    sidebarRoot(card)
      .querySelectorAll<HTMLButtonElement>(".chat-title")[1]
      .click();
    for (let attempt = 0; attempt < 3; attempt += 1) await wait(card);
    sidebarRoot(card)
      .querySelectorAll<HTMLButtonElement>(".chat-title")[0]
      .click();
    await wait(card);
    sidebarRoot(card)
      .querySelectorAll<HTMLButtonElement>(".chat-title")[1]
      .click();
    await wait(card);
    expect(
      calls
        .filter((call) => call.type === "assist_workspace/conversation/get")
        .map((call) => call.conversation_id),
    ).toEqual(["a", "b"]);
  });

  test("clears the submitted new-chat draft rather than the created conversation key", async () => {
    const card = await mount();
    sidebarRoot(card).querySelector<HTMLButtonElement>(".new-chat")!.click();
    await wait(card);
    const textarea =
      composerRoot(card).querySelector<HTMLTextAreaElement>("textarea")!;
    input(textarea, "submitted once");
    await wait(card);
    composerRoot(card).querySelector<HTMLButtonElement>(".send")!.click();
    await wait(card);
    sidebarRoot(card).querySelector<HTMLButtonElement>(".new-chat")!.click();
    await wait(card);
    expect(
      composerRoot(card).querySelector<HTMLTextAreaElement>("textarea")!.value,
    ).toBe("");
  });

  test("debounces draft persistence and flushes a pending write on disconnect", async () => {
    const card = await mount();
    const textarea =
      composerRoot(card).querySelector<HTMLTextAreaElement>("textarea")!;
    input(textarea, "o");
    input(textarea, "on");
    input(textarea, "one");
    await wait(card);
    expect(localStorage.getItem("assist-workspace:ui")).toBeNull();
    card.remove();
    expect(
      JSON.parse(localStorage.getItem("assist-workspace:ui") ?? "{}").drafts.a,
    ).toBe("one");
  });

  test("shows terminal failure and stopped outcomes while restoring Send", async () => {
    const card = await mount();
    const textarea =
      composerRoot(card).querySelector<HTMLTextAreaElement>("textarea")!;
    input(textarea, "fail this");
    await wait(card);
    composerRoot(card).querySelector<HTMLButtonElement>(".send")!.click();
    await wait(card);
    let turn = (card as any).turns.get("a");
    await emit(card, {
      event: "turn_failed",
      turn_id: turn.id,
      conversation_id: "a",
      error: "sensitive stack trace",
    });
    expect(messagesRoot(card).textContent).toContain("Request failed");
    expect(messagesRoot(card).textContent).not.toContain("stack trace");
    expect(
      composerRoot(card).querySelector<HTMLTextAreaElement>("textarea")!
        .disabled,
    ).toBe(false);

    input(textarea, "stop this");
    await wait(card);
    composerRoot(card).querySelector<HTMLButtonElement>(".send")!.click();
    await wait(card);
    turn = (card as any).turns.get("a");
    await emit(card, {
      event: "turn_stopped",
      turn_id: turn.id,
      conversation_id: "a",
    });
    expect(messagesRoot(card).textContent).toContain("Stopped");
  });

  test("keeps an open inspector resolved to the live tool state", async () => {
    const card = await mount();
    const textarea =
      composerRoot(card).querySelector<HTMLTextAreaElement>("textarea")!;
    input(textarea, "run tool");
    await wait(card);
    composerRoot(card).querySelector<HTMLButtonElement>(".send")!.click();
    await wait(card);
    const turn = (card as any).turns.get("a");
    await emit(card, {
      event: "tool_started",
      turn_id: turn.id,
      conversation_id: "a",
      message_id: "live-tool-message",
      tool: { id: "live-tool", name: "calendar.search", status: "running" },
    });
    toolsRoot(card).querySelector<HTMLButtonElement>(".tool-summary")!.click();
    await wait(card);
    toolsRoot(card).querySelector<HTMLButtonElement>(".tool-row")!.click();
    await wait(card);
    inspectorRoot(card)
      .querySelectorAll<HTMLButtonElement>("nav button")[1]
      .click();
    await wait(card);
    await emit(card, {
      event: "tool_finished",
      turn_id: turn.id,
      conversation_id: "a",
      message_id: "live-tool-message",
      tool: {
        id: "live-tool",
        name: "calendar.search",
        status: "completed",
        response: { updated: true },
      },
    });
    expect(
      root(card).querySelector<any>("assist-workspace-tool-inspector")!.tool
        .response,
    ).toEqual({ updated: true });
  });

  test("does not send Enter while an IME composition is active", async () => {
    const card = await mount();
    const textarea =
      composerRoot(card).querySelector<HTMLTextAreaElement>("textarea")!;
    input(textarea, "正在输入");
    textarea.dispatchEvent(new CompositionEvent("compositionstart"));
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        composed: true,
        isComposing: true,
      }),
    );
    textarea.dispatchEvent(new CompositionEvent("compositionend"));
    await wait(card);
    expect(callbacks).toHaveLength(0);
  });

  test("Escape closes inspector before fullscreen", async () => {
    conversations[0].messages.push({
      id: "tool-message",
      role: "assistant",
      visible_content: "",
      tool_executions: [{ id: "tool", name: "calendar.search" }],
    });
    const card = await mount();
    root(card)
      .querySelector<HTMLButtonElement>("[aria-label='Fullscreen']")!
      .click();
    toolsRoot(card).querySelector<HTMLButtonElement>(".tool-summary")!.click();
    await wait(card);
    toolsRoot(card).querySelector<HTMLButtonElement>(".tool-row")!.click();
    await wait(card);
    card.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await wait(card);
    const inspector = root(card).querySelector<any>(
      "assist-workspace-tool-inspector",
    );
    expect(inspector).not.toBeNull();
    expect(inspector.hasAttribute("open")).toBe(false);
    inspector.dispatchEvent(
      new Event("inspector-transition-ended", {
        bubbles: true,
        composed: true,
      }),
    );
    await wait(card);
    expect(
      root(card).querySelector("assist-workspace-tool-inspector"),
    ).toBeNull();
    expect(root(card).querySelector(".workspace")?.className).toContain(
      "fullscreen",
    );
  });

  test("fullscreen uses the same card state and Escape exits it", async () => {
    const card = await mount();
    root(card)
      .querySelector<HTMLButtonElement>("[aria-label='Fullscreen']")!
      .click();
    await wait(card);
    expect(root(card).querySelector(".workspace")?.className).toContain(
      "fullscreen",
    );
    card.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wait(card);
    expect(root(card).querySelector(".workspace")?.className).not.toContain(
      "fullscreen",
    );
  });
});
