from custom_components.assist_workspace.models import (
    deserialize_record,
    new_conversation,
    serialize_detail,
    serialize_record,
    serialize_summary,
)


def test_workspace_id_is_stable_and_non_ulid():
    item = new_conversation("user-a", "conversation.example")
    assert item.ha_conversation_id.startswith("assist-workspace:")
    assert deserialize_record(serialize_record(item)).agent_id == "conversation.example"


def test_malformed_data_is_ignored():
    assert deserialize_record({"id": "x"}) is None


def test_public_summary_and_detail_are_explicit_and_owner_safe():
    item = new_conversation("private-owner", "conversation.example")
    summary = serialize_summary(item)
    detail = serialize_detail(item)
    assert summary["message_count"] == 0
    assert "messages" not in summary
    assert "owner_user_id" not in summary
    assert detail["messages"] == []
    assert "owner_user_id" not in detail
    assert "schema_version" not in detail


def test_record_migration_ignores_unknown_fields_and_bad_nested_records():
    item = new_conversation("user-a", "conversation.example")
    raw = serialize_record(item)
    raw["legacy_extra"] = {"ignored": True}
    raw["messages"] = [
        {
            "id": "message",
            "role": "assistant",
            "visible_content": "kept",
            "unknown": "ignored",
            "tool_executions": [{"broken": True}],
        },
        {"broken": True},
    ]
    restored = deserialize_record(raw)
    assert restored is not None
    assert [message.visible_content for message in restored.messages] == ["kept"]
    assert restored.messages[0].tool_executions == []


def test_record_migration_tolerates_non_list_nested_containers():
    item = new_conversation("user-a", "conversation.example")
    raw = serialize_record(item)
    raw["messages"] = [
        {
            "id": "message",
            "role": "assistant",
            "visible_content": "kept",
            "tool_executions": None,
        }
    ]
    restored = deserialize_record(raw)
    assert restored is not None
    assert restored.messages[0].visible_content == "kept"
    assert restored.messages[0].tool_executions == []

    raw["messages"] = None
    restored = deserialize_record(raw)
    assert restored is not None
    assert restored.messages == []
