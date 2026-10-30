import type { ToolExecution } from "../types/workspace.js";

export type ToolLabel = { short: string; qualified: string };

const acronyms = new Map(
  ["ha", "http", "https", "api", "url", "json", "ui", "ws", "llm", "mcp"].map(
    (value) => [value, value.toUpperCase()],
  ),
);

function words(value: string, sentence = false) {
  return value
    .split(/[_.-]+/)
    .filter(Boolean)
    .map((word, index) => {
      const acronym = acronyms.get(word.toLowerCase());
      if (acronym) return acronym;
      return sentence && index > 0
        ? word.toLowerCase()
        : `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`;
    })
    .join(" ");
}

/** Formats the canonical identifier without ever changing that identifier. */
export function toolLabel(tool: Pick<ToolExecution, "name">): ToolLabel {
  const raw = tool.name?.trim();
  if (!raw) return { short: "Tool", qualified: "Tool" };
  const segments = raw.split("__").filter(Boolean);
  const leaf = segments.at(-1) ?? raw;
  const dotted = leaf.split(".").filter(Boolean);
  const operation = words(dotted.at(-1) ?? leaf, true) || raw;
  const namespace =
    segments.length > 1
      ? words(segments.at(-2) ?? "")
      : words(dotted.length > 1 ? (dotted.at(-2) ?? "") : "");
  return {
    short: operation,
    qualified: namespace ? `${namespace} · ${operation}` : operation,
  };
}
