import { describe, expect, test } from "vitest";
import { reduceTurnEvent } from "../src/state/conversation-reducer.js";
import type { Conversation, Turn, TurnEvent } from "../src/types/workspace.js";

const conversation = (): Conversation => ({
  id: "a",
  agent_id: "agent",
  title: "Alpha",
  message_count: 1,
  messages: [{ id: "old", role: "assistant", visible_content: "Keep me" }],
});
const turn = (): Turn => ({
  id: "turn-a",
  conversationId: "a",
  terminal: false,
  thinking: false,
  visibleTextStarted: false,
  toolsRunning: 0,
});
const event = (value: Partial<TurnEvent> & Pick<TurnEvent, "event">) =>
  ({
    conversation_id: "a",
    turn_id: "turn-a",
    ...value,
  }) as TurnEvent;

describe("reduceTurnEvent", () => {
  test("starts a turn without mutating its inputs or durable thinking", () => {
    const before = conversation();
    const active = turn();
    const result = reduceTurnEvent(
      before,
      active,
      event({ event: "turn_started", user_message: "user", text: "Hello" }),
    );
    expect(result.conversation.messages.at(-1)).toMatchObject({
      id: "user",
      role: "user",
      visible_content: "Hello",
    });
    expect(result.turn.thinking).toBe(true);
    expect(result.timelineChanged).toBe(true);
    expect(result.summaryChanged).toBe(true);
    expect(before.messages).toHaveLength(1);
    expect(active.thinking).toBe(false);
  });

  test("keeps thinking ephemeral", () => {
    const before = conversation();
    const result = reduceTurnEvent(
      before,
      turn(),
      event({ event: "assistant_thinking" }),
    );
    expect(result.conversation).toBe(before);
    expect(result.turn.thinking).toBe(true);
    expect(result.timelineChanged).toBe(false);
  });

  test("appends deltas to new and existing assistant messages", () => {
    const first = reduceTurnEvent(
      conversation(),
      turn(),
      event({
        event: "assistant_delta",
        message_id: "answer",
        delta: "One",
      }),
    );
    const second = reduceTurnEvent(
      first.conversation,
      first.turn,
      event({
        event: "assistant_delta",
        message_id: "answer",
        delta: " two",
      }),
    );
    expect(second.conversation.messages.at(-1)?.visible_content).toBe(
      "One two",
    );
    expect(second.conversation.messages[0].visible_content).toBe("Keep me");
    expect(second.turn.visibleTextStarted).toBe(true);
  });

  test("reuses the active assistant index for subsequent deltas", () => {
    const first = reduceTurnEvent(
      conversation(),
      turn(),
      event({ event: "assistant_delta", message_id: "answer", delta: "One" }),
    );
    expect(first.turn.activeAssistantMessageId).toBe("answer");
    expect(first.turn.activeAssistantMessageIndex).toBe(1);
    const messages = new Proxy(first.conversation.messages, {
      get(target, property, receiver) {
        if (property === "findIndex")
          throw new Error("cached delta must not scan messages");
        return Reflect.get(target, property, receiver);
      },
    });
    const second = reduceTurnEvent(
      { ...first.conversation, messages },
      first.turn,
      event({ event: "assistant_delta", message_id: "answer", delta: " two" }),
    );
    expect(second.conversation.messages.at(-1)?.visible_content).toBe(
      "One two",
    );
  });

  test("starts and finishes a tool by stable id", () => {
    const started = reduceTurnEvent(
      conversation(),
      turn(),
      event({
        event: "tool_started",
        message_id: "technical",
        tool: { id: "tool", name: "calendar.search", status: "running" },
      }),
    );
    const finished = reduceTurnEvent(
      started.conversation,
      started.turn,
      event({
        event: "tool_finished",
        message_id: "technical",
        tool: {
          id: "tool",
          name: "calendar.search",
          status: "completed",
          response: { ok: true },
        },
      }),
    );
    expect(started.turn.toolsRunning).toBe(1);
    expect(finished.turn.toolsRunning).toBe(0);
    expect(
      finished.conversation.messages.at(-1)?.tool_executions?.[0],
    ).toMatchObject({ status: "completed", response: { ok: true } });
    expect(finished.timelineChanged).toBe(true);
  });

  test.each([
    ["turn_completed", "completed"],
    ["turn_failed", { kind: "failed" }],
    ["turn_stopped", { kind: "stopped" }],
  ] as const)("reports %s without losing content", (kind, outcome) => {
    const before = conversation();
    const result = reduceTurnEvent(
      before,
      turn(),
      event({ event: kind } as Partial<TurnEvent> & Pick<TurnEvent, "event">),
    );
    expect(result.terminalOutcome).toEqual(outcome);
    expect(result.conversation).toBe(before);
    expect(result.conversation.messages[0].visible_content).toBe("Keep me");
  });

  test("reconciles authoritative terminal message and tool DTOs", () => {
    const started = reduceTurnEvent(
      conversation(),
      turn(),
      event({
        event: "assistant_delta",
        message_id: "answer",
        delta: "Visible answer",
      }),
    );
    const withTool = reduceTurnEvent(
      started.conversation,
      started.turn,
      event({
        event: "tool_started",
        message_id: "answer",
        tool: { id: "tool", name: "lookup", status: "running" },
      }),
    );
    const terminal = reduceTurnEvent(
      withTool.conversation,
      withTool.turn,
      event({
        event: "turn_stopped",
        messages: [
          {
            id: "answer",
            role: "assistant",
            visible_content: "Visible answer",
            created_at: "2026-01-01T00:00:00Z",
            status: "stopped",
            retry_of: null,
            tool_executions: [
              {
                id: "tool",
                name: "lookup",
                status: "cancelled",
                request: null,
                response: null,
                started_at: "2026-01-01T00:00:00Z",
                finished_at: "2026-01-01T00:00:01Z",
                duration_ms: 1000,
                metadata: {},
              },
            ],
          },
        ],
      }),
    );
    const message = terminal.conversation.messages.at(-1)!;
    expect(message.status).toBe("stopped");
    expect(message.visible_content).toBe("Visible answer");
    expect(message.tool_executions?.[0]).toMatchObject({
      status: "cancelled",
      duration_ms: 1000,
    });
    expect(terminal.timelineChanged).toBe(true);
  });
});
