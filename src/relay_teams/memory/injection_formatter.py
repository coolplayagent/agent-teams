# -*- coding: utf-8 -*-
from __future__ import annotations

import sqlite3

from relay_teams.memory.memory_defaults import (
    INJECTION_LIMIT,
    INJECTION_MIN_CONFIDENCE,
)
from relay_teams.memory.models import (
    MemoryEntryStatus,
    MemoryEntrySummary,
    MemoryQuery,
    MemoryScope,
    MemorySearchRequest,
    MemoryTier,
)
from relay_teams.memory.service import MemoryBankService

MEMORY_SECTION_CHAR_BUDGET = 2400
MEMORY_ENTRY_TITLE_CHARS = 120
MEMORY_ENTRY_PREVIEW_CHARS = 160
MEMORY_FALLBACK_LIMIT_PER_TIER = 20


async def build_project_memory_section_async(
    *,
    memory_bank_service: MemoryBankService,
    workspace_id: str,
    role_id: str | None = None,
    session_id: str | None = None,
    objective: str = "",
) -> str:
    """Build injectable memory text from PERSISTENT and MEDIUM_TERM entries."""
    task_query = objective.strip()
    if task_query:
        section = await _build_task_relevant_memory_section_async(
            memory_bank_service=memory_bank_service,
            workspace_id=workspace_id,
            role_id=role_id,
            session_id=session_id,
            objective=task_query,
        )
        if section:
            return section

    by_tier: dict[MemoryTier, list[MemoryEntrySummary]] = {
        MemoryTier.PERSISTENT: [],
        MemoryTier.MEDIUM_TERM: [],
    }
    for tier in (MemoryTier.PERSISTENT, MemoryTier.MEDIUM_TERM):
        by_tier[tier].extend(
            await _list_role_and_workspace_memory_async(
                memory_bank_service=memory_bank_service,
                workspace_id=workspace_id,
                tier=tier,
                role_id=role_id,
                session_id=session_id,
            )
        )

    return format_memory_section(by_tier=by_tier, include_preview=False)


async def _build_task_relevant_memory_section_async(
    *,
    memory_bank_service: MemoryBankService,
    workspace_id: str,
    role_id: str | None,
    session_id: str | None,
    objective: str,
) -> str:
    by_tier: dict[MemoryTier, list[MemoryEntrySummary]] = {
        MemoryTier.PERSISTENT: [],
        MemoryTier.MEDIUM_TERM: [],
    }
    for tier in (MemoryTier.PERSISTENT, MemoryTier.MEDIUM_TERM):
        by_tier[tier].extend(
            await _search_role_and_workspace_memory_async(
                memory_bank_service=memory_bank_service,
                workspace_id=workspace_id,
                tier=tier,
                role_id=role_id,
                session_id=session_id,
                objective=objective,
            )
        )

    if not any(by_tier.values()):
        return ""

    return format_memory_section(by_tier=by_tier, include_preview=True)


async def _list_role_and_workspace_memory_async(
    *,
    memory_bank_service: MemoryBankService,
    workspace_id: str,
    tier: MemoryTier,
    role_id: str | None,
    session_id: str | None,
) -> tuple[MemoryEntrySummary, ...]:
    entries: list[MemoryEntrySummary] = []
    if role_id is not None:
        entries.extend(
            await _list_memory_async(
                memory_bank_service=memory_bank_service,
                workspace_id=workspace_id,
                tier=tier,
                scope=MemoryScope.ROLE,
                role_id=role_id,
                limit=MEMORY_FALLBACK_LIMIT_PER_TIER,
            )
        )
    if session_id is not None:
        entries.extend(
            await _list_memory_async(
                memory_bank_service=memory_bank_service,
                workspace_id=workspace_id,
                tier=tier,
                scope=MemoryScope.SESSION,
                session_id=session_id,
                role_id=role_id,
                limit=MEMORY_FALLBACK_LIMIT_PER_TIER,
            )
        )
        if role_id is not None:
            entries.extend(
                await _list_memory_async(
                    memory_bank_service=memory_bank_service,
                    workspace_id=workspace_id,
                    tier=tier,
                    scope=MemoryScope.SESSION,
                    session_id=session_id,
                    role_id=None,
                    role_id_is_null=True,
                    limit=MEMORY_FALLBACK_LIMIT_PER_TIER,
                )
            )
    if role_id is not None:
        entries.extend(
            await _list_memory_async(
                memory_bank_service=memory_bank_service,
                workspace_id=workspace_id,
                tier=tier,
                scope=MemoryScope.WORKSPACE,
                role_id=role_id,
                limit=MEMORY_FALLBACK_LIMIT_PER_TIER,
            )
        )
    workspace_entries = await _list_memory_async(
        memory_bank_service=memory_bank_service,
        workspace_id=workspace_id,
        tier=tier,
        scope=MemoryScope.WORKSPACE,
        role_id=None,
        role_id_is_null=True,
        limit=MEMORY_FALLBACK_LIMIT_PER_TIER,
    )
    entries.extend(workspace_entries)
    return tuple(entries)


async def _list_memory_async(
    *,
    memory_bank_service: MemoryBankService,
    workspace_id: str,
    tier: MemoryTier,
    scope: MemoryScope,
    role_id: str | None,
    limit: int,
    session_id: str | None = None,
    role_id_is_null: bool = False,
) -> tuple[MemoryEntrySummary, ...]:
    try:
        result = await memory_bank_service.list_entries_async(
            MemoryQuery(
                workspace_id=workspace_id,
                tier=tier,
                scope=scope,
                session_id=session_id,
                role_id=role_id,
                role_id_is_null=role_id_is_null,
                status=MemoryEntryStatus.ACTIVE,
                limit=limit,
            )
        )
    except (ValueError, OSError, RuntimeError, sqlite3.Error):
        return ()
    return result.items


async def _search_role_and_workspace_memory_async(
    *,
    memory_bank_service: MemoryBankService,
    workspace_id: str,
    tier: MemoryTier,
    role_id: str | None,
    session_id: str | None,
    objective: str,
) -> tuple[MemoryEntrySummary, ...]:
    entries: list[MemoryEntrySummary] = []
    if role_id is not None:
        entries.extend(
            await _search_memory_async(
                memory_bank_service=memory_bank_service,
                workspace_id=workspace_id,
                tier=tier,
                scope=MemoryScope.ROLE,
                role_id=role_id,
                objective=objective,
                limit=INJECTION_LIMIT,
            )
        )
    if session_id is not None:
        entries.extend(
            await _search_memory_async(
                memory_bank_service=memory_bank_service,
                workspace_id=workspace_id,
                tier=tier,
                scope=MemoryScope.SESSION,
                session_id=session_id,
                role_id=role_id,
                objective=objective,
                limit=INJECTION_LIMIT,
            )
        )
        if role_id is not None:
            entries.extend(
                await _search_memory_async(
                    memory_bank_service=memory_bank_service,
                    workspace_id=workspace_id,
                    tier=tier,
                    scope=MemoryScope.SESSION,
                    session_id=session_id,
                    role_id=None,
                    role_id_is_null=True,
                    objective=objective,
                    limit=INJECTION_LIMIT,
                )
            )
    if role_id is not None:
        entries.extend(
            await _search_memory_async(
                memory_bank_service=memory_bank_service,
                workspace_id=workspace_id,
                tier=tier,
                scope=MemoryScope.WORKSPACE,
                role_id=role_id,
                objective=objective,
                limit=INJECTION_LIMIT,
            )
        )
    workspace_entries = await _search_memory_async(
        memory_bank_service=memory_bank_service,
        workspace_id=workspace_id,
        tier=tier,
        scope=MemoryScope.WORKSPACE,
        role_id=None,
        role_id_is_null=True,
        objective=objective,
        limit=INJECTION_LIMIT,
    )
    entries.extend(workspace_entries)
    return tuple(entries)


async def _search_memory_async(
    *,
    memory_bank_service: MemoryBankService,
    workspace_id: str,
    tier: MemoryTier,
    scope: MemoryScope,
    role_id: str | None,
    objective: str,
    limit: int,
    session_id: str | None = None,
    role_id_is_null: bool = False,
) -> tuple[MemoryEntrySummary, ...]:
    try:
        result = await memory_bank_service.search_async(
            MemorySearchRequest(
                workspace_id=workspace_id,
                text_query=objective,
                tier=tier,
                scope=scope,
                session_id=session_id,
                role_id=role_id,
                role_id_is_null=role_id_is_null,
                status=MemoryEntryStatus.ACTIVE,
                min_confidence=INJECTION_MIN_CONFIDENCE,
                limit=limit,
            )
        )
    except (ValueError, OSError, RuntimeError, sqlite3.Error):
        return ()
    return tuple(hit.entry for hit in result.items)


def format_memory_section(
    *,
    by_tier: dict[MemoryTier, list[MemoryEntrySummary]],
    include_preview: bool,
    char_budget: int = MEMORY_SECTION_CHAR_BUDGET,
    preview_chars: int = MEMORY_ENTRY_PREVIEW_CHARS,
) -> str:
    lines: list[str] = []
    used_chars = 0
    seen_ids: set[str] = set()
    for tier in (MemoryTier.PERSISTENT, MemoryTier.MEDIUM_TERM):
        entries = [entry for entry in by_tier[tier] if entry.id not in seen_ids]
        if not entries:
            continue
        tier_label = tier.value.replace("_", " ").title()
        tier_line = f"### {tier_label}"
        if not _append_budgeted_line(
            lines,
            tier_line,
            used_chars,
            char_budget=char_budget,
        ):
            break
        used_chars += len(tier_line) + 1
        for entry in entries:
            line = _format_memory_entry_line(
                entry,
                include_preview=include_preview,
                preview_chars=preview_chars,
            )
            if not _append_budgeted_line(
                lines,
                line,
                used_chars,
                char_budget=char_budget,
            ):
                return "\n".join(lines)
            used_chars += len(line) + 1
            seen_ids.add(entry.id)

    return "\n".join(lines)


def _append_budgeted_line(
    lines: list[str],
    line: str,
    used_chars: int,
    *,
    char_budget: int,
) -> bool:
    if used_chars + len(line) + 1 > char_budget:
        return False
    lines.append(line)
    return True


def _format_memory_entry_line(
    entry: MemoryEntrySummary,
    *,
    include_preview: bool,
    preview_chars: int,
) -> str:
    title = _truncate_text(_single_line(entry.content_title), MEMORY_ENTRY_TITLE_CHARS)
    if not include_preview:
        return f"- [{entry.kind.value}] {title}"
    preview = _truncate_text(_single_line(entry.content_body_preview), preview_chars)
    suffix = f": {preview}" if preview else ""
    return f"- [{entry.kind.value}] {title}{suffix}"


def _single_line(value: str) -> str:
    return " ".join(value.split())


def _truncate_text(value: str, max_chars: int) -> str:
    if len(value) <= max_chars:
        return value
    return f"{value[: max_chars - 3].rstrip()}..."
