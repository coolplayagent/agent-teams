# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path

import pytest

from relay_teams.media import content_parts_from_text
from relay_teams.sessions.runs.run_intent_repo import RunIntentRepository
from relay_teams.sessions.runs.run_models import IntentInput
from tests.unit_tests.sessions.runs.test_run_service_recovery import _build_manager


@pytest.mark.asyncio
async def test_pending_followup_preserves_explicit_normal_model_profile(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "run_async_pending_profile_merge.db"
    manager = _build_manager(db_path)

    run_id, session_id = await manager.create_run_async(
        IntentInput(
            session_id="session-1",
            input=content_parts_from_text("first"),
            normal_model_profile="fast",
        )
    )
    next_run_id, next_session_id = await manager.create_run_async(
        IntentInput(
            session_id="session-1",
            input=content_parts_from_text("second"),
            normal_model_profile="precise",
        )
    )

    pending = manager._pending_runs[run_id]
    persisted = RunIntentRepository(db_path).get(run_id)

    assert (next_run_id, next_session_id) == (run_id, session_id)
    assert pending.intent == "first\n\nsecond"
    assert pending.normal_model_profile == "precise"
    assert persisted is not None
    assert persisted.normal_model_profile == "precise"


@pytest.mark.asyncio
async def test_pending_followup_without_override_keeps_existing_model_profile(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "run_async_pending_profile_omitted.db"
    manager = _build_manager(db_path)

    run_id, session_id = await manager.create_run_async(
        IntentInput(
            session_id="session-1",
            input=content_parts_from_text("first"),
            normal_model_profile="fast",
        )
    )
    next_run_id, next_session_id = await manager.create_run_async(
        IntentInput(
            session_id="session-1",
            input=content_parts_from_text("second"),
        )
    )

    pending = manager._pending_runs[run_id]
    persisted = RunIntentRepository(db_path).get(run_id)

    assert (next_run_id, next_session_id) == (run_id, session_id)
    assert pending.intent == "first\n\nsecond"
    assert pending.normal_model_profile == "fast"
    assert persisted is not None
    assert persisted.normal_model_profile == "fast"


@pytest.mark.asyncio
async def test_active_followup_rejects_explicit_normal_model_profile(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "run_async_active_profile_override.db"
    manager = _build_manager(db_path)

    run_id, _ = await manager.create_run_async(
        IntentInput(
            session_id="session-1",
            input=content_parts_from_text("first"),
        )
    )
    manager._running_run_ids.add(run_id)
    manager._injection_manager.activate(run_id)

    with pytest.raises(RuntimeError, match="normal model profile override"):
        await manager.create_run_async(
            IntentInput(
                session_id="session-1",
                input=content_parts_from_text("follow"),
                normal_model_profile="precise",
            )
        )
