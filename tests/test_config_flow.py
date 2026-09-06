"""Config entry activation tests."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from homeassistant import config_entries
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.assist_workspace.const import DOMAIN


@pytest.fixture(autouse=True)
async def _enable_custom_integrations(enable_custom_integrations, hass):
    hass.http = SimpleNamespace(async_register_static_paths=AsyncMock())
    yield


@pytest.mark.asyncio
async def test_user_flow_creates_single_entry(hass):
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] == "create_entry"
    assert result["title"] == "Assist Workspace"


@pytest.mark.asyncio
async def test_user_flow_rejects_second_entry(hass):
    MockConfigEntry(domain=DOMAIN).add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] == "abort"
    assert result["reason"] == "single_instance_allowed"


@pytest.mark.asyncio
async def test_setup_entry_registers_runtime_once(hass):
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    hass.http = SimpleNamespace(async_register_static_paths=AsyncMock())
    with (
        patch("custom_components.assist_workspace.ConversationStore.async_load", new=AsyncMock()),
        patch("homeassistant.components.frontend.add_extra_js_url"),
        patch("custom_components.assist_workspace.async_register"),
    ):
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()
    assert DOMAIN in hass.data
