# -*- coding: utf-8 -*-
from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from relay_teams.memory.models import (
    CreateMemoryEntryRequest,
    MemoryContent,
    MemoryConsolidationRequest,
    MemoryEntryKind,
    MemoryEntryStatus,
    MemoryIndexRebuildRequest,
    MemoryQuery,
    MemoryScope,
    MemorySearchRequest,
    MemorySourceKind,
    MemoryTier,
    UpdateMemoryEntryRequest,
)
from relay_teams.memory.repository import MemoryBankRepository
from relay_teams.memory.service import FTS_SEARCH_BATCH_SIZE, MemoryBankService

pytestmark = pytest.mark.asyncio


@pytest.fixture
def service(tmp_path: Path) -> MemoryBankService:
    db_file = tmp_path / "test_async.db"
    repo = MemoryBankRepository(db_file)
    return MemoryBankService(repository=repo)


def _create_request(**overrides: object) -> CreateMemoryEntryRequest:
    base: dict[str, object] = {
        "tier": MemoryTier.WORKING,
        "scope": MemoryScope.SESSION,
        "workspace_id": "ws-async",
        "session_id": "sess-1",
        "run_id": "run-1",
        "kind": MemoryEntryKind.INSIGHT,
        "content": MemoryContent(title="Async Test", body="Testing async paths"),
        "source": MemorySourceKind.TASK_RESULT,
    }
    base.update(overrides)
    return CreateMemoryEntryRequest(**base)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Async create / get / update / delete / list
# ---------------------------------------------------------------------------


class TestAsyncCreateEntry:
    async def test_create_async_persistent(self, service: MemoryBankService) -> None:
        req = _create_request(
            tier=MemoryTier.PERSISTENT,
            scope=MemoryScope.WORKSPACE,
            session_id=None,
            run_id=None,
        )
        entry = await service.create_entry_async(req)
        assert entry.id.startswith("mem-")
        assert entry.tier == MemoryTier.PERSISTENT

    async def test_create_async_with_ttl(self, service: MemoryBankService) -> None:
        req = _create_request()
        entry = await service.create_entry_async(req)
        assert entry.expires_at is not None

    async def test_create_async_with_confidence(
        self, service: MemoryBankService
    ) -> None:
        req = _create_request(confidence_score=0.5, tags=("a", "b"))
        entry = await service.create_entry_async(req)
        assert entry.confidence_score == 0.5
        assert entry.tags == ("a", "b")


class TestAsyncGetEntry:
    async def test_get_async_existing(self, service: MemoryBankService) -> None:
        req = _create_request()
        created = await service.create_entry_async(req)
        result = await service.get_entry_async(created.id)
        assert result is not None
        assert result.id == created.id

    async def test_get_async_missing(self, service: MemoryBankService) -> None:
        result = await service.get_entry_async("mem-nonexistent")
        assert result is None


class TestAsyncListEntries:
    async def test_list_async_returns_entries(self, service: MemoryBankService) -> None:
        await service.create_entry_async(_create_request())
        await service.create_entry_async(_create_request(run_id="run-2"))
        query = MemoryQuery(workspace_id="ws-async")
        result = await service.list_entries_async(query)
        assert result.total_count == 2


class TestAsyncUpdateEntry:
    async def test_update_async_existing(self, service: MemoryBankService) -> None:
        created = await service.create_entry_async(_create_request())
        update = UpdateMemoryEntryRequest(
            content=MemoryContent(title="Updated", body="New body"),
        )
        result = await service.update_entry_async(created.id, update)
        assert result is not None
        assert result.content.title == "Updated"

    async def test_update_async_missing(self, service: MemoryBankService) -> None:
        update = UpdateMemoryEntryRequest(
            content=MemoryContent(title="X", body="Y"),
        )
        result = await service.update_entry_async("mem-nope", update)
        assert result is None

    async def test_update_async_various_fields(
        self, service: MemoryBankService
    ) -> None:
        created = await service.create_entry_async(_create_request())
        update = UpdateMemoryEntryRequest(
            tags=("new-tag",),
            confidence_score=0.3,
            status=MemoryEntryStatus.EXPIRED,
        )
        result = await service.update_entry_async(created.id, update)
        assert result is not None
        assert result.tags == ("new-tag",)
        assert result.confidence_score == 0.3


class TestAsyncDeleteEntry:
    async def test_delete_async_existing(self, service: MemoryBankService) -> None:
        created = await service.create_entry_async(_create_request())
        result = await service.delete_entry_async(created.id)
        assert result is True

    async def test_delete_async_missing(self, service: MemoryBankService) -> None:
        result = await service.delete_entry_async("mem-nope")
        assert result is False


# ---------------------------------------------------------------------------
# Async consolidation
# ---------------------------------------------------------------------------


class TestAsyncConsolidation:
    async def test_consolidate_async(self, service: MemoryBankService) -> None:
        req = _create_request(
            tier=MemoryTier.WORKING,
            confidence_score=0.95,
        )
        await service.create_entry_async(req)

        consolidation = MemoryConsolidationRequest(
            workspace_id="ws-async",
            session_id="sess-1",
            target_tier=MemoryTier.MEDIUM_TERM,
            target_scope=MemoryScope.SESSION,
        )
        result = await service.consolidate_async(consolidation)
        assert result.consolidated_entry_count == 1

    async def test_consolidate_async_with_filters(
        self, service: MemoryBankService
    ) -> None:
        await service.create_entry_async(
            _create_request(kind=MemoryEntryKind.INSIGHT, confidence_score=0.95)
        )
        await service.create_entry_async(
            _create_request(
                kind=MemoryEntryKind.CONSTRAINT, confidence_score=0.95, run_id="r2"
            )
        )
        consolidation = MemoryConsolidationRequest(
            workspace_id="ws-async",
            session_id="sess-1",
            target_tier=MemoryTier.MEDIUM_TERM,
            target_scope=MemoryScope.SESSION,
            filter_kind=MemoryEntryKind.INSIGHT,
        )
        result = await service.consolidate_async(consolidation)
        assert result.consolidated_entry_count == 1

    async def test_consolidate_async_persistent(
        self, service: MemoryBankService
    ) -> None:
        req = _create_request(
            tier=MemoryTier.MEDIUM_TERM,
            scope=MemoryScope.WORKSPACE,
            confidence_score=0.95,
        )
        await service.create_entry_async(req)
        consolidation = MemoryConsolidationRequest(
            workspace_id="ws-async",
            session_id="sess-1",
            target_tier=MemoryTier.PERSISTENT,
            target_scope=MemoryScope.WORKSPACE,
        )
        result = await service.consolidate_async(consolidation)
        assert result.consolidated_entry_count == 1


# ---------------------------------------------------------------------------
# Async forget_expired
# ---------------------------------------------------------------------------


class TestAsyncForgetExpired:
    async def test_forget_async(self, service: MemoryBankService) -> None:
        result = await service.forget_expired_async()
        assert result == 0

    async def test_forget_async_with_expired_entries(
        self, service: MemoryBankService
    ) -> None:
        past = datetime.now(tz=timezone.utc) - timedelta(hours=1)
        req = _create_request(expires_at=past)
        await service.create_entry_async(req)
        count = await service.forget_expired_async()
        assert count >= 1

    async def test_forget_expired_removes_retrieval_documents(
        self, tmp_path: Path
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "forget_expired_index.db")
        mock_retrieval = MagicMock()
        mock_retrieval.upsert_documents_async = AsyncMock()
        mock_retrieval.delete_documents_async = AsyncMock()
        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)
        past = datetime.now(tz=timezone.utc) - timedelta(hours=1)
        created = await service.create_entry_async(_create_request(expires_at=past))

        count = await service.forget_expired_async()
        second_count = await service.forget_expired_async()

        assert count >= 1
        mock_retrieval.delete_documents_async.assert_awaited_once()
        assert mock_retrieval.delete_documents_async.await_args.kwargs[
            "document_ids"
        ] == (created.id,)
        assert second_count == 0

    async def test_forget_expired_retries_prior_index_cleanup(
        self, tmp_path: Path
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "forget_expired_retry_index.db")
        seed_service = MemoryBankService(repository=repo)
        created = await seed_service.create_entry_async(_create_request())
        await seed_service.update_entry_async(
            created.id,
            UpdateMemoryEntryRequest(status=MemoryEntryStatus.EXPIRED),
        )
        mock_retrieval = MagicMock()
        mock_retrieval.delete_documents_async = AsyncMock()
        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)

        count = await service.forget_expired_async()

        assert count == 0
        mock_retrieval.delete_documents_async.assert_awaited_once()
        assert mock_retrieval.delete_documents_async.await_args.kwargs[
            "document_ids"
        ] == (created.id,)

    async def test_forget_expired_retries_superseded_index_cleanup(
        self, tmp_path: Path
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "forget_superseded_retry_index.db")
        seed_service = MemoryBankService(repository=repo)
        created = await seed_service.create_entry_async(_create_request())
        await seed_service.update_entry_async(
            created.id,
            UpdateMemoryEntryRequest(status=MemoryEntryStatus.SUPERSEDED),
        )
        mock_retrieval = MagicMock()
        mock_retrieval.delete_documents_async = AsyncMock()
        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)

        count = await service.forget_expired_async()

        assert count == 0
        mock_retrieval.delete_documents_async.assert_awaited_once()
        assert mock_retrieval.delete_documents_async.await_args.kwargs[
            "document_ids"
        ] == (created.id,)


# ---------------------------------------------------------------------------
# Async search
# ---------------------------------------------------------------------------


class TestAsyncSearch:
    async def test_search_async_fallback(self, service: MemoryBankService) -> None:
        await service.create_entry_async(
            _create_request(
                content=MemoryContent(title="Python tip", body="Use dataclasses"),
            )
        )
        request = MemorySearchRequest(
            workspace_id="ws-async",
            text_query="python",
        )
        result = await service.search_async(request)
        assert result.total_count == 1

    async def test_search_async_no_match(self, service: MemoryBankService) -> None:
        await service.create_entry_async(_create_request())
        request = MemorySearchRequest(
            workspace_id="ws-async",
            text_query="nonexistent_query_xyz",
        )
        result = await service.search_async(request)
        assert result.total_count == 0

    async def test_search_fallback_stops_once_injection_limit_is_filled(
        self, service: MemoryBankService
    ) -> None:
        for index in range(101):
            await service.create_entry_async(
                _create_request(
                    content=MemoryContent(
                        title=f"Bounded fallback {index}",
                        body="shared bounded fallback text",
                    ),
                )
            )
        query_entries_async = AsyncMock(wraps=service._repo.query_entries_async)
        service._repo.query_entries_async = query_entries_async

        result = await service.search_limited_async(
            MemorySearchRequest(
                workspace_id="ws-async",
                text_query="bounded fallback",
                limit=1,
            )
        )

        assert len(result) == 1
        query_entries_async.assert_awaited_once()


# ---------------------------------------------------------------------------
# Service update edge cases
# ---------------------------------------------------------------------------


class TestUpdateEdgeCases:
    async def test_update_missing_entry(self, service: MemoryBankService) -> None:
        update = UpdateMemoryEntryRequest(
            content=MemoryContent(title="X", body="Y"),
        )
        result = await service.update_entry_async("mem-nonexistent", update)
        assert result is None

    async def test_update_confidence_below_threshold_auto_expires(
        self, service: MemoryBankService
    ) -> None:
        created = await service.create_entry_async(_create_request())
        update = UpdateMemoryEntryRequest(confidence_score=0.01)
        result = await service.update_entry_async(created.id, update)
        assert result is not None
        assert result.status == MemoryEntryStatus.EXPIRED

    async def test_update_with_metadata(self, service: MemoryBankService) -> None:
        created = await service.create_entry_async(_create_request())
        update = UpdateMemoryEntryRequest(metadata={"key": "value"})
        result = await service.update_entry_async(created.id, update)
        assert result is not None
        assert result.metadata == {"key": "value"}

    async def test_update_expires_at(self, service: MemoryBankService) -> None:
        created = await service.create_entry_async(_create_request())
        new_expires = datetime.now(tz=timezone.utc) + timedelta(days=30)
        update = UpdateMemoryEntryRequest(expires_at=new_expires)
        result = await service.update_entry_async(created.id, update)
        assert result is not None
        assert result.expires_at is not None

    async def test_update_status(self, service: MemoryBankService) -> None:
        created = await service.create_entry_async(_create_request())
        update = UpdateMemoryEntryRequest(status=MemoryEntryStatus.EXPIRED)
        result = await service.update_entry_async(created.id, update)
        assert result is not None
        assert result.status == MemoryEntryStatus.EXPIRED


# ---------------------------------------------------------------------------
# Search fallback edge cases
# ---------------------------------------------------------------------------


class TestSearchFallback:
    async def test_search_fallback_with_tier_filter(
        self, service: MemoryBankService
    ) -> None:
        await service.create_entry_async(
            _create_request(
                tier=MemoryTier.WORKING,
                content=MemoryContent(title="pattern X", body="body content"),
            )
        )
        request = MemorySearchRequest(
            workspace_id="ws-async",
            text_query="pattern",
            tier=MemoryTier.WORKING,
        )
        result = await service.search_async(request)
        assert result.total_count == 1

    async def test_search_fallback_no_results(self, service: MemoryBankService) -> None:
        request = MemorySearchRequest(
            workspace_id="ws-nonexistent",
            text_query="anything",
        )
        result = await service.search_async(request)
        assert result.total_count == 0


# ---------------------------------------------------------------------------
# FTS5 indexing with mock retrieval service
# ---------------------------------------------------------------------------


class TestFTSIndexing:
    async def test_reindex_active_entries_skips_without_retrieval_service(
        self, service: MemoryBankService
    ) -> None:
        assert await service.reindex_active_entries_async() == 0

    async def test_reindex_active_entries_indexes_migrated_legacy_memory(
        self, tmp_path: Path
    ) -> None:
        db_file = tmp_path / "legacy_reindex.db"
        with sqlite3.connect(db_file) as conn:
            conn.execute(
                """CREATE TABLE role_memories (
                    role_id TEXT NOT NULL,
                    workspace_id TEXT NOT NULL,
                    content_markdown TEXT NOT NULL,
                    performance_json TEXT NOT NULL DEFAULT '',
                    assessment_state_json TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL
                )"""
            )
            conn.execute(
                """INSERT INTO role_memories (
                    role_id,
                    workspace_id,
                    content_markdown,
                    performance_json,
                    assessment_state_json,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    "writer",
                    "ws-legacy",
                    "Prefer indexed migrations.",
                    "",
                    "",
                    "2026-03-15T08:30:00+00:00",
                ),
            )
            conn.commit()

        repo = MemoryBankRepository(db_file)
        mock_retrieval = MagicMock()
        mock_retrieval.upsert_documents_async = AsyncMock()
        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)

        indexed_count = await service.reindex_active_entries_async()

        assert indexed_count == 1
        mock_retrieval.upsert_documents_async.assert_awaited_once()
        documents = mock_retrieval.upsert_documents_async.await_args.kwargs["documents"]
        assert len(documents) == 1
        assert documents[0].scope_id == "ws-legacy"
        assert "Prefer indexed migrations." in documents[0].body

    async def test_index_entry_with_retrieval_service(self, tmp_path: Path) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts.db")
        mock_retrieval = MagicMock()
        mock_retrieval.upsert_documents_async = AsyncMock()
        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)
        await service.create_entry_async(_create_request())
        mock_retrieval.upsert_documents_async.assert_awaited_once()

    async def test_index_entry_handles_index_state_sqlite_failure(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts_state_locked.db")
        mock_retrieval = MagicMock()
        mock_retrieval.upsert_documents_async = AsyncMock()
        monkeypatch.setattr(
            repo,
            "mark_entry_index_present_async",
            AsyncMock(side_effect=sqlite3.OperationalError("locked")),
        )
        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)

        entry = await service.create_entry_async(_create_request())

        assert entry.id.startswith("mem-")
        mock_retrieval.upsert_documents_async.assert_awaited_once()

    async def test_index_entry_skips_non_active(self, tmp_path: Path) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts_skip.db")
        mock_retrieval = MagicMock()
        mock_retrieval.upsert_documents_async = AsyncMock()
        mock_retrieval.delete_documents_async = AsyncMock()
        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)
        created = await service.create_entry_async(_create_request())
        # Update status to expired
        await service.update_entry_async(
            created.id, UpdateMemoryEntryRequest(status=MemoryEntryStatus.EXPIRED)
        )
        # upsert_documents_async called only once (initial create)
        assert mock_retrieval.upsert_documents_async.await_count == 1
        mock_retrieval.delete_documents_async.assert_awaited_once()

    async def test_reindex_active_entry_resets_removed_index_marker(
        self, tmp_path: Path
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts_reindex_reset.db")
        mock_retrieval = MagicMock()
        mock_retrieval.upsert_documents_async = AsyncMock()
        mock_retrieval.delete_documents_async = AsyncMock()
        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)
        created = await service.create_entry_async(_create_request())
        await service.update_entry_async(
            created.id,
            UpdateMemoryEntryRequest(status=MemoryEntryStatus.EXPIRED),
        )

        reactivated = await service.update_entry_async(
            created.id,
            UpdateMemoryEntryRequest(status=MemoryEntryStatus.ACTIVE),
        )
        loaded = await repo.get_by_id_async(created.id)

        assert reactivated is not None
        assert loaded is not None
        assert "retrieval_index_removed" not in loaded.metadata
        assert mock_retrieval.upsert_documents_async.await_count == 2

    async def test_index_state_does_not_overwrite_user_metadata(
        self, tmp_path: Path
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts_metadata_preserve.db")
        mock_retrieval = MagicMock()
        mock_retrieval.upsert_documents_async = AsyncMock()
        mock_retrieval.delete_documents_async = AsyncMock()
        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)
        metadata = {f"user_key_{index}": f"value-{index}" for index in range(20)}

        created = await service.create_entry_async(_create_request(metadata=metadata))
        await service.update_entry_async(
            created.id,
            UpdateMemoryEntryRequest(status=MemoryEntryStatus.EXPIRED),
        )
        await service.update_entry_async(
            created.id,
            UpdateMemoryEntryRequest(status=MemoryEntryStatus.ACTIVE),
        )
        loaded = await repo.get_by_id_async(created.id)

        assert loaded is not None
        assert loaded.metadata == metadata

    async def test_cleanup_stops_when_index_delete_makes_no_progress(
        self, tmp_path: Path
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts_cleanup_progress.db")
        seed_service = MemoryBankService(repository=repo)
        for index in range(100):
            created = await seed_service.create_entry_async(
                _create_request(
                    content=MemoryContent(
                        title=f"Expired {index}",
                        body="cleanup failure should not loop forever",
                    )
                )
            )
            await seed_service.update_entry_async(
                created.id,
                UpdateMemoryEntryRequest(status=MemoryEntryStatus.EXPIRED),
            )
        mock_retrieval = MagicMock()
        mock_retrieval.delete_documents_async = AsyncMock(
            side_effect=sqlite3.OperationalError("locked")
        )
        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)

        deleted_count = await service._delete_index_entries_by_status_async(
            MemoryEntryStatus.EXPIRED
        )

        assert deleted_count == 0
        assert mock_retrieval.delete_documents_async.await_count == 1

    async def test_cleanup_returns_zero_when_no_entries_need_index_delete(
        self, tmp_path: Path
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts_cleanup_empty.db")
        mock_retrieval = MagicMock()
        mock_retrieval.delete_documents_async = AsyncMock()
        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)

        deleted_count = await service._delete_index_entries_by_status_async(
            MemoryEntryStatus.EXPIRED
        )

        assert deleted_count == 0
        mock_retrieval.delete_documents_async.assert_not_awaited()

    async def test_cleanup_continues_after_one_workspace_delete_failure(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts_cleanup_continue.db")
        seed_service = MemoryBankService(repository=repo)
        fail_entry = await seed_service.create_entry_async(
            _create_request(workspace_id="ws-fail")
        )
        ok_entry = await seed_service.create_entry_async(
            _create_request(workspace_id="ws-ok")
        )
        await seed_service.update_entry_async(
            fail_entry.id,
            UpdateMemoryEntryRequest(status=MemoryEntryStatus.EXPIRED),
        )
        await seed_service.update_entry_async(
            ok_entry.id,
            UpdateMemoryEntryRequest(status=MemoryEntryStatus.EXPIRED),
        )
        mock_retrieval = MagicMock()
        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)
        failed_workspace_attempts = 0

        async def delete_by_workspace(
            *,
            workspace_id: str,
            memory_ids: tuple[str, ...],
        ) -> bool:
            nonlocal failed_workspace_attempts
            if workspace_id == "ws-fail":
                failed_workspace_attempts += 1
                return False
            for memory_id in memory_ids:
                await repo.mark_entry_index_removed_async(
                    memory_id=memory_id,
                    index_kind="retrieval",
                    removed_at=datetime.now(tz=timezone.utc),
                )
            return True

        monkeypatch.setattr(
            service,
            "_delete_index_entry_ids_async",
            delete_by_workspace,
        )

        deleted_count = await service._delete_index_entries_by_status_async(
            MemoryEntryStatus.EXPIRED
        )

        assert deleted_count == 1
        assert failed_workspace_attempts == 2

    async def test_cleanup_skips_full_failed_batch_to_sweep_later_candidates(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts_cleanup_skip_failed.db")
        seed_service = MemoryBankService(repository=repo)
        for index in range(FTS_SEARCH_BATCH_SIZE):
            fail_entry = await seed_service.create_entry_async(
                _create_request(
                    tier=MemoryTier.PERSISTENT,
                    scope=MemoryScope.WORKSPACE,
                    workspace_id="ws-fail",
                    run_id=None,
                    content=MemoryContent(
                        title=f"Failed cleanup {index}",
                        body="failed cleanup batch",
                    ),
                )
            )
            await seed_service.update_entry_async(
                fail_entry.id,
                UpdateMemoryEntryRequest(status=MemoryEntryStatus.EXPIRED),
            )
        ok_entry = await seed_service.create_entry_async(
            _create_request(
                tier=MemoryTier.PERSISTENT,
                scope=MemoryScope.WORKSPACE,
                workspace_id="ws-ok",
                run_id=None,
            )
        )
        await seed_service.update_entry_async(
            ok_entry.id,
            UpdateMemoryEntryRequest(status=MemoryEntryStatus.EXPIRED),
        )
        service = MemoryBankService(repository=repo, retrieval_service=MagicMock())

        async def delete_by_workspace(
            *,
            workspace_id: str,
            memory_ids: tuple[str, ...],
        ) -> bool:
            if workspace_id == "ws-fail":
                return False
            for memory_id in memory_ids:
                await repo.mark_entry_index_removed_async(
                    memory_id=memory_id,
                    index_kind="retrieval",
                    removed_at=datetime.now(tz=timezone.utc),
                )
            return True

        monkeypatch.setattr(
            service,
            "_delete_index_entry_ids_async",
            delete_by_workspace,
        )

        deleted_count = await service._delete_index_entries_by_status_async(
            MemoryEntryStatus.EXPIRED
        )

        assert deleted_count == 1
        cleanup = await repo.query_entries_needing_index_cleanup_async(
            status=MemoryEntryStatus.EXPIRED,
            limit=FTS_SEARCH_BATCH_SIZE + 1,
        )
        assert ok_entry.id not in {summary.id for summary in cleanup}

    async def test_rebuild_stale_index_entries_indexes_only_stale_active_entries(
        self, tmp_path: Path
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts_rebuild_stale.db")
        seed_service = MemoryBankService(repository=repo)
        missing_state = await seed_service.create_entry_async(
            _create_request(content=MemoryContent(title="Missing", body="missing"))
        )
        removed_state = await seed_service.create_entry_async(
            _create_request(content=MemoryContent(title="Removed", body="removed"))
        )
        present_state = await seed_service.create_entry_async(
            _create_request(content=MemoryContent(title="Present", body="present"))
        )
        now = datetime.now(tz=timezone.utc)
        await repo.mark_entry_index_removed_async(
            memory_id=removed_state.id,
            index_kind="retrieval",
            removed_at=now,
        )
        await repo.mark_entry_index_present_async(
            memory_id=present_state.id,
            index_kind="retrieval",
            updated_at=now,
        )
        mock_retrieval = MagicMock()
        mock_retrieval.upsert_documents_async = AsyncMock()
        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)

        indexed_count = await service.rebuild_stale_index_entries_async()

        assert indexed_count == 2
        indexed_ids = {
            documents[0].document_id
            for _, kwargs in mock_retrieval.upsert_documents_async.await_args_list
            for documents in (kwargs["documents"],)
        }
        assert indexed_ids == {missing_state.id, removed_state.id}

    async def test_rebuild_stale_index_entries_ignores_present_legacy_flag(
        self, tmp_path: Path
    ) -> None:
        db_file = tmp_path / "test_fts_rebuild_legacy_flag.db"
        repo = MemoryBankRepository(db_file)
        seed_service = MemoryBankService(repository=repo)
        present_state = await seed_service.create_entry_async(
            _create_request(
                content=MemoryContent(title="Present", body="already rebuilt"),
                metadata={"retrieval_index_removed": "true"},
            )
        )
        await repo.mark_entry_index_present_async(
            memory_id=present_state.id,
            index_kind="retrieval",
            updated_at=datetime.now(tz=timezone.utc),
        )

        reloaded_repo = MemoryBankRepository(db_file)
        stale = await reloaded_repo.query_entries_needing_index_rebuild_async(limit=10)

        assert present_state.id not in {entry.id for entry in stale}

    async def test_index_cleanup_handles_malformed_metadata_json(
        self, tmp_path: Path
    ) -> None:
        db_file = tmp_path / "test_fts_cleanup_malformed_metadata.db"
        repo = MemoryBankRepository(db_file)
        seed_service = MemoryBankService(repository=repo)
        expired = await seed_service.create_entry_async(_create_request())
        await seed_service.update_entry_async(
            expired.id,
            UpdateMemoryEntryRequest(status=MemoryEntryStatus.EXPIRED),
        )
        with sqlite3.connect(db_file) as conn:
            conn.execute(
                "UPDATE memory_entries SET metadata_json = ? WHERE memory_id = ?",
                ("{", expired.id),
            )
            conn.commit()
        reloaded_repo = MemoryBankRepository(db_file)

        cleanup = await reloaded_repo.query_entries_needing_index_cleanup_async(
            status=MemoryEntryStatus.EXPIRED,
            limit=10,
        )

        assert expired.id in {entry.id for entry in cleanup}

    async def test_index_cleanup_ignores_present_legacy_flag_after_expiry(
        self, tmp_path: Path
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts_cleanup_legacy_flag.db")
        seed_service = MemoryBankService(repository=repo)
        expired = await seed_service.create_entry_async(
            _create_request(metadata={"retrieval_index_removed": "true"})
        )
        await repo.mark_entry_index_present_async(
            memory_id=expired.id,
            index_kind="retrieval",
            updated_at=datetime.now(tz=timezone.utc),
        )
        await seed_service.update_entry_async(
            expired.id,
            UpdateMemoryEntryRequest(status=MemoryEntryStatus.EXPIRED),
        )

        cleanup = await repo.query_entries_needing_index_cleanup_async(
            status=MemoryEntryStatus.EXPIRED,
            limit=10,
        )

        assert expired.id in {entry.id for entry in cleanup}

    async def test_rebuild_stale_index_entries_result_supports_dry_run(
        self, tmp_path: Path
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts_rebuild_dry_run.db")
        seed_service = MemoryBankService(repository=repo)
        stale = await seed_service.create_entry_async(
            _create_request(content=MemoryContent(title="Stale", body="stale"))
        )
        other_workspace = await seed_service.create_entry_async(
            _create_request(
                workspace_id="ws-other",
                content=MemoryContent(title="Other", body="other"),
            )
        )
        mock_retrieval = MagicMock()
        mock_retrieval.upsert_documents_async = AsyncMock()
        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)

        result = await service.rebuild_stale_index_entries_result_async(
            MemoryIndexRebuildRequest(
                workspace_id=stale.workspace_id,
                limit=10,
                dry_run=True,
            )
        )

        assert result.scanned_count == 1
        assert result.rebuilt_count == 0
        assert result.skipped_count == 1
        assert result.failed_count == 0
        assert other_workspace.workspace_id == "ws-other"
        mock_retrieval.upsert_documents_async.assert_not_awaited()

    async def test_rebuild_stale_index_entries_result_skips_without_retrieval(
        self, tmp_path: Path
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts_rebuild_no_retrieval.db")
        seed_service = MemoryBankService(repository=repo)
        await seed_service.create_entry_async(
            _create_request(content=MemoryContent(title="Missing", body="missing"))
        )
        service = MemoryBankService(repository=repo)

        result = await service.rebuild_stale_index_entries_result_async(
            MemoryIndexRebuildRequest(limit=10)
        )

        assert result.scanned_count == 1
        assert result.rebuilt_count == 0
        assert result.skipped_count == 1
        assert result.failed_count == 0

    async def test_rebuild_stale_index_entries_skips_full_failed_batch(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts_rebuild_failed_batch.db")
        seed_service = MemoryBankService(repository=repo)
        for index in range(4):
            await seed_service.create_entry_async(
                _create_request(
                    content=MemoryContent(
                        title=f"Stale {index}",
                        body=f"stale {index}",
                    )
                )
            )
        service = MemoryBankService(repository=repo, retrieval_service=MagicMock())
        index_entry = AsyncMock(side_effect=(False, False, True, True))
        monkeypatch.setattr(service, "_index_entry_async", index_entry)

        result = await service.rebuild_stale_index_entries_result_async(
            MemoryIndexRebuildRequest(limit=2)
        )

        assert result.scanned_count == 4
        assert result.rebuilt_count == 2
        assert result.skipped_count == 0
        assert result.failed_count == 2
        assert index_entry.await_count == 4

    async def test_delete_entry_removes_retrieval_document(
        self, tmp_path: Path
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts_delete.db")
        mock_retrieval = MagicMock()
        mock_retrieval.upsert_documents_async = AsyncMock()
        mock_retrieval.delete_documents_async = AsyncMock()
        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)
        created = await service.create_entry_async(_create_request())

        deleted = await service.delete_entry_async(created.id)

        assert deleted is True
        mock_retrieval.delete_documents_async.assert_awaited_once()
        assert mock_retrieval.delete_documents_async.await_args.kwargs[
            "document_ids"
        ] == (created.id,)

    async def test_delete_entry_skips_index_state_after_row_delete(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts_delete_skip_state.db")
        mock_retrieval = MagicMock()
        mock_retrieval.upsert_documents_async = AsyncMock()
        mock_retrieval.delete_documents_async = AsyncMock()
        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)
        created = await service.create_entry_async(_create_request())
        mark_removed = AsyncMock(return_value=True)
        monkeypatch.setattr(repo, "mark_entry_index_removed_async", mark_removed)

        deleted = await service.delete_entry_async(created.id)

        assert deleted is True
        mock_retrieval.delete_documents_async.assert_awaited_once()
        mark_removed.assert_not_awaited()

    async def test_delete_entry_deletes_row_when_retrieval_delete_fails(
        self, tmp_path: Path
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts_delete_fail.db")
        mock_retrieval = MagicMock()
        mock_retrieval.upsert_documents_async = AsyncMock()
        mock_retrieval.delete_documents_async = AsyncMock(
            side_effect=sqlite3.OperationalError("locked")
        )
        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)
        created = await service.create_entry_async(_create_request())

        deleted = await service.delete_entry_async(created.id)
        loaded = await service.get_entry_async(created.id)

        assert deleted is True
        assert loaded is None
        mock_retrieval.delete_documents_async.assert_awaited_once()

    async def test_delete_entry_keeps_index_when_database_delete_fails(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts_delete_db_fail.db")
        mock_retrieval = MagicMock()
        mock_retrieval.upsert_documents_async = AsyncMock()
        mock_retrieval.delete_documents_async = AsyncMock()
        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)
        created = await service.create_entry_async(_create_request())
        monkeypatch.setattr(
            repo,
            "delete_entry_async",
            AsyncMock(side_effect=sqlite3.OperationalError("locked")),
        )

        with pytest.raises(sqlite3.OperationalError):
            await service.delete_entry_async(created.id)

        loaded = await service.get_entry_async(created.id)
        assert loaded is not None
        mock_retrieval.delete_documents_async.assert_not_awaited()

    async def test_index_entry_handles_retrieval_failure(self, tmp_path: Path) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts_fail.db")
        mock_retrieval = MagicMock()
        mock_retrieval.upsert_documents_async = AsyncMock(
            side_effect=RuntimeError("FTS error")
        )
        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)
        # Should not raise
        entry = await service.create_entry_async(_create_request())
        assert entry is not None

    async def test_search_fts_with_hits(self, tmp_path: Path) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts_search.db")
        mock_retrieval = MagicMock()
        hit = MagicMock()
        hit.document_id = "mem-dummy"
        hit.score = 0.95
        hit.rank = 1
        hit.snippet = "found text"
        mock_retrieval.upsert_documents_async = AsyncMock()
        mock_retrieval.search_async = AsyncMock(return_value=[hit])

        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)
        # Create an entry with matching id
        created = await service.create_entry_async(_create_request())

        # Change the hit to match the real entry id
        hit.document_id = created.id

        request = MemorySearchRequest(
            workspace_id="ws-async",
            text_query="test query",
        )
        result = await service.search_async(request)
        assert result.total_count >= 1

    async def test_search_fts_no_hits(self, tmp_path: Path) -> None:
        repo = MemoryBankRepository(tmp_path / "test_fts_no_hits.db")
        mock_retrieval = MagicMock()
        mock_retrieval.search_async = AsyncMock(return_value=[])
        service = MemoryBankService(repository=repo, retrieval_service=mock_retrieval)
        request = MemorySearchRequest(
            workspace_id="ws-async",
            text_query="no match",
        )
        result = await service.search_async(request)
        assert result.total_count == 0


# ---------------------------------------------------------------------------
# Repository metadata decoding
# ---------------------------------------------------------------------------


class TestRepositoryMetadataDecoding:
    async def test_malformed_metadata_json_loads_as_empty_metadata(
        self, tmp_path: Path
    ) -> None:
        db_file = tmp_path / "malformed_metadata.db"
        repo = MemoryBankRepository(db_file)
        service = MemoryBankService(repository=repo)
        created = await service.create_entry_async(_create_request())
        with sqlite3.connect(db_file) as conn:
            conn.execute(
                "UPDATE memory_entries SET metadata_json = ? WHERE memory_id = ?",
                ("{", created.id),
            )
            conn.commit()

        reloaded_repo = MemoryBankRepository(db_file)
        loaded = await reloaded_repo.get_by_id_async(created.id)

        assert loaded is not None
        assert loaded.metadata == {}

    async def test_empty_json_tags_are_not_backfilled_repeatedly(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "empty_tags_backfill.db")
        service = MemoryBankService(repository=repo)
        await service.create_entry_async(_create_request(tags=()))
        sync_calls: list[tuple[str, tuple[str, ...]]] = []

        def record_sync_tags(memory_id: str, tags: tuple[str, ...]) -> None:
            sync_calls.append((memory_id, tags))

        monkeypatch.setattr(repo, "_sync_tags", record_sync_tags)

        repo._backfill_memory_entry_tags()

        assert sync_calls == []


# ---------------------------------------------------------------------------
# _source_tier_for
# ---------------------------------------------------------------------------


class TestSourceTierFor:
    async def test_persistent_sources_medium_term(self) -> None:
        assert (
            MemoryBankService._source_tier_for(MemoryTier.PERSISTENT)
            == MemoryTier.MEDIUM_TERM
        )

    async def test_medium_term_sources_working(self) -> None:
        assert (
            MemoryBankService._source_tier_for(MemoryTier.MEDIUM_TERM)
            == MemoryTier.WORKING
        )

    async def test_working_sources_working(self) -> None:
        assert (
            MemoryBankService._source_tier_for(MemoryTier.WORKING) == MemoryTier.WORKING
        )


# ---------------------------------------------------------------------------
# Condensation placeholder
# ---------------------------------------------------------------------------


class TestCondensation:
    async def test_condense_raises_not_implemented(
        self, service: MemoryBankService
    ) -> None:
        with pytest.raises(NotImplementedError, match="FE-2"):
            service.condense("ws-async")
