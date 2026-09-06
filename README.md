# Assist Workspace

Assist Workspace is a standalone, provider-neutral Home Assistant integration
and Lovelace card for persistent conversations with Home Assistant conversation
agents. It provides per-user history, streaming responses, search, tool
activity diagnostics, and a responsive chat workspace without calling an LLM
provider directly from the browser.

<img width="1047" height="516" alt="Screenshot 2026-09-06 151837" src="https://github.com/user-attachments/assets/3b2e34e5-6bac-4c5b-8370-daa2730a5352" />

## Features

- Home Assistant conversation-agent selection for new conversations;
- durable, per-user conversation history with lazy detail loading;
- streaming assistant responses and concurrent conversation turns;
- server-side bounded history search;
- sequential Tool Activity Clusters with steps, status chips, elapsed time, and
  a raw tool inspector;
- redacted and size-bounded tool request/result diagnostics;
- responsive sidebar, fullscreen mode, and a wide Inspector column;
- follow-at-bottom scrolling with Jump to latest;
- browser-local drafts and sidebar preference;
- explicit failed, stopped, loading, retry, reconnect, and restart-recovery
  states.

## Requirements and compatibility

Assist Workspace requires Home Assistant with the standard conversation-agent
WebSocket APIs and a browser that supports modern custom Lovelace elements. The
integration is provider-neutral:

- Home Assistant owns authentication, conversation agents, provider
  credentials, and tool authorization;
- the browser talks only to the authenticated Assist Workspace WebSocket API;
- new conversations use the Assistant selected in the card configuration;
- existing conversations retain their stored `agent_id`.

The project originally grew out of a Codex Assist UI experiment, but it no
longer depends on Codex Assist or its internals.

## Installation

1. Add `Maeriberii/ha-assist-workspace` as a custom HACS repository in the
   **Integration** category and install it.
2. Restart Home Assistant once so the integration can register its versioned
   frontend module.
3. Add **Assist Workspace** through **Settings → Devices & services → Add
   integration**. The YAML alternative is `assist_workspace: {}`.
4. Add the card from the Lovelace card picker or use the visual editor. After
   an integration update, reload the integration or restart Home Assistant and
   refresh the browser once so the generated module is replaced.

## Add the card

The visual editor is the recommended setup path: choose an available Assistant
from the live Home Assistant agent list.

The minimal YAML shape is:

```yaml
type: custom:assist-workspace-card
```

If the card is configured in YAML, `agent_id` must be an agent available in
the target Home Assistant installation. Agent ids are installation-specific;
there is no project-wide default provider.

## Card options

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `agent_id` | string | unset | Assistant used when creating new conversations. Existing conversations keep their saved agent. |
| `open_last_conversation` | boolean | `true` | Select the most recently updated conversation only during initial navigation. |
| `enter_sends` | boolean | `true` | With `true`, Enter sends and Shift+Enter inserts a newline. With `false`, Enter inserts a newline and Ctrl+Enter/Meta+Enter sends. |
| `confirm_delete` | boolean | `true` | Ask for confirmation before deleting a conversation. |
| `keep_drafts` | boolean | `true` | Persist drafts in browser storage between reloads. When false, mounted drafts remain in memory but are not restored or written. |
| `default_sidebar_state` | `expanded` \| `collapsed` | `expanded` | Initial sidebar preference. An explicit browser-local toggle takes precedence. |
| `show_assistant_name` | boolean | `true` | Show the selected Assistant name in the workspace. |
| `show_tool_activity` | boolean | `true` | Show tool activity in the presentation layer. Tool execution and backend data are unaffected. |

## History, storage, and privacy

Conversation history is stored in Home Assistant's versioned Store, separately
for each authenticated Home Assistant user. Ownership comes from the HA
connection context and cannot be supplied by the browser.

Startup first loads compact summaries. Full messages are fetched lazily for the
selected conversation. Search runs on the server and returns bounded summary,
match, and plaintext snippet data. The Workspace history is separate from
provider-native session state: after a Home Assistant restart or ChatLog expiry,
only visible user and assistant text is restored to the next provider session.
Hidden reasoning, encrypted provider state, raw native sessions, and exact
provider-session continuity are not restored.

Tool diagnostics available through public Home Assistant ChatLog deltas are
redacted and size-bounded on the server before transport or persistence.
Sensitive keys such as `authorization`, `token`, `api_key`, `password`,
`secret`, and `cookie` become `[REDACTED]`; truncation records the original
size. Tool Activity Clusters are a presentation grouping only: durable
assistant messages remain separate.

## Behavior notes

New Chat is distinct from loading an existing conversation. A selected existing
conversation with missing detail cannot accidentally create another chat, and
failed detail loads expose Retry. A first accepted turn carries authoritative
conversation metadata, including the title and server timestamp, so the
sidebar can update without a page reload.

Drafts are browser-local. A submitted draft is cleared at the accepted
`turn_started` boundary, not merely when a transport subscription is
acknowledged. A background turn never owns or clears the unrelated New Chat
draft.

## Development

Frontend source lives in `frontend/src/` and is written in Lit TypeScript:

```bash
cd frontend
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run typecheck:test
npm test
npm run build
npm run test:build
npm run test:e2e
npm run build:analyze
```

Backend checks use `uv` from the repository root:

```bash
uv sync --group dev
PYTHONPATH=. uv run pytest
uv run ruff format --check .
uv run ruff check .
uv run mypy .
uv run python scripts/check_version.py
git diff --check
```

Vite builds the checked-in Home Assistant resource at
`custom_components/assist_workspace/frontend/assist-workspace-card.js`.
That file is generated and must not be edited manually; CI rebuilds it and
rejects bundle drift.

See [Architecture](docs/architecture.md) for runtime boundaries and
[Frontend decisions](docs/frontend-decisions.md) for current UI decisions.
