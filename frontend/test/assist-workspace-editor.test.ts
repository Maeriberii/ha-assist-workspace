import { beforeEach, describe, expect, test } from "vitest";
import "../src/assist-workspace-editor.js";

describe("AssistWorkspaceEditor", () => {
  beforeEach(() => document.body.replaceChildren());

  test("uses Home Assistant selected events and preserves unrelated config", async () => {
    const editor = document.createElement("assist-workspace-editor") as any;
    editor.hass = {
      callWS: async () => ({
        agents: [
          { id: "conversation.current", name: "Current" },
          { id: "conversation.other_agent", name: "Other" },
        ],
      }),
    };
    editor.setConfig({
      type: "custom:assist-workspace-card",
      agent_id: "conversation.current",
      enter_sends: false,
    });
    document.body.append(editor);
    await editor.updateComplete;
    await Promise.resolve();
    await editor.updateComplete;

    const events: CustomEvent[] = [];
    editor.addEventListener("config-changed", (event: Event) =>
      events.push(event as CustomEvent),
    );
    const selects = editor.shadowRoot.querySelectorAll("ha-select");
    expect((selects[0] as any).options).toEqual([
      { value: "conversation.current", label: "Current" },
      { value: "conversation.other_agent", label: "Other" },
    ]);
    selects[0].dispatchEvent(
      new CustomEvent("selected", {
        detail: { value: "conversation.other_agent" },
        bubbles: true,
        composed: true,
      }),
    );
    selects[1].dispatchEvent(
      new CustomEvent("selected", {
        detail: { value: "collapsed" },
        bubbles: true,
        composed: true,
      }),
    );

    expect(events.map((event) => event.detail.config)).toEqual([
      {
        type: "custom:assist-workspace-card",
        agent_id: "conversation.other_agent",
        enter_sends: false,
      },
      {
        type: "custom:assist-workspace-card",
        agent_id: "conversation.current",
        enter_sends: false,
        default_sidebar_state: "collapsed",
      },
    ]);
  });
});
