# -*- coding: utf-8 -*-
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from relay_teams.memory.event_handler import MemoryEventHandler
from relay_teams.memory.models import (
    ConsolidationMode,
    MemoryConsolidationRequest,
    MemoryConsolidationResult,
    MemoryEntryKind,
    MemoryEntryStatus,
    MemoryEntrySummary,
    MemoryQueryResult,
    MemoryScope,
    MemorySourceKind,
    MemoryTier,
)


@pytest.fixture
def mock_memory_bank() -> MagicMock:
    svc = MagicMock()
    empty_query_result = MagicMock()
    empty_query_result.items = ()
    empty_query_result.total_count = 0
    svc.list_entries_async = AsyncMock(return_value=empty_query_result)
    svc.infer_single_run_role_id_async = AsyncMock(return_value=None)
    svc.consolidate_async = AsyncMock(
        return_value=MemoryConsolidationResult(
            source_entry_count=2,
            consolidated_entry_count=2,
            superseded_entry_ids=(),
            new_entry_ids=("id1", "id2"),
        )
    )
    svc.create_entry = MagicMock(return_value=None)
    return svc


@pytest.fixture
def handler(mock_memory_bank: MagicMock) -> MemoryEventHandler:
    return MemoryEventHandler(memory_bank_service=mock_memory_bank)


def _memory_summary(*, memory_id: str, role_id: str | None) -> MemoryEntrySummary:
    now = datetime.now(tz=timezone.utc)
    return MemoryEntrySummary(
        id=memory_id,
        tier=MemoryTier.MEDIUM_TERM,
        scope=MemoryScope.SESSION,
        workspace_id="ws-1",
        session_id="sess-1",
        role_id=role_id,
        kind=MemoryEntryKind.INSIGHT,
        status=MemoryEntryStatus.ACTIVE,
        content_title="Summary",
        content_body_preview="Body",
        tags=(),
        confidence_score=1.0,
        source=MemorySourceKind.CONSOLIDATION,
        version=1,
        created_at=now,
        updated_at=now,
        expires_at=None,
    )


def _query_result(
    *,
    items: tuple[MemoryEntrySummary, ...],
    total_count: int,
    offset: int,
) -> MemoryQueryResult:
    return MemoryQueryResult(
        items=items,
        total_count=total_count,
        offset=offset,
        limit=100,
    )


class TestOnRunCompletedAsync:
    @pytest.mark.asyncio
    async def test_structural_consolidation_runs(
        self, handler: MemoryEventHandler, mock_memory_bank: MagicMock
    ) -> None:
        await handler.on_run_completed_async(
            workspace_id="ws-1",
            session_id="sess-1",
            role_id="Crafter",
            run_id="run-1",
        )
        # Should have been called twice: once structural, once semantic
        assert mock_memory_bank.consolidate_async.call_count == 2
        # First call = structural
        first_req = mock_memory_bank.consolidate_async.call_args_list[0].args[0]
        assert first_req.target_tier == MemoryTier.MEDIUM_TERM
        assert first_req.role_id == "Crafter"

    @pytest.mark.asyncio
    async def test_semantic_consolidation_triggered(
        self, handler: MemoryEventHandler, mock_memory_bank: MagicMock
    ) -> None:
        await handler.on_run_completed_async(
            workspace_id="ws-1",
            session_id="sess-1",
            run_id="run-1",
        )
        # Second call = semantic
        second_req = mock_memory_bank.consolidate_async.call_args_list[1].args[0]
        assert second_req.consolidation_mode == ConsolidationMode.SEMANTIC
        assert second_req.source_run_id == "run-1"

    @pytest.mark.asyncio
    async def test_infers_role_id_for_semantic_consolidation(
        self, handler: MemoryEventHandler, mock_memory_bank: MagicMock
    ) -> None:
        mock_memory_bank.infer_single_run_role_id_async = AsyncMock(
            return_value="crafter"
        )

        await handler.on_run_completed_async(
            workspace_id="ws-1",
            session_id="sess-1",
            run_id="run-1",
        )

        structural_req = mock_memory_bank.consolidate_async.call_args_list[0].args[0]
        semantic_req = mock_memory_bank.consolidate_async.call_args_list[1].args[0]
        assert structural_req.role_id == "crafter"
        assert semantic_req.role_id == "crafter"

    @pytest.mark.asyncio
    async def test_semantic_not_triggered_without_run_id(
        self, handler: MemoryEventHandler, mock_memory_bank: MagicMock
    ) -> None:
        await handler.on_run_completed_async(
            workspace_id="ws-1",
            session_id="sess-1",
            run_id=None,
        )
        assert mock_memory_bank.consolidate_async.call_count == 1

    @pytest.mark.asyncio
    async def test_semantic_failure_non_fatal(
        self, handler: MemoryEventHandler, mock_memory_bank: MagicMock
    ) -> None:
        call_count = 0

        async def _side_effect(
            req: MemoryConsolidationRequest,
        ) -> MemoryConsolidationResult:
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise RuntimeError("LLM error")
            return MemoryConsolidationResult(
                source_entry_count=1,
                consolidated_entry_count=1,
                superseded_entry_ids=(),
                new_entry_ids=("id1",),
            )

        mock_memory_bank.consolidate_async = AsyncMock(side_effect=_side_effect)
        # Should not raise
        await handler.on_run_completed_async(
            workspace_id="ws-1", session_id="sess-1", run_id="run-1"
        )

    @pytest.mark.asyncio
    async def test_structural_failure_non_fatal(
        self, handler: MemoryEventHandler, mock_memory_bank: MagicMock
    ) -> None:
        mock_memory_bank.consolidate_async = AsyncMock(side_effect=ValueError("bad"))
        # Should not raise
        await handler.on_run_completed_async(
            workspace_id="ws-1", session_id="sess-1", run_id="run-1"
        )

    @pytest.mark.asyncio
    async def test_role_inference_failure_is_non_fatal(
        self, handler: MemoryEventHandler, mock_memory_bank: MagicMock
    ) -> None:
        mock_memory_bank.infer_single_run_role_id_async = AsyncMock(
            side_effect=RuntimeError("role lookup failed")
        )

        await handler.on_run_completed_async(
            workspace_id="ws-1",
            session_id="sess-1",
            run_id="run-1",
        )

        structural_req = mock_memory_bank.consolidate_async.call_args_list[0].args[0]
        semantic_req = mock_memory_bank.consolidate_async.call_args_list[1].args[0]
        assert structural_req.role_id is None
        assert semantic_req.role_id is None


class TestSessionCompletedAsync:
    @pytest.mark.asyncio
    async def test_workspace_consolidation_failure_is_non_fatal(
        self, handler: MemoryEventHandler, mock_memory_bank: MagicMock
    ) -> None:
        mock_memory_bank.consolidate_async = AsyncMock(
            side_effect=RuntimeError("workspace consolidation failed")
        )

        await handler._consolidate_session_workspace_memory_async(
            workspace_id="ws-1",
            session_id="sess-1",
        )

        request = mock_memory_bank.consolidate_async.call_args.args[0]
        assert request.role_id is None
        assert request.target_scope == MemoryScope.WORKSPACE

    @pytest.mark.asyncio
    async def test_lists_session_memory_role_ids_across_pages(
        self, handler: MemoryEventHandler, mock_memory_bank: MagicMock
    ) -> None:
        first_page = _query_result(
            items=(
                _memory_summary(memory_id="mem-1", role_id="role-1"),
                _memory_summary(memory_id="mem-2", role_id="role-1"),
            ),
            total_count=3,
            offset=0,
        )
        second_page = _query_result(
            items=(_memory_summary(memory_id="mem-3", role_id="role-2"),),
            total_count=3,
            offset=2,
        )
        mock_memory_bank.list_entries_async = AsyncMock(
            side_effect=(first_page, second_page)
        )

        role_ids = await handler._list_session_memory_role_ids_async(
            workspace_id="ws-1",
            session_id="sess-1",
        )

        assert role_ids == ("role-1", "role-2")
        offsets = [
            call.args[0].offset
            for call in mock_memory_bank.list_entries_async.call_args_list
        ]
        assert offsets == [0, 2]

    @pytest.mark.asyncio
    async def test_returns_partial_session_memory_roles_after_list_failure(
        self, handler: MemoryEventHandler, mock_memory_bank: MagicMock
    ) -> None:
        first_page = _query_result(
            items=(_memory_summary(memory_id="mem-1", role_id="role-1"),),
            total_count=2,
            offset=0,
        )
        mock_memory_bank.list_entries_async = AsyncMock(
            side_effect=(first_page, RuntimeError("list failed"))
        )

        role_ids = await handler._list_session_memory_role_ids_async(
            workspace_id="ws-1",
            session_id="sess-1",
        )

        assert role_ids == ("role-1",)


class TestGetInjectableMemoryTextAsync:
    @pytest.mark.asyncio
    async def test_returns_empty_text_when_query_fails(
        self, handler: MemoryEventHandler, mock_memory_bank: MagicMock
    ) -> None:
        mock_memory_bank.list_entries_async = AsyncMock(
            side_effect=RuntimeError("query failed")
        )

        text = await handler.get_injectable_memory_text_async(
            workspace_id="ws-1",
            role_id="role-1",
            session_id="sess-1",
        )

        assert text == ""
