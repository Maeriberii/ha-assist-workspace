import { describe, expect, test } from "vitest";
import {
  clusterDurationMs,
  groupVisualTurns,
} from "../src/utils/visual-turns.js";

describe("visual assistant turns", () => {
  test("groups tool-only and text assistant segments after one user turn", () => {
    const turns = groupVisualTurns([
      { id: "u", role: "user", visible_content: "Question" },
      {
        id: "tool-a",
        role: "assistant",
        visible_content: "",
        tool_executions: [{ id: "a", name: "first" }],
      },
      {
        id: "tool-b",
        role: "assistant",
        visible_content: "",
        tool_executions: [{ id: "b", name: "second" }],
      },
      { id: "answer", role: "assistant", visible_content: "Done" },
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[0].id).toBe("user:u");
    expect(turns[1].id).toBe("assistant:tool-a");
    expect(turns[1]).toMatchObject({
      kind: "assistant",
      segments: [{ id: "tool-a" }, { id: "tool-b" }, { id: "answer" }],
    });
  });

  test("keeps an assistant presentation id when later segments arrive", () => {
    const initial = groupVisualTurns([
      { id: "a", role: "assistant", visible_content: "First" },
    ]);
    const expanded = groupVisualTurns([
      { id: "a", role: "assistant", visible_content: "First" },
      { id: "b", role: "assistant", visible_content: "Second" },
    ]);
    expect(initial[0].id).toBe(expanded[0].id);
  });

  test("preserves segment order and starts a new assistant turn after a user message", () => {
    const turns = groupVisualTurns([
      { id: "a1", role: "assistant", visible_content: "First" },
      { id: "a2", role: "assistant", visible_content: "Second" },
      { id: "u", role: "user", visible_content: "Next" },
      { id: "a3", role: "assistant", visible_content: "Third" },
    ]);

    expect(turns.map((turn) => turn.kind)).toEqual([
      "assistant",
      "user",
      "assistant",
    ]);
    expect(
      (turns[0] as { segments: { id: string }[] }).segments.map((m) => m.id),
    ).toEqual(["a1", "a2"]);
  });

  test("clusters consecutive tool-only rounds and keeps a stable first-message id", () => {
    const first = groupVisualTurns([
      {
        id: "a",
        role: "assistant",
        visible_content: "",
        tool_executions: [{ id: "1", name: "one" }],
      },
      {
        id: "b",
        role: "assistant",
        visible_content: "",
        tool_executions: [{ id: "2", name: "two" }],
      },
    ]);
    const appended = groupVisualTurns([
      {
        id: "a",
        role: "assistant",
        visible_content: "",
        tool_executions: [{ id: "1", name: "one" }],
      },
      {
        id: "b",
        role: "assistant",
        visible_content: "",
        tool_executions: [{ id: "2", name: "two" }],
      },
      {
        id: "c",
        role: "assistant",
        visible_content: "",
        tool_executions: [{ id: "3", name: "three" }],
      },
    ]);
    expect(first[0]).toMatchObject({
      parts: [{ kind: "tool-cluster", id: "tool-cluster:a" }],
    });
    expect(
      (appended[0] as { parts: { steps: unknown[] }[] }).parts[0].steps,
    ).toHaveLength(3);
  });

  test("visible text is a hard cluster boundary and duration uses wall clock", () => {
    const turns = groupVisualTurns([
      {
        id: "a",
        role: "assistant",
        visible_content: "",
        tool_executions: [
          {
            id: "1",
            name: "one",
            started_at: "2026-01-01T00:00:00.000Z",
            finished_at: "2026-01-01T00:00:00.400Z",
          },
        ],
      },
      { id: "text", role: "assistant", visible_content: "Checking" },
      {
        id: "b",
        role: "assistant",
        visible_content: "",
        tool_executions: [{ id: "2", name: "two", duration_ms: 200 }],
      },
    ]);
    const assistant = turns[0] as {
      parts: { kind: string; steps?: unknown[] }[];
    };
    expect(assistant.parts.map((part) => part.kind)).toEqual([
      "tool-cluster",
      "content",
      "tool-cluster",
    ]);
    expect(
      clusterDurationMs({
        kind: "tool-cluster",
        id: "x",
        steps: [
          {
            message:
              turns[0].kind === "assistant"
                ? turns[0].segments[0]
                : turns[0].message,
            tools: [
              {
                id: "a",
                name: "a",
                started_at: "2026-01-01T00:00:00.000Z",
                finished_at: "2026-01-01T00:00:00.400Z",
              },
            ],
          },
        ],
      }),
    ).toBe(400);
  });
});
