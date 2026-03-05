from __future__ import annotations

from fastapi import APIRouter, Depends

from agent_teams.application.service import AgentTeamsService
from agent_teams.application.runtime_config import load_runtime_config
from agent_teams.interfaces.server.config_paths import get_config_dir
from agent_teams.interfaces.server.deps import get_service
from agent_teams.roles.registry import RoleLoader
from agent_teams.tools.defaults import build_default_registry

router = APIRouter(prefix="/roles", tags=["Roles"])


@router.get("")
def list_roles(service: AgentTeamsService = Depends(get_service)) -> list[dict[str, object]]:
    return [role.model_dump() for role in service.list_roles()]


@router.post(":validate")
def validate_roles() -> dict[str, int | bool]:
    config = load_runtime_config(config_dir=get_config_dir())
    registry = RoleLoader().load_all(config.paths.roles_dir)
    tool_registry = build_default_registry()

    for role in registry.list_roles():
        tool_registry.validate_known(role.tools)

    return {"valid": True, "loaded_count": len(registry.list_roles())}

