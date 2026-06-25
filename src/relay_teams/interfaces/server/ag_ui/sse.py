from __future__ import annotations

from collections.abc import Iterable

from fastapi import HTTPException

from relay_teams.interfaces.server.ag_ui.contracts import AgUiRunEvent


def format_ag_ui_sse_event(event: AgUiRunEvent) -> str:
    lines: list[str] = []
    if event.event_id is not None:
        lines.append(f"id: {event.event_id}")
    lines.append(f"event: {event.type.value}")
    lines.append(f"data: {event.model_dump_json(exclude_none=True)}")
    return "\n".join(lines) + "\n\n"


def resolve_after_event_id(
    *,
    query_after_event_id: int | None,
    last_event_id: str | None,
) -> int:
    parsed_last_event_id = _parse_last_event_id(last_event_id)
    if query_after_event_id is not None:
        return max(query_after_event_id, parsed_last_event_id or 0)
    return parsed_last_event_id or 0


def _parse_last_event_id(last_event_id: str | None) -> int | None:
    if last_event_id is None or not last_event_id.strip():
        return None
    try:
        parsed = int(last_event_id.strip())
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail="Last-Event-ID must be an integer event id",
        ) from exc
    if parsed < 0:
        raise HTTPException(
            status_code=422,
            detail="Last-Event-ID must be greater than or equal to 0",
        )
    return parsed


def normalize_multiplex_run_offsets(
    run_ids: Iterable[str],
    after_event_ids: Iterable[int],
    *,
    default_after_event_id: int = 0,
    max_run_streams: int = 32,
) -> tuple[tuple[str, int], ...]:
    normalized_run_ids = tuple(str(run_id).strip() for run_id in run_ids)
    normalized_after_event_ids = tuple(after_event_ids)
    if not normalized_run_ids:
        raise HTTPException(status_code=422, detail="At least one run_id is required")
    if len(normalized_run_ids) > max_run_streams:
        raise HTTPException(
            status_code=422,
            detail=f"At most {max_run_streams} run_id values are allowed",
        )
    if len(normalized_after_event_ids) > len(normalized_run_ids):
        raise HTTPException(
            status_code=422,
            detail="after_event_id cannot contain more values than run_id",
        )

    offsets_by_run_id: dict[str, int] = {}
    ordered_run_ids: list[str] = []
    for index, run_id in enumerate(normalized_run_ids):
        if not run_id or run_id.casefold() in {"none", "null"}:
            raise HTTPException(status_code=422, detail="run_id cannot be blank")
        after_event_id = (
            normalized_after_event_ids[index]
            if index < len(normalized_after_event_ids)
            else default_after_event_id
        )
        if after_event_id < 0:
            raise HTTPException(
                status_code=422,
                detail="after_event_id must be greater than or equal to 0",
            )
        after_event_id = max(after_event_id, default_after_event_id)
        if run_id not in offsets_by_run_id:
            ordered_run_ids.append(run_id)
            offsets_by_run_id[run_id] = after_event_id
            continue
        offsets_by_run_id[run_id] = max(offsets_by_run_id[run_id], after_event_id)
    return tuple((run_id, offsets_by_run_id[run_id]) for run_id in ordered_run_ids)
