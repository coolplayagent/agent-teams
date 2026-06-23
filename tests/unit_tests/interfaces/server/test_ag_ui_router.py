from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import JsonValue

from relay_teams.general import GeneralConfig
from relay_teams.interfaces.server.deps import (
    get_general_config_service,
    get_run_service,
    get_session_service,
    get_skill_registry,
)
from relay_teams.interfaces.server.routers import ag_ui
from relay_teams.sessions.runs.enums import (
    InjectionDeliveryMode,
    InjectionSource,
    RunEventType,
)
from relay_teams.sessions.runs.run_models import IntentInput, RunEvent
from relay_teams.sessions.runs.user_question_models import (
    UserQuestionAnswerSubmission,
)


class _InjectedRecord:
    def __init__(self, *, run_id: str, content: str) -> None:
        self.run_id = run_id
        self.content = content

    def model_dump(self, *, mode: str = "python") -> dict[str, JsonValue]:
        _ = mode
        return {"run_id": self.run_id, "content": self.content}


class _FakeRunService:
    def __init__(self) -> None:
        self.created_inputs: list[IntentInput] = []
        self.scheduled_runs: list[tuple[str, str]] = []
        self.single_stream_calls: list[tuple[str, int]] = []
        self.multiplex_stream_calls: list[tuple[tuple[str, int], ...]] = []
        self.stopped_runs: list[str] = []
        self.resumed_runs: list[str] = []
        self.started_runs: list[str] = []
        self.inject_calls: list[tuple[str, str, str, str, str | None]] = []
        self.approvals: list[tuple[str, str, str, str, str]] = []
        self.answers: list[tuple[str, str, UserQuestionAnswerSubmission]] = []

    async def create_run_async(self, intent_input: IntentInput) -> tuple[str, str]:
        self.created_inputs.append(intent_input)
        return ("run-1", intent_input.session_id)

    def schedule_run_start(self, run_id: str, session_id: str) -> None:
        self.scheduled_runs.append((run_id, session_id))

    async def stream_run_events(
        self,
        run_id: str,
        after_event_id: int = 0,
    ) -> AsyncIterator[RunEvent]:
        self.single_stream_calls.append((run_id, after_event_id))
        yield RunEvent(
            session_id="session-1",
            run_id=run_id,
            trace_id=run_id,
            event_type=RunEventType.TEXT_DELTA,
            payload_json='{"text":"hello"}',
            event_id=after_event_id + 1,
        )

    async def stream_multiplexed_run_events(
        self,
        run_offsets: tuple[tuple[str, int], ...],
    ) -> AsyncIterator[RunEvent]:
        self.multiplex_stream_calls.append(run_offsets)
        for run_id, after_event_id in run_offsets:
            yield RunEvent(
                session_id=f"session-{run_id}",
                run_id=run_id,
                trace_id=run_id,
                event_type=RunEventType.RUN_COMPLETED,
                payload_json='{"status":"completed"}',
                event_id=after_event_id + 1,
            )

    async def stop_run_async(self, run_id: str) -> None:
        self.stopped_runs.append(run_id)

    async def stop_subagent_async(
        self,
        run_id: str,
        instance_id: str,
    ) -> dict[str, JsonValue]:
        return {"run_id": run_id, "instance_id": instance_id}

    async def resume_run_async(self, run_id: str) -> str:
        self.resumed_runs.append(run_id)
        return "session-1"

    async def ensure_run_started_async(self, run_id: str) -> None:
        self.started_runs.append(run_id)

    async def inject_message_async(
        self,
        *,
        run_id: str,
        source: InjectionSource,
        content: str,
        delivery_mode: InjectionDeliveryMode,
        client_message_id: str | None = None,
    ) -> _InjectedRecord:
        self.inject_calls.append(
            (run_id, source.value, content, delivery_mode.value, client_message_id)
        )
        return _InjectedRecord(run_id=run_id, content=content)

    async def resolve_tool_approval_async(
        self,
        *,
        run_id: str,
        tool_call_id: str,
        action: str,
        feedback: str = "",
        option_id: str = "",
    ) -> None:
        self.approvals.append((run_id, tool_call_id, action, feedback, option_id))

    async def answer_user_question_async(
        self,
        *,
        run_id: str,
        question_id: str,
        answers: UserQuestionAnswerSubmission,
    ) -> dict[str, JsonValue]:
        self.answers.append((run_id, question_id, answers))
        return {
            "status": "ok",
            "run_id": run_id,
            "question_id": question_id,
            "answer_count": len(answers.answers),
        }


class _FakeSessionService:
    def __init__(self) -> None:
        self.force_refresh_calls: list[bool] = []

    async def get_recovery_snapshot_async(
        self,
        session_id: str,
        *,
        force_refresh: bool = False,
    ) -> dict[str, JsonValue]:
        self.force_refresh_calls.append(force_refresh)
        return {"session_id": session_id, "runs": []}

    async def get_session_messages_async(
        self,
        session_id: str,
    ) -> list[dict[str, JsonValue]]:
        return [{"session_id": session_id, "message": "hello"}]

    async def get_global_events_async(
        self,
        session_id: str,
    ) -> list[dict[str, JsonValue]]:
        return [{"session_id": session_id, "event": "created"}]


class _FakeSkillRegistry:
    def __init__(self) -> None:
        self.resolve_calls: list[tuple[tuple[str, ...], bool, str | None]] = []

    def resolve_known(
        self,
        skill_names: tuple[str, ...],
        *,
        strict: bool = True,
        consumer: str | None = None,
        expand_wildcards: bool = True,
    ) -> tuple[str, ...]:
        _ = expand_wildcards
        self.resolve_calls.append((skill_names, strict, consumer))
        if "missing" in skill_names:
            raise ValueError("Unknown skills: ['missing']")
        return skill_names


class _FakeGeneralConfigService:
    def __init__(self, *, shell_safety_policy_enabled: bool = True) -> None:
        self.config = GeneralConfig(
            shell_safety_policy_enabled=shell_safety_policy_enabled
        )

    def get_config(self) -> GeneralConfig:
        return self.config


def _create_client(
    run_service: _FakeRunService | None = None,
    session_service: _FakeSessionService | None = None,
) -> tuple[TestClient, _FakeRunService, _FakeSessionService]:
    resolved_run_service = run_service or _FakeRunService()
    resolved_session_service = session_service or _FakeSessionService()
    app = FastAPI()
    app.include_router(ag_ui.router, prefix="/api")
    app.dependency_overrides[get_run_service] = lambda: resolved_run_service
    app.dependency_overrides[get_session_service] = lambda: resolved_session_service
    app.dependency_overrides[get_skill_registry] = lambda: _FakeSkillRegistry()
    app.dependency_overrides[get_general_config_service] = lambda: (
        _FakeGeneralConfigService()
    )
    return TestClient(app), resolved_run_service, resolved_session_service


def test_ag_ui_router_registers_foundation_routes() -> None:
    route_paths = {
        route_path
        for route in ag_ui.router.routes
        if isinstance((route_path := getattr(route, "path", "")), str)
    }

    assert "/ag-ui/runs" in route_paths
    assert "/ag-ui/runs/{run_id}/events" in route_paths
    assert "/ag-ui/runs/events" in route_paths
    assert "/ag-ui/sessions/{session_id}/snapshot" in route_paths
    assert "/ag-ui/runs/{run_id}:stop" in route_paths
    assert "/ag-ui/runs/{run_id}:resume" in route_paths
    assert "/ag-ui/runs/{run_id}/inject" in route_paths
    assert "/ag-ui/runs/{run_id}/tool-approvals/{tool_call_id}:resolve" in (route_paths)
    assert "/ag-ui/runs/{run_id}/questions/{question_id}:answer" in route_paths


def test_create_run_route_uses_session_run_service() -> None:
    client, run_service, _session_service = _create_client()

    response = client.post(
        "/api/ag-ui/runs",
        json={
            "session_id": "session-1",
            "input": [{"kind": "text", "text": "hello"}],
            "target_role_id": "writer",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "run_id": "run-1",
        "session_id": "session-1",
        "target_role_id": "writer",
    }
    assert run_service.created_inputs[0].intent == "hello"
    assert run_service.created_inputs[0].target_role_id == "writer"
    assert run_service.scheduled_runs == [("run-1", "session-1")]


def test_single_run_stream_formats_ag_ui_sse_and_uses_last_event_id() -> None:
    client, run_service, _session_service = _create_client()

    response = client.get(
        "/api/ag-ui/runs/run-1/events",
        headers={"Last-Event-ID": "41"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert run_service.single_stream_calls == [("run-1", 41)]
    assert "id: 42\n" in response.text
    assert "event: message.text.delta\n" in response.text
    assert '"type":"message.text.delta"' in response.text
    assert '"payload":{"text":"hello"}' in response.text


def test_single_run_stream_query_offset_overrides_last_event_id() -> None:
    client, run_service, _session_service = _create_client()

    response = client.get(
        "/api/ag-ui/runs/run-1/events?after_event_id=4",
        headers={"Last-Event-ID": "41"},
    )

    assert response.status_code == 200
    assert run_service.single_stream_calls == [("run-1", 4)]
    assert "id: 5\n" in response.text


def test_multiplex_stream_formats_events_and_uses_last_event_id_default() -> None:
    client, run_service, _session_service = _create_client()

    response = client.get(
        "/api/ag-ui/runs/events?run_id=run-1&run_id=run-2&after_event_id=7",
        headers={"Last-Event-ID": "11"},
    )

    assert response.status_code == 200
    assert run_service.multiplex_stream_calls == [(("run-1", 7), ("run-2", 11))]
    assert "event: run.completed\n" in response.text
    assert '"run_id":"run-1"' in response.text
    assert '"event_id":8' in response.text
    assert '"run_id":"run-2"' in response.text
    assert '"event_id":12' in response.text


def test_session_snapshot_uses_session_service_runtime_reads() -> None:
    client, _run_service, session_service = _create_client()

    response = client.get("/api/ag-ui/sessions/session-1/snapshot?force_refresh=true")

    assert response.status_code == 200
    assert response.json() == {
        "session_id": "session-1",
        "recovery": {"session_id": "session-1", "runs": []},
        "messages": [{"session_id": "session-1", "message": "hello"}],
        "global_events": [{"session_id": "session-1", "event": "created"}],
    }
    assert session_service.force_refresh_calls == [True]


def test_action_routes_delegate_to_run_service() -> None:
    client, run_service, _session_service = _create_client()

    responses = [
        client.post("/api/ag-ui/runs/run-1:stop", json={}),
        client.post("/api/ag-ui/runs/run-1:resume"),
        client.post(
            "/api/ag-ui/runs/run-1/inject",
            json={"content": "look here", "mode": "interrupt"},
        ),
        client.post(
            "/api/ag-ui/runs/run-1/tool-approvals/call-1:resolve",
            json={"action": "approve", "feedback": "ok"},
        ),
        client.post(
            "/api/ag-ui/runs/run-1/questions/question-1:answer",
            json={"answers": [{"selections": [{"label": "A"}]}]},
        ),
    ]

    assert [response.status_code for response in responses] == [200, 200, 200, 200, 200]
    assert run_service.stopped_runs == ["run-1"]
    assert run_service.resumed_runs == ["run-1"]
    assert run_service.started_runs == ["run-1"]
    assert run_service.inject_calls == [
        ("run-1", "user", "look here", "interrupt", None)
    ]
    assert run_service.approvals == [("run-1", "call-1", "approve", "ok", "")]
    assert len(run_service.answers) == 1
    assert run_service.answers[0][2].answers[0].selections[0].label == "A"
