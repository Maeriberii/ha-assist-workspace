import { beforeEach, describe, expect, test } from "vitest";
import "../src/components/history-sidebar.js";

describe("HistorySidebar", () => {
  beforeEach(() => document.body.replaceChildren());

  test("renders server-provided plaintext ranges as safe marks", async () => {
    const history = document.createElement("assist-workspace-history") as any;
    history.conversations = [];
    history.query = "маяк";
    history.searchPending = false;
    history.runningIds = new Set();
    history.searchHits = [
      {
        conversation: {
          id: "a",
          agent_id: "agent",
          title: "Conversation",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          message_count: 1,
        },
        match_type: "message",
        message_id: "m",
        snippet: "Найден маяк рядом",
        highlight_ranges: [{ start: 7, end: 11 }],
      },
    ];
    document.body.append(history);
    await history.updateComplete;
    expect(history.shadowRoot.querySelector("mark")?.textContent).toBe("маяк");
    expect(history.shadowRoot.querySelector(".result-snippet img")).toBeNull();
  });
});
