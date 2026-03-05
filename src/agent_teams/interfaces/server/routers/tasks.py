from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from agent_teams.interfaces.server.deps import get_task_repo
from agent_teams.state.task_repo import TaskRepository
from agent_teams.workflow.models import TaskRecord

router = APIRouter(prefix="/tasks", tags=["Tasks"])


@router.get("", response_model=list[TaskRecord])
def list_tasks(task_repo: TaskRepository = Depends(get_task_repo)) -> list[TaskRecord]:
    return list(task_repo.list_all())


@router.get("/{task_id}", response_model=TaskRecord)
def get_task(task_id: str, task_repo: TaskRepository = Depends(get_task_repo)) -> TaskRecord:
    try:
        return task_repo.get(task_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Task not found") from exc
