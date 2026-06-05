# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path

import pytest

from relay_teams.sessions.session_repository import SessionRepository

from .test_session_update import _build_service


@pytest.mark.asyncio
async def test_update_session_normal_model_profile_persists_after_started(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "session_normal_model_update.db"
    service = _build_service(db_path)
    _ = service.create_session(session_id="session-1", workspace_id="default")
    _ = SessionRepository(db_path).mark_started("session-1")

    updated = await service.update_session_normal_model_profile_async(
        "session-1",
        normal_model_profile="precise",
    )
    cleared = await service.update_session_normal_model_profile_async(
        "session-1",
        normal_model_profile=None,
    )

    assert updated.normal_model_profile == "precise"
    assert cleared.normal_model_profile is None
