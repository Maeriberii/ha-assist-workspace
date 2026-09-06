import { describe, expect, test } from "vitest";
import { sortConversations } from "../src/utils/conversations.js";

describe("conversation ordering", () => {
  test("sorts updated conversations newest first without mutating input", () => {
    const older = {
      id: "older",
      agent_id: "test",
      title: "Older",
      updated_at: "2026-01-01T00:00:00Z",
      message_count: 0,
      messages: [],
    };
    const newer = {
      ...older,
      id: "newer",
      title: "Newer",
      updated_at: "2026-02-01T00:00:00Z",
    };
    const input = [older, newer];
    expect(sortConversations(input).map((item) => item.id)).toEqual([
      "newer",
      "older",
    ]);
    expect(input[0]).toBe(older);
  });
});
