import pytest

from custom_components.assist_workspace.models import ToolExecution, new_conversation, new_message
from custom_components.assist_workspace.storage import ConversationStore


class MemoryStore:
    def __init__(self, data=None):
        self.data = data
        self.saves = 0

    async def async_load(self):
        return self.data

    async def async_save(self, data):
        self.data = data
        self.saves += 1


@pytest.mark.asyncio
async def test_store_ownership_list_and_delete(hass):
    store = ConversationStore(hass)
    store._store = MemoryStore()
    one, two = new_conversation("a", "conversation.a"), new_conversation("b", "conversation.b")
    one.title = "Kitchen metrics"
    await store.add(one)
    await store.add(two)
    assert [x.id for x in store.list("a")] == [one.id]
    assert store.owned("b", one.id) is None
    assert not await store.delete("b", one.id)
    assert await store.delete("a", one.id)


@pytest.mark.asyncio
async def test_search_returns_compact_title_first_and_message_snippets(hass):
    store = ConversationStore(hass)
    store._store = MemoryStore()
    title = new_conversation("a", "conversation.a")
    title.title = "Кухонный маяк"
    title.messages.append(new_message("assistant", "also needle in message"))
    message = new_conversation("a", "conversation.a")
    message.title = "Other"
    message.messages.append(new_message("assistant", f"{'x' * 240} СЕКРЕТНЫЙ маркер {'y' * 240}"))
    await store.add(title)
    await store.add(message)

    title_hit = store.search("a", "МАЯК")[0]
    assert title_hit.match_type == "title"
    assert title_hit.snippet is None
    assert title_hit.highlight_ranges == [{"start": 9, "end": 13}]

    message_hit = store.search("a", "секретный")[0]
    assert message_hit.match_type == "message"
    assert message_hit.message_id == message.messages[0].id
    assert message_hit.snippet is not None
    assert len(message_hit.snippet) <= 180
    match = message_hit.highlight_ranges[0]
    assert message_hit.snippet[match["start"] : match["end"]] == "СЕКРЕТНЫЙ"


@pytest.mark.asyncio
async def test_store_skips_corrupt_and_duplicate_records(hass):
    good = new_conversation("a", "conversation.a")
    raw = {
        "conversations": [
            {"id": "bad"},
            {"id": good.id, "owner_user_id": "a", "agent_id": "conversation.a"},
            {"id": good.id, "owner_user_id": "a", "agent_id": "conversation.a"},
        ]
    }
    store = ConversationStore(hass)
    store._store = MemoryStore(raw)
    await store.async_load()
    assert [x.id for x in store.list("a")] == [good.id]


@pytest.mark.asyncio
async def test_store_recovers_orphaned_running_messages_and_tools(hass):
    item = new_conversation("a", "conversation.a")
    message = new_message("assistant", "partial", status="running")
    message.tool_executions.append(ToolExecution(id="tool", name="query"))
    item.messages.append(message)
    raw = {
        "conversations": [
            {
                "id": item.id,
                "owner_user_id": "a",
                "agent_id": "conversation.a",
                "title": item.title,
                "created_at": item.created_at,
                "updated_at": item.updated_at,
                "messages": [
                    {
                        "id": message.id,
                        "role": "assistant",
                        "visible_content": "partial",
                        "status": "running",
                        "tool_executions": [{"id": "tool", "name": "query", "status": "running"}],
                    }
                ],
            }
        ]
    }
    store = ConversationStore(hass)
    memory = MemoryStore(raw)
    store._store = memory
    await store.async_load()
    recovered = store.list("a")[0].messages[0]
    assert recovered.status == "interrupted"
    assert recovered.tool_executions[0].status == "cancelled"
    assert memory.saves == 1
