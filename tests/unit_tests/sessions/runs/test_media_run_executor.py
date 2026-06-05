# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path
from typing import cast

import pytest

from relay_teams.media import MediaAssetService, content_parts_from_text
from relay_teams.providers.provider_contracts import LLMProvider
from relay_teams.roles.role_models import RoleDefinition
from relay_teams.sessions.runs.assistant_errors import RunCompletionReason
from relay_teams.sessions.runs.run_models import (
    ImageGenerationConfig,
    IntentInput,
    RunKind,
)
from relay_teams.sessions.session_models import SessionMode, SessionRecord

from .test_run_service_recovery import (
    _NativeImageProvider,
    _SessionRepo,
    _build_manager,
    _media_role_registry,
)


@pytest.mark.asyncio
async def test_media_generation_applies_normal_model_profile(
    tmp_path: Path,
) -> None:
    provider = _NativeImageProvider()
    provider_role_profiles: list[str | None] = []

    def provider_factory(role: RoleDefinition, _session_id: str | None) -> LLMProvider:
        provider_role_profiles.append(role.model_profile)
        return provider

    manager = _build_manager(
        tmp_path / "run_media_generation_normal_model.db",
        provider_factory=provider_factory,
        role_registry=_media_role_registry(),
        media_asset_service=cast(MediaAssetService, object()),
        session_repo=_SessionRepo(
            SessionRecord(
                session_id="session-1",
                workspace_id="default",
                session_mode=SessionMode.NORMAL,
                normal_model_profile="image-fast",
            )
        ),
    )

    result = await manager.run_intent(
        IntentInput(
            session_id="session-1",
            run_kind=RunKind.GENERATE_IMAGE,
            generation_config=ImageGenerationConfig(),
            input=content_parts_from_text("draw a compact icon"),
        )
    )

    assert result.status == "completed"
    assert result.completion_reason == RunCompletionReason.ASSISTANT_RESPONSE
    assert result.output_text == "image ready"
    assert provider_role_profiles == ["image-fast"]
