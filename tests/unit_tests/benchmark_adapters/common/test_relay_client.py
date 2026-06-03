from __future__ import annotations

from pathlib import Path
from typing import cast

import httpx
import pytest
from pydantic import JsonValue

from benchmarks.common.relay_client import (
    RelayTeamsClientConfig,
    RelayTeamsHttpClient,
    RelayTokenUsage,
    SessionMode,
    event_payload,
    parse_sse_event_line,
)


def test_parse_sse_event_line_decodes_data_payload() -> None:
    event = parse_sse_event_line(
        'data: {"event_type": "text_delta", "payload_json": "{\\"text\\": \\"hi\\"}"}'
    )

    assert event is not None
    assert event["event_type"] == "text_delta"
    assert event_payload(event) == {"text": "hi"}


def test_parse_sse_event_line_ignores_non_data_lines() -> None:
    assert parse_sse_event_line("event: ping") is None
    assert parse_sse_event_line("data:") is None


def test_token_usage_merge_sums_stream_events() -> None:
    payload: dict[str, JsonValue] = {
        "input_tokens": 10,
        "cached_input_tokens": 2,
        "output_tokens": 5,
        "total_tokens": 17,
        "requests": 1,
        "tool_calls": 3,
    }

    merged = RelayTokenUsage(input_tokens=20, output_tokens=1).merge_payload(payload)

    assert merged.input_tokens == 30
    assert merged.cached_input_tokens == 2
    assert merged.output_tokens == 6
    assert merged.total_tokens == 17
    assert merged.tool_calls == 3


def test_client_config_reads_host_header_from_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RELAY_TEAMS_BENCH_HOST_HEADER", "127.0.0.1:8000")

    client = RelayTeamsHttpClient.from_env()

    assert client._config.host_header == "127.0.0.1:8000"


def test_pick_workspace_accepts_nested_workspace_response() -> None:
    class FakeResponse:
        def raise_for_status(self) -> None:
            return

        def json(self) -> dict[str, object]:
            return {"workspace": {"workspace_id": "default"}}

    class FakeClient:
        def post(self, endpoint: str, *, json: dict[str, str]) -> FakeResponse:
            assert endpoint == "/api/workspaces/pick"
            assert json["root_path"] == "/tmp/project"
            return FakeResponse()

    client = RelayTeamsHttpClient(
        RelayTeamsClientConfig(workspace_path=Path("/tmp/project"))
    )

    assert client._pick_workspace(cast(httpx.Client, FakeClient())) == "default"


def test_configure_session_forces_normal_topology_without_root_role() -> None:
    class FakeResponse:
        def raise_for_status(self) -> None:
            return

    class FakeClient:
        def __init__(self) -> None:
            self.patch_payloads: list[dict[str, object]] = []

        def patch(self, endpoint: str, *, json: dict[str, object]) -> FakeResponse:
            assert endpoint == "/api/sessions/session-1/topology"
            self.patch_payloads.append(json)
            return FakeResponse()

    http_client = RelayTeamsHttpClient(
        RelayTeamsClientConfig(session_mode=SessionMode.NORMAL)
    )
    fake_client = FakeClient()

    http_client._configure_session(cast(httpx.Client, fake_client), "session-1")

    assert fake_client.patch_payloads == [{"session_mode": "normal"}]
