from __future__ import annotations

import json
import time

import httpx

from integration_tests.support.api_helpers import create_session, new_session_id


_TERMINAL_RELAY_EVENT_TYPES = {"run_completed", "run_failed", "run_stopped"}
_STREAM_TIMEOUT_SECONDS = 40.0


def test_ag_ui_run_stream_replays_from_last_event_id(
    api_client: httpx.Client,
) -> None:
    session_id = create_session(
        api_client,
        session_id=new_session_id("session-ag-ui-replay"),
    )
    run_id = _create_ag_ui_run(
        api_client,
        session_id=session_id,
        prompt="请初始化一个人工编排流程",
    )

    live_events = _stream_ag_ui_run_until_terminal(api_client, run_id=run_id)
    live_event_ids = [_event_id(event) for event in live_events]
    live_relay_types = [_relay_event_type(event) for event in live_events]
    first_event_id = live_event_ids[0]

    assert live_relay_types[0] == "run_started"
    assert "awaiting_manual_action" in live_relay_types
    assert live_relay_types[-1] == "run_completed"
    assert live_event_ids == sorted(live_event_ids)
    assert first_event_id > 0

    replayed_events = _stream_ag_ui_run_until_terminal(
        api_client,
        run_id=run_id,
        headers={"Last-Event-ID": str(first_event_id)},
    )
    replayed_event_ids = [_event_id(event) for event in replayed_events]

    assert replayed_event_ids == live_event_ids[1:]
    assert all(event_id > first_event_id for event_id in replayed_event_ids)
    assert [_relay_event_type(event) for event in replayed_events] == live_relay_types[
        1:
    ]


def test_ag_ui_multiplex_stream_replays_each_run_from_its_offset(
    api_client: httpx.Client,
) -> None:
    session_id = create_session(
        api_client,
        session_id=new_session_id("session-ag-ui-multiplex-replay"),
    )
    run_a_id = _create_ag_ui_run(
        api_client,
        session_id=session_id,
        prompt="请初始化第一个人工编排流程",
    )
    run_a_events = _stream_ag_ui_run_until_terminal(api_client, run_id=run_a_id)
    run_b_id = _create_ag_ui_run(
        api_client,
        session_id=session_id,
        prompt="请初始化第二个人工编排流程",
    )
    run_b_events = _stream_ag_ui_run_until_terminal(api_client, run_id=run_b_id)

    run_a_event_ids = [_event_id(event) for event in run_a_events]
    run_b_event_ids = [_event_id(event) for event in run_b_events]
    run_a_replay_offset = run_a_event_ids[0]
    multiplexed_events = _stream_ag_ui_multiplex_until_closed(
        api_client,
        run_offsets=((run_a_id, run_a_replay_offset), (run_b_id, 0)),
    )

    replayed_by_run_id = _events_by_run_id(multiplexed_events)

    assert [_event_id(event) for event in replayed_by_run_id[run_a_id]] == (
        run_a_event_ids[1:]
    )
    assert [_event_id(event) for event in replayed_by_run_id[run_b_id]] == (
        run_b_event_ids
    )
    assert [_relay_event_type(event) for event in replayed_by_run_id[run_a_id]] == [
        _relay_event_type(event) for event in run_a_events[1:]
    ]
    assert [_relay_event_type(event) for event in replayed_by_run_id[run_b_id]] == [
        _relay_event_type(event) for event in run_b_events
    ]


def _create_ag_ui_run(
    client: httpx.Client,
    *,
    session_id: str,
    prompt: str,
) -> str:
    response = client.post(
        "/api/ag-ui/runs",
        json={
            "execution_mode": "manual",
            "input": [{"kind": "text", "text": prompt}],
            "session_id": session_id,
        },
    )
    response.raise_for_status()
    body = response.json()
    run_id = body.get("run_id")
    if not isinstance(run_id, str) or not run_id.strip():
        raise AssertionError(f"Invalid AG-UI run creation response: {body}")
    return run_id


def _stream_ag_ui_run_until_terminal(
    client: httpx.Client,
    *,
    run_id: str,
    headers: dict[str, str] | None = None,
) -> list[dict[str, object]]:
    events: list[dict[str, object]] = []
    deadline = time.monotonic() + _STREAM_TIMEOUT_SECONDS
    stream_timeout = httpx.Timeout(
        _STREAM_TIMEOUT_SECONDS,
        connect=5.0,
        read=_STREAM_TIMEOUT_SECONDS,
        write=5.0,
        pool=5.0,
    )
    try:
        with client.stream(
            "GET",
            f"/api/ag-ui/runs/{run_id}/events",
            headers=headers,
            timeout=stream_timeout,
        ) as response:
            response.raise_for_status()
            assert response.headers["content-type"].startswith("text/event-stream")
            current_event_name: str | None = None
            for raw_line in response.iter_lines():
                if time.monotonic() > deadline:
                    raise AssertionError(
                        "Timed out waiting for terminal AG-UI event for "
                        f"run_id={run_id}; received {len(events)} events",
                    )
                line = raw_line.strip()
                if line.startswith("event:"):
                    current_event_name = line[6:].strip()
                    continue
                if not line.startswith("data:"):
                    continue
                event = _parse_ag_ui_sse_data(line[5:].strip())
                if current_event_name is not None:
                    assert event.get("type") == current_event_name
                current_event_name = None
                events.append(event)
                if _relay_event_type(event) in _TERMINAL_RELAY_EVENT_TYPES:
                    return events
    except httpx.TimeoutException as exc:
        raise AssertionError(
            "Timed out waiting for terminal AG-UI event for "
            f"run_id={run_id}; received {len(events)} events",
        ) from exc
    raise AssertionError(f"AG-UI stream ended without terminal event for {run_id}")


def _stream_ag_ui_multiplex_until_closed(
    client: httpx.Client,
    *,
    run_offsets: tuple[tuple[str, int], ...],
) -> list[dict[str, object]]:
    events: list[dict[str, object]] = []
    terminal_run_ids: set[str] = set()
    expected_run_ids = {run_id for run_id, _after_event_id in run_offsets}
    deadline = time.monotonic() + _STREAM_TIMEOUT_SECONDS
    stream_timeout = httpx.Timeout(
        _STREAM_TIMEOUT_SECONDS,
        connect=5.0,
        read=_STREAM_TIMEOUT_SECONDS,
        write=5.0,
        pool=5.0,
    )
    params: dict[str, list[str]] = {"after_event_id": [], "run_id": []}
    for run_id, after_event_id in run_offsets:
        params["run_id"].append(run_id)
        params["after_event_id"].append(str(after_event_id))
    try:
        with client.stream(
            "GET",
            "/api/ag-ui/runs/events",
            params=params,
            timeout=stream_timeout,
        ) as response:
            response.raise_for_status()
            assert response.headers["content-type"].startswith("text/event-stream")
            current_event_name: str | None = None
            for raw_line in response.iter_lines():
                if time.monotonic() > deadline:
                    raise AssertionError(
                        "Timed out waiting for multiplex AG-UI replay; received "
                        f"{len(events)} events",
                    )
                line = raw_line.strip()
                if line.startswith("event:"):
                    current_event_name = line[6:].strip()
                    continue
                if not line.startswith("data:"):
                    continue
                event = _parse_ag_ui_sse_data(line[5:].strip())
                if current_event_name is not None:
                    assert event.get("type") == current_event_name
                current_event_name = None
                events.append(event)
                run_id = _run_id(event)
                if _relay_event_type(event) in _TERMINAL_RELAY_EVENT_TYPES:
                    terminal_run_ids.add(run_id)
                if expected_run_ids <= terminal_run_ids:
                    return events
    except httpx.TimeoutException as exc:
        raise AssertionError(
            "Timed out waiting for multiplex AG-UI replay; received "
            f"{len(events)} events",
        ) from exc
    if expected_run_ids <= terminal_run_ids:
        return events
    raise AssertionError(
        "AG-UI multiplex stream ended before all runs reached terminal state: "
        f"expected={sorted(expected_run_ids)}, terminal={sorted(terminal_run_ids)}",
    )


def _parse_ag_ui_sse_data(raw_payload: str) -> dict[str, object]:
    payload = json.loads(raw_payload)
    if not isinstance(payload, dict):
        raise AssertionError(f"Invalid AG-UI SSE payload: {payload}")
    if "error" in payload:
        raise AssertionError(f"AG-UI stream returned error: {payload['error']}")
    return payload


def _event_id(event: dict[str, object]) -> int:
    event_id = event.get("event_id")
    if not isinstance(event_id, int):
        raise AssertionError(f"AG-UI event is missing an integer event_id: {event}")
    return event_id


def _run_id(event: dict[str, object]) -> str:
    run_id = event.get("run_id")
    if not isinstance(run_id, str) or not run_id:
        raise AssertionError(f"AG-UI event is missing run_id: {event}")
    return run_id


def _relay_event_type(event: dict[str, object]) -> str:
    relay_event_type = event.get("relay_event_type")
    if not isinstance(relay_event_type, str) or not relay_event_type:
        raise AssertionError(f"AG-UI event is missing relay_event_type: {event}")
    return relay_event_type


def _events_by_run_id(
    events: list[dict[str, object]],
) -> dict[str, list[dict[str, object]]]:
    by_run_id: dict[str, list[dict[str, object]]] = {}
    for event in events:
        by_run_id.setdefault(_run_id(event), []).append(event)
    return by_run_id
