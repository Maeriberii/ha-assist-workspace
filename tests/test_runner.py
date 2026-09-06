from __future__ import annotations

from contextlib import contextmanager
from types import SimpleNamespace

import pytest

from custom_components.assist_workspace import conversation_runner as runner
from custom_components.assist_workspace.models import new_conversation


class FakeLog:
    def __init__(self, listener):
        self.content = [object()]
        self.listener = listener
        self.restored = []

    def async_add_user_content(self, content):
        self.restored.append(("user", content.content))

    def async_add_assistant_content_without_tools(self, content):
        self.restored.append(("assistant", content.content))


@pytest.mark.asyncio
async def test_stream_normalizes_boundaries_parallel_tools_and_result(monkeypatch):
    item = new_conversation("u", "conversation.agent")
    events = []
    captured = {}

    @contextmanager
    def session(*_args):
        yield SimpleNamespace()

    @contextmanager
    def log(_hass, _session, chat_log_delta_listener):
        captured["log"] = FakeLog(chat_log_delta_listener)
        yield captured["log"]

    async def converse(**_kwargs):
        emit = captured["log"].listener
        emit(None, {"role": "assistant", "content": "First"})
        emit(
            None,
            {
                "content": " chunk",
                "tool_calls": [
                    {"id": "a", "tool_name": "one", "tool_args": {"token": "x"}},
                    {"id": "b", "tool_name": "two", "tool_args": {}},
                ],
            },
        )
        emit(
            None,
            {
                "tool_call_id": "b",
                "tool_name": "two",
                "tool_result": {"ok": 2},
                "role": "tool_result",
            },
        )
        emit(
            None,
            {
                "tool_call_id": "a",
                "tool_name": "one",
                "tool_result": {"ok": 1},
                "role": "tool_result",
            },
        )
        emit(None, {"role": "assistant", "content": "Second"})
        return SimpleNamespace(response=SimpleNamespace(speech={"plain": {"speech": "fallback"}}))

    monkeypatch.setattr(runner, "async_get_chat_session", session)
    monkeypatch.setattr(runner.conversation, "async_get_chat_log", log)
    monkeypatch.setattr(runner.conversation, "async_converse", converse)
    hass = SimpleNamespace(config=SimpleNamespace(language="en"))
    await runner.async_run_turn(hass, item, "hello", None, events.append)

    assistants = [message for message in item.messages if message.role == "assistant"]
    assert [message.visible_content for message in assistants] == ["First chunk", "Second"]
    assert len(assistants[0].tool_executions) == 2
    assert assistants[0].tool_executions[0].request["token"] == "[REDACTED]"
    assert {event["event"] for event in events} >= {
        "assistant_delta",
        "tool_started",
        "tool_finished",
        "turn_completed",
    }
    assert [message["status"] for message in events[-1]["messages"]] == [
        "completed",
        "completed",
    ]


@pytest.mark.asyncio
async def test_soft_restore_is_visible_only_and_current_turn_added_once(monkeypatch):
    item = new_conversation("u", "conversation.agent")
    item.messages.extend(
        [runner.new_message("user", "old question"), runner.new_message("assistant", "old answer")]
    )
    captured = {}

    @contextmanager
    def session(*_args):
        yield SimpleNamespace()

    @contextmanager
    def log(_hass, _session, chat_log_delta_listener):
        captured["log"] = FakeLog(chat_log_delta_listener)
        yield captured["log"]

    async def converse(**_kwargs):
        return SimpleNamespace(response=SimpleNamespace(speech={"plain": {"speech": "new answer"}}))

    monkeypatch.setattr(runner, "async_get_chat_session", session)
    monkeypatch.setattr(runner.conversation, "async_get_chat_log", log)
    monkeypatch.setattr(runner.conversation, "async_converse", converse)
    events = []
    await runner.async_run_turn(
        SimpleNamespace(config=SimpleNamespace(language="en")),
        item,
        "new question",
        None,
        events.append,
    )
    assert captured["log"].restored[:2] == [("user", "old question"), ("assistant", "old answer")]
    assert [m.visible_content for m in item.messages if m.role == "user"] == [
        "old question",
        "new question",
    ]
    assert [m.visible_content for m in item.messages if m.role == "assistant"] == [
        "old answer",
        "new answer",
    ]
    assert [event["delta"] for event in events if event["event"] == "assistant_delta"] == [
        "new answer"
    ]
    assert [event["event"] for event in events].count("turn_completed") == 1
    assert events[-1]["event"] == "turn_completed"
    assert [message["status"] for message in events[-1]["messages"]] == ["completed"]


@pytest.mark.asyncio
async def test_provider_exception_emits_one_terminal_failure(monkeypatch):
    item = new_conversation("u", "conversation.agent")
    events = []

    @contextmanager
    def session(*_args):
        yield SimpleNamespace()

    @contextmanager
    def log(*_args, **_kwargs):
        yield FakeLog(None)

    async def converse(**_kwargs):
        raise RuntimeError("provider failed")

    monkeypatch.setattr(runner, "async_get_chat_session", session)
    monkeypatch.setattr(runner.conversation, "async_get_chat_log", log)
    monkeypatch.setattr(runner.conversation, "async_converse", converse)
    await runner.async_run_turn(
        SimpleNamespace(config=SimpleNamespace(language="en")), item, "x", None, events.append
    )
    assert [event["event"] for event in events].count("turn_failed") == 1
    assert item.messages[-1].status == "failed"
    assert events[-1]["messages"][-1]["status"] == "failed"


@pytest.mark.asyncio
async def test_cancellation_marks_turn_stopped(monkeypatch):
    item = new_conversation("u", "conversation.agent")
    events = []

    @contextmanager
    def session(*_args):
        yield SimpleNamespace()

    @contextmanager
    def log(*_args, **_kwargs):
        yield FakeLog(None)

    async def converse(**_kwargs):
        raise __import__("asyncio").CancelledError

    monkeypatch.setattr(runner, "async_get_chat_session", session)
    monkeypatch.setattr(runner.conversation, "async_get_chat_log", log)
    monkeypatch.setattr(runner.conversation, "async_converse", converse)
    with pytest.raises(__import__("asyncio").CancelledError):
        await runner.async_run_turn(
            SimpleNamespace(config=SimpleNamespace(language="en")), item, "x", None, events.append
        )
    assert item.messages[-1].status == "stopped"
    assert events[-1]["event"] == "turn_stopped"
    assert events[-1]["messages"][-1]["status"] == "stopped"


@pytest.mark.asyncio
async def test_cancellation_persists_the_explicit_terminal_outcome(monkeypatch):
    item = new_conversation("u", "conversation.agent")
    saves = 0

    @contextmanager
    def session(*_args):
        yield SimpleNamespace()

    @contextmanager
    def log(*_args, **_kwargs):
        yield FakeLog(None)

    async def converse(**_kwargs):
        raise __import__("asyncio").CancelledError

    async def persist():
        nonlocal saves
        saves += 1

    monkeypatch.setattr(runner, "async_get_chat_session", session)
    monkeypatch.setattr(runner.conversation, "async_get_chat_log", log)
    monkeypatch.setattr(runner.conversation, "async_converse", converse)
    with pytest.raises(__import__("asyncio").CancelledError):
        await runner.async_run_turn(
            SimpleNamespace(config=SimpleNamespace(language="en")),
            item,
            "x",
            None,
            lambda _event: None,
            persist,
        )
    # Once for accepted input and once after the stopped outcome is durable.
    assert saves == 2


@pytest.mark.asyncio
async def test_terminal_summary_uses_the_timestamp_from_terminal_persistence(monkeypatch):
    item = new_conversation("u", "conversation.agent")
    events = []
    persisted = []

    @contextmanager
    def session(*_args):
        yield SimpleNamespace()

    @contextmanager
    def log(*_args, **_kwargs):
        yield FakeLog(None)

    async def converse(**_kwargs):
        return SimpleNamespace(response=SimpleNamespace(speech={"plain": {"speech": "done"}}))

    async def persist():
        item.updated_at = f"2026-01-01T00:00:0{len(persisted)}Z"
        persisted.append(item.updated_at)

    monkeypatch.setattr(runner, "async_get_chat_session", session)
    monkeypatch.setattr(runner.conversation, "async_get_chat_log", log)
    monkeypatch.setattr(runner.conversation, "async_converse", converse)
    await runner.async_run_turn(
        SimpleNamespace(config=SimpleNamespace(language="en")),
        item,
        "hello",
        None,
        events.append,
        persist,
    )

    assert len(persisted) == 2
    assert events[0]["summary"]["updated_at"] == persisted[0]
    assert events[-1]["summary"]["updated_at"] == persisted[-1]
    assert item.updated_at == events[-1]["summary"]["updated_at"]
