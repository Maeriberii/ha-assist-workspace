from custom_components.assist_workspace.redaction import REDACTED, bounded, redact


def test_redacts_deep_sensitive_values():
    assert redact({"headers": {"Authorization": "bearer x"}, "items": [{"api_key": "x"}]}) == {
        "headers": {"Authorization": REDACTED},
        "items": [{"api_key": REDACTED}],
    }


def test_bounds_large_payload_explicitly():
    result = bounded({"result": "x" * 1000}, limit=100)
    assert result["truncated"] is True
    assert result["original_size"] > 100
