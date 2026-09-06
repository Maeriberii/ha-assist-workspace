# Assist Workspace frontend decisions

This document records current product decisions for a Home Assistant custom
card. Home Assistant is the runtime host and theme source; the implementation
uses Lit and native HA WebSocket APIs.

## Product boundary

Assist Workspace is a standalone provider-neutral conversation workspace. The
card does not contain provider credentials or browser-side LLM clients. It
selects Home Assistant conversation agents, renders the authenticated results,
and keeps presentation state separate from durable conversation state.

## History and navigation

- The sidebar groups durable summaries by date and marks the selected row.
- New Chat is explicit state, not a nullable loading sentinel.
- Initial navigation may open the most recently updated conversation; later
  refreshes do not override explicit user navigation.
- Search is a separate debounced session with distinct Searching, Search failed,
  and No results states.
- The sidebar becomes a drawer on compact cards and remains independently
  scrollable.
- Row menus own rename and delete actions; deleting the active last item leads
  to a usable New Chat.

## Composer and drafts

- The composer is one stable Lit surface so focus and textarea identity survive
  updates.
- It auto-grows within bounded limits and supports the configured Enter mode.
- With `enter_sends=true`, Enter sends and Shift+Enter inserts a newline. With
  `false`, Enter inserts a newline and Ctrl+Enter/Meta+Enter sends.
- A selected conversation whose detail is still loading or failed cannot create
  an accidental replacement conversation.
- Drafts are browser-local. A draft is cleared at the accepted `turn_started`
  boundary, not at subscription acknowledgement.
- New Chat drafts are atomically rekeyed to the created conversation id. A
  background turn owns only its own submitted draft and cannot clear `__new__`.
- `keep_drafts=false` removes persistence while preserving mounted in-memory
  text and browser-local sidebar preference.

## Timeline and actions

- User messages use a right-aligned bubble; assistant messages use a flat
  Markdown column for technical readability.
- Copy actions sit close to their message content, preserve user/assistant
  alignment, remain discoverable on touch devices, and copy only visible text.
- Stable user and assistant presentation ids keep streaming DOM identity stable.
- Tool diagnostics, hidden thinking, Inspector metadata, and step labels are
  never added to copied assistant text.

## Follow and navigation

- The timeline follows new content only while the reader is near the bottom.
- Upward intent detaches follow mode and exposes Jump to latest.
- Jump uses a short smooth animation where motion is allowed and is cancelled
  on conversation navigation or component detach.
- Reduced-motion users receive instant layout, drawer, Inspector, tool, and
  jump behavior.

## Tool presentation

- Human-readable tool labels are used in summaries and rows; raw identifiers
  remain available in Inspector Metadata.
- Consecutive tool-only assistant segments are grouped into one Tool Activity
  Cluster. Visible assistant text breaks a cluster.
- A cluster reports chronological status chips, tool count, step count, and
  wall-clock elapsed time. Parallel tools are not blindly summed when
  timestamps are available.
- Expanded clusters keep visible Step boundaries and retain expansion while a
  later step streams in.
- Cluster grouping is presentation-only. Durable messages are not merged, and
  Inspector selection always routes by raw message/tool identity.
- `show_tool_activity=false` hides the presentation but does not change turn
  execution, storage, or received tool data.

## Inspector and responsive layout

- Wide cards (`>=1100px`) reserve a third grid track for the Inspector. The
  closed track is zero width and open/close motion interpolates the main column.
- Compact cards (`<700px`) and medium cards (`700–1099px`) use an overlay/sheet
  Inspector and do not resize the main column.
- Inspector mount, open, and exit lifecycles are separate so a closing panel can
  animate without creating an implicit grid row.
- The card uses `ResizeObserver` because Lovelace card width, not viewport
  width, determines responsive mode.

## Config editor and options

The visual editor exposes the HA-facing card contract. The current options and
defaults are documented in the root [README](../README.md): `agent_id`,
`open_last_conversation`, `enter_sends`, `confirm_delete`, `keep_drafts`,
`default_sidebar_state`, `show_assistant_name`, and `show_tool_activity`.

`agent_id` applies to new conversations. Existing conversations retain their
stored agent. `default_sidebar_state` is only a default; an explicit browser
preference wins. Tool visibility is presentation-only.

## Failure and recovery presentation

Loading, detail failure, Retry, failed turns, stopped turns, reconnect
reconciliation, and startup recovery have explicit states. A background detail
request cannot replace the active conversation's main loading/error state.
The card never treats an empty or missing detail as an implicit New Chat when a
durable conversation is selected.

## Custom-card contract

The integration registers one idempotent frontend module and exposes the card,
visual editor, `window.customCards` metadata, `setConfig`, `hass`, and grid
sizing expected by Lovelace. Frontend source is under `frontend/src/`. Vite
generates `custom_components/assist_workspace/frontend/assist-workspace-card.js`;
the generated bundle is checked in for HA and must not be edited manually.

## Deliberately deferred scaling

There is no message pagination or virtualization today. Stable ids and the
presentation builder are preparation, not an implementation of either feature.
Before adding them, benchmark 100, 1,000, 5,000, and 10,000-message histories
for initial render, conversation switch, wheel/FPS, resize, fullscreen,
Inspector transitions, streaming latency, Jump to latest, memory, and DOM node
count. Any future solution must handle variable-height Markdown, code, tables,
images, tool clusters, and multi-segment turns.
