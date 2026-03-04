from __future__ import annotations

import os
from pathlib import Path

CONFIG_DIR_ENV_VAR = "AGENT_TEAMS_CONFIG_DIR"


def get_project_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent.parent.parent


def get_config_dir() -> Path:
    raw_override = os.environ.get(CONFIG_DIR_ENV_VAR, "").strip()
    if not raw_override:
        return get_project_root() / ".agent_teams"
    return Path(raw_override).expanduser().resolve()


def get_frontend_dist_dir() -> Path:
    return get_project_root() / "frontend" / "dist"
