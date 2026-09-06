import type {
  Conversation,
  Message,
  MessageDto,
  ToolExecution,
  Turn,
  TurnEvent,
  TurnNotice,
} from "../types/workspace.js";

function resolveMessageIndex(
  messages: readonly Message[],
  messageId: string,
  cachedIndex?: number,
): number {
  if (cachedIndex !== undefined && messages[cachedIndex]?.id === messageId)
    return cachedIndex;
  const lastIndex = messages.length - 1;
  if (lastIndex >= 0 && messages[lastIndex]?.id === messageId) return lastIndex;
  return messages.findIndex((message) => message.id === messageId);
}

function reconcileMessages(
  messages: Message[],
  authoritative: MessageDto[] | undefined,
): { messages: Message[]; changed: boolean } {
  if (!authoritative?.length) return { messages, changed: false };
  const nextMessages = messages.slice();
  for (const dto of authoritative) {
    const index = nextMessages.findIndex((message) => message.id === dto.id);
    const previous = index >= 0 ? nextMessages[index] : undefined;
    const next: Message = {
      ...dto,
      // A defensive compatibility guard: terminal metadata must not erase
      // already visible streamed text if an older backend omits it.
      visible_content:
        dto.visible_content || previous?.visible_content || dto.visible_content,
    };
    if (index >= 0) nextMessages[index] = next;
    else nextMessages.push(next);
  }
  return { messages: nextMessages, changed: true };
}

export type TurnReduction = {
  conversation: Conversation;
  turn: Turn;
  timelineChanged: boolean;
  summaryChanged: boolean;
  terminalOutcome?: TurnNotice | "completed";
};

function applyTool(
  messages: Message[],
  messageId: string | undefined,
  tool: ToolExecution | undefined,
): { messages: Message[]; changed: boolean } {
  if (!messageId || !tool) return { messages, changed: false };
  const messageIndex = messages.findIndex(
    (message) => message.id === messageId,
  );
  if (messageIndex < 0) {
    return {
      changed: true,
      messages: [
        ...messages,
        {
          id: messageId,
          role: "assistant",
          visible_content: "",
          status: "running",
          tool_executions: [tool],
        },
      ],
    };
  }
  const message = messages[messageIndex];
  const tools = message.tool_executions ?? [];
  const toolIndex = tools.findIndex((item) => item.id === tool.id);
  const nextTools =
    toolIndex < 0
      ? [...tools, tool]
      : tools.map((item, index) =>
          index === toolIndex ? { ...item, ...tool } : item,
        );
  return {
    changed: true,
    messages: messages.map((item, index) =>
      index === messageIndex
        ? { ...message, tool_executions: nextTools }
        : item,
    ),
  };
}

/** Pure translation from transport turn events to application state. */
export function reduceTurnEvent(
  conversation: Conversation,
  turn: Turn,
  event: TurnEvent,
): TurnReduction {
  let messages = conversation.messages;
  let nextTurn = { ...turn };
  let timelineChanged = false;
  let summaryChanged = false;
  let terminalOutcome: TurnReduction["terminalOutcome"];

  switch (event.event) {
    case "turn_started": {
      nextTurn = { ...nextTurn, thinking: true };
      const messageId = event.user_message ?? `user-${turn.id}`;
      if (!messages.some((message) => message.id === messageId)) {
        messages = [
          ...messages,
          {
            id: messageId,
            role: "user",
            visible_content: event.text ?? "",
            status: "completed",
          },
        ];
        timelineChanged = true;
      }
      summaryChanged = true;
      break;
    }
    case "assistant_thinking":
      nextTurn = { ...nextTurn, thinking: true };
      break;
    case "assistant_delta": {
      nextTurn = {
        ...nextTurn,
        thinking: false,
        visibleTextStarted: true,
      };
      const delta = event.delta ?? "";
      if (!delta) break;
      const messageId = event.message_id ?? `assistant-${turn.id}`;
      const messageIndex = resolveMessageIndex(
        messages,
        messageId,
        nextTurn.activeAssistantMessageId === messageId
          ? nextTurn.activeAssistantMessageIndex
          : undefined,
      );
      messages =
        messageIndex < 0
          ? [
              ...messages,
              {
                id: messageId,
                role: "assistant",
                visible_content: delta,
                status: "running",
              },
            ]
          : (() => {
              const nextMessages = messages.slice();
              const message = nextMessages[messageIndex];
              nextMessages[messageIndex] = {
                ...message,
                visible_content: message.visible_content + delta,
              };
              return nextMessages;
            })();
      nextTurn = {
        ...nextTurn,
        activeAssistantMessageId: messageId,
        activeAssistantMessageIndex:
          messageIndex < 0 ? messages.length - 1 : messageIndex,
      };
      timelineChanged = true;
      break;
    }
    case "tool_started":
    case "tool_finished": {
      nextTurn = {
        ...nextTurn,
        thinking: false,
        toolsRunning: Math.max(
          0,
          nextTurn.toolsRunning + (event.event === "tool_started" ? 1 : -1),
        ),
      };
      const applied = applyTool(messages, event.message_id, event.tool);
      messages = applied.messages;
      timelineChanged = applied.changed;
      break;
    }
    case "turn_completed": {
      const reconciled = reconcileMessages(messages, event.messages);
      messages = reconciled.messages;
      timelineChanged = reconciled.changed;
      nextTurn = { ...nextTurn, thinking: false, toolsRunning: 0 };
      terminalOutcome = "completed";
      break;
    }
    case "turn_failed": {
      const reconciled = reconcileMessages(messages, event.messages);
      messages = reconciled.messages;
      timelineChanged = reconciled.changed;
      nextTurn = { ...nextTurn, thinking: false, toolsRunning: 0 };
      terminalOutcome = { kind: "failed" };
      break;
    }
    case "turn_stopped": {
      const reconciled = reconcileMessages(messages, event.messages);
      messages = reconciled.messages;
      timelineChanged = reconciled.changed;
      nextTurn = { ...nextTurn, thinking: false, toolsRunning: 0 };
      terminalOutcome = { kind: "stopped" };
      break;
    }
  }

  return {
    conversation:
      messages === conversation.messages
        ? conversation
        : { ...conversation, messages },
    turn: nextTurn,
    timelineChanged,
    summaryChanged,
    terminalOutcome,
  };
}
