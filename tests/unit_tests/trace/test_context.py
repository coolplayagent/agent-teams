# -*- coding: utf-8 -*-
from __future__ import annotations

from agent_teams.trace import (
    bind_trace_context,
    generate_request_id,
    generate_trace_id,
    get_trace_context,
)


def test_bind_trace_context_applies_and_restores_context() -> None:
    assert get_trace_context().trace_id is None

    with bind_trace_context(trace_id="trace-a", request_id="req-a"):
        context = get_trace_context()
        assert context.trace_id == "trace-a"
        assert context.request_id == "req-a"

        with bind_trace_context(task_id="task-1"):
            nested = get_trace_context()
            assert nested.trace_id == "trace-a"
            assert nested.request_id == "req-a"
            assert nested.task_id == "task-1"

        restored = get_trace_context()
        assert restored.trace_id == "trace-a"
        assert restored.request_id == "req-a"
        assert restored.task_id is None

    final = get_trace_context()
    assert final.trace_id is None
    assert final.request_id is None
    assert final.task_id is None


def test_generate_ids_use_expected_prefix() -> None:
    assert generate_request_id().startswith("req_")
    assert generate_trace_id().startswith("trace_")
