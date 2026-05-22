# -*- coding: utf-8 -*-
from __future__ import annotations

import importlib.util
import os
from pathlib import Path

from relay_teams.paths import get_project_root_or_none

FRONTEND_DIST_DIR_ENV = "RELAY_TEAMS_FRONTEND_DIST_DIR"


def get_frontend_dist_dir() -> Path:
    candidates = _frontend_dist_candidates()
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def get_frontend_v2_source_dir() -> Path:
    candidates = _frontend_v2_source_candidates()
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def _frontend_dist_candidates() -> tuple[Path, ...]:
    candidates: list[Path] = []
    env_frontend_dist_dir = _env_frontend_dist_dir()
    if env_frontend_dist_dir is not None:
        candidates.append(env_frontend_dist_dir)
    git_frontend_dist_dir = _git_frontend_dist_dir()
    if git_frontend_dist_dir is not None:
        candidates.append(git_frontend_dist_dir)
    candidates.extend((_package_frontend_dist_dir(), _cwd_frontend_dist_dir()))
    return tuple(candidates)


def _frontend_v2_source_candidates() -> tuple[Path, ...]:
    candidates: list[Path] = []
    git_frontend_v2_source_dir = _git_frontend_v2_source_dir()
    if git_frontend_v2_source_dir is not None:
        candidates.append(git_frontend_v2_source_dir)
    candidates.extend(
        (_package_frontend_v2_source_dir(), _cwd_frontend_v2_source_dir())
    )
    return tuple(candidates)


def _env_frontend_dist_dir() -> Path | None:
    raw_value = os.environ.get(FRONTEND_DIST_DIR_ENV)
    if raw_value is None or not raw_value.strip():
        return None
    return Path(raw_value.strip()).expanduser().resolve()


def _git_frontend_dist_dir() -> Path | None:
    project_root = get_project_root_or_none()
    if project_root is None:
        return None
    return project_root / "frontend" / "dist"


def _git_frontend_v2_source_dir() -> Path | None:
    project_root = get_project_root_or_none()
    if project_root is None:
        return None
    return project_root / "frontend" / "v2" / "src"


def _package_frontend_dist_dir() -> Path:
    frontend_package_spec = importlib.util.find_spec("relay_teams.frontend")
    if frontend_package_spec is None or frontend_package_spec.origin is None:
        return Path(__file__).resolve().parents[2] / "frontend" / "dist"
    return Path(frontend_package_spec.origin).resolve().parent / "dist"


def _package_frontend_v2_source_dir() -> Path:
    frontend_package_spec = importlib.util.find_spec("relay_teams.frontend")
    if frontend_package_spec is None or frontend_package_spec.origin is None:
        return Path(__file__).resolve().parents[2] / "frontend" / "v2" / "src"
    return Path(frontend_package_spec.origin).resolve().parent / "v2" / "src"


def _cwd_frontend_dist_dir() -> Path:
    return Path.cwd().resolve() / "frontend" / "dist"


def _cwd_frontend_v2_source_dir() -> Path:
    return Path.cwd().resolve() / "frontend" / "v2" / "src"
