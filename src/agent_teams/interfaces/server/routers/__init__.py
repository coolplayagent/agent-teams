from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from agent_teams.application.service import AgentTeamsService
from agent_teams.application.workflow_orchestration_service import WorkflowTaskSpecInput
from agent_teams.interfaces.server.deps import get_service

router = APIRouter(prefix='/workflows', tags=['Workflows'])

WorkflowType = Literal['spec_flow', 'custom']
DispatchAction = Literal['next', 'revise']


class CreateWorkflowRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    objective: str = Field(min_length=1)
    workflow_type: WorkflowType = 'custom'
    tasks: list[WorkflowTaskSpecInput] | None = None


class DispatchTasksRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    action: DispatchAction
    feedback: str = ''
    max_dispatch: int = 1


@router.post('/runs/{run_id}')
def create_workflow_for_run(
    run_id: str,
    req: CreateWorkflowRequest,
    service: AgentTeamsService = Depends(get_service),
) -> dict[str, object]:
    try:
        return service.create_workflow_graph_for_run(
            run_id=run_id,
            objective=req.objective,
            workflow_type=req.workflow_type,
            tasks=req.tasks,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get('/runs/{run_id}/{workflow_id}')
def get_workflow_status_for_run(
    run_id: str,
    workflow_id: str,
    service: AgentTeamsService = Depends(get_service),
) -> dict[str, object]:
    try:
        return service.get_workflow_status_for_run(run_id=run_id, workflow_id=workflow_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/runs/{run_id}/{workflow_id}/dispatch')
async def dispatch_tasks_for_run(
    run_id: str,
    workflow_id: str,
    req: DispatchTasksRequest,
    service: AgentTeamsService = Depends(get_service),
) -> dict[str, object]:
    try:
        return await service.dispatch_tasks_for_run(
            run_id=run_id,
            workflow_id=workflow_id,
            action=req.action,
            feedback=req.feedback,
            max_dispatch=req.max_dispatch,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

