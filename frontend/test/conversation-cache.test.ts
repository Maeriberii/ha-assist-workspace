import { describe, expect, test } from "vitest";
import { ConversationCache } from "../src/state/conversation-cache.js";
import type { Conversation } from "../src/types/workspace.js";

const detail = (id: string, updatedAt: string, content = id): Conversation => ({
  id,
  agent_id: "agent",
  title: id.toUpperCase(),
  created_at: updatedAt,
  updated_at: updatedAt,
  message_count: 1,
  messages: [
    { id: `${id}-message`, role: "assistant", visible_content: content },
  ],
});

describe("ConversationCache", () => {
  test("separates sorted summaries, details and active selection", () => {
    const cache = new ConversationCache();
    cache.replaceDetails([
      detail("old", "2026-01-01T00:00:00Z"),
      detail("new", "2026-02-01T00:00:00Z"),
    ]);
    cache.activeId = "old";
    expect(cache.summaries.map((item) => item.id)).toEqual(["new", "old"]);
    expect(cache.activeDetail?.id).toBe("old");
    expect(cache.summaries[0]).not.toHaveProperty("messages");
  });

  test("updates one timeline in O(1) cache space and bumps its revision", () => {
    const cache = new ConversationCache();
    const before = detail("a", "2026-01-01T00:00:00Z", "before");
    cache.setDetail(before);
    const next = {
      ...before,
      messages: [{ ...before.messages[0], visible_content: "after" }],
    };
    cache.applyTimeline(next, true);
    expect(cache.getDetail("a")?.messages[0].visible_content).toBe("after");
    expect(cache.getRevision("a")).toBe(1);
  });

  test("does not scan or serialize the full timeline on the streamed delta path", () => {
    const cache = new ConversationCache();
    const before = detail("a", "2026-01-01T00:00:00Z", "before");
    cache.setDetail(before);
    const messages = new Proxy(
      [{ ...before.messages[0], visible_content: "after" }],
      {
        get(target, property, receiver) {
          if (property === Symbol.iterator)
            throw new Error("streaming path scanned the timeline");
          return Reflect.get(target, property, receiver);
        },
      },
    );
    expect(() =>
      cache.applyTimeline({ ...before, messages }, true),
    ).not.toThrow();
    expect(cache.getRevision("a")).toBe(1);
  });

  test("summary refresh and title changes do not advance timeline revision", () => {
    const cache = new ConversationCache();
    const item = detail("a", "2026-01-01T00:00:00Z");
    cache.setDetail(item);
    cache.replaceSummaries([{ ...cache.summaries[0], title: "Renamed" }]);
    expect(cache.getRevision("a")).toBe(0);
    expect(cache.getDetail("a")?.messages).toEqual(item.messages);
  });

  test("keeps background details and resolves live tools by ids", () => {
    const cache = new ConversationCache();
    const item = detail("a", "2026-01-01T00:00:00Z");
    item.messages[0].tool_executions = [
      { id: "tool", name: "calendar.search", status: "running" },
    ];
    cache.setDetail(item);
    cache.activeId = null;
    expect(cache.resolveTool("a", "a-message", "tool")?.status).toBe("running");
  });

  test("can preserve a background detail during a summary refresh", () => {
    const cache = new ConversationCache();
    const item = detail("running", "2026-01-01T00:00:00Z");
    cache.setDetail(item);
    cache.replaceSummaries([], new Set([item.id]));
    expect(cache.getDetail(item.id)).toBe(item);
  });

  test("streamed timelines cannot overwrite an authoritative summary", () => {
    const cache = new ConversationCache();
    const item = detail("a", "2026-01-01T00:00:00Z");
    cache.replaceSummaries([
      {
        ...cacheSummary(item),
        title: "Fresh title",
        updated_at: "2026-02-01T00:00:00Z",
      },
    ]);
    cache.setDetail(item);
    cache.applyTimeline(
      {
        ...item,
        messages: [
          ...item.messages,
          { id: "delta", role: "assistant", visible_content: "x" },
        ],
      },
      true,
    );
    expect(cache.getSummary("a")?.title).toBe("Fresh title");
    expect(cache.getDetail("a")?.title).toBe("Fresh title");
  });

  test("authoritative GET wins when it is newer than a realtime summary", () => {
    const cache = new ConversationCache();
    const old = detail("a", "2026-01-01T00:00:00Z");
    cache.setDetail(old);
    cache.replaceSummaries([
      {
        ...cacheSummary(old),
        title: "Realtime",
        updated_at: "2026-01-02T00:00:00Z",
      },
    ]);
    cache.setDetail({
      ...old,
      title: "GET title",
      updated_at: "2026-01-03T00:00:00Z",
    });
    expect(cache.getSummary("a")).toMatchObject({
      title: "GET title",
      updated_at: "2026-01-03T00:00:00Z",
    });
  });

  test("equal timestamps prefer the authoritative GET deterministically", () => {
    const cache = new ConversationCache();
    const old = detail("a", "2026-01-01T00:00:00Z");
    cache.setDetail(old);
    cache.replaceSummaries([{ ...cacheSummary(old), title: "Realtime" }]);
    cache.setDetail({ ...old, title: "GET title" });
    expect(cache.getSummary("a")?.title).toBe("GET title");
  });

  test("stale list summaries cannot regress realtime metadata", () => {
    const cache = new ConversationCache();
    const item = detail("a", "2026-01-01T00:00:00Z");
    cache.replaceSummaries([
      {
        ...cacheSummary(item),
        title: "Fresh title",
        updated_at: "2026-01-02T00:00:00Z",
      },
    ]);
    cache.replaceSummaries([
      {
        ...cacheSummary(item),
        title: "New chat",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(cache.getSummary("a")?.title).toBe("Fresh title");
  });

  test("newer list metadata can update an existing summary", () => {
    const cache = new ConversationCache();
    const item = detail("a", "2026-01-01T00:00:00Z");
    cache.setDetail(item);
    cache.replaceSummaries([
      {
        ...cacheSummary(item),
        title: "Later title",
        updated_at: "2026-01-02T00:00:00Z",
      },
    ]);
    expect(cache.getSummary("a")?.title).toBe("Later title");
  });
});

function cacheSummary(item: Conversation) {
  return {
    id: item.id,
    agent_id: item.agent_id,
    title: item.title,
    created_at: item.created_at,
    updated_at: item.updated_at,
    message_count: item.messages.length,
  };
}
