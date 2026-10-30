import type {
  AgentListResponse,
  ConversationDetailDto,
  ConversationListResponse,
  ConversationSearchResponse,
  ConversationSummaryDto,
  Hass,
  SearchHit,
  TurnEvent,
} from "../types/workspace.js";

/** Typed application boundary around Home Assistant's WebSocket transport. */
export class WorkspaceApi {
  constructor(private hass: Hass) {}

  updateHass(hass: Hass) {
    this.hass = hass;
  }

  async listConversations(): Promise<ConversationSummaryDto[]> {
    const result = await this.hass.callWS<ConversationListResponse>({
      type: "assist_workspace/conversation/list",
    });
    return result.conversations ?? [];
  }

  async getConversation(id: string): Promise<ConversationDetailDto> {
    return this.hass.callWS<ConversationDetailDto>({
      type: "assist_workspace/conversation/get",
      conversation_id: id,
    });
  }

  async searchConversations(query: string): Promise<SearchHit[]> {
    const result = await this.hass.callWS<ConversationSearchResponse>({
      type: "assist_workspace/conversation/search",
      query,
    });
    return result.hits ?? [];
  }

  createConversation(agentId: string): Promise<ConversationDetailDto> {
    return this.hass.callWS<ConversationDetailDto>({
      type: "assist_workspace/conversation/create",
      agent_id: agentId,
    });
  }

  renameConversation(
    id: string,
    title: string,
  ): Promise<ConversationSummaryDto> {
    return this.hass.callWS<ConversationSummaryDto>({
      type: "assist_workspace/conversation/rename",
      conversation_id: id,
      title,
    });
  }

  async deleteConversation(id: string): Promise<void> {
    await this.hass.callWS({
      type: "assist_workspace/conversation/delete",
      conversation_id: id,
    });
  }

  async listAgents() {
    const result = await this.hass.callWS<AgentListResponse>({
      type: "conversation/agent/list",
    });
    return result.agents ?? [];
  }

  runTurn(
    conversationId: string,
    turnId: string,
    text: string,
    onEvent: (event: TurnEvent) => void,
  ): Promise<() => void> {
    // Home Assistant invokes this callback with the event payload directly.
    return this.hass.connection.subscribeMessage(onEvent, {
      type: "assist_workspace/turn/run",
      conversation_id: conversationId,
      turn_id: turnId,
      text,
    });
  }

  async cancelTurn(conversationId: string, turnId: string): Promise<void> {
    await this.hass.callWS({
      type: "assist_workspace/turn/cancel",
      conversation_id: conversationId,
      turn_id: turnId,
    });
  }
}
