from __future__ import annotations

import json
from pathlib import Path

from relay_teams_evals.loaders.base import DatasetLoader
from relay_teams_evals.models import EvalItem


class AgentBenchLoader(DatasetLoader):
    def load(self, path: Path) -> list[EvalItem]:
        return _load_agentbench_items(path=path, dataset="agentbench")


def _load_agentbench_items(*, path: Path, dataset: str) -> list[EvalItem]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"AgentBench dataset must be a JSON object: {path}")
    raw_results = payload.get("results")
    if not isinstance(raw_results, list):
        raise ValueError(f"AgentBench dataset needs a results list: {path}")

    items: list[EvalItem] = []
    for index, raw_item in enumerate(raw_results, start=1):
        if not isinstance(raw_item, dict):
            continue
        item = raw_item
        raw_task_id = _string_field(item, "task_id") or f"item-{index}"
        task_id = _item_id(item=item, task_id=raw_task_id)
        intent = (
            _string_field(item, "instruction")
            or _string_field(item, "description")
            or task_id
        )
        extra_fields = {
            key: _stringify_extra_value(value)
            for key, value in item.items()
            if key not in {"task_id", "instruction", "description"}
        }
        items.append(
            EvalItem(
                item_id=task_id,
                dataset=dataset,
                intent=intent,
                extra_fields=extra_fields,
            )
        )
    return items


def _item_id(*, item: dict[str, object], task_id: str) -> str:
    suite = _string_field(item, "suite")
    if suite:
        return f"{suite}:{task_id}"
    return task_id


def _string_field(payload: dict[str, object], field: str) -> str:
    value = payload.get(field)
    return value if isinstance(value, str) else ""


def _stringify_extra_value(value: object) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return ""
    return json.dumps(value, ensure_ascii=False)
