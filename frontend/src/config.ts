export type AssistWorkspaceConfig = {
  agent_id?: string;
  open_last_conversation?: boolean;
  enter_sends?: boolean;
  confirm_delete?: boolean;
  keep_drafts?: boolean;
  default_sidebar_state?: "expanded" | "collapsed";
  show_assistant_name?: boolean;
  show_tool_activity?: boolean;
  [key: string]: unknown;
};

export const workspaceConfigDefaults = {
  open_last_conversation: true,
  enter_sends: true,
  confirm_delete: true,
  keep_drafts: true,
  default_sidebar_state: "expanded" as const,
  show_assistant_name: true,
  show_tool_activity: true,
};

export function configValue<K extends keyof typeof workspaceConfigDefaults>(
  config: AssistWorkspaceConfig | undefined,
  key: K,
) {
  return config?.[key] ?? workspaceConfigDefaults[key];
}
