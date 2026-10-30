import type {
  Conversation,
  ConversationSummary,
  ToolExecution,
} from "../types/workspace.js";

export function summaryFromDetail(
  conversation: Conversation,
): ConversationSummary {
  const { messages, ...summary } = conversation;
  return { ...summary, message_count: messages.length };
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null)
    return false;
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((value, index) => valuesEqual(value, right[index]))
    );
  if (typeof left === "object") {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = Object.keys(leftRecord);
    return (
      keys.length === Object.keys(rightRecord).length &&
      keys.every((key) => valuesEqual(leftRecord[key], rightRecord[key]))
    );
  }
  return false;
}

function isNewerSummary(
  incoming: ConversationSummary,
  current: ConversationSummary | undefined,
) {
  if (!current) return true;
  if (incoming.updated_at && current.updated_at)
    return incoming.updated_at > current.updated_at;
  return Boolean(incoming.updated_at && !current.updated_at);
}

/** Used only at authoritative detail-fetch boundaries, never per streamed token. */
export function timelinesEqual(
  left: Conversation | undefined,
  right: Conversation,
): boolean {
  return Boolean(left && valuesEqual(left.messages, right.messages));
}

export class ConversationCache {
  private summariesById = new Map<string, ConversationSummary>();
  private detailsById = new Map<string, Conversation>();
  private revisionsById = new Map<string, number>();
  private orderedIds: string[] = [];
  activeId: string | null | undefined;

  get summaries() {
    return this.orderedIds
      .map((id) => this.summariesById.get(id))
      .filter((item): item is ConversationSummary => Boolean(item));
  }

  get activeDetail() {
    return this.activeId ? this.detailsById.get(this.activeId) : undefined;
  }

  getDetail(id: string) {
    return this.detailsById.get(id);
  }

  getSummary(id: string) {
    return this.summariesById.get(id);
  }

  getRevision(id: string | null | undefined) {
    return id ? (this.revisionsById.get(id) ?? 0) : 0;
  }

  replaceSummaries(
    summaries: ConversationSummary[],
    preserveDetailIds: ReadonlySet<string> = new Set(),
  ) {
    const ids = new Set(summaries.map((item) => item.id));
    const next = new Map<string, ConversationSummary>();
    for (const incoming of summaries) {
      const current = this.summariesById.get(incoming.id);
      next.set(
        incoming.id,
        isNewerSummary(incoming, current)
          ? incoming
          : (current as ConversationSummary),
      );
    }
    for (const id of preserveDetailIds) {
      const detail = this.detailsById.get(id);
      const summary = this.summariesById.get(id);
      if (detail && summary && !next.has(id)) next.set(id, summary);
    }
    this.summariesById = next;
    this.orderedIds = [
      ...new Set([...summaries.map((item) => item.id), ...preserveDetailIds]),
    ].filter((id) => this.summariesById.has(id));
    for (const id of this.detailsById.keys()) {
      if (!ids.has(id) && !preserveDetailIds.has(id))
        this.detailsById.delete(id);
    }
    this.sort();
  }

  /** Compatibility ingestion until the server list becomes summary-only. */
  replaceDetails(details: Conversation[]) {
    this.replaceSummaries(details.map(summaryFromDetail));
    for (const detail of details) this.setDetail(detail);
  }

  setDetail(detail: Conversation) {
    const previous = this.detailsById.get(detail.id);
    const knownSummary = this.summariesById.get(detail.id);
    const detailSummary = summaryFromDetail(detail);
    const incomingSummary = knownSummary
      ? (Object.fromEntries(
          Object.entries({ ...knownSummary, ...detailSummary }).map(
            ([key, value]) => [
              key,
              value === undefined
                ? knownSummary[key as keyof ConversationSummary]
                : value,
            ],
          ),
        ) as ConversationSummary)
      : detailSummary;
    const knownIsNewer = Boolean(
      knownSummary?.updated_at &&
      detail.updated_at &&
      knownSummary.updated_at > detail.updated_at,
    );
    const authoritativeMetadata = knownIsNewer ? knownSummary : incomingSummary;
    const normalizedDetail = knownSummary
      ? { ...detail, ...authoritativeMetadata, messages: detail.messages }
      : detail;
    this.detailsById.set(detail.id, normalizedDetail);
    this.summariesById.set(
      detail.id,
      knownIsNewer ? (knownSummary as ConversationSummary) : incomingSummary,
    );
    if (!this.orderedIds.includes(detail.id)) this.orderedIds.push(detail.id);
    if (previous && !timelinesEqual(previous, normalizedDetail))
      this.bump(detail.id);
    this.sort();
  }

  applyTimeline(detail: Conversation, timelineChanged: boolean) {
    const summary = this.summariesById.get(detail.id);
    const nextDetail = summary
      ? { ...detail, ...summary, messages: detail.messages }
      : detail;
    this.detailsById.set(detail.id, nextDetail);
    if (!this.summariesById.has(detail.id)) {
      this.summariesById.set(detail.id, summaryFromDetail(detail));
      if (!this.orderedIds.includes(detail.id)) this.orderedIds.push(detail.id);
      this.sort();
    }
    if (timelineChanged) this.bump(detail.id);
  }

  applySummary(summary: ConversationSummary) {
    const current = this.summariesById.get(summary.id);
    if (!isNewerSummary(summary, current)) return;
    this.summariesById.set(summary.id, summary);
    if (!this.orderedIds.includes(summary.id)) this.orderedIds.push(summary.id);
    const detail = this.detailsById.get(summary.id);
    if (detail)
      this.detailsById.set(summary.id, {
        ...detail,
        ...summary,
        messages: detail.messages,
      });
    this.sort();
  }

  touch(id: string, updatedAt: string) {
    const summary = this.summariesById.get(id);
    if (!summary) return;
    this.summariesById.set(id, { ...summary, updated_at: updatedAt });
    const detail = this.detailsById.get(id);
    if (detail) this.detailsById.set(id, { ...detail, updated_at: updatedAt });
    this.sort();
  }

  rename(summary: ConversationSummary) {
    this.summariesById.set(summary.id, summary);
    const detail = this.detailsById.get(summary.id);
    if (detail)
      this.detailsById.set(summary.id, {
        ...detail,
        ...summary,
        messages: detail.messages,
      });
    if (!this.orderedIds.includes(summary.id)) this.orderedIds.push(summary.id);
    this.sort();
  }

  delete(id: string) {
    this.summariesById.delete(id);
    this.detailsById.delete(id);
    this.revisionsById.delete(id);
    this.orderedIds = this.orderedIds.filter((item) => item !== id);
    if (this.activeId === id) this.activeId = this.orderedIds[0] ?? null;
  }

  resolveTool(
    conversationId: string,
    messageId: string,
    toolId: string,
  ): ToolExecution | undefined {
    return this.detailsById
      .get(conversationId)
      ?.messages.find((message) => message.id === messageId)
      ?.tool_executions?.find((tool) => tool.id === toolId);
  }

  private bump(id: string) {
    this.revisionsById.set(id, this.getRevision(id) + 1);
  }

  private sort() {
    this.orderedIds.sort((left, right) =>
      (this.summariesById.get(right)?.updated_at ?? "").localeCompare(
        this.summariesById.get(left)?.updated_at ?? "",
      ),
    );
  }
}
