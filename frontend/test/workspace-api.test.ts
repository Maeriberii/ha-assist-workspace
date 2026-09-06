import { describe, expect, test, vi } from "vitest";
import { WorkspaceApi } from "../src/api/workspace-api.js";
import type { Hass, TurnEvent } from "../src/types/workspace.js";

describe("WorkspaceApi", () => {
  test("contains raw HA commands behind typed methods", async () => {
    const callWS = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === "assist_workspace/conversation/list")
        return { conversations: [] };
      if (message.type === "conversation/agent/list") return { agents: [] };
      return { id: "a", agent_id: "agent", title: "A", messages: [] };
    });
    const subscribeMessage = vi.fn(async () => () => undefined);
    const api = new WorkspaceApi({
      callWS,
      connection: { subscribeMessage },
    } as Hass);

    await api.listConversations();
    await api.getConversation("a");
    await api.searchConversations("needle");
    await api.createConversation("agent");
    await api.renameConversation("a", "Renamed");
    await api.deleteConversation("a");
    await api.listAgents();
    await api.cancelTurn("a", "turn-a");

    expect(callWS.mock.calls.map(([message]) => message.type)).toEqual([
      "assist_workspace/conversation/list",
      "assist_workspace/conversation/get",
      "assist_workspace/conversation/search",
      "assist_workspace/conversation/create",
      "assist_workspace/conversation/rename",
      "assist_workspace/conversation/delete",
      "conversation/agent/list",
      "assist_workspace/turn/cancel",
    ]);
  });

  test("preserves the direct subscribeMessage event payload", async () => {
    let callback: ((event: TurnEvent) => void) | undefined;
    const subscribeMessage = vi.fn(async (next, message) => {
      void message;
      callback = next;
      return () => undefined;
    });
    const api = new WorkspaceApi({
      callWS: vi.fn(),
      connection: { subscribeMessage },
    } as unknown as Hass);
    const received: TurnEvent[] = [];
    await api.runTurn("a", "turn-a", "hello", (event) => received.push(event));
    const event: TurnEvent = {
      event: "assistant_delta",
      conversation_id: "a",
      turn_id: "turn-a",
      message_id: "m",
      delta: "direct",
    };
    callback?.(event);
    expect(received).toEqual([event]);
    expect(subscribeMessage.mock.calls[0]?.[1]).toMatchObject({
      type: "assist_workspace/turn/run",
      conversation_id: "a",
      turn_id: "turn-a",
    });
  });
});
