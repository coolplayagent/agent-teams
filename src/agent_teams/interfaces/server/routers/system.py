from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from agent_teams.interfaces.sdk.client import AgentTeamsApp


# Since this config logic existed in app.py we replicate it here
def _get_project_root():
    from pathlib import Path

    return Path(__file__).parent.parent.parent.parent.parent


DEFAULT_CONFIG_DIR = _get_project_root() / ".agent_teams"

router = APIRouter(prefix="/global", tags=["System"])


def get_sdk(request: Request) -> AgentTeamsApp:
    return request.app.state.sdk


@router.get("/health")
def health_check():
    return {"status": "ok", "version": "0.1.0"}


@router.get("/configs")
def get_config_status(sdk: AgentTeamsApp = Depends(get_sdk)):
    return sdk.get_config_status()


@router.get("/configs/model")
def get_model_config(sdk: AgentTeamsApp = Depends(get_sdk)):
    return sdk.get_model_config()


@router.get("/configs/model/profiles")
def get_model_profiles(sdk: AgentTeamsApp = Depends(get_sdk)):
    return sdk.get_model_profiles()


class ModelProfileRequest(BaseModel):
    name: str
    model: str
    base_url: str
    api_key: str
    temperature: float = 0.7
    top_p: float = 1.0
    max_tokens: int = 4096


@router.put("/configs/model/profiles/{name}")
def save_model_profile(
    name: str, req: ModelProfileRequest, sdk: AgentTeamsApp = Depends(get_sdk)
):
    try:
        profile = {
            "model": req.model,
            "base_url": req.base_url,
            "api_key": req.api_key,
            "temperature": req.temperature,
            "top_p": req.top_p,
            "max_tokens": req.max_tokens,
        }
        sdk.save_model_profile(name, profile)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/configs/model/profiles/{name}")
def delete_model_profile(name: str, sdk: AgentTeamsApp = Depends(get_sdk)):
    try:
        sdk.delete_model_profile(name)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ModelConfigRequest(BaseModel):
    config: dict


@router.put("/configs/model")
def save_model_config(req: ModelConfigRequest, sdk: AgentTeamsApp = Depends(get_sdk)):
    try:
        sdk.save_model_config(req.config)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/configs/model/reload")
def reload_model_config(sdk: AgentTeamsApp = Depends(get_sdk)):
    try:
        sdk.reload_model_config()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/configs/mcp/reload")
def reload_mcp_config(sdk: AgentTeamsApp = Depends(get_sdk)):
    try:
        sdk.reload_mcp_config()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/configs/skills/reload")
def reload_skills_config(sdk: AgentTeamsApp = Depends(get_sdk)):
    try:
        sdk.reload_skills_config()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
