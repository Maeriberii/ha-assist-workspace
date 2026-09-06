import { beforeEach, describe, expect, test, vi } from "vitest";
import { DraftStore } from "../src/state/draft-store.js";

describe("DraftStore", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  test("debounces writes and flushes the latest value", () => {
    const store = new DraftStore(localStorage, "drafts", () => ({}), true, 200);
    store.set("__new__", "o");
    store.set("__new__", "one");
    expect(localStorage.getItem("drafts")).toBeNull();
    vi.advanceTimersByTime(200);
    expect(JSON.parse(localStorage.getItem("drafts") ?? "{}").drafts).toEqual({
      __new__: "one",
    });
  });

  test("flush persists while cancel intentionally discards a pending write", () => {
    const store = new DraftStore(localStorage, "drafts", () => ({}), true, 200);
    store.set("a", "keep");
    store.flush();
    store.set("a", "discarded persistence");
    store.cancel();
    vi.advanceTimersByTime(300);
    expect(JSON.parse(localStorage.getItem("drafts") ?? "{}").drafts.a).toBe(
      "keep",
    );
  });

  test("clears submitted and deleted conversation keys", () => {
    localStorage.setItem(
      "drafts",
      JSON.stringify({ drafts: { __new__: "sent", a: "deleted", b: "keep" } }),
    );
    const store = new DraftStore(localStorage, "drafts", () => ({}));
    store.clear("__new__", true);
    store.clear("a", true);
    expect(JSON.parse(localStorage.getItem("drafts") ?? "{}").drafts).toEqual({
      b: "keep",
    });
  });

  test("rekeys a New Chat draft atomically", () => {
    const store = new DraftStore(localStorage, "drafts", () => ({}));
    store.set("__new__", "pending");
    store.rekey("__new__", "created", true);
    expect(store.get("__new__")).toBe("");
    expect(store.get("created")).toBe("pending");
    expect(JSON.parse(localStorage.getItem("drafts") ?? "{}").drafts).toEqual({
      created: "pending",
    });
  });

  test("disabling persistence preserves mounted drafts and scrubs storage", () => {
    localStorage.setItem(
      "drafts",
      JSON.stringify({ sidebarCollapsed: true, drafts: { a: "old" } }),
    );
    const store = new DraftStore(
      localStorage,
      "drafts",
      () => ({ sidebarCollapsed: true }),
      false,
    );
    expect(store.get("a")).toBe("");
    store.set("a", "mounted");
    store.setPersistence(false);
    expect(store.get("a")).toBe("mounted");
    expect(JSON.parse(localStorage.getItem("drafts") ?? "{}")).toEqual({
      sidebarCollapsed: true,
    });
  });
});
