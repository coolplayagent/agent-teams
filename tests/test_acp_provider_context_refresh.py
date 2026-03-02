from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path

from agent_teams.acp.local_wrapper_client import LocalWrappedSessionClient
from agent_teams.acp.session_pool import AcpSessionPool
from agent_teams.providers.acp_provider import AcpSessionProvider
from agent_teams.providers.llm import LLMProvider, LLMRequest
from agent_teams.runtime.run_event_hub import RunEventHub
from agent_teams.state.event_log import EventLog
from agent_teams.state.message_repo import MessageRepository


@dataclass
class _CaptureProvider(LLMProvider):
    requests: list[LLMRequest]

    async def generate(self, request: LLMRequest) -> str:
        self.requests.append(request)
        return f"ok:{request.run_id}:{request.task_id}"


def test_local_wrapper_reused_session_refreshes_request_context(tmp_path: Path) -> None:
    db_path = tmp_path / "state.db"
    capture = _CaptureProvider(requests=[])
    provider = AcpSessionProvider(
        session_client=LocalWrappedSessionClient(delegate=capture),
        session_pool=AcpSessionPool(),
        client_id="local_wrapper:coordinator_agent",
        tools=(),
        skills=(),
        mcp_servers=(),
        run_event_hub=RunEventHub(event_log=EventLog(db_path)),
        message_repo=MessageRepository(db_path),
    )

    async def _run() -> None:
        await provider.generate(
            LLMRequest(
                run_id="run-1",
                trace_id="trace-1",
                task_id="task-1",
                session_id="session-1",
                instance_id="inst-1",
                role_id="coordinator_agent",
                system_prompt="system-1",
                user_prompt="first",
            )
        )
        await provider.generate(
            LLMRequest(
                run_id="run-2",
                trace_id="trace-2",
                task_id="task-2",
                session_id="session-1",
                instance_id="inst-1",
                role_id="coordinator_agent",
                system_prompt="system-2",
                user_prompt="second",
            )
        )

    asyncio.run(_run())

    assert len(capture.requests) == 2
    assert capture.requests[0].run_id == "run-1"
    assert capture.requests[0].task_id == "task-1"
    assert capture.requests[1].run_id == "run-2"
    assert capture.requests[1].task_id == "task-2"
