from __future__ import annotations

import json
from typing import cast

from agent_teams.state.scope_models import ScopeRef, ScopeType, StateMutation
from agent_teams.workflow.enums import TaskStatus
from agent_teams.workflow.models import TaskRecord
from agent_teams.state.shared_store import SharedStore

WORKFLOW_GRAPH_KEY = 'workflow_graph'


def workflow_scope(task_id: str) -> ScopeRef:
    return ScopeRef(scope_type=ScopeType.TASK, scope_id=task_id)


def load_graph(store: SharedStore, *, task_id: str) -> dict[str, object] | None:
    raw = store.get_state(workflow_scope(task_id), WORKFLOW_GRAPH_KEY)
    if not raw:
        return None
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError('workflow_graph must be a json object')
    return value


def save_graph(store: SharedStore, *, task_id: str, graph: dict[str, object]) -> None:
    store.manage_state(
        StateMutation(
            scope=workflow_scope(task_id),
            key=WORKFLOW_GRAPH_KEY,
            value_json=json.dumps(graph, ensure_ascii=False),
        )
    )


def node_ready(*, node_depends_on: tuple[str, ...], task_map: dict[str, TaskRecord]) -> bool:
    for dep_id in node_depends_on:
        dep = task_map.get(dep_id)
        if dep is None:
            return False
        if dep.status != TaskStatus.COMPLETED:
            return False
    return True

def get_tasks_from_graph(graph: dict[str, object]) -> dict[str, dict[str, object]]:
    tasks = graph.get('tasks')
    if not isinstance(tasks, dict):
        return {}
    return tasks


def get_task_by_name(graph: dict[str, object], task_name: str) -> dict[str, object] | None:
    tasks = get_tasks_from_graph(graph)
    return tasks.get(task_name)


def get_ready_tasks(graph: dict[str, object], task_records: dict[str, TaskRecord]) -> list[tuple[str, dict[str, object]]]:
    tasks = get_tasks_from_graph(graph)
    ready: list[tuple[str, dict[str, object]]] = []
    for task_name, task_info in tasks.items():
        task_id = task_info.get('task_id')
        if not isinstance(task_id, str) or not task_id:
            continue
        record = task_records.get(task_id)
        if record is None:
            continue
        if record.status != TaskStatus.CREATED:
            continue
        depends_on = task_info.get('depends_on', [])
        if not isinstance(depends_on, list):
            depends_on = []
        dep_ids: list[str] = []
        for dep in depends_on:
            if not isinstance(dep, str):
                continue
            dep_info = tasks.get(dep)
            if not isinstance(dep_info, dict):
                continue
            dep_id = dep_info.get('task_id')
            if isinstance(dep_id, str) and dep_id:
                dep_ids.append(dep_id)
        all_deps_completed = True
        for dep_id in dep_ids:
            dep_record = task_records.get(dep_id)
            if dep_record is None or dep_record.status != TaskStatus.COMPLETED:
                all_deps_completed = False
                break
        if all_deps_completed:
            ready.append((task_name, cast(dict[str, object], task_info)))
    return ready
