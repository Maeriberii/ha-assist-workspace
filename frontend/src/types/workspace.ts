export type ToolExecution = {
  id: string;
  name: string;
  status?: ToolExecutionStatus;
  request?: unknown;
  response?: unknown;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
  metadata?: Record<string, unknown>;
};
export type ToolExecutionStatus =
  "running" | "completed" | "cancelled" | "failed";
export type ToolExecutionDto = {
  id: string;
  name: string;
  status: ToolExecutionStatus;
  request: unknown;
  response: unknown;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  metadata: Record<string, unknown>;
};
export type MessageStatus =
  "completed" | "running" | "failed" | "stopped" | "interrupted";
export type Message = {
  id: string;
  role: "user" | "assistant";
  visible_content: string;
  created_at?: string;
  status?: MessageStatus;
  tool_executions?: ToolExecution[];
  retry_of?: string | null;
};
export type MessageDto = Required<
  Omit<Message, "retry_of" | "tool_executions">
> & {
  retry_of: string | null;
  tool_executions: ToolExecutionDto[];
};
export type ConversationSummary = {
  id: string;
  agent_id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  message_count: number;
};
export type ConversationSummaryDto = Required<ConversationSummary>;
export type Conversation = ConversationSummary & {
  messages: Message[];
};
export type ConversationDetailDto = ConversationSummaryDto & {
  messages: MessageDto[];
};
export type HighlightRange = { start: number; end: number };
export type SearchHit = {
  conversation: ConversationSummaryDto;
  match_type: "title" | "message";
  message_id?: string;
  snippet?: string;
  highlight_ranges?: HighlightRange[];
};
export type Turn = {
  id: string;
  conversationId: string;
  unsubscribe?: () => void;
  terminal: boolean;
  thinking: boolean;
  visibleTextStarted: boolean;
  toolsRunning: number;
  activeAssistantMessageId?: string;
  activeAssistantMessageIndex?: number;
  submittedDraftKey?: string;
};
export type TurnNotice = { kind: "failed" | "stopped" };
export type Agent = { id: string; name: string };
export type InspectorSelection = {
  conversationId: string;
  messageId: string;
  toolId: string;
};
type TurnEventBase = {
  conversation_id: string;
  turn_id: string;
};
export type TurnStartedEvent = TurnEventBase & {
  event: "turn_started";
  user_message?: string;
  text?: string;
  summary: ConversationSummaryDto;
};
export type AssistantDeltaEvent = TurnEventBase & {
  event: "assistant_delta";
  message_id?: string;
  delta?: string;
};
export type AssistantThinkingEvent = TurnEventBase & {
  event: "assistant_thinking";
};
export type ToolStartedEvent = TurnEventBase & {
  event: "tool_started";
  message_id?: string;
  tool?: ToolExecution;
};
export type ToolFinishedEvent = TurnEventBase & {
  event: "tool_finished";
  message_id?: string;
  tool?: ToolExecution;
};
export type TurnCompletedEvent = TurnEventBase & {
  event: "turn_completed";
  messages: MessageDto[];
  summary: ConversationSummaryDto;
};
export type TurnFailedEvent = TurnEventBase & {
  event: "turn_failed";
  messages: MessageDto[];
  error?: string;
  summary: ConversationSummaryDto;
};
export type TurnStoppedEvent = TurnEventBase & {
  event: "turn_stopped";
  messages: MessageDto[];
  summary: ConversationSummaryDto;
};
export type TurnEvent =
  | TurnStartedEvent
  | AssistantThinkingEvent
  | AssistantDeltaEvent
  | ToolStartedEvent
  | ToolFinishedEvent
  | TurnCompletedEvent
  | TurnFailedEvent
  | TurnStoppedEvent;

export type ConversationListResponse = {
  conversations?: ConversationSummaryDto[];
};
export type ConversationSearchResponse = { hits?: SearchHit[] };
export type AgentListResponse = { agents?: Agent[] };
export type WebSocketMessage = Record<string, unknown>;
export type Hass = {
  callWS: <T = unknown>(message: WebSocketMessage) => Promise<T>;
  connection: {
    subscribeMessage: (
      callback: (message: TurnEvent) => void,
      message: WebSocketMessage,
    ) => Promise<() => void>;
  };
};
