from __future__ import annotations

import pytest

from benchmarks.common.json_protocol import (
    BenchmarkJsonError,
    extract_first_json_object,
    parse_agentbench_decision,
    parse_command_decision,
)


def test_extract_first_json_object_skips_markdown_and_balances_strings() -> None:
    payload = extract_first_json_object(
        'prefix ```json\n{"commands": ["printf \\"{\\""], "done": false}\n```'
    )

    assert payload == '{"commands": ["printf \\"{\\""], "done": false}'


def test_parse_command_decision_accepts_strict_schema() -> None:
    decision = parse_command_decision(
        '{"commands": ["python -m pytest"], "done": false, "answer": "running"}'
    )

    assert decision.commands == ("python -m pytest",)
    assert decision.done is False
    assert decision.answer == "running"


def test_parse_agentbench_decision_accepts_string_arguments() -> None:
    decision = parse_agentbench_decision(
        '{"name": "execute_sql", "arguments": "{\\"query\\": \\"SELECT 1\\"}"}'
    )

    assert decision.name == "execute_sql"
    assert decision.arguments == {"query": "SELECT 1"}


def test_parse_agentbench_decision_rejects_missing_name() -> None:
    with pytest.raises(BenchmarkJsonError):
        parse_agentbench_decision('{"arguments": {"query": "SELECT 1"}}')
