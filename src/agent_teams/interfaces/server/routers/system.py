# -*- coding: utf-8 -*-
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict

from agent_teams.interfaces.server.deps import (
    get_config_status_service,
    get_mcp_config_reload_service,
    get_model_config_service,
    get_notification_settings_service,
    get_skills_config_reload_service,
)
from agent_teams.interfaces.server.config_status_service import ConfigStatusService
from agent_teams.mcp.config_reload_service import McpConfigReloadService
from agent_teams.notifications.settings_service import NotificationSettingsService
from agent_teams.providers.model_config_service import ModelConfigService
from agent_teams.providers.model_config import ProviderType
from agent_teams.skills.config_reload_service import SkillsConfigReloadService
from agent_teams.shared_types.json_types import JsonObject

router = APIRouter(prefix="/system", tags=["System"])


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "version": "0.1.0"}


@router.get("/configs")
def get_config_status(
    service: ConfigStatusService = Depends(get_config_status_service),
) -> JsonObject:
    return service.get_config_status()


@router.get("/configs/model")
def get_model_config(
    service: ModelConfigService = Depends(get_model_config_service),
) -> JsonObject:
    return service.get_model_config()


@router.get("/configs/model/profiles")
def get_model_profiles(
    service: ModelConfigService = Depends(get_model_config_service),
) -> dict[str, JsonObject]:
    return service.get_model_profiles()


class ModelProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: ProviderType = ProviderType.OPENAI_COMPATIBLE
    model: str
    base_url: str
    api_key: str
    temperature: float = 0.7
    top_p: float = 1.0
    max_tokens: int = 4096


@router.put("/configs/model/profiles/{name}")
def save_model_profile(
    name: str,
    req: ModelProfileRequest,
    service: ModelConfigService = Depends(get_model_config_service),
) -> dict[str, str]:
    try:
        service.save_model_profile(
            name,
            {
                "model": req.model,
                "provider": req.provider.value,
                "base_url": req.base_url,
                "api_key": req.api_key,
                "temperature": req.temperature,
                "top_p": req.top_p,
                "max_tokens": req.max_tokens,
            },
        )
        return {"status": "ok"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/configs/model/providers/models")
def get_provider_models(
    provider: ProviderType | None = Query(default=None),
    service: ModelConfigService = Depends(get_model_config_service),
) -> list[JsonObject]:
    return [
        model.model_dump(mode="json")
        for model in service.get_provider_models(provider=provider)
    ]


@router.delete("/configs/model/profiles/{name}")
def delete_model_profile(
    name: str,
    service: ModelConfigService = Depends(get_model_config_service),
) -> dict[str, str]:
    try:
        service.delete_model_profile(name)
        return {"status": "ok"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


class ModelConfigRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    config: JsonObject


@router.put("/configs/model")
def save_model_config(
    req: ModelConfigRequest,
    service: ModelConfigService = Depends(get_model_config_service),
) -> dict[str, str]:
    try:
        service.save_model_config(req.config)
        return {"status": "ok"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/configs/notifications")
def get_notification_config(
    service: NotificationSettingsService = Depends(get_notification_settings_service),
) -> JsonObject:
    return service.get_notification_config()


class NotificationConfigRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    config: JsonObject


@router.put("/configs/notifications")
def save_notification_config(
    req: NotificationConfigRequest,
    service: NotificationSettingsService = Depends(get_notification_settings_service),
) -> dict[str, str]:
    try:
        service.save_notification_config(req.config)
        return {"status": "ok"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/configs/model:reload")
def reload_model_config(
    service: ModelConfigService = Depends(get_model_config_service),
) -> dict[str, str]:
    try:
        service.reload_model_config()
        return {"status": "ok"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/configs/mcp:reload")
def reload_mcp_config(
    service: McpConfigReloadService = Depends(get_mcp_config_reload_service),
) -> dict[str, str]:
    try:
        service.reload_mcp_config()
        return {"status": "ok"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/configs/skills:reload")
def reload_skills_config(
    service: SkillsConfigReloadService = Depends(get_skills_config_reload_service),
) -> dict[str, str]:
    try:
        service.reload_skills_config()
        return {"status": "ok"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
