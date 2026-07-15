from __future__ import annotations

import httpx
from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
)

from integration_tests.support.api_helpers import create_session, new_session_id
from integration_tests.support.environment import IntegrationEnvironment
from relay_teams.agents.execution.message_repository import MessageRepository


def test_agent_message_endpoint_filters_reused_instance_by_task(
    api_client: httpx.Client,
    integration_env: IntegrationEnvironment,
) -> None:
    session_id = create_session(
        api_client,
        session_id=new_session_id("session-agent-task-scope"),
    )
    instance_id = "shared-orchestration-instance"
    message_repo = MessageRepository(integration_env.config_dir / "relay_teams.db")
    for task_id, prompt in (
        ("task-child-1", "First child task prompt."),
        ("task-child-2", "Second child task prompt."),
    ):
        message_repo.append(
            session_id=session_id,
            workspace_id="default",
            instance_id=instance_id,
            task_id=task_id,
            trace_id="orchestration-run-1",
            messages=[ModelRequest(parts=[UserPromptPart(content=prompt)])],
        )

    response = api_client.get(
        f"/api/sessions/{session_id}/agents/{instance_id}/messages",
        params={"task_id": "task-child-2"},
    )

    response.raise_for_status()
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["task_id"] == "task-child-2"
    assert payload[0]["message"]["parts"][0]["content"] == ("Second child task prompt.")


def test_message_endpoints_project_registry_owned_tool_semantics(
    api_client: httpx.Client,
    integration_env: IntegrationEnvironment,
) -> None:
    session_id = create_session(
        api_client,
        session_id=new_session_id("session-tool-semantics"),
    )
    instance_id = "orchestration-instance"
    message_repo = MessageRepository(integration_env.config_dir / "relay_teams.db")
    message_repo.append(
        session_id=session_id,
        workspace_id="default",
        instance_id=instance_id,
        task_id="task-child-1",
        trace_id="orchestration-run-1",
        messages=[
            ModelResponse(
                parts=[
                    ToolCallPart(
                        tool_name="orch_dispatch_task",
                        args={"task_id": "task-child-1"},
                        tool_call_id="call-dispatch-1",
                    )
                ]
            ),
            ModelRequest(
                parts=[
                    ToolReturnPart(
                        tool_name="orch_dispatch_task",
                        tool_call_id="call-dispatch-1",
                        content={"status": "assigned"},
                    )
                ]
            ),
            ModelResponse(
                parts=[
                    ToolCallPart(
                        tool_name="tool_without_declared_semantics",
                        args={},
                        tool_call_id="call-unknown-1",
                    )
                ]
            ),
        ],
    )

    for endpoint in (
        f"/api/sessions/{session_id}/messages",
        f"/api/sessions/{session_id}/agents/{instance_id}/messages",
    ):
        response = api_client.get(endpoint)
        response.raise_for_status()
        parts = [
            part
            for entry in response.json()
            for part in entry["message"]["parts"]
            if part.get("tool_name")
        ]
        assert parts[0]["semantic_category"] == "orchestration"
        assert parts[0]["action_family"] == "subagent"
        assert parts[1]["semantic_category"] == "orchestration"
        assert parts[1]["action_family"] == "subagent"
        assert parts[2]["semantic_category"] == "unknown"
        assert parts[2]["action_family"] == "generic"
