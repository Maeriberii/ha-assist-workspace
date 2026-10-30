# Assist Workspace architecture

Assist Workspace is a provider-neutral Home Assistant conversation workspace.
Home Assistant owns authentication, agent selection, provider credentials, and
tool authorization. The browser does not call provider APIs directly.

## Runtime boundary

```text
Home Assistant
  ↓ authenticated WebSocket API
WorkspaceApi
  ↓ typed transport boundary
AssistWorkspaceCard
  ├─ ConversationCache
  ├─ SearchSession
  ├─ DraftStore
  ├─ TurnRegistry
  ├─ pure conversation reducer
  └─ pure visual-turn/tool-cluster builder
```

The frontend uses separate transport shapes for list summaries, full details,
search hits, and turn events. Backend serializers do not expose owner ids,
persistence schema metadata, or unbounded diagnostics.

## Navigation and detail lifecycle

The active selection has three intentional states:

```text
activeId === undefined → initial navigation is unresolved
activeId === null      → explicit New Chat
activeId === string    → selected durable conversation
```

New Chat is never represented as detail loading. Detail loading and error state
are scoped to the active target. A background detail reconciliation updates the
cache but cannot put a different conversation's loading or error screen in the
active pane.

Selection requests use per-conversation generations. Leaving a conversation
invalidates its foreground request; deleting a different conversation does not.
Deleting the active conversation clears its state before the cache chooses a
next item. If there is no next item, the result is a usable New Chat.

History and agent refreshes are independent. Initial navigation waits for a
successful history list, while later refreshes preserve explicit user
navigation and known state when one endpoint fails.

## Metadata authority and freshness

Timeline state and conversation summary metadata are separate concerns:

```text
assistant/tool deltas → timeline messages and tool status
summary-bearing events/list/detail/rename → title, timestamps, counts, agent
```

The server's `updated_at` is the freshness signal. A newer authoritative
summary replaces an older one; a stale list, detail, or realtime payload cannot
regress a newer title or timestamp. `conversation/get` remains authoritative
for the fetched messages and can update metadata when its server timestamp is
newer. `applyTimeline()` preserves metadata ownership and never reconstructs a
title from stale detail.

The accepted-turn and terminal events carry required summaries. Terminal
summary metadata is serialized after terminal mutations and persistence, so its
`updated_at` and final `message_count` describe the persisted state. The runner
owns accepted and terminal persistence; the WebSocket wrapper does not perform a
normal duplicate terminal touch.

## Turn transport lifecycle

`turn_started` is the accepted-turn boundary. It carries the first user message
identity, initial assistant identity where available, and the authoritative
conversation summary. The WebSocket runner installs task ownership and the
subscription cancellation callback, sends the subscription result, and only
then releases the runner barrier. This ordering matters because current Home
Assistant task creation can eager-start a coroutine; it prevents the first
event from racing ahead of the subscription acknowledgement.

The frontend clears a submitted draft only at that accepted boundary. A
transport acknowledgement without `turn_started` does not imply that the turn
was accepted.

Terminal semantics are distinct:

```text
completed:        assistant running → completed, tools → completed
stopped:          assistant running → stopped,    tools → cancelled
failed:           assistant running → failed,     tools → failed
startup recovery: assistant running → interrupted, tools → cancelled
```

Terminal events carry authoritative current-turn message DTOs and a summary.
The reducer reconciles those DTOs without mutating durable inputs. Thinking and
terminal notices are presentation state, not persisted message content.

## Restart, reconnect, and unload

`TurnRegistry` is runtime-local. When a Home Assistant connection is replaced,
old local subscription ownership is discarded, affected conversation ids are
remembered, and their persisted details are fetched again. The server remains
authoritative for the resulting terminal state; background reconciliation does
not poison active-pane loading state.

At startup, persisted impossible states are normalized once: assistant
`running` becomes `interrupted` and tool `running` becomes `cancelled`. On
integration unload, active runner tasks are cancelled and awaited with
`return_exceptions=True` before the integration runtime is removed. This keeps
late cancellation persistence from accessing missing runtime data.

## DraftStore ownership

Drafts are browser-local and debounced. With `keep_drafts=false`, current
mounted drafts remain readable but the persisted `drafts` field is scrubbed
immediately; sidebar preference is preserved and old drafts are not restored on
startup.

The `__new__` draft belongs to the pending New Chat submission. When durable
conversation creation succeeds, `DraftStore.rekey()` atomically moves it to the
created conversation id. The submitted draft is cleared only when that
conversation's own turn reaches `turn_started`. Background turns in other
conversations have no authority over `__new__`.

## Tool Activity Cluster

Durable messages remain canonical:

```text
raw assistant messages
  ↓ pure presentation grouping
Tool Activity Cluster
  ↓ renderer
compact summary or expanded Step 1/2/... rows
```

Consecutive tool-only assistant segments form one cluster. Visible assistant
text is a hard boundary. A cluster keeps a stable presentation id based on its
first tool-only message, reports tool count, step count, and wall-clock elapsed
time, and shows at most three chronological status chips plus `+N`.

The cluster does not alter storage segmentation. Clicking a row still routes to
the raw `conversationId`, `messageId`, and `toolId`, so the existing Inspector
can show bounded request, response, and metadata payloads. Hiding tool activity
is presentation-only and does not disable execution or backend data.

## Persistence and future scaling

Home Assistant Store is the smallest native persistence solution for the
current workload. It stores normalized per-user conversations and uses separate
container and per-record schema versions. If measurements show file size,
full-save serialization, save latency, or search latency becoming a bottleneck,
the next measured step is an index Store plus per-conversation Store records.
A database should only follow benchmark evidence.

Virtualization and message pagination are not implemented. Stable timeline ids
and the presentation boundary prepare for future work, but any scaling change
must first benchmark 100, 1,000, 5,000, and 10,000 messages with variable-height
Markdown, tools, tables, images, streaming, scrolling, and Inspector motion.
