from __future__ import annotations

from typing import ClassVar, Protocol

from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict

from relay_teams.media import (
    ContentPart,
    InlineMediaContentPart,
    MediaRefContentPart,
)


class NormalizedRunContent(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    input: tuple[ContentPart, ...]
    display_input: tuple[ContentPart, ...]


class SessionRecordWithWorkspace(Protocol):
    workspace_id: str


class RunContentSessionService(Protocol):
    def get_session(self, session_id: str) -> SessionRecordWithWorkspace: ...


class RunContentMediaAssetService(Protocol):
    def normalize_content_parts(
        self,
        *,
        session_id: str,
        workspace_id: str,
        parts: tuple[ContentPart, ...],
    ) -> tuple[ContentPart, ...]: ...


class RunContentContainer(Protocol):
    session_service: RunContentSessionService
    media_asset_service: RunContentMediaAssetService


def normalize_run_create_content_parts(
    *,
    request: Request,
    session_id: str,
    input_parts: tuple[ContentPart, ...],
    display_input_parts: tuple[ContentPart, ...],
) -> NormalizedRunContent:
    if not _contains_inline_media((*input_parts, *display_input_parts)):
        return NormalizedRunContent(
            input=input_parts, display_input=display_input_parts
        )

    container = _run_content_container_from_request(request)
    session = container.session_service.get_session(session_id)
    normalized_input = container.media_asset_service.normalize_content_parts(
        session_id=session_id,
        workspace_id=session.workspace_id,
        parts=input_parts,
    )
    normalized_display_input = display_input_parts
    if display_input_parts:
        display_input = _reuse_normalized_inline_media_refs(
            raw_input=input_parts,
            normalized_input=normalized_input,
            display_input=display_input_parts,
        )
        normalized_display_input = display_input
        if _contains_inline_media(display_input):
            normalized_display_input = (
                container.media_asset_service.normalize_content_parts(
                    session_id=session_id,
                    workspace_id=session.workspace_id,
                    parts=display_input,
                )
            )
    return NormalizedRunContent(
        input=normalized_input,
        display_input=normalized_display_input,
    )


def _run_content_container_from_request(request: Request) -> RunContentContainer:
    container = getattr(request.app.state, "container", None)
    if container is None:
        raise HTTPException(
            status_code=503,
            detail="Media uploads require the server container to be initialized",
        )
    return container


def _reuse_normalized_inline_media_refs(
    *,
    raw_input: tuple[ContentPart, ...],
    normalized_input: tuple[ContentPart, ...],
    display_input: tuple[ContentPart, ...],
) -> tuple[ContentPart, ...]:
    normalized_refs: list[tuple[InlineMediaContentPart, MediaRefContentPart]] = []
    for raw_part, normalized_part in zip(raw_input, normalized_input, strict=False):
        if isinstance(raw_part, InlineMediaContentPart) and isinstance(
            normalized_part, MediaRefContentPart
        ):
            normalized_refs.append((raw_part, normalized_part))
    if not normalized_refs:
        return display_input

    reused_parts: list[ContentPart] = []
    for part in display_input:
        if isinstance(part, InlineMediaContentPart):
            replacement = _find_normalized_media_ref(part, normalized_refs)
            if replacement is not None:
                reused_parts.append(replacement)
                continue
        reused_parts.append(part)
    return tuple(reused_parts)


def _find_normalized_media_ref(
    part: InlineMediaContentPart,
    normalized_refs: list[tuple[InlineMediaContentPart, MediaRefContentPart]],
) -> MediaRefContentPart | None:
    for raw_part, normalized_part in normalized_refs:
        if part == raw_part:
            return normalized_part
    return None


def _contains_inline_media(parts: tuple[ContentPart, ...]) -> bool:
    return any(isinstance(part, InlineMediaContentPart) for part in parts)
