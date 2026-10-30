import { beforeEach, describe, expect, test, vi } from "vitest";
import "../src/components/workspace-composer.js";

describe("WorkspaceComposer", () => {
  beforeEach(() => document.body.replaceChildren());

  test("keeps Send disabled for whitespace and does not send during composition", async () => {
    const composer = document.createElement("assist-workspace-composer") as any;
    composer.draft = "";
    composer.running = false;
    composer.textareaDisabled = false;
    composer.canSend = false;
    const send = vi.fn();
    composer.addEventListener("send-requested", send);
    document.body.append(composer);
    await composer.updateComplete;
    const textarea = composer.shadowRoot.querySelector("textarea");
    const button = composer.shadowRoot.querySelector("button");
    expect(button.disabled).toBe(true);
    textarea.value = "text";
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
    textarea.dispatchEvent(new CompositionEvent("compositionstart"));
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        isComposing: true,
      }),
    );
    expect(send).not.toHaveBeenCalled();
  });
});
