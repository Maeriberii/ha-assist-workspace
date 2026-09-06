import type { Message, ToolExecution } from "../types/workspace.js";

export type ToolStep = { message: Message; tools: ToolExecution[] };
export type ToolCluster = {
  kind: "tool-cluster";
  id: string;
  steps: ToolStep[];
};
export type VisualPart = { kind: "content"; message: Message } | ToolCluster;
export type VisualTurn =
  | { id: string; kind: "user"; message: Message }
  | { id: string; kind: "assistant"; segments: Message[]; parts: VisualPart[] };

function isToolOnly(message: Message) {
  return (
    message.role === "assistant" &&
    !message.visible_content &&
    Boolean(message.tool_executions?.length)
  );
}

export function groupVisualTurns(messages: Message[]): VisualTurn[] {
  const turns: VisualTurn[] = [];
  for (const message of messages) {
    const last = turns.at(-1);
    if (message.role === "user") {
      turns.push({ id: `user:${message.id}`, kind: "user", message });
      continue;
    }
    if (!last || last.kind === "user")
      turns.push({
        id: `assistant:${message.id}`,
        kind: "assistant",
        segments: [message],
        parts: [],
      });
    else last.segments.push(message);
    const assistant = turns.at(-1);
    if (!assistant || assistant.kind !== "assistant") continue;
    const previous = assistant.parts.at(-1);
    if (isToolOnly(message) && previous?.kind === "tool-cluster")
      previous.steps.push({ message, tools: message.tool_executions ?? [] });
    else if (isToolOnly(message))
      assistant.parts.push({
        kind: "tool-cluster",
        id: `tool-cluster:${message.id}`,
        steps: [{ message, tools: message.tool_executions ?? [] }],
      });
    else assistant.parts.push({ kind: "content", message });
  }
  return turns;
}

export function clusterTools(cluster: ToolCluster) {
  return cluster.steps.flatMap((step) => step.tools);
}

export function clusterDurationMs(cluster: ToolCluster): number | undefined {
  const tools = clusterTools(cluster);
  const timestamps = tools
    .flatMap((tool) => [tool.started_at, tool.finished_at])
    .filter((value): value is string => Boolean(value));
  if (timestamps.length === tools.length * 2) {
    const values = timestamps.map((value) => Date.parse(value));
    if (values.every(Number.isFinite))
      return Math.max(...values) - Math.min(...values);
  }
  const durations = cluster.steps.map((step) => {
    const values = step.tools
      .map((tool) => tool.duration_ms)
      .filter((value): value is number => value != null && value >= 0);
    return values.length ? Math.max(...values) : undefined;
  });
  return durations.every((value): value is number => value !== undefined)
    ? durations.reduce((a, b) => a + b, 0)
    : undefined;
}
