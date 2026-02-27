from __future__ import annotations

import json
from typing import Literal

from agent_teams.core.enums import ScopeType, TaskStatus
from agent_teams.core.models import ScopeRef, StateMutation, TaskRecord
from agent_teams.state.shared_store import SharedStore

WORKFLOW_GRAPH_KEY = 'workflow_graph'

StageName = Literal['spec', 'design', 'code', 'verify']


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


def stage_tag(stage: StageName) -> str:
    return f'stage:{stage}'


def workflow_tag(workflow_id: str) -> str:
    return f'workflow:{workflow_id}'


def module_tag(module_id: str) -> str:
    return f'module:{module_id}'


def node_ready(*, node_depends_on: tuple[str, ...], task_map: dict[str, TaskRecord]) -> bool:
    for dep_id in node_depends_on:
        dep = task_map.get(dep_id)
        if dep is None:
            return False
        if dep.status != TaskStatus.COMPLETED:
            return False
    return True


def stage_from_scope(scope: tuple[str, ...]) -> str | None:
    for item in scope:
        if item.startswith('stage:'):
            return item.split(':', 1)[1]
    return None
