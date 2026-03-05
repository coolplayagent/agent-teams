from __future__ import annotations

from fastapi import Request

from agent_teams.env.runtime_config_service import RuntimeConfigService
from agent_teams.interfaces.server.container import ServerContainer
from agent_teams.roles.registry import RoleRegistry
from agent_teams.runs.manager import RunManager
from agent_teams.sessions import SessionService
from agent_teams.skills.registry import SkillRegistry
from agent_teams.state.task_repo import TaskRepository
from agent_teams.tools.registry import ToolRegistry
from agent_teams.triggers import TriggerService
from agent_teams.workflow.orchestration_service import WorkflowOrchestrationService


def get_container(request: Request) -> ServerContainer:
    return request.app.state.container


def get_run_service(request: Request) -> RunManager:
    return get_container(request).run_service


def get_session_service(request: Request) -> SessionService:
    return get_container(request).session_service


def get_workflow_service(request: Request) -> WorkflowOrchestrationService:
    return get_container(request).workflow_service


def get_trigger_service(request: Request) -> TriggerService:
    return get_container(request).trigger_service


def get_system_config_service(request: Request) -> RuntimeConfigService:
    return get_container(request).config_service


def get_task_repo(request: Request) -> TaskRepository:
    return get_container(request).task_repo


def get_role_registry(request: Request) -> RoleRegistry:
    return get_container(request).role_registry


def get_tool_registry(request: Request) -> ToolRegistry:
    return get_container(request).tool_registry


def get_skill_registry(request: Request) -> SkillRegistry:
    return get_container(request).skill_registry
