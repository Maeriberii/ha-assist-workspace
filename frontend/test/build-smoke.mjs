import { Window } from "happy-dom";
import { pathToFileURL } from "node:url";

const window = new Window();
Object.assign(globalThis, {
  window,
  document: window.document,
  customElements: window.customElements,
  HTMLElement: window.HTMLElement,
  ShadowRoot: window.ShadowRoot,
  Document: window.Document,
  CSSStyleSheet: window.CSSStyleSheet,
  localStorage: window.localStorage,
});

const bundle = pathToFileURL(
  new URL(
    "../../custom_components/assist_workspace/frontend/assist-workspace-card.js",
    import.meta.url,
  ).pathname,
).href;

await import(bundle);
if (!customElements.get("assist-workspace-card")) {
  throw new Error(
    "Built Assist Workspace bundle did not register its Lovelace card",
  );
}
if (!customElements.get("assist-workspace-editor")) {
  throw new Error(
    "Built Assist Workspace bundle did not register its visual editor",
  );
}
