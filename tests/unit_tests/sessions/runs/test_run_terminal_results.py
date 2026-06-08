from __future__ import annotations

from relay_teams.media import content_parts_from_text
from relay_teams.sessions.runs.assistant_errors import RunCompletionReason
from relay_teams.sessions.runs.run_models import RunResult
from relay_teams.sessions.runs.run_terminal_results import RunTerminalResultService


def test_normalize_terminal_run_result_projects_verification_failed_as_completed() -> (
    None
):
    result = RunTerminalResultService.normalize_terminal_run_result(
        RunResult(
            trace_id="run-1",
            root_task_id="task-1",
            status="failed",
            completion_reason=RunCompletionReason.ASSISTANT_ERROR,
            error_code="verification_failed",
            error_message="runtime_guardrail:pre_execution_boundary",
            output=content_parts_from_text("Verification warning"),
        )
    )

    assert result.status == "completed"
    assert result.completion_reason == RunCompletionReason.ASSISTANT_RESPONSE
    assert result.error_code == "verification_failed"
    assert result.error_message == "runtime_guardrail:pre_execution_boundary"


def test_normalize_terminal_run_result_uses_public_verification_message_when_output_empty() -> (
    None
):
    result = RunTerminalResultService.normalize_terminal_run_result(
        RunResult(
            trace_id="run-1",
            root_task_id="task-1",
            status="failed",
            completion_reason=RunCompletionReason.ASSISTANT_ERROR,
            error_code="verification_failed",
            error_message="runtime_guardrail:pre_execution_boundary",
            output=(),
        )
    )

    assert result.status == "completed"
    assert result.completion_reason == RunCompletionReason.ASSISTANT_RESPONSE
    assert result.error_message == "runtime_guardrail:pre_execution_boundary"
    assert "verification did not pass" in result.output_text
    assert "runtime_guardrail" not in result.output_text
