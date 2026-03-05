from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from agent_teams.application.service import AgentTeamsService
from agent_teams.interfaces.server.deps import get_service
from agent_teams.workflow.models import TaskRecord

router = APIRouter(prefix="/tasks", tags=["Tasks"])


@router.get("", response_model=list[TaskRecord])
def list_tasks(service: AgentTeamsService = Depends(get_service)) -> list[TaskRecord]:
    return list(service.list_tasks())


@router.get("/{task_id}", response_model=TaskRecord)
def get_task(task_id: str, service: AgentTeamsService = Depends(get_service)) -> TaskRecord:
    try:
        return service.query_task(task_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Task not found") from exc
