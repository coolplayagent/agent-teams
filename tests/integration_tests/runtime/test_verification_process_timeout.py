# -*- coding: utf-8 -*-
from __future__ import annotations

import sys
from pathlib import Path

import pytest

from relay_teams.agents.orchestration.verification import verify_task
from relay_teams.agents.tasks.enums import TaskStatus
from relay_teams.agents.tasks.models import TaskEnvelope, VerificationCommand
from relay_teams.agents.tasks.models import VerificationPlan
from relay_teams.agents.tasks.task_repository import TaskRepository
from relay_teams.sessions.runs.event_log import EventLog
from relay_teams.tools.runtime.policy import ToolApprovalPolicy

YOLO_TOOL_APPROVAL_POLICY = ToolApprovalPolicy(yolo=True)


@pytest.mark.timeout(3)
def test_verify_task_reports_command_timeout(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "verification_timeout.db"
    task_repo = TaskRepository(db_path)
    event_log = EventLog(db_path)
    task = TaskEnvelope(
        task_id="task-1",
        session_id="session-1",
        trace_id="run-1",
        objective="Return evidence",
        verification=VerificationPlan(
            command_checks=(
                VerificationCommand(
                    command=(
                        sys.executable,
                        "-c",
                        "import sys, time; "
                        "sys.stdout.write('partial stdout'); "
                        "sys.stdout.flush(); "
                        "sys.stderr.write('partial stderr'); "
                        "sys.stderr.flush(); "
                        "time.sleep(5)",
                    ),
                    timeout_seconds=1.0,
                ),
            ),
        ),
    )
    _ = task_repo.create(task)
    task_repo.update_status(task.task_id, TaskStatus.COMPLETED, result="done")

    result = verify_task(
        task_repo,
        event_log,
        task.task_id,
        allowed_tools=("shell",),
        tool_approval_policy=YOLO_TOOL_APPROVAL_POLICY,
        workspace_root=tmp_path,
    )

    assert result.passed is False
    assert result.report is not None
    command_check = result.report.checks[-1]
    assert "timed out" in command_check.details
    assert command_check.output_excerpt == "partial stdout\npartial stderr"
