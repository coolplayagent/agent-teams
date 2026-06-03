# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import cast

import pytest

from relay_teams.sessions.runs.run_control_manager import RunControlManager
from relay_teams.sessions.runs.run_event_publisher import RunEventPublisher
from relay_teams.sessions.runs.run_interactions import (
    RunInteractionService,
    _acp_selected_option_metadata_patch,
    _resolve_acp_selected_option_id,
)
from relay_teams.sessions.runs.run_runtime_repo import RunRuntimeRecord
from relay_teams.sessions.runs.user_question_manager import UserQuestionManager
from relay_teams.sessions.runs.user_question_repository import UserQuestionRepository
from relay_teams.tools.runtime.approval_state import ToolApprovalManager
from relay_teams.tools.workspace_tools.shell_approval_repo import (
    ShellApprovalRepository,
)


def test_resolve_acp_selected_option_rejects_option_id_for_local_ticket() -> None:
    with pytest.raises(ValueError, match="only supported for ACP permission tickets"):
        _resolve_acp_selected_option_id(
            ticket=None,
            action="approve",
            option_id="allow",
        )

    assert (
        _resolve_acp_selected_option_id(
            ticket=None,
            action="approve",
            option_id="",
        )
        == ""
    )


def test_acp_selected_option_metadata_patch_normalizes_blank_option_id() -> None:
    assert _acp_selected_option_metadata_patch("  ") is None
    assert _acp_selected_option_metadata_patch(" allow ") == {
        "acp_selected_option_id": "allow"
    }


def test_list_open_tool_approvals_uses_in_memory_manager_without_ticket_repo() -> None:
    tool_approval_manager = ToolApprovalManager()
    tool_approval_manager.open_approval(
        run_id="run-1",
        tool_call_id="call-1",
        instance_id="inst-1",
        role_id="Coordinator",
        tool_name="shell",
        args_preview="pwd",
        risk_level="medium",
    )
    service = _interaction_service_without_ticket_repo(tool_approval_manager)

    assert service.list_open_tool_approvals("run-1") == [
        {
            "tool_call_id": "call-1",
            "instance_id": "inst-1",
            "role_id": "Coordinator",
            "tool_name": "shell",
            "args_preview": "pwd",
            "risk_level": "medium",
        }
    ]


@pytest.mark.asyncio
async def test_list_open_tool_approvals_async_uses_in_memory_manager_without_ticket_repo() -> (
    None
):
    tool_approval_manager = ToolApprovalManager()
    tool_approval_manager.open_approval(
        run_id="run-1",
        tool_call_id="call-1",
        instance_id="inst-1",
        role_id="Coordinator",
        tool_name="shell",
        args_preview="pwd",
    )
    service = _interaction_service_without_ticket_repo(tool_approval_manager)

    assert await service.list_open_tool_approvals_async("run-1") == [
        {
            "tool_call_id": "call-1",
            "instance_id": "inst-1",
            "role_id": "Coordinator",
            "tool_name": "shell",
            "args_preview": "pwd",
            "risk_level": "medium",
        }
    ]


def _interaction_service_without_ticket_repo(
    tool_approval_manager: ToolApprovalManager,
) -> RunInteractionService:
    async def no_runtime_async(_run_id: str) -> RunRuntimeRecord | None:
        return None

    async def false_async(_value: str) -> bool:
        return False

    async def resume_run_async(_run_id: str) -> str:
        return "session-1"

    async def ensure_run_started_async(_run_id: str) -> None:
        return None

    return RunInteractionService(
        run_control_manager=cast(RunControlManager, object()),
        tool_approval_manager=tool_approval_manager,
        get_approval_ticket_repo=lambda: None,
        get_shell_approval_repo=lambda: cast(ShellApprovalRepository | None, None),
        require_user_question_repo=lambda: cast(UserQuestionRepository, object()),
        get_user_question_repo=lambda: cast(UserQuestionRepository | None, None),
        get_user_question_manager=lambda: cast(UserQuestionManager | None, None),
        get_runtime=lambda _run_id: None,
        get_runtime_async=no_runtime_async,
        is_running_run=lambda _run_id: False,
        has_pending_resolvable_question_for_session=lambda _session_id: False,
        has_pending_resolvable_question_for_session_async=false_async,
        has_running_agents_for_run=lambda _run_id: False,
        has_running_agents_for_run_async=false_async,
        resume_run=lambda _run_id: "session-1",
        resume_run_async=resume_run_async,
        ensure_run_started=lambda _run_id: None,
        ensure_run_started_async=ensure_run_started_async,
        event_publisher=cast(RunEventPublisher, object()),
    )
