from __future__ import annotations

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

from pydantic_ai import Agent
from pydantic_ai.messages import ModelRequest, UserPromptPart

from agent_teams.acp.session_client import SessionHandle, SessionInitSpec, TurnInput, TurnOutput
from agent_teams.acp.session_pool import AcpSessionPool
from agent_teams.core.enums import RunEventType, TaskStatus
from agent_teams.core.models import RunEvent
from agent_teams.interfaces.sdk.client import AgentTeamsApp
from agent_teams.providers.acp_provider import AcpSessionProvider
from agent_teams.providers.llm import LLMRequest
from agent_teams.roles.registry import RoleLoader
from agent_teams.runtime.run_event_hub import RunEventHub
from agent_teams.state.agent_repo import AgentInstanceRepository
from agent_teams.state.event_log import EventLog
from agent_teams.state.message_repo import MessageRepository
from agent_teams.state.shared_store import SharedStore
from agent_teams.state.task_repo import TaskRepository
from agent_teams.tools.create_workflow_graph.mount import TaskSpecModel, mount
from agent_teams.tools.runtime import ToolDeps
from agent_teams.workflow.runtime_graph import load_graph


class _FakeSessionClient:
    async def open(self, spec: SessionInitSpec) -> SessionHandle:
        return SessionHandle(session_id="remote-session", instance_id=spec.instance_id)

    async def run_turn(self, handle: SessionHandle, turn: TurnInput) -> TurnOutput:
        return TurnOutput(text=f"reply:{turn.user_prompt}", tool_calls=(), tool_results=())

    async def close(self, handle: SessionHandle) -> None:
        return None


def _build_tool_deps(db_path: Path, task_id: str, trace_id: str, session_id: str) -> ToolDeps:
    role_registry = RoleLoader().load_all(Path(".agent_teams/roles"))
    return ToolDeps(
        task_repo=TaskRepository(db_path),
        instance_pool=None,  # unused by create_workflow_graph
        shared_store=SharedStore(db_path),
        event_bus=EventLog(db_path),
        injection_manager=None,  # unused by create_workflow_graph
        run_event_hub=RunEventHub(event_log=None),
        agent_repo=AgentInstanceRepository(db_path),
        workspace_root=Path.cwd(),
        run_id=trace_id,
        trace_id=trace_id,
        task_id=task_id,
        session_id=session_id,
        instance_id="inst-coordinator",
        role_id="coordinator_agent",
        role_registry=role_registry,
        task_execution_service=None,  # unused by create_workflow_graph
    )


def test_create_workflow_graph_recreates_when_existing_not_dispatched(tmp_path: Path) -> None:
    db_path = tmp_path / "state.db"
    deps = _build_tool_deps(
        db_path=db_path,
        task_id="root-task",
        trace_id="trace-1",
        session_id="session-1",
    )

    agent = Agent("test")
    mount(agent)
    tool_fn = agent._function_toolset.tools["create_workflow_graph"].function
    ctx = SimpleNamespace(deps=deps)

    async def _run() -> tuple[dict[str, object], dict[str, object]]:
        first = await tool_fn(
            ctx,
            objective="first objective",
            workflow_type="custom",
            tasks=[
                TaskSpecModel(
                    task_name="first_task",
                    objective="first sub task",
                    role_id="time",
                    depends_on=[],
                )
            ],
        )
        second = await tool_fn(
            ctx,
            objective="second objective",
            workflow_type="custom",
            tasks=[
                TaskSpecModel(
                    task_name="second_task",
                    objective="second sub task",
                    role_id="time",
                    depends_on=[],
                )
            ],
        )
        return json.loads(first), json.loads(second)

    first_data, second_data = asyncio.run(_run())
    assert first_data["created"] is True
    assert first_data["replaced_existing"] is False
    assert second_data["created"] is True
    assert second_data["replaced_existing"] is True

    graph = load_graph(deps.shared_store, task_id="root-task")
    assert isinstance(graph, dict)
    assert "second_task" in graph["tasks"]
    assert "first_task" not in graph["tasks"]

    records = deps.task_repo.list_by_trace("trace-1")
    assert len(records) == 1
    assert records[0].envelope.objective == "second sub task"


def test_create_workflow_graph_blocks_recreate_after_dispatch_started(tmp_path: Path) -> None:
    db_path = tmp_path / "state.db"
    deps = _build_tool_deps(
        db_path=db_path,
        task_id="root-task",
        trace_id="trace-1",
        session_id="session-1",
    )

    agent = Agent("test")
    mount(agent)
    tool_fn = agent._function_toolset.tools["create_workflow_graph"].function
    ctx = SimpleNamespace(deps=deps)

    async def _run() -> tuple[dict[str, object], dict[str, object]]:
        first = await tool_fn(
            ctx,
            objective="initial objective",
            workflow_type="custom",
            tasks=[
                TaskSpecModel(
                    task_name="task_a",
                    objective="task a",
                    role_id="time",
                    depends_on=[],
                )
            ],
        )
        graph = load_graph(deps.shared_store, task_id="root-task")
        task_id = str(graph["tasks"]["task_a"]["task_id"])
        deps.task_repo.update_status(task_id=task_id, status=TaskStatus.ASSIGNED)

        second = await tool_fn(
            ctx,
            objective="new objective",
            workflow_type="custom",
            tasks=[
                TaskSpecModel(
                    task_name="task_b",
                    objective="task b",
                    role_id="time",
                    depends_on=[],
                )
            ],
        )
        return json.loads(first), json.loads(second)

    first_data, second_data = asyncio.run(_run())
    assert first_data["created"] is True
    assert second_data["created"] is False
    assert "has started execution" in str(second_data["message"])


def test_get_session_rounds_uses_run_id_and_splits_rounds(tmp_path: Path) -> None:
    db_path = tmp_path / "state.db"
    event_log = EventLog(db_path)
    message_repo = MessageRepository(db_path)
    agent_repo = AgentInstanceRepository(db_path)
    task_repo = TaskRepository(db_path)
    shared_store = SharedStore(db_path)

    event_log.emit_run_event(
        RunEvent(
            session_id="s1",
            run_id="run-A",
            trace_id="shared-trace",
            task_id="t1",
            instance_id="inst-coord",
            role_id="coordinator_agent",
            event_type=RunEventType.MODEL_STEP_STARTED,
            payload_json=json.dumps(
                {"instance_id": "inst-coord", "role_id": "coordinator_agent"}
            ),
        )
    )
    event_log.emit_run_event(
        RunEvent(
            session_id="s1",
            run_id="run-B",
            trace_id="shared-trace",
            task_id="t2",
            instance_id="inst-coord",
            role_id="coordinator_agent",
            event_type=RunEventType.MODEL_STEP_STARTED,
            payload_json=json.dumps(
                {"instance_id": "inst-coord", "role_id": "coordinator_agent"}
            ),
        )
    )

    message_repo.append(
        session_id="s1",
        run_id="run-A",
        instance_id="inst-coord",
        task_id="t1",
        trace_id="shared-trace",
        role_id="coordinator_agent",
        messages=[ModelRequest(parts=[UserPromptPart(content="intent A")])],
    )
    message_repo.append(
        session_id="s1",
        run_id="run-B",
        instance_id="inst-coord",
        task_id="t2",
        trace_id="shared-trace",
        role_id="coordinator_agent",
        messages=[ModelRequest(parts=[UserPromptPart(content="intent B")])],
    )

    app = object.__new__(AgentTeamsApp)
    app._event_log = event_log
    app._message_repo = message_repo
    app._agent_repo = agent_repo
    app._task_repo = task_repo
    app._shared_store = shared_store

    rounds = AgentTeamsApp.get_session_rounds(app, "s1")
    assert len(rounds) == 2
    by_run = {row["run_id"]: row for row in rounds}
    assert by_run["run-A"]["intent"] == "intent A"
    assert by_run["run-B"]["intent"] == "intent B"


def test_acp_provider_persists_messages_to_sql(tmp_path: Path) -> None:
    db_path = tmp_path / "state.db"
    event_log = EventLog(db_path)
    message_repo = MessageRepository(db_path)
    provider = AcpSessionProvider(
        session_client=_FakeSessionClient(),
        session_pool=AcpSessionPool(),
        client_id="acp:test",
        tools=(),
        skills=(),
        mcp_servers=(),
        run_event_hub=RunEventHub(event_log=event_log),
        message_repo=message_repo,
    )

    async def _run() -> None:
        await provider.generate(
            LLMRequest(
                run_id="run-subagent",
                trace_id="trace-subagent",
                task_id="task-subagent",
                session_id="session-1",
                instance_id="inst-subagent",
                role_id="time",
                system_prompt="system",
                user_prompt="what time is it",
            )
        )

    asyncio.run(_run())

    rows = message_repo.get_messages_for_instance("session-1", "inst-subagent")
    assert len(rows) == 2
    assert rows[0]["run_id"] == "run-subagent"
    assert rows[0]["role_id"] == "time"
    assert rows[1]["role"] == "assistant"
