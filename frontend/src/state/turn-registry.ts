import type { Turn } from "../types/workspace.js";

export class TurnRegistry {
  private readonly turns = new Map<string, Turn>();
  get(conversationId: string | null | undefined) {
    return conversationId ? this.turns.get(conversationId) : undefined;
  }
  start(turn: Turn) {
    this.turns.set(turn.conversationId, turn);
  }
  isCurrent(turn: Turn) {
    return this.turns.get(turn.conversationId) === turn;
  }
  finish(turn: Turn) {
    if (!this.isCurrent(turn)) return false;
    turn.terminal = true;
    turn.unsubscribe?.();
    this.turns.delete(turn.conversationId);
    return true;
  }
  clear() {
    this.turns.forEach((turn) => turn.unsubscribe?.());
    this.turns.clear();
  }
  has(conversationId: string | null | undefined) {
    return this.get(conversationId) !== undefined;
  }
  get size() {
    return this.turns.size;
  }
  get conversationIds() {
    return [...this.turns.keys()];
  }
}
