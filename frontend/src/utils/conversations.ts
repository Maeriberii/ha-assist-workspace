import type { Conversation } from "../types/workspace.js";

export function sortConversations(items: Conversation[]): Conversation[] {
  return [...items].sort((left, right) =>
    (right.updated_at ?? "").localeCompare(left.updated_at ?? ""),
  );
}
