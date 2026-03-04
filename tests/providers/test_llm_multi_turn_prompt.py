from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import cast

import pytest
from pydantic_ai.messages import ModelRequest, UserPromptPart

import agent_teams.providers.llm as llm_module
from agent_teams.coordination.task_execution_service import TaskExecutionService
from agent_teams.core.models import ModelEndpointConfig
from agent_teams.mcp.registry import McpRegistry
from agent_teams.providers.llm import LLMRequest, OpenAICompatibleProvider
from agent_teams.roles.registry import RoleRegistry
from agent_teams.runtime.injection_manager import RunInjectionManager
from agent_teams.runtime.run_control_manager import RunControlManager
from agent_teams.runtime.run_event_hub import RunEventHub
from agent_teams.runtime.tool_approval_manager import ToolApprovalManager
from agent_teams.skills.registry import SkillRegistry
from agent_teams.state.agent_repo import AgentInstanceRepository
from agent_teams.state.message_repo import MessageRepository
from agent_teams.tools.policy import ToolApprovalPolicy
from agent_teams.tools.registry import ToolRegistry


class _FakeRunEventHub:
    def __init__(self) -> None:
        self.events: list[object] = []

    def publish(self, event: object) -> None:
        self.events.append(event)


class _FakeControlContext:
    def raise_if_cancelled(self) -> None:
        return


class _FakeRunControlManager:
    def context(self, *, run_id: str, instance_id: str | None = None) -> _FakeControlContext:
        _ = (run_id, instance_id)
        return _FakeControlContext()


class _FakeInjectionManager:
    def drain_at_boundary(self, run_id: str, instance_id: str) -> list[object]:
        _ = (run_id, instance_id)
        return []


class _FakeMessageRepo:
    def __init__(self) -> None:
        self.history = [ModelRequest(parts=[UserPromptPart(content="previous turn")])]

    def get_history(self, instance_id: str) -> list[ModelRequest]:
        _ = instance_id
        return list(self.history)

    def append(self, **kwargs: object) -> None:
        _ = kwargs


class _FakeResult:
    def __init__(self) -> None:
        self.response = "ok"

    def new_messages(self) -> list[object]:
        return []

    def usage(self) -> SimpleNamespace:
        return SimpleNamespace(
            input_tokens=0,
            output_tokens=0,
            total_tokens=0,
            requests=1,
            tool_calls=0,
        )


class _FakeAgentRun:
    def __init__(self) -> None:
        self.result = _FakeResult()

    async def __aenter__(self) -> _FakeAgentRun:
        return self

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        _ = (exc_type, exc, tb)
        return False

    def __aiter__(self) -> _FakeAgentRun:
        return self

    async def __anext__(self):
        raise StopAsyncIteration

    def new_messages(self) -> list[object]:
        return []


class _FakeAgent:
    def __init__(self) -> None:
        self.prompts: list[str | None] = []

    def iter(self, prompt: str | None, *, deps: object, message_history: object) -> _FakeAgentRun:
        _ = (deps, message_history)
        self.prompts.append(prompt)
        return _FakeAgentRun()


def _build_provider(message_repo: _FakeMessageRepo, hub: _FakeRunEventHub) -> OpenAICompatibleProvider:
    config = ModelEndpointConfig(
        model="gpt-test",
        base_url="http://localhost",
        api_key="test-key",
    )
    return OpenAICompatibleProvider(
        config,
        task_repo=None,
        instance_pool=None,
        shared_store=None,
        event_bus=None,
        injection_manager=cast(RunInjectionManager, cast(object, _FakeInjectionManager())),
        run_event_hub=cast(RunEventHub, cast(object, hub)),
        agent_repo=cast(AgentInstanceRepository, object()),
        workspace_root=Path("."),
        tool_registry=cast(ToolRegistry, object()),
        mcp_registry=cast(McpRegistry, object()),
        skill_registry=cast(SkillRegistry, object()),
        allowed_tools=(),
        allowed_mcp_servers=(),
        allowed_skills=(),
        message_repo=cast(MessageRepository, cast(object, message_repo)),
        role_registry=cast(RoleRegistry, object()),
        task_execution_service=cast(TaskExecutionService, object()),
        run_control_manager=cast(
            RunControlManager,
            cast(object, _FakeRunControlManager()),
        ),
        tool_approval_manager=cast(ToolApprovalManager, object()),
        tool_approval_policy=cast(ToolApprovalPolicy, object()),
    )


@pytest.mark.asyncio
async def test_generate_passes_current_turn_prompt_even_with_existing_history(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_agent = _FakeAgent()
    fake_message_repo = _FakeMessageRepo()
    fake_hub = _FakeRunEventHub()
    provider = _build_provider(fake_message_repo, fake_hub)

    monkeypatch.setattr(
        llm_module,
        "build_collaboration_agent",
        lambda **kwargs: fake_agent,
    )

    request = LLMRequest(
        run_id="run-2",
        trace_id="run-2",
        task_id="task-2",
        session_id="session-2",
        instance_id="inst-2",
        role_id="coordinator_agent",
        system_prompt="system",
        user_prompt="current turn",
    )

    _ = await provider.generate(request)

    assert fake_agent.prompts == ["current turn"]
