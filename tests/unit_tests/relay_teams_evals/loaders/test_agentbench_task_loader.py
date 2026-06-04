from __future__ import annotations

import json
from pathlib import Path

import pytest

from relay_teams_evals.loaders.agentbench_task_loader import (
    AgentBenchLoader,
)


def test_agentbench_loader_reads_raw_results(tmp_path: Path) -> None:
    results_file = tmp_path / "results.json"
    results_file.write_text(
        json.dumps(
            {
                "results": [
                    {
                        "suite": "db",
                        "task_id": "std-0",
                        "description": "answer the query",
                        "passed": True,
                        "status": "completed",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    items = AgentBenchLoader().load(results_file)

    assert len(items) == 1
    assert items[0].dataset == "agentbench"
    assert items[0].item_id == "db:std-0"
    assert items[0].intent == "answer the query"
    assert items[0].extra_fields["passed"] == "true"


def test_agentbench_loader_handles_dirty_items_and_fallback_fields(
    tmp_path: Path,
) -> None:
    results_file = tmp_path / "results.json"
    results_file.write_text(
        json.dumps(
            {
                "results": [
                    "ignored",
                    {
                        "instruction": "Inspect the database.",
                        "passed": False,
                        "notes": None,
                        "metadata": {"rows": [1, 2]},
                    },
                ]
            }
        ),
        encoding="utf-8",
    )

    items = AgentBenchLoader().load(results_file)

    assert len(items) == 1
    assert items[0].item_id == "item-2"
    assert items[0].intent == "Inspect the database."
    assert items[0].extra_fields["passed"] == "false"
    assert items[0].extra_fields["notes"] == ""
    assert items[0].extra_fields["metadata"] == '{"rows": [1, 2]}'


def test_agentbench_loader_rejects_invalid_payloads(tmp_path: Path) -> None:
    non_object = tmp_path / "non-object.json"
    non_object.write_text("[]", encoding="utf-8")
    with pytest.raises(ValueError, match="must be a JSON object"):
        AgentBenchLoader().load(non_object)

    missing_results = tmp_path / "missing-results.json"
    missing_results.write_text("{}", encoding="utf-8")
    with pytest.raises(ValueError, match="needs a results list"):
        AgentBenchLoader().load(missing_results)
