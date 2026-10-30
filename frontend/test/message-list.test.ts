import { beforeEach, describe, expect, test } from "vitest";
import "../src/components/message-list.js";
import type { Conversation } from "../src/types/workspace.js";

const conversation = (title = "Alpha"): Conversation => ({
  id: "a",
  agent_id: "agent",
  title,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  message_count: 1,
  messages: [{ id: "m", role: "assistant", visible_content: "answer" }],
});

describe("MessageList", () => {
  beforeEach(() => document.body.replaceChildren());

  test("uses the cache revision rather than conversation object identity for unread", async () => {
    const list = document.createElement("assist-workspace-message-list") as any;
    list.conversation = conversation();
    list.timelineRevision = 4;
    list.expandedIds = new Set();
    document.body.append(list);
    await list.updateComplete;
    list.followState = { detachedFromBottom: true, hasUnread: false };

    list.conversation = conversation("Metadata-only rename");
    await list.updateComplete;
    expect(list.followState.hasUnread).toBe(false);

    list.timelineRevision = 5;
    await list.updateComplete;
    expect(list.followState.hasUnread).toBe(true);
  });
});
