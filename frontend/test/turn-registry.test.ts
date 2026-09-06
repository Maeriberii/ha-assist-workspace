import { describe, expect, test, vi } from "vitest";
import { TurnRegistry } from "../src/state/turn-registry.js";
import type { Turn } from "../src/types/workspace.js";

const turn = (id: string): Turn => ({
  id,
  conversationId: "conversation",
  terminal: false,
  thinking: false,
  visibleTextStarted: false,
  toolsRunning: 0,
});

describe("TurnRegistry", () => {
  test("rejects a stale turn and cleans up only the current subscription", () => {
    const registry = new TurnRegistry();
    const stale = turn("stale");
    const current = turn("current");
    const unsubscribe = vi.fn();
    current.unsubscribe = unsubscribe;
    registry.start(stale);
    registry.start(current);
    expect(registry.finish(stale)).toBe(false);
    expect(registry.finish(current)).toBe(true);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(registry.size).toBe(0);
  });
});
