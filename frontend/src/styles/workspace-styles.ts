import { css } from "lit";

/** Layout shared by the workspace coordinator, not by its domain components. */
export const workspaceStyles = css`
  :host {
    display: block;
    height: 100%;
    min-height: 0;
    min-width: 0;
  }
  .workspace {
    --aw-control-height: 40px;
    --aw-touch-target: 32px;
    --aw-touch-size: var(--aw-touch-target);
    --aw-radius-sm: 8px;
    --aw-radius-md: 12px;
    --aw-spacing-xs: 4px;
    --aw-spacing-sm: 8px;
    --aw-spacing-md: 12px;
    --aw-chat-max-width: 1080px;
    --aw-sidebar-width: 280px;
    --aw-motion-fast: 140ms;
    --aw-motion-panel-open: 160ms;
    --aw-motion-panel-close: 120ms;
    --aw-ease-panel: cubic-bezier(0.2, 0.8, 0.2, 1);
    --aw-json-key: #027c9b;
    --aw-json-string: #2e7d32;
    --aw-json-number: #b26a00;
    --aw-json-boolean: #7c4dff;
    --aw-json-null: #6b7280;
    position: relative;
    height: 100%;
    min-height: 360px;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    background: var(--card-background-color);
    color: var(--primary-text-color);
    border-radius: var(--ha-card-border-radius, 12px);
  }
  .workspace-header {
    display: flex;
    gap: 8px;
    padding: 12px;
    border-bottom: 1px solid var(--divider-color);
    align-items: center;
    min-width: 0;
  }
  .workspace-header button {
    flex: 0 0 auto;
    min-width: var(--aw-touch-size, 32px);
    min-height: var(--aw-touch-size, 32px);
  }
  .workspace-header strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .agent {
    min-width: 0;
    margin-left: auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--secondary-text-color);
  }
  .layout {
    min-height: 0;
    min-width: 0;
    display: grid;
    grid-template-columns: var(--aw-sidebar-width) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    position: relative;
    overflow: hidden;
  }
  .layout-ready .layout {
    transition: grid-template-columns var(--aw-motion-panel-close)
      var(--aw-ease-panel);
  }
  .layout-ready .layout:has(assist-workspace-tool-inspector[open]) {
    transition-duration: var(--aw-motion-panel-open);
  }
  .sidebar-collapsed .layout {
    grid-template-columns: 0 minmax(0, 1fr);
  }
  .sidebar {
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    border-right: 1px solid var(--divider-color);
    opacity: 1;
    transform: translateX(0);
    transition:
      opacity 120ms ease,
      transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .sidebar-collapsed .sidebar {
    border-right-color: transparent;
    opacity: 0;
    transform: translateX(-8px);
  }
  main {
    min-height: 0;
    min-width: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
  }
  .fullscreen {
    position: fixed;
    z-index: 1000;
    inset: 12px;
    height: auto;
    box-shadow: 0 12px 40px #0005;
  }
  .fullscreen main {
    grid-template-columns: minmax(0, var(--aw-chat-max-width));
    justify-content: center;
  }
  .wide .layout:has(assist-workspace-tool-inspector[open]) {
    grid-template-columns:
      var(--aw-sidebar-width) minmax(0, 1fr)
      35%;
  }
  .wide .layout {
    grid-template-columns: var(--aw-sidebar-width) minmax(0, 1fr) 0px;
  }
  .wide assist-workspace-tool-inspector[open] {
    position: static;
  }
  .wide.sidebar-collapsed .layout {
    grid-template-columns: 0 minmax(0, 1fr) 0px;
  }
  .wide.sidebar-collapsed .layout:has(assist-workspace-tool-inspector[open]) {
    grid-template-columns: 0 minmax(0, 1fr) 35%;
  }
  .medium assist-workspace-tool-inspector,
  .compact assist-workspace-tool-inspector {
    position: absolute;
    z-index: 3;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(440px, 92%);
    max-width: 100%;
  }
  .wide assist-workspace-tool-inspector:not([open]) {
    position: absolute;
    z-index: 3;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(440px, 92%);
  }
  .compact {
    --aw-touch-target: 42px;
    --aw-user-max: 90%;
  }
  .compact .agent {
    display: none;
  }
  .compact .layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .compact .sidebar {
    position: absolute;
    z-index: 2;
    width: min(320px, 88%);
    height: 100%;
    background: var(--card-background-color);
    transform: translateX(-110%);
    opacity: 1;
    transition: transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
    box-shadow: 10px 0 28px #0003;
  }
  .compact.sidebar-open .sidebar,
  .compact.sidebar-open.sidebar-collapsed .sidebar {
    transform: translateX(0);
  }
  .compact.sidebar-collapsed .sidebar {
    border-right-color: var(--divider-color);
    transform: translateX(-110%);
  }
  @media (prefers-reduced-motion: reduce) {
    .sidebar,
    .compact .sidebar,
    .layout,
    .layout-ready .layout {
      transition: none;
    }
  }
`;
