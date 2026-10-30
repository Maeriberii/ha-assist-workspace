import asyncio
from types import SimpleNamespace

import pytest

from custom_components.assist_workspace import websocket_api
from custom_components.assist_workspace.const import DOMAIN
from custom_components.assist_workspace.models import new_conversation, new_message
from custom_components.assist_workspace.storage import ConversationStore


class ResultConnection:
    def __init__(self) -> None:
        self.user = SimpleNamespace(id="owner")
        self.results = []
        self.errors = []
        self.events = []
        self.subscriptions = {}

    def send_result(self, message_id, result=None):
        self.results.append((message_id, result))

    def send_error(self, message_id, code, message):
        self.errors.append((message_id, code, message))

    def send_event(self, message_id, event):
        self.events.append((message_id, event))

    def context(self, msg):
        return SimpleNamespace()


@pytest.mark.asyncio
async def test_list_get_and_search_have_distinct_public_shapes(hass):
    store = ConversationStore(hass)
    item = new_conversation("owner", "conversation.agent")
    item.title = "Architecture"
    item.messages.append(new_message("assistant", "compact needle response"))
    store._items[item.id] = item
    hass.data[DOMAIN] = {"store": store, "tasks": {}}
    connection = ResultConnection()

    websocket_api.ws_list(hass, connection, {"id": 1})
    await hass.async_block_till_done()
    summary = connection.results[-1][1]["conversations"][0]
    assert summary["message_count"] == 1
    assert "messages" not in summary
    assert "owner_user_id" not in summary

    websocket_api.ws_get(hass, connection, {"id": 2, "conversation_id": item.id})
    await hass.async_block_till_done()
    detail = connection.results[-1][1]
    assert detail["messages"][0]["visible_content"] == "compact needle response"
    assert "owner_user_id" not in detail

    websocket_api.ws_search(hass, connection, {"id": 3, "query": "needle"})
    await hass.async_block_till_done()
    hit = connection.results[-1][1]["hits"][0]
    assert hit["match_type"] == "message"
    assert hit["conversation"]["id"] == item.id
    assert "messages" not in hit["conversation"]
    assert "compact needle response" in hit["snippet"]


@pytest.mark.asyncio
async def test_delete_does_not_cancel_another_users_turn(hass):
    store = ConversationStore(hass)
    item = new_conversation("other-owner", "conversation.agent")
    store._items[item.id] = item
    cancelled = False

    class Task:
        def cancel(self):
            nonlocal cancelled
            cancelled = True

    hass.data[DOMAIN] = {
        "store": store,
        "tasks": {item.id: {"task": Task()}},
    }
    connection = ResultConnection()

    websocket_api.ws_delete(hass, connection, {"id": 2, "conversation_id": item.id})
    await hass.async_block_till_done()

    assert not cancelled
    assert item.id in hass.data[DOMAIN]["tasks"]
    assert connection.errors


@pytest.mark.asyncio
async def test_turn_subscription_acknowledges_before_first_event(hass, monkeypatch):
    store = ConversationStore(hass)
    item = new_conversation("owner", "conversation.agent")
    store._items[item.id] = item
    hass.data[DOMAIN] = {"store": store, "tasks": {}}
    connection = ResultConnection()
    order = []

    def send_result(message_id, result=None):
        order.append("result")
        connection.results.append((message_id, result))

    def send_event(message_id, event):
        order.append(f"event:{event['event']}")
        connection.events.append((message_id, event))

    connection.send_result = send_result
    connection.send_event = send_event
    monkeypatch.setattr(websocket_api, "agent_available", lambda hass, agent_id: True)

    async def fake_run_turn(hass, item, text, context, emit, persist_accepted):
        emit(
            {
                "event": "turn_started",
                "summary": {
                    "id": item.id,
                    "agent_id": item.agent_id,
                    "title": text,
                    "created_at": item.created_at,
                    "updated_at": item.updated_at,
                    "message_count": 0,
                },
            }
        )
        await asyncio.sleep(0)

    monkeypatch.setattr(websocket_api, "async_run_turn", fake_run_turn)
    await websocket_api.ws_run.__wrapped__(
        hass,
        connection,
        {
            "id": 10,
            "conversation_id": item.id,
            "turn_id": "turn-1",
            "text": "Kitchen check",
        },
    )
    await hass.async_block_till_done()

    assert order[:2] == ["result", "event:turn_started"]
