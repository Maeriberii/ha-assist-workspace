import { LitElement, css, html } from "lit";
import type { AssistWorkspaceConfig } from "./config.js";

type HaSelectEvent = CustomEvent<{ value: string }>;

class AssistWorkspaceEditor extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { attribute: false },
  };
  declare hass?: { callWS: (message: Record<string, unknown>) => Promise<any> };
  declare config?: AssistWorkspaceConfig;
  private agents: Array<{ id: string; name: string }> = [];
  connectedCallback() {
    super.connectedCallback();
    void this.loadAgents();
  }
  protected updated(changed: Map<string, unknown>) {
    if (changed.has("hass")) void this.loadAgents();
  }
  setConfig(config: AssistWorkspaceConfig) {
    this.config = config;
  }
  private async loadAgents() {
    if (this.hass)
      this.agents =
        (await this.hass.callWS({ type: "conversation/agent/list" })).agents ??
        [];
    this.requestUpdate();
  }
  render() {
    const set = (key: string, value: unknown) =>
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: { ...this.config, [key]: value } },
          bubbles: true,
          composed: true,
        }),
      );
    const toggle = (key: string) => (event: Event) =>
      set(key, (event.target as HTMLInputElement).checked);
    const select =
      (key: "agent_id" | "default_sidebar_state") => (event: HaSelectEvent) =>
        set(key, event.detail.value);
    return html`<div class="editor">
      <section>
        <h3>Assistant</h3>
        <ha-select
          label="Assistant"
          .value=${this.config?.agent_id ?? ""}
          .options=${this.agents.map((agent) => ({ value: agent.id, label: agent.name }))}
          @selected=${select("agent_id")}
        ></ha-select>
        <p>
          Used for newly created conversations. Existing conversations keep
          their original assistant.
        </p>
      </section>
      <section>
        <h3>Conversation</h3>
        <ha-formfield label="Open last conversation on load"
          ><ha-switch
            ?checked=${this.config?.open_last_conversation ?? true}
            @change=${toggle("open_last_conversation")}
          ></ha-switch
        ></ha-formfield>
        <ha-formfield label="Press Enter to send"
          ><ha-switch
            ?checked=${this.config?.enter_sends ?? true}
            @change=${toggle("enter_sends")}
          ></ha-switch
        ></ha-formfield>
        <ha-formfield label="Confirm conversation deletion"
          ><ha-switch
            ?checked=${this.config?.confirm_delete ?? true}
            @change=${toggle("confirm_delete")}
          ></ha-switch
        ></ha-formfield>
      </section>
      <section>
        <h3>Workspace</h3>
        <ha-formfield label="Keep drafts locally"
          ><ha-switch
            ?checked=${this.config?.keep_drafts ?? true}
            @change=${toggle("keep_drafts")}
          ></ha-switch
        ></ha-formfield>
        <ha-select
          label="Default sidebar"
          .value=${this.config?.default_sidebar_state ?? "expanded"}
          .options=${[
            { value: "expanded", label: "Expanded" },
            { value: "collapsed", label: "Collapsed" },
          ]}
          @selected=${select("default_sidebar_state")}
        ></ha-select>
        <ha-formfield label="Show assistant name"
          ><ha-switch
            ?checked=${this.config?.show_assistant_name ?? true}
            @change=${toggle("show_assistant_name")}
          ></ha-switch
        ></ha-formfield>
        <ha-formfield label="Show tool activity"
          ><ha-switch
            ?checked=${this.config?.show_tool_activity ?? true}
            @change=${toggle("show_tool_activity")}
          ></ha-switch
        ></ha-formfield>
      </section>
    </div>`;
  }
  static styles = [
    css`
      .editor {
        box-sizing: border-box;
        max-width: 520px;
        width: 100%;
      }
      section {
        margin: 0 0 24px;
      }
      h3 {
        margin: 0 0 12px;
        font-size: 1rem;
      }
      ha-select,
      ha-formfield {
        display: block;
        width: 100%;
        margin: 8px 0;
      }
      p {
        margin: 6px 0;
        color: var(--secondary-text-color);
        font-size: 0.9rem;
      }
    `,
  ];
}
if (!customElements.get("assist-workspace-editor"))
  customElements.define("assist-workspace-editor", AssistWorkspaceEditor);
